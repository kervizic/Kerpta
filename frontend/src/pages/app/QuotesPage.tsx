// Kerpta — Page devis (liste, détail, création, édition)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Loader2, ArrowLeft, Send, Check, X, Copy, Plus, Trash2,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import UnitCombobox from '@/components/app/UnitCombobox'
import ProductAutocomplete, { type AutocompleteProduct } from '@/components/app/ProductAutocomplete'
import ClientCombobox from '@/components/app/ClientCombobox'

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 transition'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Quote {
  id: string
  number: string
  client_name: string | null
  document_type: string
  is_avenant: boolean
  avenant_number: number | null
  status: string
  issue_date: string
  subtotal_ht: number
  total_ttc: number
  created_at: string
}

interface QuoteDetail extends Quote {
  client_id: string
  show_quantity: boolean
  contract_id: string | null
  bpu_source_id: string | null
  billing_profile_id: string | null
  expiry_date: string | null
  total_vat: number
  discount_type: string
  discount_value: number
  notes: string | null
  footer: string | null
  lines: QuoteLine[]
}

interface QuoteLine {
  id: string
  product_id: string | null
  reference: string | null
  description: string | null
  quantity: number
  unit: string | null
  unit_price: number
  vat_rate: number
  discount_percent: number
  total_ht: number
  total_vat: number
}

interface ClientOption { id: string; name: string }
interface BillingProfile { id: string; name: string; is_default: boolean; footer: string | null }
// ── Types pour ligne formulaire ────────────────────────────────────────────

interface FormLine {
  key: string
  product_id: string | null
  client_product_variant_id: string | null
  reference: string
  description: string
  quantity: string
  unit: string
  unit_price: string
  vat_rate: string
  discount_percent: string
}

function emptyLine(): FormLine {
  return {
    key: crypto.randomUUID(),
    product_id: null,
    client_product_variant_id: null,
    reference: '',
    description: '',
    quantity: '1',
    unit: '',
    unit_price: '0',
    vat_rate: '20',
    discount_percent: '0',
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Envoyé', cls: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepté', cls: 'bg-green-100 text-green-700' },
  refused: { label: 'Refusé', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expiré', cls: 'bg-yellow-100 text-yellow-700' },
}

const DOC_LABELS: Record<string, string> = { devis: 'Devis', bpu: 'BPU', attachement: 'Attachement' }

function fmtCurrency(v: number) {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function calcLineHT(line: FormLine): number {
  const qty = parseFloat(line.quantity) || 0
  const price = parseFloat(line.unit_price) || 0
  const disc = (parseFloat(line.discount_percent) || 0) / 100
  return Math.round(qty * price * (1 - disc) * 100) / 100
}

function calcLineVAT(line: FormLine): number {
  const ht = calcLineHT(line)
  const rate = (parseFloat(line.vat_rate) || 0) / 100
  return Math.round(ht * rate * 100) / 100
}

// ── Liste ─────────────────────────────────────────────────────────────────────

function QuotesList() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<{ items: Quote[]; total: number }>('/quotes', {
        page, document_type: filterType || undefined, status: filterStatus || undefined,
      })
      setQuotes(data.items)
      setTotal(data.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, filterType, filterStatus])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Devis</h1>
          <button
            onClick={() => navigate('/app/devis/new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Nouveau devis
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1) }} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
            <option value="">Tous types</option>
            <option value="devis">Devis</option>
            <option value="bpu">BPU</option>
            <option value="attachement">Attachement</option>
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
            <option value="">Tous statuts</option>
            <option value="draft">Brouillon</option>
            <option value="sent">Envoyé</option>
            <option value="accepted">Accepté</option>
            <option value="refused">Refusé</option>
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : quotes.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun devis trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total HT</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const st = STATUS_LABELS[q.status] || { label: q.status, cls: 'bg-gray-100 text-gray-600' }
                  const typeLabel = q.is_avenant ? `Avenant n°${q.avenant_number}` : (DOC_LABELS[q.document_type] || q.document_type)
                  return (
                    <tr key={q.id} onClick={() => navigate(`/app/devis/${q.id}`)} className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{q.number}</td>
                      <td className="px-4 py-3 text-gray-500">{typeLabel}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{q.client_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{q.issue_date}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(q.subtotal_ht)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Précédent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Suivant</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Détail ─────────────────────────────────────────────────────────────────────

function QuoteDetailView({ quoteId }: { quoteId: string }) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    setLoading(true)
    orgGet<QuoteDetail>(`/quotes/${quoteId}`)
      .then(setQuote)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [quoteId])

  async function doAction(action: string) {
    setActionLoading(action)
    try {
      await orgPost(`/quotes/${quoteId}/${action}`)
      const data = await orgGet<QuoteDetail>(`/quotes/${quoteId}`)
      setQuote(data)
    } catch { /* ignore */ }
    setActionLoading('')
  }

  if (loading) return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  if (!quote) return <div className="flex-1 flex justify-center items-center text-gray-400">Devis introuvable</div>

  const st = STATUS_LABELS[quote.status] || { label: quote.status, cls: 'bg-gray-100 text-gray-600' }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={() => navigate('/app/devis')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {quote.is_avenant ? `Avenant n°${quote.avenant_number}` : (DOC_LABELS[quote.document_type] || 'Devis')} {quote.number}
            </h1>
            <p className="text-sm text-gray-400">{quote.client_name} — {quote.issue_date}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.cls}`}>{st.label}</span>
        </div>

        {/* Actions */}
        {quote.status === 'draft' && (
          <div className="flex gap-2 mb-6">
            <button onClick={() => navigate(`/app/devis/${quoteId}/edit`)} className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition">
              Modifier
            </button>
            <button onClick={() => doAction('send')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
            </button>
            <button onClick={() => doAction('duplicate')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
              <Copy className="w-4 h-4" /> Dupliquer
            </button>
          </div>
        )}
        {quote.status === 'sent' && (
          <div className="flex gap-2 mb-6">
            <button onClick={() => doAction('accept')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accepter
            </button>
            <button onClick={() => doAction('refuse')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
              <X className="w-4 h-4" /> Refuser
            </button>
            <button onClick={() => doAction('duplicate')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
              <Copy className="w-4 h-4" /> Dupliquer
            </button>
          </div>
        )}

        {/* Totaux */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total HT</p>
            <p className="text-xl font-bold text-gray-900">{fmtCurrency(quote.subtotal_ht)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">TVA</p>
            <p className="text-xl font-bold text-gray-900">{fmtCurrency(quote.total_vat)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total TTC</p>
            <p className="text-xl font-bold text-orange-600">{fmtCurrency(quote.total_ttc)}</p>
          </div>
        </div>

        {/* Lignes */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                <th className="px-4 py-3">Réf.</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qté</th>
                <th className="px-4 py-3 text-right">PU HT</th>
                <th className="px-4 py-3 text-right">TVA</th>
                <th className="px-4 py-3 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.reference || '—'}</td>
                  <td className="px-4 py-3 text-gray-900">{l.description || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{Number(l.quantity)} {l.unit || ''}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(l.unit_price)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{Number(l.vat_rate)}%</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCurrency(l.total_ht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Notes */}
        {quote.notes && (
          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Formulaire création/édition ──────────────────────────────────────────────

function QuoteFormPage({ quoteId }: { quoteId?: string }) {
  const isEdit = !!quoteId

  // Données du formulaire
  const [clientId, setClientId] = useState('')
  const [documentType, setDocumentType] = useState('devis')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState('')
  const [billingProfileId, setBillingProfileId] = useState('')
  const [discountType, setDiscountType] = useState('none')
  const [discountValue, setDiscountValue] = useState('0')
  const [notes, setNotes] = useState('')
  const [footer, setFooter] = useState('')
  const [lines, setLines] = useState<FormLine[]>([emptyLine()])

  // Données de référence
  const [clients, setClients] = useState<ClientOption[]>([])
  const [profiles, setProfiles] = useState<BillingProfile[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  // Charger les données de référence
  useEffect(() => {
    Promise.all([
      orgGet<{ items: ClientOption[] }>('/clients', { page_size: 100 }),
      orgGet<BillingProfile[]>('/billing/profiles'),
    ]).then(([clientsData, profilesData]) => {
      setClients(clientsData.items)
      setProfiles(profilesData)
      // Auto-sélectionner le profil par défaut
      if (!isEdit) {
        const defaultProfile = profilesData.find((p) => p.is_default)
        if (defaultProfile) {
          setBillingProfileId(defaultProfile.id)
          if (defaultProfile.footer) setFooter(defaultProfile.footer)
        }
      }
    }).catch(() => {})
  }, [isEdit])

  // Charger le devis si édition
  useEffect(() => {
    if (!quoteId) return
    setLoading(true)
    orgGet<QuoteDetail>(`/quotes/${quoteId}`)
      .then((q) => {
        setClientId(q.client_id)
        setDocumentType(q.document_type)
        setIssueDate(q.issue_date)
        setExpiryDate(q.expiry_date || '')
        setBillingProfileId(q.billing_profile_id || '')
        setDiscountType(q.discount_type)
        setDiscountValue(String(q.discount_value))
        setNotes(q.notes || '')
        setFooter(q.footer || '')
        setLines(
          q.lines.length > 0
            ? q.lines.map((l) => ({
                key: l.id,
                product_id: l.product_id,
                client_product_variant_id: null,
                reference: l.reference || '',
                description: l.description || '',
                quantity: String(l.quantity),
                unit: l.unit || '',
                unit_price: String(l.unit_price),
                vat_rate: String(l.vat_rate),
                discount_percent: String(l.discount_percent),
              }))
            : [emptyLine()]
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [quoteId])

  // Calculs live
  const totals = useMemo(() => {
    let subtotalHT = 0
    let totalVAT = 0
    for (const line of lines) {
      subtotalHT += calcLineHT(line)
      totalVAT += calcLineVAT(line)
    }
    // Remise globale
    if (discountType === 'percent') {
      const disc = (parseFloat(discountValue) || 0) / 100
      const discAmount = subtotalHT * disc
      subtotalHT -= discAmount
      totalVAT -= totalVAT * disc
    } else if (discountType === 'fixed') {
      const disc = parseFloat(discountValue) || 0
      subtotalHT -= disc
    }
    subtotalHT = Math.round(subtotalHT * 100) / 100
    totalVAT = Math.round(totalVAT * 100) / 100
    return { subtotalHT, totalVAT, totalTTC: Math.round((subtotalHT + totalVAT) * 100) / 100 }
  }, [lines, discountType, discountValue])

  // Gestion des lignes
  function updateLine(index: number, field: keyof FormLine, value: string | null) {
    setLines((prev) => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index))
  }

  function selectProduct(index: number, product: AutocompleteProduct) {
    setLines((prev) => prev.map((l, i) => i === index ? {
      ...l,
      product_id: product.id,
      reference: product.reference || '',
      description: product.name + (product.description ? `\n${product.description}` : ''),
      unit: product.unit || '',
      unit_price: product.unit_price != null ? String(product.unit_price) : '0',
      vat_rate: String(product.vat_rate),
    } : l))
  }

  // Sauvegarde
  async function handleSave(andSend = false) {
    if (!clientId) return
    setSaving(true)

    // Créer les nouveaux articles (lignes sans product_id)
    const updatedLines = [...lines]
    let newArticlesCount = 0
    for (let i = 0; i < updatedLines.length; i++) {
      const l = updatedLines[i]
      if (!l.product_id && l.description.trim()) {
        try {
          const result = await orgPost<{ id: string }>('/catalog/products', {
            name: l.description.split('\n')[0],
            description: l.description.includes('\n') ? l.description.split('\n').slice(1).join('\n') : undefined,
            unit: l.unit || undefined,
            unit_price: parseFloat(l.unit_price) || undefined,
            vat_rate: parseFloat(l.vat_rate) || 20,
            reference: l.reference || undefined,
            is_in_catalog: false,
          })
          updatedLines[i] = { ...l, product_id: result.id }
          newArticlesCount++
        } catch { /* continue même si la création échoue */ }
      }
    }
    if (newArticlesCount > 0) {
      setLines(updatedLines)
    }

    const payload = {
      client_id: clientId,
      document_type: documentType,
      issue_date: issueDate,
      expiry_date: expiryDate || null,
      billing_profile_id: billingProfileId || null,
      discount_type: discountType,
      discount_value: parseFloat(discountValue) || 0,
      notes: notes || null,
      footer: footer || null,
      lines: updatedLines.map((l, i) => ({
        product_id: l.product_id,
        client_product_variant_id: l.client_product_variant_id,
        position: i,
        reference: l.reference || null,
        description: l.description || null,
        quantity: parseFloat(l.quantity) || 1,
        unit: l.unit || null,
        unit_price: parseFloat(l.unit_price) || 0,
        vat_rate: parseFloat(l.vat_rate) || 0,
        discount_percent: parseFloat(l.discount_percent) || 0,
      })),
    }

    try {
      let resultId = quoteId
      if (isEdit && quoteId) {
        await orgPatch(`/quotes/${quoteId}`, payload)
      } else {
        const result = await orgPost<{ id: string; number: string }>('/quotes', payload)
        resultId = result.id
      }

      if (andSend && resultId) {
        await orgPost(`/quotes/${resultId}/send`)
      }

      navigate(resultId ? `/app/devis/${resultId}` : '/app/devis')
    } catch { /* */ }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <button onClick={() => navigate(quoteId ? `/app/devis/${quoteId}` : '/app/devis')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <h1 className="text-xl font-semibold text-gray-900 mb-6">
          {isEdit ? 'Modifier le devis' : 'Nouveau devis'}
        </h1>

        {/* En-tête */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">En-tête</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Client *</label>
              <ClientCombobox
                value={clientId}
                onChange={setClientId}
                onNewClient={() => navigate('/app/clients?action=nouveau')}
                className={INPUT}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type de document</label>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={`${INPUT} bg-white`}>
                <option value="devis">Devis</option>
                <option value="bpu">BPU</option>
                <option value="attachement">Attachement</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date d'émission</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date d'expiration</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Profil de facturation</label>
              <select value={billingProfileId} onChange={(e) => setBillingProfileId(e.target.value)} className={`${INPUT} bg-white`}>
                <option value="">— Aucun —</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (défaut)' : ''}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Lignes</h2>
              {lines.some((l) => !l.product_id && l.description.trim()) && (
                <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  {lines.filter((l) => !l.product_id && l.description.trim()).length} nouvel article{lines.filter((l) => !l.product_id && l.description.trim()).length > 1 ? 's' : ''} sera créé{lines.filter((l) => !l.product_id && l.description.trim()).length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  <th className="px-2 py-2 w-20">Réf.</th>
                  <th className="px-2 py-2">Désignation</th>
                  <th className="px-2 py-2 w-16">Qté</th>
                  <th className="px-2 py-2 w-20">Unité</th>
                  <th className="px-2 py-2 w-24">PU HT</th>
                  <th className="px-2 py-2 w-16">TVA %</th>
                  <th className="px-2 py-2 w-16">Rem. %</th>
                  <th className="px-2 py-2 w-24 text-right">Total HT</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const lineHT = calcLineHT(line)
                  return (
                    <tr key={line.key} className="border-b border-gray-50">
                      <td className="px-1 py-1.5">
                        <input type="text" value={line.reference} onChange={(e) => updateLine(i, 'reference', e.target.value)} placeholder="Réf" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      </td>
                      <td className="px-1 py-1.5">
                        <ProductAutocomplete
                          value={line.description}
                          onChange={(text) => { updateLine(i, 'description', text); if (line.product_id) updateLine(i, 'product_id', null) }}
                          onSelect={(p) => selectProduct(i, p)}
                          clientId={clientId || null}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                          placeholder="Désignation"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 text-right" />
                      </td>
                      <td className="px-1 py-1.5">
                        <UnitCombobox value={line.unit} onChange={(v) => updateLine(i, 'unit', v)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 text-right" />
                      </td>
                      <td className="px-1 py-1.5">
                        <select value={line.vat_rate} onChange={(e) => updateLine(i, 'vat_rate', e.target.value)} className="w-full px-1 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
                          <option value="20">20</option>
                          <option value="10">10</option>
                          <option value="5.5">5.5</option>
                          <option value="2.1">2.1</option>
                          <option value="0">0</option>
                        </select>
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.1" min="0" max="100" value={line.discount_percent} onChange={(e) => updateLine(i, 'discount_percent', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 text-right" />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium text-gray-900 whitespace-nowrap">
                        {fmtCurrency(lineHT)}
                      </td>
                      <td className="px-1 py-1.5">
                        <button onClick={() => removeLine(i)} className="p-1 rounded hover:bg-red-50 transition" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pied de devis */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Options</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Remise globale</label>
              <div className="flex gap-2">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="none">Aucune</option>
                  <option value="percent">Pourcentage</option>
                  <option value="fixed">Montant fixe</option>
                </select>
                {discountType !== 'none' && (
                  <input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? '%' : '€'} className={`w-24 ${INPUT}`} />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes internes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INPUT} placeholder="Visibles uniquement par vous" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pied de page</label>
              <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className={INPUT} placeholder="Texte en bas du document" />
            </div>
          </div>

          {/* Récapitulatif */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Récapitulatif</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sous-total HT</span>
                <span className="font-medium text-gray-900">{fmtCurrency(totals.subtotalHT)}</span>
              </div>
              {discountType !== 'none' && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remise {discountType === 'percent' ? `(${discountValue}%)` : ''}</span>
                  <span className="text-red-500">
                    {discountType === 'percent'
                      ? `- ${fmtCurrency(lines.reduce((s, l) => s + calcLineHT(l), 0) * (parseFloat(discountValue) || 0) / 100)}`
                      : `- ${fmtCurrency(parseFloat(discountValue) || 0)}`
                    }
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">TVA</span>
                <span className="font-medium text-gray-900">{fmtCurrency(totals.totalVAT)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between">
                <span className="text-base font-semibold text-gray-900">Total TTC</span>
                <span className="text-xl font-bold text-orange-600">{fmtCurrency(totals.totalTTC)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            onClick={() => navigate(quoteId ? `/app/devis/${quoteId}` : '/app/devis')}
            className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !clientId}
            className="px-5 py-2.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer (brouillon)'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !clientId}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Enregistrer et envoyer</>}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function QuotesPage({ path }: { path: string }) {
  // /app/devis/new
  if (path === '/app/devis/new') return <QuoteFormPage />

  // /app/devis/{id}/edit
  const editMatch = path.match(/^\/app\/devis\/(.+)\/edit$/)
  if (editMatch) return <QuoteFormPage quoteId={editMatch[1]} />

  // /app/devis/{id}
  const detailMatch = path.match(/^\/app\/devis\/([^/]+)$/)
  if (detailMatch) return <QuoteDetailView quoteId={detailMatch[1]} />

  // /app/devis
  return <QuotesList />
}

// Kerpta — Page devis (liste, détail, création, édition)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Loader2, ArrowLeft, Send, Check, X, Copy, Plus, Trash2, RefreshCw, Info,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import UnitCombobox from '@/components/app/UnitCombobox'
import ProductAutocomplete, { type AutocompleteProduct } from '@/components/app/ProductAutocomplete'
import ClientCombobox, { type ClientItem } from '@/components/app/ClientCombobox'
import DatePicker from '@/components/app/DatePicker'
import ColumnFilterHeader, { type FilterValues, type FilterOption } from '@/components/app/ColumnFilter'
import { INPUT, SELECT, LINE_INPUT, LINE_SELECT } from '@/lib/formStyles'

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

const QUOTE_FILTERS: FilterOption[] = [
  { column: 'number', label: 'N°', type: 'text', placeholder: 'Rechercher un numéro...' },
  { column: 'type', label: 'Type', type: 'select', options: [
    { value: 'devis', label: 'Devis' },
    { value: 'bpu', label: 'BPU' },
    { value: 'attachement', label: 'Attachement' },
  ] },
  { column: 'client', label: 'Client', type: 'text', placeholder: 'Rechercher un client...' },
  { column: 'date', label: 'Date', type: 'date-range' },
  { column: 'status', label: 'Statut', type: 'multi-select', options: [
    { value: 'draft', label: 'Brouillon' },
    { value: 'sent', label: 'Envoyé' },
    { value: 'accepted', label: 'Accepté' },
    { value: 'refused', label: 'Refusé' },
    { value: 'expired', label: 'Expiré' },
  ] },
]

function QuotesList() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterValues>({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const updateFilter = useCallback((column: string, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [column]: value }))
    setPage(1)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page }

      if (filters.number) params.search = filters.number as string
      if (filters.type) params.document_type = filters.type as string
      if (filters.client) params.client_search = filters.client as string
      const dateArr = filters.date as string[] | undefined
      if (dateArr?.[0]) params.date_from = dateArr[0]
      if (dateArr?.[1]) params.date_to = dateArr[1]
      const statusArr = filters.status as string[] | undefined
      if (statusArr?.length === 1) params.status = statusArr[0]

      const data = await orgGet<{ items: Quote[]; total: number }>('/quotes', params)
      let items = data.items

      if (statusArr && statusArr.length > 1) {
        items = items.filter((q) => statusArr.includes(q.status))
      }

      setQuotes(items)
      setTotal(data.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, filters])

  // Debounce pour les filtres texte
  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 300)
    return () => clearTimeout(timer)
  }, [load])

  const activeFilterCount = Object.values(filters).filter((v) =>
    (typeof v === 'string' && v) || (Array.isArray(v) && v.some(Boolean))
  ).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Devis</h1>
            <div className="relative group">
              <Info className="w-4 h-4 text-gray-300 hover:text-gray-500 transition cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 bg-gray-800 text-white text-[11px] rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition z-50">
                Cliquez sur les en-têtes de colonnes pour filtrer
              </div>
            </div>
            {activeFilterCount > 0 && (
              <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                {activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/app/devis/new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Nouveau devis
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <ColumnFilterHeader filter={QUOTE_FILTERS[0]} value={filters.number || ''} onChange={(v) => updateFilter('number', v)} />
                <ColumnFilterHeader filter={QUOTE_FILTERS[1]} value={filters.type || ''} onChange={(v) => updateFilter('type', v)} />
                <ColumnFilterHeader filter={QUOTE_FILTERS[2]} value={filters.client || ''} onChange={(v) => updateFilter('client', v)} />
                <ColumnFilterHeader filter={QUOTE_FILTERS[3]} value={filters.date || []} onChange={(v) => updateFilter('date', v)} />
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Total HT</th>
                <ColumnFilterHeader filter={QUOTE_FILTERS[4]} value={filters.status || []} onChange={(v) => updateFilter('status', v)} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" /></td></tr>
              ) : quotes.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">Aucun devis trouvé</td></tr>
              ) : (
                quotes.map((q) => {
                  const st = STATUS_LABELS[q.status] || { label: q.status, cls: 'bg-gray-100 text-gray-600' }
                  const typeLabel = q.is_avenant ? `Avenant n°${q.avenant_number}` : (DOC_LABELS[q.document_type] || q.document_type)
                  const isEditable = q.status === 'draft'
                  return (
                    <tr key={q.id} onClick={() => isEditable ? setEditId(q.id) : setSelectedId(q.id)} className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{q.number}</td>
                      <td className="px-4 py-3 text-gray-500">{typeLabel}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{q.client_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{q.issue_date}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(q.subtotal_ht)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Précédent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Suivant</button>
          </div>
        )}
        {/* Panneau détail devis (lecture seule) */}
        {selectedId && (
          <QuoteDetailPanel
            quoteId={selectedId}
            onClose={() => { setSelectedId(null); void load() }}
          />
        )}

        {/* Formulaire édition en overlay */}
        {editId && (
          <QuoteFormPage
            quoteId={editId}
            onClose={() => { setEditId(null); void load() }}
          />
        )}
      </div>
    </div>
  )
}

// ── Détail ─────────────────────────────────────────────────────────────────────

function QuoteDetailPanel({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
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

  const st = quote ? (STATUS_LABELS[quote.status] || { label: quote.status, cls: 'bg-gray-100 text-gray-600' }) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full mx-6 max-w-4xl mt-8 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : !quote ? (
          <div className="py-16 text-center text-gray-400 text-sm">Devis introuvable</div>
        ) : (
          <>
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {quote.is_avenant ? `Avenant n°${quote.avenant_number}` : (DOC_LABELS[quote.document_type] || 'Devis')} {quote.number}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">{quote.client_name} — {quote.issue_date}</span>
              {st && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.label}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition ml-3">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5">
        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-5">
          {quote.status === 'draft' && (
            <>
              <button onClick={() => doAction('send')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
              </button>
              <button onClick={() => doAction('duplicate')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
                <Copy className="w-4 h-4" /> Dupliquer
              </button>
            </>
          )}
          {quote.status === 'sent' && (
            <>
              <button onClick={() => doAction('accept')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accepter
              </button>
              <button onClick={() => doAction('refuse')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
                <X className="w-4 h-4" /> Refuser
              </button>
              <button onClick={() => doAction('duplicate')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
                <Copy className="w-4 h-4" /> Dupliquer
              </button>
            </>
          )}
        </div>

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
          </>
        )}
      </div>
    </div>
  )
}

// ── Formulaire création/édition ──────────────────────────────────────────────

function QuoteFormPage({ quoteId, onClose }: { quoteId?: string; onClose?: () => void }) {
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
  const [profiles, setProfiles] = useState<BillingProfile[]>([])
  const [docColumns, setDocColumns] = useState({
    reference: true, description: true, quantity: true, unit: true,
    unit_price: true, vat_rate: true, discount_percent: true, total_ht: true,
  })
  const [vatRates, setVatRates] = useState<{ rate: string; label: string }[]>([
    { rate: '20', label: 'TVA 20%' }, { rate: '10', label: 'TVA 10%' },
    { rate: '5.5', label: 'TVA 5,5%' }, { rate: '2.1', label: 'TVA 2,1%' },
    { rate: '0', label: 'TVA 0%' },
  ])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  // Charger la config colonnes et taux TVA
  useEffect(() => {
    orgGet<Record<string, boolean>>('/billing/document-columns').then((cols) => setDocColumns((prev) => ({ ...prev, ...cols }))).catch(() => {})
    orgGet<{ rate: string; label: string }[]>('/billing/vat-rates').then(setVatRates).catch(() => {})
  }, [])

  // Charger les données de référence
  useEffect(() => {
    orgGet<BillingProfile[]>('/billing/profiles').then((profilesData) => {
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

  // Appliquer un profil de facturation
  function applyProfile(profile: BillingProfile) {
    setBillingProfileId(profile.id)
    if (profile.footer) setFooter(profile.footer)
  }

  // Quand le client change, appliquer son profil par défaut
  function handleClientSelect(client: ClientItem | null) {
    if (client?.billing_profile_id) {
      const profile = profiles.find((p) => p.id === client.billing_profile_id)
      if (profile) applyProfile(profile)
    }
  }

  // Quand le profil change manuellement
  function handleProfileChange(profileId: string) {
    const profile = profiles.find((p) => p.id === profileId)
    if (profile) {
      applyProfile(profile)
    } else {
      setBillingProfileId(profileId)
    }
  }

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

  // Actualiser une ligne depuis le catalogue (recharge les données du produit source)
  async function refreshLine(index: number) {
    const line = lines[index]
    if (!line.product_id) return
    try {
      const product = await orgGet<AutocompleteProduct>(`/catalog/products/${line.product_id}`)
      setLines((prev) => prev.map((l, i) => i === index ? {
        ...l,
        reference: product.reference || '',
        description: product.name + (product.description ? `\n${product.description}` : ''),
        unit: product.unit || '',
        unit_price: product.unit_price != null ? String(product.unit_price) : '0',
        vat_rate: String(product.vat_rate),
      } : l))
    } catch { /* produit supprimé ou inaccessible */ }
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

      if (onClose) onClose()
      else navigate('/app/devis')
    } catch { /* */ }
    setSaving(false)
  }

  if (loading) {
    if (onClose) return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full mx-6 max-w-5xl mt-8 mb-8 flex justify-center py-16" onClick={(e) => e.stopPropagation()}>
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      </div>
    )
    return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  }

  const formContent = (
    <>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {isEdit ? 'Modifier le devis' : 'Nouveau devis'}
          </h1>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        {/* En-tête */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">En-tête</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Client *</label>
              <ClientCombobox
                value={clientId}
                onChange={setClientId}
                onSelect={handleClientSelect}
                onNewClient={() => navigate('/app/clients?action=nouveau')}
                className={INPUT}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type de document</label>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={SELECT}>
                <option value="devis">Devis</option>
                <option value="bpu">BPU</option>
                <option value="attachement">Attachement</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date d'émission</label>
              <DatePicker value={issueDate} onChange={setIssueDate} className={INPUT} placeholder="Date d'émission" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date d'expiration</label>
              <DatePicker value={expiryDate} onChange={setExpiryDate} className={INPUT} placeholder="Date d'expiration" clearable />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Profil de facturation</label>
              <select value={billingProfileId} onChange={(e) => handleProfileChange(e.target.value)} className={SELECT}>
                <option value="">— Aucun —</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (défaut)' : ''}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Lignes</h2>
            {lines.some((l) => !l.product_id && l.description.trim()) && (
              <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                {lines.filter((l) => !l.product_id && l.description.trim()).length} nouvel article{lines.filter((l) => !l.product_id && l.description.trim()).length > 1 ? 's' : ''} sera créé{lines.filter((l) => !l.product_id && l.description.trim()).length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  {docColumns.reference && <th className="px-2 py-2 w-20">Réf.</th>}
                  <th className="px-2 py-2">Désignation</th>
                  <th className="px-2 py-2 w-16">Qté</th>
                  {docColumns.unit && <th className="px-2 py-2 w-20">Unité</th>}
                  <th className="px-2 py-2 w-24">PU HT</th>
                  {docColumns.vat_rate && <th className="px-2 py-2 w-20">TVA %</th>}
                  {docColumns.discount_percent && <th className="px-2 py-2 w-16">Rem. %</th>}
                  <th className="px-2 py-2 w-28 text-right">Total HT</th>
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const lineHT = calcLineHT(line)
                  return (
                    <tr key={line.key} className="border-b border-gray-50 align-middle">
                      {docColumns.reference && (
                        <td className="px-1 py-1.5">
                          <input type="text" value={line.reference} onChange={(e) => updateLine(i, 'reference', e.target.value)} placeholder="Réf" className={LINE_INPUT} />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <ProductAutocomplete
                          value={line.description}
                          onChange={(text) => { updateLine(i, 'description', text); if (line.product_id) updateLine(i, 'product_id', null) }}
                          onSelect={(p) => selectProduct(i, p)}
                          clientId={clientId || null}
                          className={LINE_INPUT}
                          placeholder="Désignation"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className={`${LINE_INPUT} text-right`} />
                      </td>
                      {docColumns.unit && (
                        <td className="px-1 py-1.5">
                          <UnitCombobox value={line.unit} onChange={(v) => updateLine(i, 'unit', v)} className={LINE_INPUT} />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} className={`${LINE_INPUT} text-right`} />
                      </td>
                      {docColumns.vat_rate && (
                        <td className="px-1 py-1.5">
                          <select value={line.vat_rate} onChange={(e) => updateLine(i, 'vat_rate', e.target.value)} className={LINE_SELECT}>
                            {vatRates.map((vr) => <option key={vr.rate} value={vr.rate}>{vr.rate}%</option>)}
                          </select>
                        </td>
                      )}
                      {docColumns.discount_percent && (
                        <td className="px-1 py-1.5">
                          <input type="number" step="0.1" min="0" max="100" value={line.discount_percent} onChange={(e) => updateLine(i, 'discount_percent', e.target.value)} className={`${LINE_INPUT} text-right`} />
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right text-xs font-medium text-gray-900 whitespace-nowrap align-middle">
                        {fmtCurrency(lineHT)}
                      </td>
                      <td className="px-1 py-1.5">
                        <div className="flex gap-0.5">
                          {line.product_id && (
                            <button onClick={() => refreshLine(i)} className="p-1 rounded hover:bg-blue-50 transition" title="Actualiser depuis le catalogue">
                              <RefreshCw className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                            </button>
                          )}
                          <button onClick={() => removeLine(i)} className="p-1 rounded hover:bg-red-50 transition" title="Supprimer">
                            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium transition px-2 py-1"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un élément
          </button>

          {/* Alerte TVA 0% */}
          {lines.some((l) => parseFloat(l.vat_rate) === 0 && l.description.trim()) && (
            <div className="mt-3 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <span className="font-bold text-amber-500 mt-px">⚠</span>
              <span>
                Une ou plusieurs lignes utilisent un taux de TVA à 0 %. Assurez-vous que la mention légale correspondante
                (ex : « TVA non applicable, art. 293 B du CGI ») est bien configurée dans votre profil de facturation
                (Paramètres de vente).
              </span>
            </div>
          )}
        </div>

        {/* Pied de devis */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Options</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Remise globale</label>
              <div className="flex gap-2">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className={SELECT}>
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
                <span className="text-xl font-bold text-gray-900">{fmtCurrency(totals.totalTTC)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            onClick={() => onClose ? onClose() : navigate('/app/devis')}
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
    </>
  )

  // Mode overlay (édition depuis la liste)
  if (onClose) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-xl w-full mx-6 max-w-5xl mt-8 mb-8 px-6 py-6"
          onClick={(e) => e.stopPropagation()}
        >
          {formContent}
        </div>
      </div>
    )
  }

  // Mode pleine page (création)
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <button onClick={() => navigate('/app/devis')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        {formContent}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function QuotesPage({ path }: { path: string }) {
  if (path === '/app/devis/new') return <QuoteFormPage />
  return <QuotesList />
}

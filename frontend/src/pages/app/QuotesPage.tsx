// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Loader2, ArrowLeft, Send, Check, X, Copy } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost } from '@/lib/orgApi'

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

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Envoyé', cls: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepté', cls: 'bg-green-100 text-green-700' },
  refused: { label: 'Refusé', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expiré', cls: 'bg-yellow-100 text-yellow-700' },
}

const DOC_LABELS: Record<string, string> = {
  devis: 'Devis',
  bpu: 'BPU',
  attachement: 'Attachement',
}

function fmtCurrency(v: number) {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

// ── Liste ─────────────────────────────────────────────────────────────────────

function QuotesList() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
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
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function QuotesPage({ path }: { path: string }) {
  const match = path.match(/^\/app\/devis\/(.+)$/)
  if (match) return <QuoteDetailView quoteId={match[1]} />
  return <QuotesList />
}

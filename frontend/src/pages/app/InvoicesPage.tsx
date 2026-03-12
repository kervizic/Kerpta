// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Loader2, ArrowLeft, Send, Check, FileText } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost } from '@/lib/orgApi'

interface Invoice {
  id: string
  number: string
  client_name: string | null
  is_credit_note: boolean
  is_situation: boolean
  situation_number: number | null
  status: string
  issue_date: string
  due_date: string | null
  subtotal_ht: number
  total_ttc: number
  amount_paid: number
  created_at: string
}

interface InvoiceDetail extends Invoice {
  client_id: string
  quote_id: string | null
  contract_id: string | null
  situation_id: string | null
  credit_note_for: string | null
  total_vat: number
  discount_type: string
  discount_value: number
  payment_terms: number
  payment_method: string | null
  notes: string | null
  footer: string | null
  lines: InvoiceLine[]
}

interface InvoiceLine {
  id: string
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
  sent: { label: 'Envoyée', cls: 'bg-blue-100 text-blue-700' },
  partial: { label: 'Partiel', cls: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'Payée', cls: 'bg-green-100 text-green-700' },
  overdue: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulée', cls: 'bg-gray-100 text-gray-400' },
}

function fmtCurrency(v: number) {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

// ── Liste ─────────────────────────────────────────────────────────────────────

function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCN, setFilterCN] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<{ items: Invoice[]; total: number }>('/invoices', {
        page,
        status: filterStatus || undefined,
        is_credit_note: filterCN === '' ? undefined : filterCN === 'true',
      })
      setInvoices(data.items)
      setTotal(data.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, filterStatus, filterCN])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Factures</h1>
        </div>

        <div className="flex gap-3 mb-4">
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
            <option value="">Tous statuts</option>
            <option value="draft">Brouillon</option>
            <option value="sent">Envoyée</option>
            <option value="paid">Payée</option>
            <option value="overdue">En retard</option>
            <option value="cancelled">Annulée</option>
          </select>
          <select value={filterCN} onChange={(e) => { setFilterCN(e.target.value); setPage(1) }} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
            <option value="">Tous</option>
            <option value="false">Factures</option>
            <option value="true">Avoirs</option>
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucune facture trouvée</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Échéance</th>
                  <th className="px-4 py-3 text-right">Total TTC</th>
                  <th className="px-4 py-3 text-right">Payé</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = STATUS_LABELS[inv.status] || { label: inv.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={inv.id} onClick={() => navigate(`/app/factures/${inv.id}`)} className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {inv.is_credit_note && <span className="text-red-500 mr-1">CN</span>}
                        {inv.number}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.client_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.issue_date}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.due_date || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(inv.total_ttc)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{fmtCurrency(inv.amount_paid)}</td>
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

function InvoiceDetailView({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    setLoading(true)
    orgGet<InvoiceDetail>(`/invoices/${invoiceId}`)
      .then(setInvoice)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [invoiceId])

  async function doAction(action: string) {
    setActionLoading(action)
    try {
      await orgPost(`/invoices/${invoiceId}/${action}`)
      const data = await orgGet<InvoiceDetail>(`/invoices/${invoiceId}`)
      setInvoice(data)
    } catch { /* ignore */ }
    setActionLoading('')
  }

  if (loading) return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  if (!invoice) return <div className="flex-1 flex justify-center items-center text-gray-400">Facture introuvable</div>

  const st = STATUS_LABELS[invoice.status] || { label: invoice.status, cls: 'bg-gray-100 text-gray-600' }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={() => navigate('/app/factures')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {invoice.is_credit_note ? 'Avoir' : 'Facture'} {invoice.number}
              {invoice.is_situation && <span className="text-gray-400 ml-2">(Situation n°{invoice.situation_number})</span>}
            </h1>
            <p className="text-sm text-gray-400">{invoice.client_name} — {invoice.issue_date}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.cls}`}>{st.label}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-6">
          {invoice.status === 'draft' && (
            <button onClick={() => doAction('send')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
            </button>
          )}
          {['sent', 'partial', 'overdue'].includes(invoice.status) && (
            <button onClick={() => doAction('mark-paid')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {actionLoading === 'mark-paid' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Marquer payée
            </button>
          )}
          {!invoice.is_credit_note && !['draft', 'cancelled'].includes(invoice.status) && (
            <button onClick={() => doAction('credit-note')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
              {actionLoading === 'credit-note' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Créer un avoir
            </button>
          )}
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total HT</p>
            <p className="text-lg font-bold text-gray-900">{fmtCurrency(invoice.subtotal_ht)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">TVA</p>
            <p className="text-lg font-bold text-gray-900">{fmtCurrency(invoice.total_vat)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total TTC</p>
            <p className="text-lg font-bold text-orange-600">{fmtCurrency(invoice.total_ttc)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Payé</p>
            <p className={`text-lg font-bold ${Number(invoice.amount_paid) >= Number(invoice.total_ttc) ? 'text-green-600' : 'text-gray-500'}`}>{fmtCurrency(invoice.amount_paid)}</p>
          </div>
        </div>

        {/* Lignes */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qté</th>
                <th className="px-4 py-3 text-right">PU HT</th>
                <th className="px-4 py-3 text-right">TVA</th>
                <th className="px-4 py-3 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-50">
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

        {/* Info complémentaire */}
        {(invoice.notes || invoice.payment_method) && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5 mt-4 space-y-2 text-sm">
            {invoice.payment_method && <p><span className="text-gray-400">Mode de paiement :</span> {invoice.payment_method}</p>}
            {invoice.notes && <p><span className="text-gray-400">Notes :</span> {invoice.notes}</p>}
          </section>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InvoicesPage({ path }: { path: string }) {
  const match = path.match(/^\/app\/factures\/(.+)$/)
  if (match) return <InvoiceDetailView invoiceId={match[1]} />
  return <InvoicesList />
}

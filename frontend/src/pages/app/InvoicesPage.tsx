// Kerpta — Page factures (liste, détail, création, édition)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Loader2, Send, Check, FileText, Plus, Trash2, Pencil, RefreshCw,
  ShieldCheck, Printer, Lock, X, Info,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import UnitCombobox from '@/components/app/UnitCombobox'
import ProductAutocomplete, { type AutocompleteProduct } from '@/components/app/ProductAutocomplete'
import ClientCombobox from '@/components/app/ClientCombobox'
import BillingProfileModal, { type BillingProfileData } from '@/components/app/BillingProfileModal'
import ClientPanel from '@/components/app/ClientPanel'
import DatePicker from '@/components/app/DatePicker'
import ModalOverlay from '@/components/app/ModalOverlay'
import ColumnFilterHeader, { type FilterValues, type FilterOption } from '@/components/app/ColumnFilter'
import axios from 'axios'

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 transition'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string
  number: string | null
  proforma_number: string | null
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
  billing_profile_id: string | null
  total_vat: number
  discount_type: string
  discount_value: number
  payment_terms: number
  payment_method: string | null
  customer_reference: string | null
  purchase_order_number: string | null
  notes: string | null
  footer: string | null
  lines: InvoiceLineDetail[]
}

interface InvoiceLineDetail {
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

interface ClientOption { id: string; name: string; billing_profile_id?: string | null }
interface BillingProfile {
  id: string; name: string; is_default: boolean
  payment_terms: number | null; payment_method: string | null
  footer: string | null
}

// ── Types ligne formulaire ────────────────────────────────────────────────

interface FormLine {
  key: string
  product_id: string | null
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
  validated: { label: 'Validée', cls: 'bg-orange-100 text-orange-700' },
  sent: { label: 'Envoyée', cls: 'bg-blue-100 text-blue-700' },
  partial: { label: 'Partiel', cls: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'Payée', cls: 'bg-green-100 text-green-700' },
  overdue: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulée', cls: 'bg-gray-100 text-gray-400' },
}

interface PaymentMethodOption { id: string; label: string; position: number }

function fmtCurrency(v: number) {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function calcLineHT(line: FormLine): number {
  const qty = parseFloat(line.quantity) || 0
  const price = parseFloat(line.unit_price) || 0
  const discount = parseFloat(line.discount_percent) || 0
  return Math.round(qty * price * (1 - discount / 100) * 100) / 100
}

function calcLineVAT(line: FormLine): number {
  const ht = calcLineHT(line)
  const rate = parseFloat(line.vat_rate) || 0
  return Math.round(ht * rate / 100 * 100) / 100
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Liste ─────────────────────────────────────────────────────────────────────

const INVOICE_FILTERS: FilterOption[] = [
  { column: 'number', label: 'N°', type: 'text', placeholder: 'Rechercher un numéro...' },
  { column: 'type', label: 'Type', type: 'select', options: [
    { value: 'false', label: 'Facture' },
    { value: 'true', label: 'Avoir' },
  ] },
  { column: 'client', label: 'Client', type: 'text', placeholder: 'Rechercher un client...' },
  { column: 'date', label: 'Date', type: 'date-range' },
  { column: 'status', label: 'Statut', type: 'multi-select', options: [
    { value: 'draft', label: 'Brouillon' },
    { value: 'validated', label: 'Validée' },
    { value: 'sent', label: 'Envoyée' },
    { value: 'partial', label: 'Partiel' },
    { value: 'paid', label: 'Payée' },
    { value: 'overdue', label: 'En retard' },
    { value: 'cancelled', label: 'Annulée' },
  ] },
]

function InvoicesList({ initialSelectedId }: { initialSelectedId?: string } = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterValues>({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)

  const updateFilter = useCallback((column: string, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [column]: value }))
    setPage(1)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | boolean | number | undefined> = { page }

      // Numéro
      if (filters.number) params.search = filters.number as string
      // Type (facture/avoir)
      if (filters.type) params.is_credit_note = filters.type === 'true'
      // Client
      if (filters.client) params.client_search = filters.client as string
      // Date
      const dateArr = filters.date as string[] | undefined
      if (dateArr?.[0]) params.date_from = dateArr[0]
      if (dateArr?.[1]) params.date_to = dateArr[1]
      // Statut (multi-select → on envoie le premier pour l'instant, filtrage client pour multi)
      const statusArr = filters.status as string[] | undefined
      if (statusArr?.length === 1) params.status = statusArr[0]

      const data = await orgGet<{ items: Invoice[]; total: number }>('/invoices', params)
      let items = data.items

      // Filtrage côté client pour multi-status (le backend ne supporte qu'un seul)
      if (statusArr && statusArr.length > 1) {
        items = items.filter((inv) => statusArr.includes(inv.status))
      }

      setInvoices(items)
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
            <h1 className="text-xl font-semibold text-gray-900">Factures</h1>
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
            onClick={() => navigate('/app/factures/nouveau')}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle facture
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucune facture trouvée</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <ColumnFilterHeader filter={INVOICE_FILTERS[0]} value={filters.number || ''} onChange={(v) => updateFilter('number', v)} />
                  <ColumnFilterHeader filter={INVOICE_FILTERS[1]} value={filters.type || ''} onChange={(v) => updateFilter('type', v)} />
                  <ColumnFilterHeader filter={INVOICE_FILTERS[2]} value={filters.client || ''} onChange={(v) => updateFilter('client', v)} />
                  <ColumnFilterHeader filter={INVOICE_FILTERS[3]} value={filters.date || []} onChange={(v) => updateFilter('date', v)} />
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Échéance</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Total TTC</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Payé</th>
                  <ColumnFilterHeader filter={INVOICE_FILTERS[4]} value={filters.status || []} onChange={(v) => updateFilter('status', v)} />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = STATUS_LABELS[inv.status] || { label: inv.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={inv.id} onClick={() => setSelectedId(inv.id)} className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {inv.number || inv.proforma_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {inv.is_credit_note ? 'Avoir' : 'Facture'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.client_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.issue_date}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{inv.due_date || '—'}</td>
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

        {/* Modale détail facture */}
        {selectedId && (
          <InvoiceDetailModal
            invoiceId={selectedId}
            onClose={() => { setSelectedId(null); void load() }}
          />
        )}
      </div>
    </div>
  )
}

// ── Détail (modale) ──────────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
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

  const st = invoice ? (STATUS_LABELS[invoice.status] || { label: invoice.status, cls: 'bg-gray-100 text-gray-600' }) : null

  return (
    <ModalOverlay onClose={onClose} size="full">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : !invoice ? (
          <div className="py-16 text-center text-gray-400 text-sm">Facture introuvable</div>
        ) : (
          <>
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {invoice.is_credit_note ? 'Avoir' : invoice.number ? 'Facture' : 'Proforma'} {invoice.number || invoice.proforma_number}
                {invoice.is_situation && <span className="text-gray-400 ml-2 text-sm">(Situation n°{invoice.situation_number})</span>}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{invoice.client_name} — {invoice.issue_date}</span>
                {st && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.label}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition ml-3">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5">
        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-5">
          {invoice.status === 'draft' && (
            <>
              <button onClick={() => navigate(`/app/factures/${invoiceId}/modifier`)} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition">
                <Pencil className="w-4 h-4" /> Modifier
              </button>
              <button onClick={() => doAction('validate')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {actionLoading === 'validate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Valider
              </button>
              <button onClick={() => window.open(`/api/v1/invoices/${invoiceId}/pdf?proforma=true`, '_blank')} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
                <Printer className="w-4 h-4" /> Imprimer proforma
              </button>
              <button onClick={() => doAction('send')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
                {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer proforma
              </button>
            </>
          )}
          {invoice.status === 'validated' && (
            <>
              <button onClick={() => navigate(`/app/factures/${invoiceId}/modifier`)} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition">
                <Pencil className="w-4 h-4" /> Modifier
              </button>
              <button onClick={() => window.open(`/api/v1/invoices/${invoiceId}/pdf`, '_blank')} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
                <Printer className="w-4 h-4" /> Imprimer facture
              </button>
              <button onClick={() => doAction('send')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer facture
              </button>
            </>
          )}
          {['sent', 'partial', 'overdue'].includes(invoice.status) && (
            <>
              <button onClick={() => window.open(`/api/v1/invoices/${invoiceId}/pdf`, '_blank')} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition">
                <Printer className="w-4 h-4" /> Imprimer facture
              </button>
              <button onClick={() => doAction('mark-paid')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {actionLoading === 'mark-paid' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Marquer payée
              </button>
            </>
          )}
          {!invoice.is_credit_note && !['draft', 'validated', 'cancelled'].includes(invoice.status) && (
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
        {(invoice.notes || invoice.payment_method || invoice.footer || invoice.customer_reference || invoice.purchase_order_number) && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5 mt-4 space-y-2 text-sm">
            {invoice.customer_reference && <p><span className="text-gray-400">Référence client :</span> {invoice.customer_reference}</p>}
            {invoice.purchase_order_number && <p><span className="text-gray-400">N° commande :</span> {invoice.purchase_order_number}</p>}
            {invoice.payment_method && <p><span className="text-gray-400">Mode de règlement :</span> {invoice.payment_method}</p>}
            {invoice.due_date && <p><span className="text-gray-400">Échéance :</span> {invoice.due_date}</p>}
            {invoice.notes && <p><span className="text-gray-400">Notes :</span> {invoice.notes}</p>}
            {invoice.footer && (
              <div className="border-t border-gray-100 pt-2 mt-2">
                <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Mentions légales</p>
                <p className="text-gray-600 whitespace-pre-line text-xs">{invoice.footer}</p>
              </div>
            )}
          </section>
        )}
        </div>
          </>
        )}
    </ModalOverlay>
  )
}

// ── Formulaire création/édition ──────────────────────────────────────────────

function InvoiceFormPage({ invoiceId }: { invoiceId?: string }) {
  const isEdit = !!invoiceId

  // Données du formulaire
  const [clientId, setClientId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [billingProfileId, setBillingProfileId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [discountType, setDiscountType] = useState('none')
  const [discountValue, setDiscountValue] = useState('0')
  const [customerReference, setCustomerReference] = useState('')
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [footer, setFooter] = useState('')
  const [lines, setLines] = useState<FormLine[]>([emptyLine()])

  // Données de référence
  const [clients, setClients] = useState<ClientOption[]>([])
  const [profiles, setProfiles] = useState<BillingProfile[]>([])
  const [profilesFull, setProfilesFull] = useState<BillingProfileData[]>([])
  const [profileModal, setProfileModal] = useState<BillingProfileData | 'new' | null>(null)
  const [clientPanelId, setClientPanelId] = useState<string | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])
  const [docColumns, setDocColumns] = useState({
    reference: true, description: true, quantity: true, unit: true,
    unit_price: true, vat_rate: true, discount_percent: true, total_ht: true,
  })
  const [vatRates, setVatRates] = useState<{ rate: string; label: string }[]>([
    { rate: '20', label: 'TVA 20%' }, { rate: '10', label: 'TVA 10%' },
    { rate: '5.5', label: 'TVA 5,5%' }, { rate: '2.1', label: 'TVA 2,1%' },
    { rate: '0', label: 'TVA 0%' },
  ])
  const [invoiceStatus, setInvoiceStatus] = useState('draft')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isValidated = invoiceStatus === 'validated'

  // Charger les données de référence
  useEffect(() => {
    orgGet<Record<string, boolean>>('/billing/document-columns').then((cols) => setDocColumns((prev) => ({ ...prev, ...cols }))).catch(() => {})
    orgGet<{ rate: string; label: string }[]>('/billing/vat-rates').then(setVatRates).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      orgGet<{ items: ClientOption[] }>('/clients', { page_size: 100 }),
      orgGet<BillingProfile[]>('/billing/profiles'),
      orgGet<PaymentMethodOption[]>('/billing/payment-methods'),
    ]).then(([clientsData, profilesData, methodsData]) => {
      setClients(clientsData.items)
      setProfiles(profilesData)
      setProfilesFull(profilesData as unknown as BillingProfileData[])
      setPaymentMethods(methodsData)
      // Auto-sélectionner le profil par défaut
      if (!isEdit) {
        const defaultProfile = profilesData.find((p) => p.is_default)
        if (defaultProfile) {
          applyProfile(defaultProfile)
        }
      }
    }).catch(() => {})
  }, [isEdit])

  // Appliquer un profil de facturation
  function applyProfile(profile: BillingProfile) {
    setBillingProfileId(profile.id)
    if (profile.footer) setFooter(profile.footer)
    if (profile.payment_method) setPaymentMethod(profile.payment_method)
    if (profile.payment_terms != null) {
      setPaymentTerms(profile.payment_terms)
      setDueDate(addDays(issueDate, profile.payment_terms))
    }
  }

  // Charger la facture si édition
  useEffect(() => {
    if (!invoiceId) return
    setLoading(true)
    orgGet<InvoiceDetail>(`/invoices/${invoiceId}`)
      .then((inv) => {
        setInvoiceStatus(inv.status)
        setClientId(inv.client_id)
        setIssueDate(inv.issue_date)
        setDueDate(inv.due_date || '')
        setBillingProfileId(inv.billing_profile_id || '')
        setPaymentMethod(inv.payment_method || '')
        setPaymentTerms(inv.payment_terms)
        setDiscountType(inv.discount_type)
        setDiscountValue(String(inv.discount_value))
        setCustomerReference(inv.customer_reference || '')
        setPurchaseOrderNumber(inv.purchase_order_number || '')
        setNotes(inv.notes || '')
        setFooter(inv.footer || '')
        setLines(
          inv.lines.length > 0
            ? inv.lines.map((l) => ({
                key: l.id,
                product_id: l.product_id,
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
  }, [invoiceId])

  // Calculs live
  const totals = useMemo(() => {
    let subtotalHT = 0
    let totalVAT = 0
    const vatByRate: Record<string, { base: number; vat: number }> = {}

    for (const line of lines) {
      const ht = calcLineHT(line)
      const vat = calcLineVAT(line)
      subtotalHT += ht
      totalVAT += vat
      const rateKey = String(parseFloat(line.vat_rate) || 0)
      if (!vatByRate[rateKey]) vatByRate[rateKey] = { base: 0, vat: 0 }
      vatByRate[rateKey].base += ht
      vatByRate[rateKey].vat += vat
    }

    // Remise globale
    if (discountType === 'percent') {
      const disc = (parseFloat(discountValue) || 0) / 100
      subtotalHT -= subtotalHT * disc
      totalVAT -= totalVAT * disc
    } else if (discountType === 'fixed') {
      subtotalHT -= parseFloat(discountValue) || 0
    }

    subtotalHT = Math.round(subtotalHT * 100) / 100
    totalVAT = Math.round(totalVAT * 100) / 100
    return { subtotalHT, totalVAT, totalTTC: Math.round((subtotalHT + totalVAT) * 100) / 100, vatByRate }
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
  async function handleSave(andSend = false, andValidate = false) {
    if (!clientId) return
    setSaving(true)
    setError('')

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
        } catch { /* continue */ }
      }
    }
    if (newArticlesCount > 0) setLines(updatedLines)

    const payload = {
      client_id: clientId,
      issue_date: issueDate,
      due_date: dueDate || null,
      payment_terms: paymentTerms,
      payment_method: paymentMethod || null,
      billing_profile_id: billingProfileId || null,
      customer_reference: customerReference || null,
      purchase_order_number: purchaseOrderNumber || null,
      discount_type: discountType,
      discount_value: parseFloat(discountValue) || 0,
      notes: notes || null,
      footer: footer || null,
      lines: updatedLines.map((l, i) => ({
        product_id: l.product_id,
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
      let resultId = invoiceId
      if (isEdit && invoiceId) {
        await orgPatch(`/invoices/${invoiceId}`, payload)
      } else {
        const result = await orgPost<{ id: string; number: string }>('/invoices', payload)
        resultId = result.id
      }

      if (andValidate && resultId) {
        await orgPost(`/invoices/${resultId}/validate`)
      } else if (andSend && resultId) {
        await orgPost(`/invoices/${resultId}/send`)
      }

      navigate(resultId ? `/app/factures/${resultId}` : '/app/factures')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: unknown }
        if (typeof d?.detail === 'string') setError(d.detail)
        else setError(`Erreur ${err.response?.status || ''} — impossible d'enregistrer la facture`)
      } else {
        setError("Erreur inattendue lors de l'enregistrement")
      }
    }
    setSaving(false)
  }

  // Quand le client change, appliquer son profil par défaut
  function handleClientChange(newClientId: string) {
    setClientId(newClientId)
    const client = clients.find((c) => c.id === newClientId)
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

  // Quand la date d'émission change, recalculer l'échéance
  function handleIssueDateChange(date: string) {
    setIssueDate(date)
    if (paymentTerms > 0) {
      setDueDate(addDays(date, paymentTerms))
    }
  }

  if (loading) {
    return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <button onClick={() => navigate(invoiceId ? `/app/factures/${invoiceId}` : '/app/factures')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <h1 className="text-xl font-semibold text-gray-900 mb-6">
          {isEdit ? 'Modifier la facture' : 'Nouvelle facture'}
        </h1>

        {error && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {isValidated && (
          <div className="flex items-start gap-3 px-5 py-4 bg-orange-50 border border-orange-200 rounded-2xl mb-4">
            <Lock className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">Facture validée</p>
              <p className="text-xs text-orange-600 mt-0.5">
                Seuls les notes internes et le mode de règlement sont modifiables après validation (obligation légale française).
              </p>
            </div>
          </div>
        )}

        {/* En-tête */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">En-tête</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Client *</label>
              <div className="flex items-center gap-1.5">
                <ClientCombobox
                  value={clientId}
                  onChange={handleClientChange}
                  onNewClient={() => navigate('/app/clients?action=nouveau')}
                  className={INPUT}
                  disabled={isValidated}
                />
                {clientId && (
                  <button onClick={() => setClientPanelId(clientId)} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition" title="Voir le client">
                    <Pencil className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Profil de facturation</label>
              <div className="flex items-center gap-1.5">
                <select value={billingProfileId} onChange={(e) => {
                  if (e.target.value === '__new__') { setProfileModal('new'); return }
                  handleProfileChange(e.target.value)
                }} className={`${INPUT} bg-white`} disabled={isValidated}>
                  <option value="">— Aucun —</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (défaut)' : ''}</option>)}
                  <option value="__new__">+ Nouveau profil</option>
                </select>
                {billingProfileId && (
                  <button onClick={() => {
                    const full = profilesFull.find((p) => p.id === billingProfileId)
                    if (full) setProfileModal(full)
                  }} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition" title="Modifier le profil">
                    <Pencil className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date d'émission</label>
              <DatePicker value={issueDate} onChange={handleIssueDateChange} className={INPUT} disabled={isValidated} placeholder="Date d'émission" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date d'échéance</label>
              <DatePicker value={dueDate} onChange={setDueDate} className={INPUT} disabled={isValidated} placeholder="Date d'échéance" clearable />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Mode de règlement</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`${INPUT} bg-white h-[38px]`}>
                <option value="">— Non spécifié —</option>
                {paymentMethods.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Référence client</label>
              <input type="text" value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} placeholder="N° devis, contrat, marché..." className={INPUT} disabled={isValidated} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">N° commande</label>
              <input type="text" value={purchaseOrderNumber} onChange={(e) => setPurchaseOrderNumber(e.target.value)} placeholder="N° bon de commande" className={INPUT} disabled={isValidated} />
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
                    <tr key={line.key} className="border-b border-gray-50 align-top">
                      {docColumns.reference && (
                        <td className="px-1 py-1.5">
                          <input type="text" value={line.reference} onChange={(e) => updateLine(i, 'reference', e.target.value)} placeholder="Réf" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400" disabled={isValidated} />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <ProductAutocomplete
                          value={line.description}
                          onChange={(text) => { updateLine(i, 'description', text); if (line.product_id) updateLine(i, 'product_id', null) }}
                          onSelect={(p) => selectProduct(i, p)}
                          clientId={clientId || null}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                          placeholder="Désignation"
                          disabled={isValidated}
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 text-right" disabled={isValidated} />
                      </td>
                      {docColumns.unit && (
                        <td className="px-1 py-1.5">
                          <UnitCombobox value={line.unit} onChange={(v) => updateLine(i, 'unit', v)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400" disabled={isValidated} />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 text-right" disabled={isValidated} />
                      </td>
                      {docColumns.vat_rate && (
                        <td className="px-1 py-1.5">
                          <select value={line.vat_rate} onChange={(e) => updateLine(i, 'vat_rate', e.target.value)} className="w-full px-2 py-0 h-[30px] text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white" disabled={isValidated}>
                            {vatRates.map((vr) => <option key={vr.rate} value={vr.rate}>{vr.rate}%</option>)}
                          </select>
                        </td>
                      )}
                      {docColumns.discount_percent && (
                        <td className="px-1 py-1.5">
                          <input type="number" step="0.1" min="0" max="100" value={line.discount_percent} onChange={(e) => updateLine(i, 'discount_percent', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 text-right" disabled={isValidated} />
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right text-xs font-medium text-gray-900 whitespace-nowrap">
                        {fmtCurrency(lineHT)}
                      </td>
                      {!isValidated && (
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
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!isValidated && (
            <button
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium transition px-2 py-1"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter un élément
            </button>
          )}

          {/* Alerte TVA 0% */}
          {lines.some((l) => parseFloat(l.vat_rate) === 0 && l.description.trim()) && (
            <div className="mt-3 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <span className="font-bold text-amber-500 mt-px">⚠</span>
              <span>
                Une ou plusieurs lignes utilisent un taux de TVA à 0 %. Assurez-vous que la mention légale correspondante
                (ex : « TVA non applicable, art. 293 B du CGI ») est bien configurée dans votre{' '}
                <button type="button" onClick={() => {
                  const full = profilesFull.find((p) => p.id === billingProfileId)
                  if (full) setProfileModal(full)
                }} className="text-orange-600 hover:underline font-medium">profil de facturation</button>.
              </span>
            </div>
          )}
        </div>

        {/* Pied de facture */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Options</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Remise globale</label>
              <div className="flex gap-2">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="px-3 py-2 h-[38px] text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" disabled={isValidated}>
                  <option value="none">Aucune</option>
                  <option value="percent">Pourcentage</option>
                  <option value="fixed">Montant fixe</option>
                </select>
                {discountType !== 'none' && (
                  <input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? '%' : '€'} className={`w-24 ${INPUT}`} disabled={isValidated} />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes internes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INPUT} placeholder="Visibles uniquement par vous" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Récapitulatif</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sous-total HT</span>
                <span className="font-medium text-gray-900">{fmtCurrency(totals.subtotalHT)}</span>
              </div>
              {discountType !== 'none' && parseFloat(discountValue) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Remise {discountType === 'percent' ? `${discountValue}%` : 'fixe'}</span>
                  <span>-{discountType === 'percent' ? fmtCurrency(lines.reduce((s, l) => s + calcLineHT(l), 0) * (parseFloat(discountValue) || 0) / 100) : fmtCurrency(parseFloat(discountValue) || 0)}</span>
                </div>
              )}
              {Object.entries(totals.vatByRate)
                .filter(([, v]) => v.vat !== 0)
                .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                .map(([rate, v]) => (
                  <div key={rate} className="flex justify-between text-gray-500">
                    <span>TVA {rate}% (base {fmtCurrency(v.base)})</span>
                    <span>{fmtCurrency(v.vat)}</span>
                  </div>
                ))}
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-gray-500">Total TVA</span>
                <span className="font-medium text-gray-900">{fmtCurrency(totals.totalVAT)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between text-base">
                <span className="font-semibold text-gray-900">Total TTC</span>
                <span className="font-bold text-gray-900">{fmtCurrency(totals.totalTTC)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !clientId}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Enregistrer
          </button>
          {!isValidated && (
            <button
              onClick={() => handleSave(false, true)}
              disabled={saving || !clientId}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Valider
            </button>
          )}
        </div>

        {/* Modale profil de facturation */}
        {profileModal !== null && (
          <BillingProfileModal
            profile={profileModal === 'new' ? null : profileModal}
            onClose={() => setProfileModal(null)}
            onSaved={async () => {
              try {
                const updated = await orgGet<BillingProfileData[]>('/billing/profiles')
                setProfilesFull(updated)
                setProfiles(updated as unknown as BillingProfile[])
              } catch { /* */ }
            }}
          />
        )}

        {/* Modale fiche client */}
        {clientPanelId && (
          <ClientPanel
            clientId={clientPanelId}
            compact
            onClose={() => setClientPanelId(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InvoicesPage({ path }: { path: string }) {
  if (path === '/app/factures/nouveau') return <InvoiceFormPage />
  const editMatch = path.match(/^\/app\/factures\/(.+)\/modifier$/)
  if (editMatch) return <InvoiceFormPage invoiceId={editMatch[1]} />
  const detailMatch = path.match(/^\/app\/factures\/(.+)$/)
  if (detailMatch) return <InvoicesList initialSelectedId={detailMatch[1]} />
  return <InvoicesList />
}

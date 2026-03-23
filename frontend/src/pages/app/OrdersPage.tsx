// Kerpta - Page commandes clients (liste + detail overlay)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, X, Plus, FileText, Receipt, Archive, ArchiveRestore,
  ShoppingCart, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { orgGet, orgPost } from '@/lib/orgApi'
import ClientCombobox from '@/components/app/ClientCombobox'
import ColumnFilterHeader, { type FilterValues, type FilterOption } from '@/components/app/ColumnFilter'
import MobileFilterPanel from '@/components/app/MobileFilterPanel'
import PageLayout from '@/components/app/PageLayout'
import { BTN, BTN_SM, BTN_SECONDARY, CARD, INPUT, SELECT, TEXTAREA, LABEL, OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER, BADGE_COUNT } from '@/lib/formStyles'
import { fmtCurrency } from '@/lib/formatting'

// -- Types --------------------------------------------------------------------

interface Order {
  id: string
  client_id: string
  client_name: string | null
  client_reference: string | null
  display_reference: string | null
  source: string
  status: string
  issue_date: string
  delivery_date: string | null
  subtotal_ht: number
  total_vat: number
  total_ttc: number
  is_archived: boolean
  contract_id: string | null
  created_at: string
}

interface OrderLine {
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

interface LinkedDoc {
  id: string
  number: string | null
  proforma_number?: string | null
}

interface OrderDetail extends Order {
  currency: string
  discount_type: string
  discount_value: number
  notes: string | null
  client_document_url: string | null
  lines: OrderLine[]
  linked_quotes: LinkedDoc[]
  linked_invoices: LinkedDoc[]
}

// -- Constantes ---------------------------------------------------------------

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  confirmed: { label: 'Confirmee', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  partially_invoiced: { label: 'Part. facturee', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  invoiced: { label: 'Facturee', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  cancelled: { label: 'Annulee', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
}

const SOURCE_LABELS: Record<string, string> = {
  quote_validation: 'Validation devis',
  quote_invoice: 'Facturation devis',
  client_document: 'BC client',
  manual: 'Manuelle',
}

type OrderTypeFilter = 'all' | 'orders' | 'contracts'

// -- Filtres ------------------------------------------------------------------

const ORDER_FILTERS: FilterOption[] = [
  { column: 'reference', label: 'Reference', type: 'text', placeholder: 'Rechercher...' },
  { column: 'client', label: 'Client', type: 'text', placeholder: 'Rechercher un client...' },
  { column: 'date', label: 'Date', type: 'date-range' },
  { column: 'status', label: 'Statut', type: 'multi-select', options: [
    { value: 'draft', label: 'Brouillon' },
    { value: 'confirmed', label: 'Confirmee' },
    { value: 'partially_invoiced', label: 'Part. facturee' },
    { value: 'invoiced', label: 'Facturee' },
    { value: 'cancelled', label: 'Annulee' },
  ] },
]

// -- Composant principal ------------------------------------------------------

export default function OrdersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterValues>({})
  const [debouncedFilters, setDebouncedFilters] = useState<FilterValues>({})
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all')

  // Selection multiple + archivage
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)

  const qc = useQueryClient()
  const invalidate = () => { setSelected(new Set()); void qc.invalidateQueries({ queryKey: ['orders'] }) }

  const updateFilter = (column: string, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [column]: value }))
    setPage(1)
  }

  // Debounce des filtres (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedFilters(filters), 300)
    return () => clearTimeout(debounceRef.current)
  }, [filters])

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['orders', { page, filters: debouncedFilters, showArchived }],
    queryFn: () => {
      const params: Record<string, string | number | undefined> = { page, page_size: 25 }
      if (debouncedFilters.reference) params.search = debouncedFilters.reference as string
      if (debouncedFilters.client) params.client_search = debouncedFilters.client as string
      const dateArr = debouncedFilters.date as string[] | undefined
      if (dateArr?.[0]) params.date_from = dateArr[0]
      if (dateArr?.[1]) params.date_to = dateArr[1]
      const statusArr = debouncedFilters.status as string[] | undefined
      if (statusArr?.length === 1) params.status = statusArr[0]
      if (showArchived) params.archived = 'true'
      return orgGet<{ items: Order[]; total: number }>('/orders', params)
    },
  })

  const statusArr = debouncedFilters.status as string[] | undefined
  const orders = useMemo(() => {
    let items = rawData?.items ?? []
    // Filtre statut multi-select cote client
    if (statusArr && statusArr.length > 1) {
      items = items.filter((o) => statusArr.includes(o.status))
    }
    // Filtre type : commandes vs contrats
    if (orderTypeFilter === 'orders') {
      items = items.filter((o) => !o.contract_id)
    } else if (orderTypeFilter === 'contracts') {
      items = items.filter((o) => !!o.contract_id)
    }
    return items
  }, [rawData, statusArr, orderTypeFilter])
  const total = rawData?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  const activeFilterCount = Object.values(filters).filter((v) =>
    (typeof v === 'string' && v) || (Array.isArray(v) && v.some(Boolean))
  ).length

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === orders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orders.map((o) => o.id)))
    }
  }

  async function batchArchive() {
    if (selected.size === 0) return
    setBatchLoading(true)
    try {
      await orgPost('/orders/batch/archive', { ids: [...selected], archive: !showArchived })
      invalidate()
    } catch { /* */ }
    setBatchLoading(false)
  }

  const TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
    { key: 'all', label: 'Toutes' },
    { key: 'orders', label: 'Commandes' },
    { key: 'contracts', label: 'Contrats' },
  ]

  return (
    <PageLayout
      icon={<ShoppingCart className="w-5 h-5 text-kerpta" />}
      title="Commandes"
      actions={<>
        {activeFilterCount > 0 && (
          <span className="text-[10px] bg-kerpta-100 text-kerpta-700 dark:bg-kerpta-900/40 dark:text-kerpta-400 px-2 py-0.5 rounded-full font-medium">
            {activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''}
          </span>
        )}
        {/* Barre d'actions (selection active) */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{selected.size} selectionne{selected.size > 1 ? 's' : ''}</span>
            <button
              onClick={batchArchive}
              disabled={batchLoading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
            >
              {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {showArchived ? 'Desarchiver' : 'Archiver'}
            </button>
          </div>
        )}
        {/* Toggle archives */}
        <button
          onClick={() => { setShowArchived((v) => !v); setPage(1) }}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
            showArchived
              ? 'border-kerpta-300 bg-kerpta-50 text-kerpta-700 dark:border-kerpta-600 dark:bg-kerpta-900/30 dark:text-kerpta-400'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <Archive className="w-3.5 h-3.5 inline mr-1" />
          Archivees
        </button>
        {/* Bouton filtres mobile */}
        <button
          onClick={() => setShowMobileFilters(true)}
          className={`md:hidden relative p-2 rounded-lg border transition ${
            activeFilterCount > 0 ? 'border-kerpta-300 bg-kerpta-50 text-kerpta-600 dark:border-kerpta-600 dark:bg-kerpta-900/30 dark:text-kerpta-400' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {activeFilterCount > 0 && (
            <span className={`absolute -top-1 -right-1 w-4 h-4 ${BADGE_COUNT}`}>
              {activeFilterCount}
            </span>
          )}
        </button>
        <button onClick={() => setShowCreate(true)} className={BTN}>
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nouvelle commande</span>
        </button>
      </>}
    >
      {/* Onglets Toutes / Commandes / Contrats */}
      <div className="flex gap-1 mb-3">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setOrderTypeFilter(tab.key); setPage(1) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              orderTypeFilter === tab.key
                ? 'border-kerpta-300 bg-kerpta-50 text-kerpta-700 dark:border-kerpta-600 dark:bg-kerpta-900/30 dark:text-kerpta-400'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop : tableau */}
      <div className="hidden md:block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-left">
              <th className="pl-3 pr-1 py-3 w-[1%] whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={orders.length > 0 && selected.size === orders.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-kerpta focus:ring-kerpta-400"
                />
              </th>
              <ColumnFilterHeader filter={ORDER_FILTERS[0]} value={filters.reference || ''} onChange={(v) => updateFilter('reference', v)} />
              <ColumnFilterHeader filter={ORDER_FILTERS[1]} value={filters.client || ''} onChange={(v) => updateFilter('client', v)} />
              <ColumnFilterHeader filter={ORDER_FILTERS[2]} value={filters.date || []} onChange={(v) => updateFilter('date', v)} />
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Total TTC</th>
              <ColumnFilterHeader filter={ORDER_FILTERS[3]} value={filters.status || []} onChange={(v) => updateFilter('status', v)} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-kerpta mx-auto" /></td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucune commande trouvee</td></tr>
            ) : (
              orders.map((o) => {
                const st = STATUS_LABELS[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
                return (
                  <tr key={o.id} onClick={() => setSelectedId(o.id)} className="border-b border-gray-50 dark:border-gray-700 hover:bg-kerpta-50/50 dark:hover:bg-kerpta-900/30 cursor-pointer transition">
                    <td className="pl-3 pr-1 py-3 w-[1%] whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-kerpta focus:ring-kerpta-400"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {o.display_reference || '-'}
                        {o.contract_id && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
                            Contrat
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{o.client_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{o.issue_date}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtCurrency(o.total_ttc)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile : cartes */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucune commande trouvee</div>
        ) : (
          orders.map((o) => {
            const st = STATUS_LABELS[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
            return (
              <div
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`${CARD} p-4 cursor-pointer hover:border-kerpta-200 dark:hover:border-kerpta-700 transition active:bg-kerpta-50/50 dark:active:bg-kerpta-900/30`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleSelect(o.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-kerpta focus:ring-kerpta-400"
                    />
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {o.display_reference || '-'}
                    </span>
                    {o.contract_id && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 shrink-0">
                        Contrat
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pl-6">
                  <span>{o.client_name || '-'}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmtCurrency(o.total_ttc)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5 pl-6">
                  <span>{o.issue_date}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className={BTN_SM}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={BTN_SM}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filtres mobile */}
      {showMobileFilters && (
        <MobileFilterPanel
          filters={ORDER_FILTERS}
          values={filters}
          onChange={(col, val) => updateFilter(col, val)}
          onClose={() => setShowMobileFilters(false)}
          onReset={() => { setFilters({}); setShowMobileFilters(false) }}
        />
      )}

      {/* Overlay detail */}
      {selectedId && (
        <OrderDetailOverlay
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={invalidate}
        />
      )}

      {/* Modale creation */}
      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); invalidate() }}
        />
      )}
    </PageLayout>
  )
}

// -- Detail overlay -----------------------------------------------------------

function OrderDetailOverlay({
  orderId, onClose, onRefresh,
}: {
  orderId: string
  onClose: () => void
  onRefresh: () => void
}) {
  const [invoicing, setInvoicing] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => orgGet<OrderDetail>(`/orders/${orderId}`),
  })

  async function handleInvoice() {
    if (!order) return
    setInvoicing(true)
    try {
      await orgPost(`/orders/${orderId}/invoice`, {})
      onRefresh()
      onClose()
    } catch {
      alert('Erreur lors de la facturation')
    } finally {
      setInvoicing(false)
    }
  }

  return (
    <div className={OVERLAY_BACKDROP} onClick={onClose}>
      <div className={OVERLAY_PANEL + ' max-h-[90vh] overflow-y-auto'} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={OVERLAY_HEADER}>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-kerpta" />
            <span className="font-semibold text-gray-900 dark:text-white">
              {order?.display_reference || 'Commande'}
            </span>
            {order && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(STATUS_LABELS[order.status] || { cls: '' }).cls}`}>
                {(STATUS_LABELS[order.status] || { label: order.status }).label}
              </span>
            )}
            {order?.contract_id && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
                Contrat
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
          </div>
        )}

        {order && (
          <div className="p-4 md:p-6 space-y-6">
            {/* Infos generales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className={LABEL}>Client</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white block">{order.client_name || '-'}</span>
              </div>
              <div>
                <span className={LABEL}>Ref. client</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white block">{order.client_reference || '-'}</span>
              </div>
              <div>
                <span className={LABEL}>Source</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 block">{SOURCE_LABELS[order.source] || order.source}</span>
              </div>
              <div>
                <span className={LABEL}>Date</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 block">{new Date(order.issue_date).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>

            {/* Devis lies */}
            {order.linked_quotes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Devis lies ({order.linked_quotes.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {order.linked_quotes.map(q => (
                    <span key={q.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                      <FileText className="w-3 h-3" />
                      {q.number || q.id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Factures liees */}
            {order.linked_invoices.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Factures liees ({order.linked_invoices.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {order.linked_invoices.map(inv => (
                    <span key={inv.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium">
                      <Receipt className="w-3 h-3" />
                      {inv.number || inv.proforma_number || inv.id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lignes */}
            {order.lines.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Lignes ({order.lines.length})
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
                        <th className="py-2 px-3 text-left font-medium">Description</th>
                        <th className="py-2 px-3 text-right font-medium">Qte</th>
                        <th className="py-2 px-3 text-right font-medium">PU HT</th>
                        <th className="py-2 px-3 text-right font-medium">TVA</th>
                        <th className="py-2 px-3 text-right font-medium">Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map(ln => (
                        <tr key={ln.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-3 text-gray-900 dark:text-white">
                            {ln.reference && <span className="text-xs text-gray-400 mr-1">{ln.reference}</span>}
                            {ln.description || '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">
                            {ln.quantity}{ln.unit ? ` ${ln.unit}` : ''}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">
                            {fmtCurrency(ln.unit_price)}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">
                            {ln.vat_rate}%
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">
                            {fmtCurrency(ln.total_ht)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totaux */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Sous-total HT</span>
                  <span>{fmtCurrency(order.subtotal_ht)}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>TVA</span>
                  <span>{fmtCurrency(order.total_vat)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-1">
                  <span>Total TTC</span>
                  <span>{fmtCurrency(order.total_ttc)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {order.notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Notes</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}

            {/* Actions */}
            {order.status !== 'invoiced' && order.status !== 'cancelled' && (
              <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button onClick={handleInvoice} disabled={invoicing} className={BTN + ' flex-1'}>
                  {invoicing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                  Facturer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// -- Modale creation ----------------------------------------------------------

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clientId, setClientId] = useState('')
  const [clientRef, setClientRef] = useState('')
  const [source, setSource] = useState('client_document')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!clientId) { setError('Selectionnez un client'); return }
    setSaving(true)
    setError('')
    try {
      await orgPost('/orders', {
        client_id: clientId,
        client_reference: clientRef || null,
        source,
        issue_date: issueDate,
        notes: notes || null,
        lines: [],
      })
      onCreated()
    } catch {
      setError('Erreur lors de la creation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={OVERLAY_BACKDROP} onClick={onClose}>
      <div className={OVERLAY_PANEL + ' max-w-lg p-6'} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nouvelle commande</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={LABEL}>Client *</label>
            <ClientCombobox
              value={clientId}
              onChange={(id: string) => setClientId(id)}
            />
          </div>

          <div>
            <label className={LABEL}>Reference BC client</label>
            <input className={INPUT} placeholder="Ex: BC-42-2026" value={clientRef} onChange={e => setClientRef(e.target.value)} />
          </div>

          <div>
            <label className={LABEL}>Source</label>
            <select className={SELECT} value={source} onChange={e => setSource(e.target.value)}>
              <option value="client_document">BC client recu</option>
              <option value="manual">Commande manuelle</option>
            </select>
          </div>

          <div>
            <label className={LABEL}>Date</label>
            <input className={INPUT} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>

          <div>
            <label className={LABEL}>Notes</label>
            <textarea className={TEXTAREA + ' h-20'} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button onClick={handleSave} disabled={saving} className={BTN}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Creer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Kerpta - Page commandes clients (liste + detail overlay)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, X, Plus, FileText, Receipt, Archive, ArchiveRestore,
  ShoppingCart, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { orgGet, orgPost } from '@/lib/orgApi'
import ClientCombobox, { type ClientItem } from '@/components/app/ClientCombobox'
import PageLayout from '@/components/app/PageLayout'
import { BTN, BTN_SM, BTN_SECONDARY, CARD, INPUT, SELECT, TEXTAREA, LABEL, OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER } from '@/lib/formStyles'
import { fmtCurrency } from '@/lib/formatting'

// ── Types ────────────────────────────────────────────────────────────────────

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
  contract_id: string | null
  lines: OrderLine[]
  linked_quotes: LinkedDoc[]
  linked_invoices: LinkedDoc[]
}

// ── Constantes ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  confirmed: 'Confirmee',
  partially_invoiced: 'Partiellement facturee',
  invoiced: 'Facturee',
  cancelled: 'Annulee',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  partially_invoiced: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  invoiced: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const SOURCE_LABELS: Record<string, string> = {
  quote_validation: 'Validation devis',
  quote_invoice: 'Facturation devis',
  client_document: 'BC client',
  manual: 'Manuelle',
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function OrdersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, statusFilter, search, showArchived],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', '25')
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      if (showArchived) params.set('archived', 'true')
      return orgGet<{ items: Order[]; total: number; page: number; page_size: number }>(
        `/orders?${params.toString()}`
      )
    },
  })

  const orders = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  return (
    <PageLayout
      icon={<ShoppingCart className="w-5 h-5 text-kerpta" />}
      title="Commandes"
      subtitle={`${total} commande${total > 1 ? 's' : ''}`}
    >
      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setShowCreate(true)} className={BTN}>
          <Plus className="w-4 h-4" /> Nouvelle commande
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className={INPUT + ' max-w-xs'}
          placeholder="Rechercher..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className={SELECT + ' max-w-[180px]'}
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={BTN_SM}
        >
          {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          {showArchived ? 'Masquer archivees' : 'Voir archivees'}
        </button>
      </div>

      {/* Chargement */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
        </div>
      )}

      {/* Liste vide */}
      {!isLoading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <ShoppingCart className="w-12 h-12 mb-3" />
          <span className="text-sm">Aucune commande</span>
          <span className="text-xs mt-1">Les commandes sont creees automatiquement lors de la validation d'un devis</span>
        </div>
      )}

      {/* Table desktop */}
      {!isLoading && orders.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 px-3 font-medium">Reference</th>
                  <th className="py-2 px-3 font-medium">Client</th>
                  <th className="py-2 px-3 font-medium">Source</th>
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium text-right">Total TTC</th>
                  <th className="py-2 px-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition"
                  >
                    <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">
                      {o.display_reference || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">
                      {o.client_name || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 text-xs">
                      {SOURCE_LABELS[o.source] || o.source}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400">
                      {new Date(o.issue_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-900 dark:text-white">
                      {fmtCurrency(o.total_ttc)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || ''}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-2">
            {orders.map(o => (
              <div
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={CARD + ' p-3 cursor-pointer hover:border-kerpta transition'}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                    {o.display_reference || '-'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_COLORS[o.status] || ''}`}>
                    {STATUS_LABELS[o.status] || o.status}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{o.client_name || '-'}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmtCurrency(o.total_ttc)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className={BTN_SM}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500">
                Page {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={BTN_SM}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Overlay detail */}
      {selectedId && (
        <OrderDetailOverlay
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['orders'] })}
        />
      )}

      {/* Modale creation */}
      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['orders'] }) }}
        />
      )}
    </PageLayout>
  )
}

// ── Detail overlay ───────────────────────────────────────────────────────────

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
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || ''}`}>
                {STATUS_LABELS[order.status] || order.status}
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
                <span className={LABEL + ' mb-0.5'}>Client</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{order.client_name || '-'}</span>
              </div>
              <div>
                <span className={LABEL + ' mb-0.5'}>Ref. client</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{order.client_reference || '-'}</span>
              </div>
              <div>
                <span className={LABEL + ' mb-0.5'}>Source</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{SOURCE_LABELS[order.source] || order.source}</span>
              </div>
              <div>
                <span className={LABEL + ' mb-0.5'}>Date</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{new Date(order.issue_date).toLocaleDateString('fr-FR')}</span>
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

// ── Modale creation ──────────────────────────────────────────────────────────

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
              onChange={(c: ClientItem | null) => setClientId(c?.id || '')}
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

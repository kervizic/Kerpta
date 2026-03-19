// Kerpta — Page devis (liste, détail, création, édition)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Send, Check, X, Copy, Plus, Trash2, RefreshCw, Pencil, FileDown, Archive, ArchiveRestore,
} from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDownload } from '@/lib/orgApi'
import UnitCombobox from '@/components/app/UnitCombobox'
import ProductAutocomplete, { type AutocompleteProduct } from '@/components/app/ProductAutocomplete'
import ClientCombobox, { type ClientItem } from '@/components/app/ClientCombobox'
import DatePicker from '@/components/app/DatePicker'
import ColumnFilterHeader, { type FilterValues, type FilterOption } from '@/components/app/ColumnFilter'
import MobileFilterPanel from '@/components/app/MobileFilterPanel'
import ClientPanel from '@/components/app/ClientPanel'
import { CreateClientForm } from '@/pages/app/ClientsPage'
import { ProductDetailModal } from '@/pages/app/CatalogPage'
import PageLayout from '@/components/app/PageLayout'
import { INPUT, SELECT, LINE_INPUT, LINE_SELECT, BTN, OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER, BADGE_COUNT, CARD } from '@/lib/formStyles'
import { fmtCurrency } from '@/lib/formatting'

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
  draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  sent: { label: 'Envoyé', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  accepted: { label: 'Accepté', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  refused: { label: 'Refusé', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  expired: { label: 'Expiré', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
}

interface DocTypeConfig {
  key: string
  title: string
  columns: Record<string, boolean>
}

const DOC_LABELS: Record<string, string> = { devis: 'Devis', bpu: 'BPU', attachement: 'Attachement' }


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

function calcLineTTC(line: FormLine): number {
  return calcLineHT(line) + calcLineVAT(line)
}

function unitPriceFromTTC(ttc: number, line: FormLine): string {
  const qty = parseFloat(line.quantity) || 1
  const disc = (parseFloat(line.discount_percent) || 0) / 100
  const rate = (parseFloat(line.vat_rate) || 0) / 100
  const ht = ttc / (1 + rate)
  const price = ht / (qty * (1 - disc))
  return (Math.round(price * 100) / 100).toString()
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
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterValues>({})
  const [debouncedFilters, setDebouncedFilters] = useState<FilterValues>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [docTypeLabels, setDocTypeLabels] = useState<Record<string, string>>(DOC_LABELS)

  // Selection multiple + archivage
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)

  const qc = useQueryClient()
  const invalidate = () => { setSelected(new Set()); void qc.invalidateQueries({ queryKey: ['quotes'] }) }

  // Charger les types de documents
  const { data: docTypes } = useQuery({
    queryKey: ['quote-document-types'],
    queryFn: () => orgGet<DocTypeConfig[]>('/billing/quote-document-types'),
  })
  useEffect(() => {
    if (docTypes) {
      const labels: Record<string, string> = {}
      docTypes.forEach((t) => { labels[t.key] = t.title })
      setDocTypeLabels(labels)
    }
  }, [docTypes])

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

  const { data: rawData, isLoading: loading } = useQuery({
    queryKey: ['quotes', { page, filters: debouncedFilters, showArchived }],
    queryFn: () => {
      const params: Record<string, string | number | undefined> = { page }
      if (debouncedFilters.number) params.search = debouncedFilters.number as string
      if (debouncedFilters.type) params.document_type = debouncedFilters.type as string
      if (debouncedFilters.client) params.client_search = debouncedFilters.client as string
      const dateArr = debouncedFilters.date as string[] | undefined
      if (dateArr?.[0]) params.date_from = dateArr[0]
      if (dateArr?.[1]) params.date_to = dateArr[1]
      const statusArr = debouncedFilters.status as string[] | undefined
      if (statusArr?.length === 1) params.status = statusArr[0]
      if (showArchived) params.archived = 'true'
      return orgGet<{ items: Quote[]; total: number }>('/quotes', params)
    },
  })

  const statusArr = debouncedFilters.status as string[] | undefined
  const quotes = useMemo(() => {
    let items = rawData?.items ?? []
    if (statusArr && statusArr.length > 1) {
      items = items.filter((q) => statusArr.includes(q.status))
    }
    return items
  }, [rawData, statusArr])
  const total = rawData?.total ?? 0

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
    if (selected.size === quotes.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(quotes.map((q) => q.id)))
    }
  }

  async function batchArchive() {
    if (selected.size === 0) return
    setBatchLoading(true)
    try {
      await orgPost('/quotes/batch/archive', { ids: [...selected], archive: !showArchived })
      invalidate()
    } catch { /* */ }
    setBatchLoading(false)
  }

  async function batchDownloadPdf() {
    if (selected.size === 0) return
    setBatchLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_URL ?? '/api/v1'
      const token = localStorage.getItem('supabase_access_token')
      const orgId = localStorage.getItem('kerpta_active_org')
      const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) reqHeaders['Authorization'] = `Bearer ${token}`
      if (orgId) reqHeaders['X-Organization-Id'] = orgId
      const response = await fetch(`${apiBase}/quotes/batch/pdf`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ ids: [...selected] }),
      })
      if (!response.ok) throw new Error(`Download error ${response.status}`)
      const blob = await response.blob()
      const ct = response.headers.get('content-type') || ''
      const filename = ct.includes('zip') ? 'devis.zip' : 'devis.pdf'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch { /* */ }
    setBatchLoading(false)
  }

  return (
    <PageLayout
      icon={<Send className="w-5 h-5 text-kerpta" />}
      title="Devis"
      actions={<>
            {activeFilterCount > 0 && (
              <span className="text-[10px] bg-kerpta-100 text-kerpta-700 dark:bg-kerpta-900/40 dark:text-kerpta-400 px-2 py-0.5 rounded-full font-medium">
                {activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''}
              </span>
            )}
            {/* Barre d'actions (sélection active) */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 mr-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
                <button
                  onClick={batchDownloadPdf}
                  disabled={batchLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition disabled:opacity-50"
                >
                  <FileDown className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  onClick={batchArchive}
                  disabled={batchLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
                >
                  {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  {showArchived ? 'Désarchiver' : 'Archiver'}
                </button>
              </div>
            )}
            {/* Toggle archivés */}
            <button
              onClick={() => { setShowArchived((v) => !v); setPage(1) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                showArchived
                  ? 'border-kerpta-300 bg-kerpta-50 text-kerpta-700 dark:border-kerpta-600 dark:bg-kerpta-900/30 dark:text-kerpta-400'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              <Archive className="w-3.5 h-3.5 inline mr-1" />
              Archivés
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
            <button
              onClick={() => setShowCreate(true)}
              className={BTN}
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nouveau devis</span>
            </button>
      </>}
    >

        {/* Desktop : tableau */}
        <div className="hidden md:block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left">
                <th className="pl-3 pr-1 py-3 w-[1%] whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={quotes.length > 0 && selected.size === quotes.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-kerpta focus:ring-kerpta-400"
                  />
                </th>
                <ColumnFilterHeader filter={QUOTE_FILTERS[0]} value={filters.number || ''} onChange={(v) => updateFilter('number', v)} />
                <ColumnFilterHeader filter={QUOTE_FILTERS[1]} value={filters.type || ''} onChange={(v) => updateFilter('type', v)} />
                <ColumnFilterHeader filter={QUOTE_FILTERS[2]} value={filters.client || ''} onChange={(v) => updateFilter('client', v)} />
                <ColumnFilterHeader filter={QUOTE_FILTERS[3]} value={filters.date || []} onChange={(v) => updateFilter('date', v)} />
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Total HT</th>
                <ColumnFilterHeader filter={QUOTE_FILTERS[4]} value={filters.status || []} onChange={(v) => updateFilter('status', v)} />
                <th className="pr-2 py-3 w-[1%] whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-kerpta mx-auto" /></td></tr>
              ) : quotes.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun devis trouvé</td></tr>
              ) : (
                quotes.map((q) => {
                  const st = STATUS_LABELS[q.status] || { label: q.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
                  const typeLabel = q.is_avenant ? `Avenant n°${q.avenant_number}` : (docTypeLabels[q.document_type] || q.document_type)
                  const isEditable = q.status === 'draft' || q.status === 'sent'
                  return (
                    <tr key={q.id} onClick={() => isEditable ? setEditId(q.id) : setSelectedId(q.id)} className="border-b border-gray-50 dark:border-gray-700 hover:bg-kerpta-50/50 dark:hover:bg-kerpta-900/30 cursor-pointer transition">
                      <td className="pl-3 pr-1 py-3 w-[1%] whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(q.id)}
                          onChange={() => toggleSelect(q.id)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-kerpta focus:ring-kerpta-400"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap">{q.number}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{typeLabel}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{q.client_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{q.issue_date}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtCurrency(q.subtotal_ht)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                      <td className="pr-2 py-3 w-[1%] whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); void orgDownload(`/quotes/${q.id}/pdf?download=1`, `${q.number}.pdf`) }}
                          title="Télécharger le PDF"
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile : cartes */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
          ) : quotes.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun devis trouvé</div>
          ) : (
            quotes.map((q) => {
              const st = STATUS_LABELS[q.status] || { label: q.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
              const typeLabel = q.is_avenant ? `Avenant n°${q.avenant_number}` : (docTypeLabels[q.document_type] || q.document_type)
              const isEditable = q.status === 'draft' || q.status === 'sent'
              return (
                <div
                  key={q.id}
                  onClick={() => isEditable ? setEditId(q.id) : setSelectedId(q.id)}
                  className={`${CARD} p-4 cursor-pointer hover:border-kerpta-200 dark:hover:border-kerpta-700 transition active:bg-kerpta-50/50 dark:active:bg-kerpta-900/30`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(q.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(q.id) }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-kerpta focus:ring-kerpta-400"
                      />
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{q.number}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{q.client_name || '—'}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{typeLabel} — {q.issue_date}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{fmtCurrency(q.subtotal_ht)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); void orgDownload(`/quotes/${q.id}/pdf?download=1`, `${q.number}.pdf`) }}
                        title="Télécharger le PDF"
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200">Précédent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200">Suivant</button>
          </div>
        )}
        {/* Panneau détail devis (lecture seule) */}
        {selectedId && (
          <QuoteDetailPanel
            quoteId={selectedId}
            onClose={() => { setSelectedId(null); invalidate() }}
          />
        )}

        {/* Formulaire édition en overlay */}
        {editId && (
          <QuoteFormPage
            quoteId={editId}
            onClose={() => { setEditId(null); invalidate() }}
          />
        )}

        {/* Formulaire création en overlay */}
        {showCreate && (
          <QuoteFormPage
            onClose={() => { setShowCreate(false); invalidate() }}
          />
        )}

        {/* Panneau filtres mobile */}
        {showMobileFilters && (
          <MobileFilterPanel
            filters={QUOTE_FILTERS}
            values={filters}
            onChange={updateFilter}
            onClose={() => setShowMobileFilters(false)}
          />
        )}
    </PageLayout>
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

  const st = quote ? (STATUS_LABELS[quote.status] || { label: quote.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }) : null

  return (
    <div
      className={OVERLAY_BACKDROP}
      onClick={onClose}
    >
      <div
        className={OVERLAY_PANEL}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
        ) : !quote ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">Devis introuvable</div>
        ) : (
          <>
        {/* En-tête */}
        <div className={`${OVERLAY_HEADER} rounded-t-2xl`}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {quote.is_avenant ? `Avenant n°${quote.avenant_number}` : (DOC_LABELS[quote.document_type] || 'Devis')} {quote.number}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{quote.client_name} — {quote.issue_date}</span>
              {st && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.label}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition ml-3">
            <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5">
        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(quote.status === 'draft' || quote.status === 'sent') && (
            <>
              <button onClick={() => doAction('accept')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accepter
              </button>
              {quote.status === 'draft' && (
                <button onClick={() => doAction('send')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
                </button>
              )}
              <button onClick={() => doAction('refuse')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 text-sm font-medium rounded-lg transition disabled:opacity-50">
                <X className="w-4 h-4" /> Refuser
              </button>
              <button onClick={() => void orgDownload(`/quotes/${quoteId}/pdf?download=1`, 'devis.pdf')} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm font-medium rounded-lg transition">
                <FileDown className="w-4 h-4" /> Télécharger PDF
              </button>
              <button onClick={() => doAction('duplicate')} disabled={!!actionLoading} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition disabled:opacity-50">
                <Copy className="w-4 h-4" /> Dupliquer
              </button>
            </>
          )}
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold mb-1">Total HT</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{fmtCurrency(quote.subtotal_ht)}</p>
          </div>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold mb-1">TVA</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{fmtCurrency(quote.total_vat)}</p>
          </div>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold mb-1">Total TTC</p>
            <p className="text-xl font-bold text-kerpta-600 dark:text-kerpta-400">{fmtCurrency(quote.total_ttc)}</p>
          </div>
        </div>

        {/* Lignes */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                <th className="px-4 py-3">Réf.</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qté</th>
                <th className="px-4 py-3 text-right">PU HT</th>
                <th className="px-4 py-3 text-right">TVA</th>
                <th className="px-4 py-3 text-right">Total HT</th>
                <th className="px-4 py-3 text-right">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{l.reference || '—'}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{l.description || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{Number(l.quantity)} {l.unit || ''}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmtCurrency(l.unit_price)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{Number(l.vat_rate)}%</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmtCurrency(l.total_ht)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmtCurrency(l.total_ht + (l.total_ht * l.vat_rate / 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Notes */}
        {quote.notes && (
          <div className={`mt-4 ${CARD} p-4`}>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-semibold mb-1">Notes</p>
            <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{quote.notes}</p>
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
  const [docTypes, setDocTypes] = useState<DocTypeConfig[]>([])
  const [docColumns, setDocColumns] = useState({
    reference: true, description: true, quantity: true, unit: true,
    unit_price: true, vat_rate: true, discount_percent: true, total_ht: true, total_ttc: false,
  })
  const [vatRates, setVatRates] = useState<{ rate: string; label: string }[]>([
    { rate: '20', label: 'TVA 20%' }, { rate: '10', label: 'TVA 10%' },
    { rate: '5.5', label: 'TVA 5,5%' }, { rate: '2.1', label: 'TVA 2,1%' },
    { rate: '0', label: 'TVA 0%' },
  ])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [clientPanelId, setClientPanelId] = useState<string | null>(null)
  const [showNewClient, setShowNewClient] = useState(false)
  const [editProductId, setEditProductId] = useState<string | null>(null)

  // Colonnes effectives = colonnes globales ∩ colonnes du type de document sélectionné
  const activeColumns = useMemo(() => {
    const typeConfig = docTypes.find((t) => t.key === documentType)
    if (!typeConfig) return docColumns
    // Une colonne est visible si elle est activée globalement ET activée pour ce type
    const merged: Record<string, boolean> = {}
    for (const key of Object.keys(docColumns)) {
      merged[key] = docColumns[key as keyof typeof docColumns] && (typeConfig.columns[key] !== false)
    }
    return merged as typeof docColumns
  }, [docColumns, docTypes, documentType])

  // Charger la config colonnes, taux TVA et types de documents
  useEffect(() => {
    orgGet<Record<string, boolean>>('/billing/document-columns').then((cols) => setDocColumns((prev) => ({ ...prev, ...cols }))).catch(() => {})
    orgGet<{ rate: string; label: string }[]>('/billing/vat-rates').then(setVatRates).catch(() => {})
    orgGet<DocTypeConfig[]>('/billing/quote-document-types').then(setDocTypes).catch(() => {})
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
  async function handleSave(andSend = false, andPrint = false) {
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

      if (andPrint && resultId) {
        void orgDownload(`/quotes/${resultId}/pdf?download=1`, 'devis.pdf')
      }

      onClose?.()
    } catch { /* */ }
    setSaving(false)
  }

  if (loading) {
    if (onClose) return (
      <div className={OVERLAY_BACKDROP} onClick={onClose}>
        <div className={`${OVERLAY_PANEL} flex justify-center py-16`} onClick={(e) => e.stopPropagation()}>
          <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
        </div>
      </div>
    )
    return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
  }

  const formContent = (
    <>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Modifier le devis' : 'Nouveau devis'}
          </h1>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </div>

        {/* En-tête */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 mb-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">En-tête</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Client *</label>
              <div className="flex items-center gap-1.5">
                <ClientCombobox
                  value={clientId}
                  onChange={setClientId}
                  onSelect={handleClientSelect}
                  onNewClient={() => setShowNewClient(true)}
                  className={INPUT}
                />
                {clientId && (
                  <button onClick={() => setClientPanelId(clientId)} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="Voir le client">
                    <Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type de document</label>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={SELECT}>
                {docTypes.length > 0 ? (
                  docTypes.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)
                ) : (
                  <>
                    <option value="devis">Devis</option>
                    <option value="bpu">BPU</option>
                    <option value="attachement">Attachement</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date d'émission</label>
              <DatePicker value={issueDate} onChange={setIssueDate} className={INPUT} placeholder="Date d'émission" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date d'expiration</label>
              <DatePicker value={expiryDate} onChange={setExpiryDate} className={INPUT} placeholder="Date d'expiration" clearable />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Profil de facturation</label>
              <select value={billingProfileId} onChange={(e) => handleProfileChange(e.target.value)} className={SELECT}>
                <option value="">— Aucun —</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (défaut)' : ''}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Lignes</h2>
            {lines.some((l) => !l.product_id && l.description.trim()) && (
              <span className="text-[10px] bg-kerpta-100 text-kerpta-700 dark:bg-kerpta-900/40 dark:text-kerpta-400 px-2 py-0.5 rounded-full font-medium">
                {lines.filter((l) => !l.product_id && l.description.trim()).length} nouvel article{lines.filter((l) => !l.product_id && l.description.trim()).length > 1 ? 's' : ''} sera créé{lines.filter((l) => !l.product_id && l.description.trim()).length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Desktop : tableau des lignes */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                  {activeColumns.reference && <th className="px-2 py-2 w-20">Réf.</th>}
                  <th className="px-2 py-2">Désignation</th>
                  {activeColumns.quantity && <th className="px-2 py-2 w-16">Qté</th>}
                  {activeColumns.unit && <th className="px-2 py-2 w-20">Unité</th>}
                  <th className="px-2 py-2 w-24">PU HT</th>
                  {activeColumns.vat_rate && <th className="px-2 py-2 w-20">TVA %</th>}
                  {activeColumns.discount_percent && <th className="px-2 py-2 w-16">Rem. %</th>}
                  {activeColumns.total_ht && <th className="px-2 py-2 w-28 text-right">Total HT</th>}
                  {activeColumns.total_ttc && <th className="px-2 py-2 w-28 text-right">Total TTC</th>}
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const lineHT = calcLineHT(line)
                  const lineTTC = calcLineTTC(line)
                  return (
                    <tr key={line.key} className="border-b border-gray-50 dark:border-gray-700 align-middle">
                      {activeColumns.reference && (
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
                        <textarea
                          value={line.description.includes('\n') ? line.description.split('\n').slice(1).join('\n') : ''}
                          onChange={(e) => {
                            const name = line.description.split('\n')[0]
                            updateLine(i, 'description', e.target.value ? `${name}\n${e.target.value}` : name)
                          }}
                          placeholder="Description (optionnel)"
                          rows={1}
                          className={`${LINE_INPUT} mt-1 text-xs text-gray-500 dark:text-gray-400 resize-none`}
                        />
                      </td>
                      {activeColumns.quantity && (
                        <td className="px-1 py-1.5">
                          <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className={`${LINE_INPUT} text-right`} />
                        </td>
                      )}
                      {activeColumns.unit && (
                        <td className="px-1 py-1.5">
                          <UnitCombobox value={line.unit} onChange={(v) => updateLine(i, 'unit', v)} className={LINE_INPUT} />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} className={`${LINE_INPUT} text-right`} />
                      </td>
                      {activeColumns.vat_rate && (
                        <td className="px-1 py-1.5">
                          <select value={line.vat_rate} onChange={(e) => updateLine(i, 'vat_rate', e.target.value)} className={LINE_SELECT}>
                            {vatRates.map((vr) => <option key={vr.rate} value={vr.rate}>{vr.rate}%</option>)}
                          </select>
                        </td>
                      )}
                      {activeColumns.discount_percent && (
                        <td className="px-1 py-1.5">
                          <input type="number" step="0.1" min="0" max="100" value={line.discount_percent} onChange={(e) => updateLine(i, 'discount_percent', e.target.value)} className={`${LINE_INPUT} text-right`} />
                        </td>
                      )}
                      {activeColumns.total_ht && (
                      <td className="px-2 text-right text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        <div className="h-[30px] flex items-center justify-end">
                          {fmtCurrency(lineHT)}
                        </div>
                      </td>
                      )}
                      {activeColumns.total_ttc && (
                      <td className="px-1 py-1.5">
                        <input
                          type="number" step="0.01"
                          value={Math.round(lineTTC * 100) / 100}
                          onChange={(e) => {
                            const newTTC = parseFloat(e.target.value) || 0
                            updateLine(i, 'unit_price', unitPriceFromTTC(newTTC, line))
                          }}
                          className={`${LINE_INPUT} text-right`}
                        />
                      </td>
                      )}
                      <td className="px-1">
                        <div className="h-[30px] flex items-center gap-0.5">
                          {line.product_id && (
                            <button onClick={() => setEditProductId(line.product_id)} className="p-1 rounded hover:bg-kerpta-50 dark:hover:bg-kerpta-900/30 transition" title="Modifier l'article">
                              <Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-kerpta-600" />
                            </button>
                          )}
                          {line.product_id && (
                            <button onClick={() => refreshLine(i)} className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition" title="Actualiser depuis le catalogue">
                              <RefreshCw className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-blue-500" />
                            </button>
                          )}
                          <button onClick={() => removeLine(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition" title="Supprimer">
                            <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes des lignes */}
          <div className="md:hidden space-y-3">
            {lines.map((line, i) => {
              const lineHT = calcLineHT(line)
              const lineTTC = calcLineTTC(line)
              return (
                <div key={line.key} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2.5">
                  {/* Désignation (pleine largeur) */}
                  <ProductAutocomplete
                    value={line.description}
                    onChange={(text) => { updateLine(i, 'description', text); if (line.product_id) updateLine(i, 'product_id', null) }}
                    onSelect={(p) => selectProduct(i, p)}
                    clientId={clientId || null}
                    className={INPUT}
                    placeholder="Désignation"
                  />
                  <textarea
                    value={line.description.includes('\n') ? line.description.split('\n').slice(1).join('\n') : ''}
                    onChange={(e) => {
                      const name = line.description.split('\n')[0]
                      updateLine(i, 'description', e.target.value ? `${name}\n${e.target.value}` : name)
                    }}
                    placeholder="Description (optionnel)"
                    rows={1}
                    className={`${INPUT} mt-1 text-xs text-gray-500 dark:text-gray-400 resize-none`}
                  />

                  {/* Grille 2 colonnes pour les champs numériques */}
                  <div className="grid grid-cols-2 gap-2">
                    {activeColumns.reference && (
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Réf.</label>
                        <input type="text" value={line.reference} onChange={(e) => updateLine(i, 'reference', e.target.value)} placeholder="Réf" className={INPUT} />
                      </div>
                    )}
                    {activeColumns.quantity && (
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Qté</label>
                        <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className={`${INPUT} text-right`} />
                      </div>
                    )}
                    {activeColumns.unit && (
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Unité</label>
                        <UnitCombobox value={line.unit} onChange={(v) => updateLine(i, 'unit', v)} className={INPUT} />
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">PU HT</label>
                      <input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} className={`${INPUT} text-right`} />
                    </div>
                    {activeColumns.vat_rate && (
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">TVA %</label>
                        <select value={line.vat_rate} onChange={(e) => updateLine(i, 'vat_rate', e.target.value)} className={SELECT}>
                          {vatRates.map((vr) => <option key={vr.rate} value={vr.rate}>{vr.rate}%</option>)}
                        </select>
                      </div>
                    )}
                    {activeColumns.discount_percent && (
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Rem. %</label>
                        <input type="number" step="0.1" min="0" max="100" value={line.discount_percent} onChange={(e) => updateLine(i, 'discount_percent', e.target.value)} className={`${INPUT} text-right`} />
                      </div>
                    )}
                  </div>

                  {/* Total + actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                    {activeColumns.total_ht && (
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{fmtCurrency(lineHT)}</span>
                    )}
                    {activeColumns.total_ttc && (
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-gray-400 dark:text-gray-500">TTC</label>
                        <input
                          type="number" step="0.01"
                          value={Math.round(lineTTC * 100) / 100}
                          onChange={(e) => {
                            const newTTC = parseFloat(e.target.value) || 0
                            updateLine(i, 'unit_price', unitPriceFromTTC(newTTC, line))
                          }}
                          className={`${INPUT} w-24 text-right text-sm`}
                        />
                      </div>
                    )}
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      {line.product_id && (
                        <button onClick={() => setEditProductId(line.product_id)} className="p-1.5 rounded hover:bg-kerpta-50 dark:hover:bg-kerpta-900/30 transition">
                          <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        </button>
                      )}
                      {line.product_id && (
                        <button onClick={() => refreshLine(i)} className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition">
                          <RefreshCw className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        </button>
                      )}
                      <button onClick={() => removeLine(i)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                        <Trash2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="mt-2 flex items-center gap-1.5 text-xs text-kerpta-600 dark:text-kerpta-400 hover:text-kerpta-700 dark:hover:text-kerpta-300 font-medium transition px-2 py-1"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un élément
          </button>

          {/* Alerte TVA 0% */}
          {lines.some((l) => parseFloat(l.vat_rate) === 0 && l.description.trim()) && (
            <div className="mt-3 flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-700 dark:text-amber-400">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Options</h2>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Remise globale</label>
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
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes internes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INPUT} placeholder="Visibles uniquement par vous" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Pied de page</label>
              <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className={INPUT} placeholder="Texte en bas du document" />
            </div>
          </div>

          {/* Récapitulatif */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-4">Récapitulatif</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Sous-total HT</span>
                <span className="font-medium text-gray-900 dark:text-white">{fmtCurrency(totals.subtotalHT)}</span>
              </div>
              {discountType !== 'none' && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Remise {discountType === 'percent' ? `(${discountValue}%)` : ''}</span>
                  <span className="text-red-500">
                    {discountType === 'percent'
                      ? `- ${fmtCurrency(lines.reduce((s, l) => s + calcLineHT(l), 0) * (parseFloat(discountValue) || 0) / 100)}`
                      : `- ${fmtCurrency(parseFloat(discountValue) || 0)}`
                    }
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">TVA</span>
                <span className="font-medium text-gray-900 dark:text-white">{fmtCurrency(totals.totalVAT)}</span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between">
                <span className="text-base font-semibold text-gray-900 dark:text-white">Total TTC</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{fmtCurrency(totals.totalTTC)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            onClick={() => onClose?.()}
            className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !clientId}
            className="px-5 py-2.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
          </button>
          <button
            onClick={() => handleSave(false, true)}
            disabled={saving || !clientId}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileDown className="w-4 h-4" /> Télécharger PDF</>}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !clientId}
            className={`${BTN} px-5 py-2.5`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Envoyer</>}
          </button>
        </div>

        {/* Modale fiche client */}
        {clientPanelId && (
          <ClientPanel
            clientId={clientPanelId}
            compact
            onClose={() => setClientPanelId(null)}
          />
        )}

        {/* Modale création client */}
        {showNewClient && (
          <CreateClientForm
            onClose={() => setShowNewClient(false)}
            onCreated={(id) => {
              setShowNewClient(false)
              setClientId(id)
            }}
          />
        )}

        {/* Modale détail article */}
        {editProductId && (
          <ProductDetailModal
            productId={editProductId}
            onClose={() => setEditProductId(null)}
          />
        )}
    </>
  )

  return (
    <div
      className={OVERLAY_BACKDROP}
      onClick={onClose}
    >
      <div
        className={`${OVERLAY_PANEL} px-3 md:px-6 py-4 md:py-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {formContent}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  return <QuotesList />
}

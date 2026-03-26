// Kerpta - Page Import IA (liste + detail overlay)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, X, Upload, Sparkles, ChevronLeft, ChevronRight,
  ExternalLink, CheckCircle2, Clock, XCircle, Brain, Trash2,
} from 'lucide-react'
import { orgGet, orgPost, orgDelete, orgDownload } from '@/lib/orgApi'
import ClientCombobox from '@/components/app/ClientCombobox'
import ColumnFilterHeader, { type FilterValues, type FilterOption } from '@/components/app/ColumnFilter'
import MobileFilterPanel from '@/components/app/MobileFilterPanel'
import PageLayout from '@/components/app/PageLayout'
import ImportDocumentModal from '@/components/app/ImportDocumentModal'
import {
  BTN, BTN_SM, BTN_SECONDARY, BTN_DANGER, CARD, INPUT, LABEL, SELECT,
  OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER, BADGE_COUNT, SECTION,
} from '@/lib/formStyles'
import { fmtCurrency } from '@/lib/formatting'

// -- Types --------------------------------------------------------------------

interface ImportItem {
  id: string
  source_filename: string | null
  source_file_url: string | null
  extracted_doc_type: string | null
  extracted_client_name: string | null
  extracted_client_siret: string | null
  extracted_client_siren: string | null
  extracted_client_tva: string | null
  extracted_client_address: string | null
  extracted_doc_number: string | null
  extracted_doc_date: string | null
  extracted_doc_due_date: string | null
  extracted_reference: string | null
  extracted_order_number: string | null
  extracted_total_ht: number | null
  extracted_total_tva: number | null
  extracted_total_ttc: number | null
  extracted_iban: string | null
  extracted_payment_mode: string | null
  extracted_currency: string | null
  extracted_json: Record<string, unknown> | null
  prompt_sent: string | null
  confidence: number | null
  model_used: string | null
  tokens_in: number | null
  tokens_out: number | null
  extraction_duration_ms: number | null
  status: string
  target_type: string | null
  client_id: string | null
  created_at: string
  lines: ImportLine[]
}

interface ImportLine {
  position: number
  extracted_designation: string | null
  extracted_quantity: number | null
  extracted_unit_price: number | null
  extracted_vat_rate: number | null
  extracted_total_ht: number | null
  match_confidence: number | null
  match_status: string | null
}

// -- Constantes ---------------------------------------------------------------

const DOC_TYPE_OPTIONS = [
  { value: 'facture', label: 'Facture' },
  { value: 'avoir', label: 'Avoir' },
  { value: 'devis', label: 'Devis' },
  { value: 'pro_forma', label: 'Proforma' },
  { value: 'bon_commande', label: 'Bon de commande' },
  { value: 'bon_livraison', label: 'Bon de livraison' },
  { value: 'releve', label: 'Releve' },
  { value: 'acompte', label: 'Acompte' },
]

const DOC_TYPE_LABELS: Record<string, string> = {}
DOC_TYPE_OPTIONS.forEach((o) => { DOC_TYPE_LABELS[o.value] = o.label })

/** Mapping type de document -> target_type pour la validation */
function docTypeToTarget(docType: string): 'invoice' | 'quote' | 'order' {
  if (['facture', 'avoir', 'releve', 'acompte'].includes(docType)) return 'invoice'
  if (['devis', 'pro_forma'].includes(docType)) return 'quote'
  return 'order'
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  validated: { label: 'Valide', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  rejected: { label: 'Rejete', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
}

function confidenceBadge(confidence: number | null) {
  if (confidence == null) return { label: '-', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.8) return { label: `${pct}%`, cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' }
  if (confidence >= 0.5) return { label: `${pct}%`, cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' }
  return { label: `${pct}%`, cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
}

// -- Filtres ------------------------------------------------------------------

const IMPORT_FILTERS: FilterOption[] = [
  { column: 'search', label: 'Recherche', type: 'text', placeholder: 'Fichier, client...' },
  { column: 'status', label: 'Statut', type: 'multi-select', options: [
    { value: 'pending', label: 'En attente' },
    { value: 'validated', label: 'Valide' },
    { value: 'rejected', label: 'Rejete' },
  ] },
]

// -- Composant principal ------------------------------------------------------

export default function ImportsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterValues>({})
  const [debouncedFilters, setDebouncedFilters] = useState<FilterValues>({})
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const qc = useQueryClient()
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['imports'] }) }

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
    queryKey: ['imports', { page, filters: debouncedFilters }],
    queryFn: () => {
      const params: Record<string, string | number | undefined> = { page, page_size: 25 }
      if (debouncedFilters.search) params.search = debouncedFilters.search as string
      const statusArr = debouncedFilters.status as string[] | undefined
      if (statusArr?.length === 1) params.status = statusArr[0]
      return orgGet<{ items: ImportItem[]; total: number }>('/imports', params)
    },
  })

  // Filtre statut multi-select cote client
  const statusArr = debouncedFilters.status as string[] | undefined
  let imports = rawData?.items ?? []
  if (statusArr && statusArr.length > 1) {
    imports = imports.filter((i) => statusArr.includes(i.status))
  }
  const total = rawData?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  const activeFilterCount = Object.values(filters).filter((v) =>
    (typeof v === 'string' && v) || (Array.isArray(v) && v.some(Boolean))
  ).length

  return (
    <PageLayout
      icon={<Sparkles className="w-5 h-5 text-kerpta" />}
      title="Import IA"
      actions={<>
        {activeFilterCount > 0 && (
          <span className="text-[10px] bg-kerpta-100 text-kerpta-700 dark:bg-kerpta-900/40 dark:text-kerpta-400 px-2 py-0.5 rounded-full font-medium">
            {activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''}
          </span>
        )}
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
        <button onClick={() => setShowImport(true)} className={BTN}>
          <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Importer</span>
        </button>
      </>}
    >
      {/* Desktop : tableau */}
      <div className="hidden md:block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-left">
              <ColumnFilterHeader filter={IMPORT_FILTERS[0]} value={filters.search || ''} onChange={(v) => updateFilter('search', v)} />
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Client</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">TTC</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Confiance</th>
              <ColumnFilterHeader filter={IMPORT_FILTERS[1]} value={filters.status || []} onChange={(v) => updateFilter('status', v)} />
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-kerpta mx-auto" /></td></tr>
            ) : imports.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun import trouve</td></tr>
            ) : (
              imports.map((item) => {
                const st = STATUS_LABELS[item.status] || { label: item.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
                const conf = confidenceBadge(item.confidence)
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="border-b border-gray-50 dark:border-gray-700 hover:bg-kerpta-50/50 dark:hover:bg-kerpta-900/30 cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2 max-w-[200px]">
                        <Sparkles className="w-3.5 h-3.5 text-kerpta shrink-0" />
                        <span className="truncate">{item.source_filename || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {DOC_TYPE_LABELS[item.extracted_doc_type ?? ''] || item.extracted_doc_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[160px]">
                      {item.extracted_client_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 whitespace-nowrap">
                      {item.extracted_total_ttc != null ? fmtCurrency(item.extracted_total_ttc) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${conf.cls}`}>{conf.label}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
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
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
        ) : imports.length === 0 ? (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun import trouve</div>
        ) : (
          imports.map((item) => {
            const st = STATUS_LABELS[item.status] || { label: item.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
            const conf = confidenceBadge(item.confidence)
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`${CARD} p-4 cursor-pointer hover:border-kerpta-200 dark:hover:border-kerpta-700 transition active:bg-kerpta-50/50 dark:active:bg-kerpta-900/30`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-kerpta shrink-0" />
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {item.source_filename || '-'}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pl-5">
                  <span>{DOC_TYPE_LABELS[item.extracted_doc_type ?? ''] || '-'}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${conf.cls}`}>{conf.label}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-5">
                  <span className="truncate">{item.extracted_client_name || '-'}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {item.extracted_total_ttc != null ? fmtCurrency(item.extracted_total_ttc) : '-'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={BTN_SM}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={BTN_SM}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filtres mobile */}
      {showMobileFilters && (
        <MobileFilterPanel
          filters={IMPORT_FILTERS}
          values={filters}
          onChange={(col, val) => updateFilter(col, val)}
          onClose={() => setShowMobileFilters(false)}
        />
      )}

      {/* Overlay detail */}
      {selectedId && (
        <ImportDetailOverlay
          importId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={invalidate}
        />
      )}

      {/* Import IA */}
      {showImport && (
        <ImportDocumentModal
          documentType="order"
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); invalidate() }}
        />
      )}
    </PageLayout>
  )
}

// -- Overlay detail -----------------------------------------------------------

function ImportDetailOverlay({
  importId,
  onClose,
  onRefresh,
}: {
  importId: string
  onClose: () => void
  onRefresh: () => void
}) {
  const [docType, setDocType] = useState<string>('')
  const [clientId, setClientId] = useState<string>('')
  const [docNumber, setDocNumber] = useState('')
  const [docDate, setDocDate] = useState('')
  const [docDueDate, setDocDueDate] = useState('')
  const [docRef, setDocRef] = useState('')
  const [docOrderNumber, setDocOrderNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [showFile, setShowFile] = useState(false)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['import-detail', importId],
    queryFn: () => orgGet<ImportItem>(`/imports/${importId}`),
  })

  // Initialiser le type et le client depuis les donnees extraites
  useEffect(() => {
    if (detail) {
      setDocType(detail.extracted_doc_type || '')
      setClientId(detail.client_id || '')
      setDocNumber(detail.extracted_doc_number || '')
      setDocDate(detail.extracted_doc_date || '')
      setDocDueDate(detail.extracted_doc_due_date || '')
      setDocRef(detail.extracted_reference || '')
      setDocOrderNumber(detail.extracted_order_number || '')
    }
  }, [detail])

  async function handleValidate() {
    if (!detail) return
    setSaving(true)
    try {
      const targetType = docTypeToTarget(docType || detail.extracted_doc_type || 'bon_commande')
      await orgPost(`/imports/${importId}/validate`, {
        action: 'create',
        target_type: targetType,
        client_id: clientId || null,
        corrected_json: {
          document: {
            numero: docNumber || null,
            date_emission: docDate || null,
            date_echeance: docDueDate || null,
            reference: docRef || null,
            numero_commande: docOrderNumber || null,
          },
          meta: { type_document: docType || null },
        },
      })
      onRefresh()
      onClose()
    } catch {
      /* */
    }
    setSaving(false)
  }

  async function handleReject() {
    setRejecting(true)
    try {
      await orgPost(`/imports/${importId}/reject`, {})
      onRefresh()
      onClose()
    } catch {
      /* */
    }
    setRejecting(false)
  }

  const conf = detail ? confidenceBadge(detail.confidence) : null
  const st = detail ? (STATUS_LABELS[detail.status] || { label: detail.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }) : null

  const fileUrl = detail?.source_file_url ? `/api/v1/imports/${importId}/file` : null

  return (
    <div className={OVERLAY_BACKDROP} onClick={onClose}>
      <div className={`${OVERLAY_PANEL} ${showFile ? '!max-w-7xl' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={OVERLAY_HEADER}>
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="w-5 h-5 text-kerpta shrink-0" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {detail?.source_filename || 'Import'}
            </h2>
            {conf && <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${conf.cls}`}>{conf.label}</span>}
            {st && <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${st.cls}`}>{st.label}</span>}
          </div>
          <div className="flex items-center gap-2">
            {fileUrl && (
              <button
                onClick={() => setShowFile(!showFile)}
                className={`${BTN_SM} ${showFile ? 'bg-kerpta-50 dark:bg-kerpta-900/30' : ''}`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {showFile ? 'Masquer' : 'Voir le fichier'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-kerpta" />
          </div>
        ) : detail ? (
          <div className={`flex flex-col ${showFile ? 'lg:flex-row' : ''}`}>
            {/* Fichier source (PDF viewer) */}
            {showFile && fileUrl && (
              <div className="lg:w-1/2 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <iframe
                  src={fileUrl}
                  className="w-full h-[50vh] lg:h-[80vh]"
                  title="Fichier source"
                />
              </div>
            )}
          <div className={`${showFile ? 'lg:w-1/2 lg:overflow-y-auto lg:max-h-[80vh]' : 'w-full'} p-4 md:p-6 space-y-6`}>
            {/* Meta extraction */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
              {detail.model_used && (
                <span className="flex items-center gap-1">
                  <Brain className="w-3.5 h-3.5" /> {detail.model_used}
                </span>
              )}
              {detail.tokens_in != null && (
                <span>Tokens in: {detail.tokens_in.toLocaleString('fr-FR')}</span>
              )}
              {detail.tokens_out != null && (
                <span>Tokens out: {detail.tokens_out.toLocaleString('fr-FR')}</span>
              )}
              {detail.extraction_duration_ms != null && (
                <span>{(detail.extraction_duration_ms / 1000).toFixed(1)}s</span>
              )}
              {detail.source_file_url && (
                <button
                  onClick={() => orgDownload(`/imports/${detail.id}/file`, detail.source_filename || 'fichier-source')}
                  className="flex items-center gap-1 text-kerpta hover:underline cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Fichier source
                </button>
              )}
            </div>

            {/* Section Type de document */}
            <div className={SECTION}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Type de document</h3>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className={SELECT}
                disabled={detail.status === 'rejected'}
              >
                <option value="">-- Choisir --</option>
                {DOC_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Section Client detecte */}
            <div className={SECTION}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Client detecte</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={LABEL}>Nom (IA)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{detail.extracted_client_name || '-'}</span>
                    <Sparkles className="w-3 h-3 text-kerpta" />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>SIRET / SIREN (IA)</label>
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                    {detail.extracted_client_siret || detail.extracted_client_siren || '-'}
                  </span>
                </div>
                <div>
                  <label className={LABEL}>N. TVA (IA)</label>
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                    {detail.extracted_client_tva || '-'}
                  </span>
                </div>
                <div className="md:col-span-3">
                  <label className={LABEL}>Adresse (IA)</label>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{detail.extracted_client_address || '-'}</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Associer un client Kerpta</label>
                <div className="flex items-center gap-2">
                  <ClientCombobox
                    value={clientId}
                    onChange={setClientId}
                    disabled={detail.status === 'rejected'}
                  />
                  {clientId && (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  )}
                </div>
              </div>
            </div>

            {/* Section Document */}
            <div className={SECTION}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Document</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>Numero</label>
                  <input className={INPUT} value={docNumber} onChange={e => setDocNumber(e.target.value)} disabled={detail.status === 'rejected'} placeholder="N. document" />
                </div>
                <div>
                  <label className={LABEL}>Date emission</label>
                  <input className={INPUT} type="date" value={docDate} onChange={e => setDocDate(e.target.value)} disabled={detail.status === 'rejected'} />
                </div>
                <div>
                  <label className={LABEL}>Date echeance</label>
                  <input className={INPUT} type="date" value={docDueDate} onChange={e => setDocDueDate(e.target.value)} disabled={detail.status === 'rejected'} />
                </div>
                <div>
                  <label className={LABEL}>Reference</label>
                  <input className={INPUT} value={docRef} onChange={e => setDocRef(e.target.value)} disabled={detail.status === 'rejected'} placeholder="Reference" />
                </div>
                <div>
                  <label className={LABEL}>N. commande</label>
                  <input className={INPUT} value={docOrderNumber} onChange={e => setDocOrderNumber(e.target.value)} disabled={detail.status === 'rejected'} placeholder="N. commande" />
                </div>
              </div>
            </div>

            {/* Section Lignes */}
            {detail.lines && detail.lines.length > 0 && (
              <div className={SECTION}>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Lignes ({detail.lines.length})
                </h3>
                <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600 text-left">
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase w-[60px]">Conf.</th>
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase">Designation</th>
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase text-right w-[60px]">Qte</th>
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase text-right w-[80px]">PU HT</th>
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase text-right w-[60px]">TVA%</th>
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase text-right w-[90px]">Total HT</th>
                        <th className="px-2 py-2 text-gray-400 dark:text-gray-500 font-semibold uppercase text-center w-[70px]">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line, idx) => {
                        const lc = confidenceBadge(line.match_confidence)
                        return (
                          <tr key={idx} className="border-b border-gray-50 dark:border-gray-700">
                            <td className="px-2 py-2">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${lc.cls}`}>{lc.label}</span>
                            </td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{line.extracted_designation || '-'}</td>
                            <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{line.extracted_quantity ?? '-'}</td>
                            <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">
                              {line.extracted_unit_price != null ? fmtCurrency(line.extracted_unit_price) : '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">
                              {line.extracted_vat_rate != null ? `${line.extracted_vat_rate}%` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">
                              {line.extracted_total_ht != null ? fmtCurrency(line.extracted_total_ht) : '-'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {line.match_status === 'matched' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                              ) : line.match_status === 'pending' ? (
                                <Clock className="w-4 h-4 text-yellow-500 mx-auto" />
                              ) : line.match_status === 'unmatched' ? (
                                <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section Totaux */}
            <div className={SECTION}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Totaux</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>Total HT</label>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {detail.extracted_total_ht != null ? fmtCurrency(detail.extracted_total_ht) : '-'}
                  </span>
                </div>
                <div>
                  <label className={LABEL}>TVA</label>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {detail.extracted_total_tva != null ? fmtCurrency(detail.extracted_total_tva) : '-'}
                  </span>
                </div>
                <div>
                  <label className={LABEL}>Total TTC</label>
                  <span className="text-sm font-semibold text-kerpta">
                    {detail.extracted_total_ttc != null ? fmtCurrency(detail.extracted_total_ttc) : '-'}
                  </span>
                </div>
                <div>
                  <label className={LABEL}>IBAN</label>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{detail.extracted_iban || '-'}</span>
                </div>
                <div>
                  <label className={LABEL}>Mode paiement</label>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{detail.extracted_payment_mode || '-'}</span>
                </div>
              </div>
            </div>

            {/* Section Prompt / Reponse IA (accordeon) */}
            {detail.prompt_sent && (
              <details className={SECTION}>
                <summary className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer select-none">
                  Prompt / Reponse IA
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={LABEL}>Prompt envoye</label>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                      {detail.prompt_sent}
                    </pre>
                  </div>
                  <div>
                    <label className={LABEL}>Reponse IA (JSON)</label>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                      {JSON.stringify(detail.extracted_json, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {detail.status !== 'rejected' && (
                <button onClick={handleValidate} disabled={saving || !docType} className={BTN}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {detail.status === 'validated' ? 'Re-valider' : 'Valider et creer'}
                </button>
              )}
              {detail.status !== 'rejected' && (
                <button onClick={handleReject} disabled={rejecting} className={BTN_DANGER}>
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Rejeter
                </button>
              )}
              <button
                onClick={async () => {
                  if (!confirm('Supprimer cet import ?')) return
                  await orgDelete(`/imports/${importId}`)
                  onRefresh()
                  onClose()
                }}
                className={BTN_DANGER}
              >
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>
              <div className="flex-1" />
              <button onClick={onClose} className={BTN_SECONDARY}>Fermer</button>
            </div>
          </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

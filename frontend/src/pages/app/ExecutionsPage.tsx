// Kerpta — Page Suivi (documents d'execution)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orgGet, orgPost, orgDelete } from '@/lib/orgApi'
import { useAuthStore } from '@/stores/authStore'
import { BTN, BTN_SM, BTN_SECONDARY, BTN_DANGER_SM, BTN_CLOSE, INPUT, SELECT, LINE_INPUT, LINE_SELECT, LABEL, OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER, CARD, SECTION, TEXTAREA } from '@/lib/formStyles'
import { Plus, Search, X, ChevronRight, Archive, Check, FileText, Trash2, Copy, ArrowRight } from 'lucide-react'
import PageLayout from '@/components/app/PageLayout'
import ClientCombobox from '@/components/app/ClientCombobox'

// ── Types ──────────────────────────────────────────────────────────────────

interface ExecutionLine {
  id?: string
  position: number
  reference?: string
  description?: string
  unit?: string
  product_id?: string
  unit_price: number
  vat_rate: number
  discount_percent?: number
  quantity?: number
  total_ht?: number
  total_vat?: number
  total_contract?: number
  previous_pct?: number
  current_pct?: number
  cumulative_amount?: number
  previously_invoiced?: number
  line_invoice_amount?: number
  source_line_id?: string
  source_quote_id?: string
}

interface Execution {
  id: string
  exec_type: string
  number: string
  client_id?: string
  client_name?: string
  status: string
  period_label?: string
  client_reference?: string
  observation_date?: string
  source_quote_id?: string
  contract_id?: string
  invoice_id?: string
  situation_number?: number
  subtotal_ht: number
  total_vat: number
  total_ttc: number
  discount_type: string
  discount_value: number
  is_archived: boolean
  created_at?: string
  updated_at?: string
}

interface ExecutionDetail extends Execution {
  lines: ExecutionLine[]
  linked_documents: LinkedDoc[]
  notes?: string
  billing_profile_id?: string
  validated_at?: string
  created_by?: string
  source_quote_number?: string
  contract_reference?: string
  invoice_number?: string
}

interface LinkedDoc {
  id: string
  link_type: string
  other_execution: Execution
}

// ── Constantes ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  order: 'Commande',
  delivery: 'Bon de livraison',
  work_report: 'Attachement',
  progress: 'Situation',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Valide',
  invoiced: 'Facture',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  validated: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  invoiced: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const TYPE_COLORS: Record<string, string> = {
  order: 'bg-kerpta/10 text-kerpta dark:bg-kerpta-900/20 dark:text-kerpta-400',
  delivery: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  work_report: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  progress: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const fmt = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Composant principal ────────────────────────────────────────────────────

export default function ExecutionsPage() {
  const qc = useQueryClient()
  const { activeOrgId } = useAuthStore()

  // Filtres
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Overlays
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // ── Liste ──────────────────────────────────────────────────────────────

  const { data: listData, isLoading } = useQuery<{ items: Execution[]; total: number; total_pages: number }>({
    queryKey: ['executions', activeOrgId, typeFilter, statusFilter, search, page],
    queryFn: () => orgGet(`/api/v1/executions?${new URLSearchParams({
      ...(typeFilter ? { exec_type: typeFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
      page: String(page),
      page_size: '25',
    })}`),
    enabled: !!activeOrgId,
  })

  const items: Execution[] = listData?.items ?? []
  const totalPages = listData?.total_pages ?? 0

  // ── Detail ─────────────────────────────────────────────────────────────

  const { data: detail } = useQuery<ExecutionDetail>({
    queryKey: ['execution', selectedId],
    queryFn: () => orgGet(`/api/v1/executions/${selectedId}`),
    enabled: !!selectedId,
  })

  // ── Mutations ──────────────────────────────────────────────────────────

  const validateMut = useMutation({
    mutationFn: (id: string) => orgPost(`/api/v1/executions/${id}/validate`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['executions'] }); qc.invalidateQueries({ queryKey: ['execution'] }) },
  })

  const invoiceMut = useMutation({
    mutationFn: (id: string) => orgPost(`/api/v1/executions/${id}/invoice`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['executions'] }); qc.invalidateQueries({ queryKey: ['execution'] }) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => orgDelete(`/api/v1/executions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['executions'] }); setSelectedId(null) },
  })

  const duplicateMut = useMutation({
    mutationFn: (id: string) => orgPost(`/api/v1/executions/${id}/duplicate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  const archiveMut = useMutation({
    mutationFn: (ids: string[]) => orgPost('/api/v1/executions/batch/archive', { ids, archive: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  // ── Rendu ──────────────────────────────────────────────────────────────

  return (
    <PageLayout title="Suivi" subtitle="Documents d'execution">
      {/* Barre de filtres */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        {/* Onglets type */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => { setTypeFilter(null); setPage(1) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              !typeFilter ? 'bg-kerpta text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            Tous
          </button>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTypeFilter(key); setPage(1) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                typeFilter === key ? 'bg-kerpta text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Recherche */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className={`${INPUT} pl-9`}
          />
        </div>

        {/* Filtre statut */}
        <select
          value={statusFilter ?? ''}
          onChange={e => { setStatusFilter(e.target.value || null); setPage(1) }}
          className={`${SELECT} w-auto`}
        >
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Bouton creer */}
        <button onClick={() => setShowCreate(true)} className={BTN}>
          <Plus className="w-4 h-4" /> Nouveau
        </button>
      </div>

      {/* ── Tableau desktop ─────────────────────────────────────────────── */}
      <div className={`${CARD} hidden md:block overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 font-medium">Numero</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium text-right">Montant HT</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun document</td></tr>
            ) : items.map(exec => (
              <tr
                key={exec.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer transition"
                onClick={() => setSelectedId(exec.id)}
              >
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900 dark:text-white">
                  {exec.number}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {exec.client_name ?? '-'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[exec.exec_type] ?? ''}`}>
                    {TYPE_LABELS[exec.exec_type] ?? exec.exec_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[exec.status] ?? ''}`}>
                    {STATUS_LABELS[exec.status] ?? exec.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {exec.created_at ? new Date(exec.created_at).toLocaleDateString('fr-FR') : '-'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-gray-900 dark:text-white">
                  {fmt(exec.subtotal_ht)} EUR
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Cards mobile ────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {items.map(exec => (
          <div
            key={exec.id}
            className={`${CARD} p-3 cursor-pointer`}
            onClick={() => setSelectedId(exec.id)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs font-medium text-gray-900 dark:text-white">{exec.number}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[exec.status]}`}>
                {STATUS_LABELS[exec.status]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">{exec.client_name ?? '-'}</span>
              <span className="text-xs font-mono text-gray-900 dark:text-white">{fmt(exec.subtotal_ht)} EUR</span>
            </div>
            <div className="mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[exec.exec_type]}`}>
                {TYPE_LABELS[exec.exec_type]}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={BTN_SM}
          >
            Precedent
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={BTN_SM}
          >
            Suivant
          </button>
        </div>
      )}

      {/* ── Overlay detail ──────────────────────────────────────────────── */}
      {selectedId && detail && (
        <ExecutionDetailPanel
          detail={detail}
          onClose={() => setSelectedId(null)}
          onValidate={() => validateMut.mutate(detail.id)}
          onInvoice={() => invoiceMut.mutate(detail.id)}
          onDelete={() => { if (confirm('Supprimer ce brouillon ?')) deleteMut.mutate(detail.id) }}
          onDuplicate={() => duplicateMut.mutate(detail.id)}
          onArchive={() => archiveMut.mutate([detail.id])}
        />
      )}

      {/* ── Overlay creation ────────────────────────────────────────────── */}
      {showCreate && (
        <ExecutionCreatePanel
          defaultType={typeFilter ?? 'order'}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['executions'] }) }}
        />
      )}
    </PageLayout>
  )
}

// ── Panel detail ───────────────────────────────────────────────────────────

function ExecutionDetailPanel({
  detail,
  onClose,
  onValidate,
  onInvoice,
  onDelete,
  onDuplicate,
  onArchive,
}: {
  detail: ExecutionDetail
  onClose: () => void
  onValidate: () => void
  onInvoice: () => void
  onDelete: () => void
  onDuplicate: () => void
  onArchive: () => void
}) {
  const isProgress = detail.exec_type === 'progress'

  return (
    <div className={OVERLAY_BACKDROP} onClick={onClose}>
      <div className={OVERLAY_PANEL} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={OVERLAY_HEADER}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{detail.number}</h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[detail.exec_type]}`}>
              {TYPE_LABELS[detail.exec_type]}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[detail.status]}`}>
              {STATUS_LABELS[detail.status]}
            </span>
          </div>
          <button onClick={onClose} className={BTN_CLOSE}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {/* Infos generales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className={LABEL}>Client</span>
              <p className="text-gray-900 dark:text-white">{detail.client_name ?? '-'}</p>
            </div>
            {detail.client_reference && (
              <div>
                <span className={LABEL}>Ref. client</span>
                <p className="text-gray-900 dark:text-white">{detail.client_reference}</p>
              </div>
            )}
            {detail.period_label && (
              <div>
                <span className={LABEL}>Periode</span>
                <p className="text-gray-900 dark:text-white">{detail.period_label}</p>
              </div>
            )}
            {detail.situation_number && (
              <div>
                <span className={LABEL}>Situation n.</span>
                <p className="text-gray-900 dark:text-white">{detail.situation_number}</p>
              </div>
            )}
          </div>

          {/* Chaine documentaire */}
          {(detail.source_quote_number || detail.invoice_number || detail.linked_documents.length > 0) && (
            <div className={SECTION}>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Chaine documentaire</h3>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {detail.source_quote_number && (
                  <>
                    <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded">
                      Devis {detail.source_quote_number}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                  </>
                )}
                <span className="px-2 py-1 bg-kerpta/10 text-kerpta dark:text-kerpta-400 rounded font-semibold">
                  {detail.number}
                </span>
                {detail.linked_documents.map(ld => (
                  <span key={ld.id} className="flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                      {ld.other_execution.number}
                    </span>
                  </span>
                ))}
                {detail.invoice_number && (
                  <>
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                    <span className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded">
                      Facture {detail.invoice_number}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tableau de lignes */}
          <div className={SECTION}>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Lignes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-2">Ref</th>
                    <th className="py-2 pr-2">Description</th>
                    <th className="py-2 pr-2">Unite</th>
                    {isProgress ? (
                      <>
                        <th className="py-2 pr-2 text-right">Total contrat</th>
                        <th className="py-2 pr-2 text-right">% prec.</th>
                        <th className="py-2 pr-2 text-right">% actuel</th>
                        <th className="py-2 text-right">Montant</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 pr-2 text-right">Qte</th>
                        <th className="py-2 pr-2 text-right">PU</th>
                        <th className="py-2 pr-2 text-right">TVA</th>
                        <th className="py-2 text-right">Total HT</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {detail.lines.map(ln => (
                    <tr key={ln.id ?? ln.position} className="text-gray-700 dark:text-gray-300">
                      <td className="py-2 pr-2 font-mono">{ln.reference ?? '-'}</td>
                      <td className="py-2 pr-2 max-w-[200px] truncate">{ln.description ?? '-'}</td>
                      <td className="py-2 pr-2">{ln.unit ?? '-'}</td>
                      {isProgress ? (
                        <>
                          <td className="py-2 pr-2 text-right font-mono">{fmt(ln.total_contract)}</td>
                          <td className="py-2 pr-2 text-right font-mono">{ln.previous_pct ?? 0}%</td>
                          <td className="py-2 pr-2 text-right font-mono">{ln.current_pct ?? 0}%</td>
                          <td className="py-2 text-right font-mono font-semibold">{fmt(ln.line_invoice_amount)}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-2 text-right font-mono">{ln.quantity ?? 0}</td>
                          <td className="py-2 pr-2 text-right font-mono">{fmt(ln.unit_price)}</td>
                          <td className="py-2 pr-2 text-right font-mono">{ln.vat_rate ?? 0}%</td>
                          <td className="py-2 text-right font-mono font-semibold">{fmt(ln.total_ht)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totaux */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total HT</span>
                <span className="font-mono text-gray-900 dark:text-white">{fmt(detail.subtotal_ht)} EUR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">TVA</span>
                <span className="font-mono text-gray-900 dark:text-white">{fmt(detail.total_vat)} EUR</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1 font-semibold">
                <span className="text-gray-900 dark:text-white">Total TTC</span>
                <span className="font-mono text-gray-900 dark:text-white">{fmt(detail.total_ttc)} EUR</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {detail.notes && (
            <div>
              <span className={LABEL}>Notes</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            {detail.status === 'draft' && (
              <button onClick={onValidate} className={BTN_SM}>
                <Check className="w-3.5 h-3.5" /> Valider
              </button>
            )}
            {detail.status === 'validated' && (
              <button onClick={onInvoice} className={BTN_SM}>
                <FileText className="w-3.5 h-3.5" /> Facturer
              </button>
            )}
            <button onClick={onDuplicate} className={BTN_SM}>
              <Copy className="w-3.5 h-3.5" /> Dupliquer
            </button>
            <button onClick={onArchive} className={`${BTN_SM} !border-gray-300 !text-gray-600 dark:!text-gray-400`}>
              <Archive className="w-3.5 h-3.5" /> Archiver
            </button>
            {detail.status === 'draft' && (
              <button onClick={onDelete} className={BTN_DANGER_SM}>
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Panel creation ─────────────────────────────────────────────────────────

function ExecutionCreatePanel({
  defaultType,
  onClose,
  onCreated,
}: {
  defaultType: string
  onClose: () => void
  onCreated: () => void
}) {
  const [execType, setExecType] = useState(defaultType)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientRef, setClientRef] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ExecutionLine[]>([
    { position: 0, unit_price: 0, vat_rate: 20, quantity: 1 },
  ])
  const [submitting, setSubmitting] = useState(false)

  const isProgress = execType === 'progress'

  const addLine = () => {
    setLines(prev => [
      ...prev,
      {
        position: prev.length,
        unit_price: 0,
        vat_rate: 20,
        ...(isProgress ? { total_contract: 0, current_pct: 0 } : { quantity: 1 }),
      },
    ])
  }

  const updateLine = (idx: number, field: string, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, position: i })))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!clientId) return
    setSubmitting(true)
    try {
      await orgPost('/api/v1/executions', {
        exec_type: execType,
        client_id: clientId,
        client_reference: clientRef || undefined,
        period_label: periodLabel || undefined,
        notes: notes || undefined,
        lines: lines.map((l, i) => ({
          ...l,
          position: i,
          unit_price: Number(l.unit_price),
          vat_rate: Number(l.vat_rate),
          quantity: l.quantity != null ? Number(l.quantity) : undefined,
          total_contract: l.total_contract != null ? Number(l.total_contract) : undefined,
          current_pct: l.current_pct != null ? Number(l.current_pct) : undefined,
          discount_percent: Number(l.discount_percent ?? 0),
        })),
      })
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={OVERLAY_BACKDROP} onClick={onClose}>
      <div className={OVERLAY_PANEL} onClick={e => e.stopPropagation()}>
        <div className={OVERLAY_HEADER}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nouveau document d'execution
          </h2>
          <button onClick={onClose} className={BTN_CLOSE}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
          {/* Type */}
          <div>
            <label className={LABEL}>Type</label>
            <select
              value={execType}
              onChange={e => setExecType(e.target.value)}
              className={SELECT}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Client */}
          <div>
            <label className={LABEL}>Client</label>
            <ClientCombobox value={clientId ?? ''} onChange={setClientId} />
          </div>

          {/* Reference client */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Reference client</label>
              <input value={clientRef} onChange={e => setClientRef(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Periode</label>
              <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} className={INPUT} placeholder="ex: Janvier 2026" />
            </div>
          </div>

          {/* Lignes */}
          <div className={SECTION}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">Lignes</h3>
              <button type="button" onClick={addLine} className={BTN_SM}>
                <Plus className="w-3.5 h-3.5" /> Ligne
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      placeholder="Description"
                      value={line.description ?? ''}
                      onChange={e => updateLine(idx, 'description', e.target.value)}
                      className={LINE_INPUT}
                    />
                  </div>
                  <div className="w-16">
                    <input
                      type="number"
                      placeholder={isProgress ? '% actuel' : 'Qte'}
                      value={isProgress ? (line.current_pct ?? '') : (line.quantity ?? '')}
                      onChange={e => updateLine(idx, isProgress ? 'current_pct' : 'quantity', e.target.value)}
                      className={LINE_INPUT}
                      step="any"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="number"
                      placeholder={isProgress ? 'Total contrat' : 'PU'}
                      value={isProgress ? (line.total_contract ?? '') : (line.unit_price ?? '')}
                      onChange={e => updateLine(idx, isProgress ? 'total_contract' : 'unit_price', e.target.value)}
                      className={LINE_INPUT}
                      step="any"
                    />
                  </div>
                  <div className="w-16">
                    <select
                      value={line.vat_rate}
                      onChange={e => updateLine(idx, 'vat_rate', Number(e.target.value))}
                      className={LINE_SELECT}
                    >
                      <option value={0}>0%</option>
                      <option value={2.1}>2.1%</option>
                      <option value={5.5}>5.5%</option>
                      <option value={10}>10%</option>
                      <option value={20}>20%</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="p-1 text-gray-400 hover:text-red-500 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={TEXTAREA} rows={2} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={!clientId || submitting} className={BTN}>
              {submitting ? 'Creation...' : 'Creer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

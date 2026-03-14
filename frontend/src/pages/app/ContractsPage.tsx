// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, BarChart3, Info, Filter } from 'lucide-react'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import ColumnFilterHeader, { type FilterValues, type FilterOption } from '@/components/app/ColumnFilter'
import MobileFilterPanel from '@/components/app/MobileFilterPanel'

interface Contract {
  id: string
  reference: string
  client_name: string | null
  contract_type: string
  status: string
  title: string | null
  total_budget: number
  total_invoiced: number
  start_date: string | null
  end_date: string | null
  created_at: string
}

interface ContractDetail extends Contract {
  client_id: string | null
  supplier_id: string | null
  auto_renew: boolean
  renewal_notice_days: number
  bpu_quote_id: string | null
  remaining: number
  progress_percent: number
  quote_count: number
  situation_count: number
  invoice_count: number
  notes: string | null
}

interface Situation {
  id: string
  situation_number: number
  period_label: string
  status: string
  cumulative_total: number
  previously_invoiced: number
  invoice_amount: number
  invoice_id: string | null
}

interface QuoteRef {
  id: string
  number: string
  document_type: string
  is_avenant: boolean
  avenant_number: number | null
  status: string
  subtotal_ht: number
  total_ttc: number
  issue_date: string
}

const TYPE_LABELS: Record<string, string> = {
  purchase_order: 'Bon de commande',
  fixed_price: 'Prix fixe',
  progress_billing: 'Avancement',
  recurring: 'Récurrent',
  employment: 'Travail',
  nda: 'NDA',
  other: 'Autre',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  active: { label: 'Actif', cls: 'bg-green-100 text-green-700' },
  completed: { label: 'Terminé', cls: 'bg-blue-100 text-blue-700' },
  terminated: { label: 'Résilié', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulé', cls: 'bg-yellow-100 text-yellow-700' },
}

function fmtCurrency(v: number) {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

// ── Filtres colonnes ──────────────────────────────────────────────────────────

const CONTRACT_FILTERS: FilterOption[] = [
  { column: 'reference', label: 'Réf.', type: 'text', placeholder: 'Rechercher une référence...' },
  { column: 'client', label: 'Client', type: 'text', placeholder: 'Rechercher un client...' },
  { column: 'type', label: 'Type', type: 'select', options: [
    { value: 'purchase_order', label: 'Bon de commande' },
    { value: 'fixed_price', label: 'Prix fixe' },
    { value: 'progress_billing', label: 'Avancement' },
    { value: 'recurring', label: 'Récurrent' },
  ] },
  { column: 'status', label: 'Statut', type: 'multi-select', options: [
    { value: 'draft', label: 'Brouillon' },
    { value: 'active', label: 'Actif' },
    { value: 'completed', label: 'Terminé' },
    { value: 'terminated', label: 'Résilié' },
    { value: 'cancelled', label: 'Annulé' },
  ] },
]

// ── Liste ─────────────────────────────────────────────────────────────────────

function ContractsList() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterValues>({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const updateFilter = useCallback((column: string, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [column]: value }))
    setPage(1)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page }

      if (filters.type) params.contract_type = filters.type as string
      const statusArr = filters.status as string[] | undefined
      if (statusArr?.length === 1) params.status = statusArr[0]

      const data = await orgGet<{ items: Contract[]; total: number }>('/contracts', params)
      let items = data.items

      // Filtrage côté client pour référence et client (pas de param backend dédié)
      const refSearch = (filters.reference as string || '').toLowerCase()
      if (refSearch) items = items.filter((c) => c.reference.toLowerCase().includes(refSearch))
      const clientSearch = (filters.client as string || '').toLowerCase()
      if (clientSearch) items = items.filter((c) => (c.client_name || '').toLowerCase().includes(clientSearch))
      // Multi-status côté client
      if (statusArr && statusArr.length > 1) {
        items = items.filter((c) => statusArr.includes(c.status))
      }

      setContracts(items)
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
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Contrats & Commandes</h1>
            <div className="relative group hidden md:block">
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
            onClick={() => setShowMobileFilters(true)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
          >
            <Filter className="w-4 h-4" />
            Filtres
            {activeFilterCount > 0 && (
              <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-medium leading-none">{activeFilterCount}</span>
            )}
          </button>
        </div>

        <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <ColumnFilterHeader filter={CONTRACT_FILTERS[0]} value={filters.reference || ''} onChange={(v) => updateFilter('reference', v)} />
                <ColumnFilterHeader filter={CONTRACT_FILTERS[1]} value={filters.client || ''} onChange={(v) => updateFilter('client', v)} />
                <ColumnFilterHeader filter={CONTRACT_FILTERS[2]} value={filters.type || ''} onChange={(v) => updateFilter('type', v)} />
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Budget</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Facturé</th>
                <ColumnFilterHeader filter={CONTRACT_FILTERS[3]} value={filters.status || []} onChange={(v) => updateFilter('status', v)} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" /></td></tr>
              ) : contracts.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">Aucun contrat trouvé</td></tr>
              ) : (
                contracts.map((c) => {
                  const st = STATUS_LABELS[c.status] || { label: c.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={c.id} onClick={() => setSelectedId(c.id)} className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.reference}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.client_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{TYPE_LABELS[c.contract_type] || c.contract_type}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(c.total_budget)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(c.total_invoiced)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" /></div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun contrat trouvé</div>
          ) : (
            contracts.map((c) => {
              const st = STATUS_LABELS[c.status] || { label: c.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <div key={c.id} onClick={() => setSelectedId(c.id)} className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:bg-orange-50/50 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs text-gray-700">{c.reference}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">{c.client_name || '—'}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{TYPE_LABELS[c.contract_type] || c.contract_type}</span>
                    <span className="font-medium text-gray-700">{fmtCurrency(c.total_budget)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Précédent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Suivant</button>
          </div>
        )}

        {/* Overlay détail contrat */}
        {selectedId && (
          <ContractDetailPanel
            contractId={selectedId}
            onClose={() => { setSelectedId(null); void load() }}
          />
        )}

        {/* Mobile filter panel */}
        {showMobileFilters && (
          <MobileFilterPanel
            filters={CONTRACT_FILTERS}
            values={filters}
            onChange={updateFilter}
            onClose={() => setShowMobileFilters(false)}
          />
        )}
      </div>
    </div>
  )
}

// ── Détail (overlay) ──────────────────────────────────────────────────────────

function ContractDetailPanel({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [situations, setSituations] = useState<Situation[]>([])
  const [quotes, setQuotes] = useState<QuoteRef[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'budget' | 'situations' | 'quotes'>('budget')
  const [creatingSlice, setCreatingSlice] = useState(false)
  const [sliceLabel, setSliceLabel] = useState('')
  const [situationId, setSituationId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      orgGet<ContractDetail>(`/contracts/${contractId}`),
      orgGet<Situation[]>(`/contracts/${contractId}/situations`),
      orgGet<QuoteRef[]>(`/contracts/${contractId}/quotes`),
    ])
      .then(([c, s, q]) => { setContract(c); setSituations(s); setQuotes(q) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [contractId])

  async function createSituation() {
    if (!sliceLabel.trim()) return
    setCreatingSlice(true)
    try {
      await orgPost<{ id: string }>(`/contracts/${contractId}/situations`, { period_label: sliceLabel })
      setSliceLabel('')
      // Refresh
      const [s] = await Promise.all([orgGet<Situation[]>(`/contracts/${contractId}/situations`)])
      setSituations(s)
    } catch { /* ignore */ }
    setCreatingSlice(false)
  }

  const st = contract ? (STATUS_LABELS[contract.status] || { label: contract.status, cls: 'bg-gray-100 text-gray-600' }) : null
  const progressWidth = contract ? Math.min(Number(contract.progress_percent), 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full mx-2 md:mx-6 max-w-5xl mt-4 md:mt-8 mb-4 md:mb-8 px-4 md:px-6 py-4 md:py-6"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : !contract || !st ? (
          <div className="py-16 text-center text-gray-400 text-sm">Contrat introuvable</div>
        ) : (<>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{contract.reference} {contract.title && `— ${contract.title}`}</h1>
            <p className="text-sm text-gray-400">
              {TYPE_LABELS[contract.contract_type] || contract.contract_type} — {contract.client_name || 'Sans client'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.cls}`}>{st.label}</span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
              <span className="sr-only">Fermer</span>
              ✕
            </button>
          </div>
        </div>

        {/* Budget card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-orange-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Budget</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-400">Total budget</p>
              <p className="text-lg font-bold text-gray-900">{fmtCurrency(contract.total_budget)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Facturé</p>
              <p className="text-lg font-bold text-gray-900">{fmtCurrency(contract.total_invoiced)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Restant</p>
              <p className="text-lg font-bold text-orange-600">{fmtCurrency(contract.remaining)}</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="bg-orange-500 h-2.5 rounded-full transition-all" style={{ width: `${progressWidth}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1 text-right">{Number(contract.progress_percent).toFixed(1)} %</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(['budget', 'situations', 'quotes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition ${tab === t ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-700'}`}
            >
              {t === 'budget' ? 'Informations' : t === 'situations' ? `Situations (${situations.length})` : `Devis (${quotes.length})`}
            </button>
          ))}
        </div>

        {/* Tab: informations */}
        {tab === 'budget' && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="text-gray-400">Début :</span> {contract.start_date || '—'}</p>
              <p><span className="text-gray-400">Fin :</span> {contract.end_date || '—'}</p>
              <p><span className="text-gray-400">Renouvellement :</span> {contract.auto_renew ? `Auto (${contract.renewal_notice_days}j préavis)` : 'Non'}</p>
              <p><span className="text-gray-400">Devis :</span> {contract.quote_count}</p>
              <p><span className="text-gray-400">Situations :</span> {contract.situation_count}</p>
              <p><span className="text-gray-400">Factures :</span> {contract.invoice_count}</p>
            </div>
            {contract.notes && <p className="text-sm text-gray-500 pt-2 border-t border-gray-100">{contract.notes}</p>}
          </section>
        )}

        {/* Tab: situations */}
        {tab === 'situations' && (
          <div className="space-y-4">
            {contract.contract_type === 'progress_billing' && contract.status === 'active' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sliceLabel}
                  onChange={(e) => setSliceLabel(e.target.value)}
                  placeholder="Libellé période (ex: Mars 2026)"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <button
                  onClick={createSituation}
                  disabled={creatingSlice || !sliceLabel.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {creatingSlice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Nouvelle situation
                </button>
              </div>
            )}

            {situations.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Aucune situation</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                      <th className="px-4 py-3">N°</th>
                      <th className="px-4 py-3">Période</th>
                      <th className="px-4 py-3 text-right">Déjà facturé</th>
                      <th className="px-4 py-3 text-right">A facturer</th>
                      <th className="px-4 py-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {situations.map((s) => {
                      const sSt = s.status === 'draft' ? { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' }
                        : s.status === 'invoiced' ? { label: 'Facturée', cls: 'bg-blue-100 text-blue-700' }
                        : { label: 'Payée', cls: 'bg-green-100 text-green-700' }
                      return (
                        <tr key={s.id} onClick={() => setSituationId(s.id)} className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                          <td className="px-4 py-3 font-mono text-gray-700">#{s.situation_number}</td>
                          <td className="px-4 py-3 text-gray-900">{s.period_label}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{fmtCurrency(s.previously_invoiced)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCurrency(s.invoice_amount)}</td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sSt.cls}`}>{sSt.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab: devis */}
        {tab === 'quotes' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {quotes.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Aucun devis lié</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                    <th className="px-4 py-3">N°</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 text-right">Total HT</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{q.number}</td>
                      <td className="px-4 py-3 text-gray-500">{q.is_avenant ? `Avenant n°${q.avenant_number}` : q.document_type}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(STATUS_LABELS[q.status] || { cls: 'bg-gray-100' }).cls}`}>{(STATUS_LABELS[q.status] || { label: q.status }).label}</span></td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(q.subtotal_ht)}</td>
                      <td className="px-4 py-3 text-gray-500">{q.issue_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Overlay situation */}
        {situationId && (
          <SituationEditorPanel
            contractId={contractId}
            situationId={situationId}
            onClose={() => {
              setSituationId(null)
              // Rafraîchir les situations
              orgGet<Situation[]>(`/contracts/${contractId}/situations`).then(setSituations).catch(() => {})
            }}
          />
        )}

        </>)}
      </div>
    </div>
  )
}

// ── Situation detail (overlay) ────────────────────────────────────────────────

function SituationEditorPanel({ contractId: _contractId, situationId, onClose }: { contractId: string; situationId: string; onClose: () => void }) {
  const [situation, setSituation] = useState<{
    id: string; situation_number: number; period_label: string; status: string
    cumulative_total: number; previously_invoiced: number; invoice_amount: number
    lines: SituationLine[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)

  interface SituationLine {
    id: string; quote_line_id: string; description: string | null; reference: string | null
    unit: string | null; total_contract: number; previous_completion_percent: number
    completion_percent: number; cumulative_amount: number; previously_invoiced: number
    line_invoice_amount: number
  }

  useEffect(() => {
    setLoading(true)
    orgGet<typeof situation>(`/situations/${situationId}`)
      .then(setSituation)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [situationId])

  function updateLinePercent(idx: number, pctStr: string) {
    if (!situation) return
    const pct = Math.min(100, Math.max(0, parseFloat(pctStr) || 0))
    const newLines = [...situation.lines]
    const line = { ...newLines[idx] }
    line.completion_percent = pct
    line.cumulative_amount = Math.round(pct * Number(line.total_contract) / 100 * 100) / 100
    line.line_invoice_amount = Math.round((line.cumulative_amount - Number(line.previously_invoiced)) * 100) / 100
    newLines[idx] = line

    const totalInvoice = newLines.reduce((s, l) => s + l.line_invoice_amount, 0)
    const totalCumul = newLines.reduce((s, l) => s + l.cumulative_amount, 0)
    const totalPrev = newLines.reduce((s, l) => s + Number(l.previously_invoiced), 0)
    setSituation({ ...situation, lines: newLines, invoice_amount: totalInvoice, cumulative_total: totalCumul, previously_invoiced: totalPrev })
  }

  async function save() {
    if (!situation) return
    setSaving(true)
    try {
      await orgPatch(`/situations/${situationId}`, {
        lines: situation.lines.map((l) => ({
          quote_line_id: l.quote_line_id,
          completion_percent: l.completion_percent,
        })),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function validate() {
    setValidating(true)
    try {
      await orgPost(`/situations/${situationId}/validate`)
      const data = await orgGet<typeof situation>(`/situations/${situationId}`)
      setSituation(data)
    } catch { /* ignore */ }
    setValidating(false)
  }

  const isDraft = situation?.status === 'draft'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full mx-2 md:mx-6 max-w-5xl mt-4 md:mt-8 mb-4 md:mb-8 px-4 md:px-6 py-4 md:py-6"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : !situation ? (
          <div className="py-16 text-center text-gray-400 text-sm">Situation introuvable</div>
        ) : (<>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Situation n°{situation.situation_number}</h1>
            <p className="text-sm text-gray-400">{situation.period_label}</p>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                </button>
                <button onClick={validate} disabled={validating} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Valider & Facturer'}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition ml-1">✕</button>
          </div>
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Cumulé</p>
            <p className="text-xl font-bold text-gray-900">{fmtCurrency(situation.cumulative_total)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Déjà facturé</p>
            <p className="text-xl font-bold text-gray-500">{fmtCurrency(situation.previously_invoiced)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">A facturer</p>
            <p className="text-xl font-bold text-orange-600">{fmtCurrency(situation.invoice_amount)}</p>
          </div>
        </div>

        {/* Lignes */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Total contrat</th>
                <th className="px-4 py-3 text-right">% précédent</th>
                <th className="px-4 py-3 text-right w-24">% cumulé</th>
                <th className="px-4 py-3 text-right">Cumulé</th>
                <th className="px-4 py-3 text-right">Déjà facturé</th>
                <th className="px-4 py-3 text-right">A facturer</th>
              </tr>
            </thead>
            <tbody>
              {situation.lines.map((l, i) => {
                const isComplete = Number(l.previous_completion_percent) >= 100
                return (
                  <tr key={l.id} className={`border-b border-gray-50 ${isComplete ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-gray-900">{l.description || l.reference || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(l.total_contract)}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{Number(l.previous_completion_percent).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">
                      {isDraft && !isComplete ? (
                        <input
                          type="number"
                          min={Number(l.previous_completion_percent)}
                          max={100}
                          step="0.01"
                          value={l.completion_percent}
                          onChange={(e) => updateLinePercent(i, e.target.value)}
                          className="w-20 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      ) : (
                        <span className="text-gray-700">{Number(l.completion_percent).toFixed(1)}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(l.cumulative_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{fmtCurrency(l.previously_invoiced)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCurrency(l.line_invoice_amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        </>)}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContractsPage({ path: _path }: { path?: string }) {
  return <ContractsList />
}

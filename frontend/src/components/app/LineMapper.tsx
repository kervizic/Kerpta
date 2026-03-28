// Kerpta - Composant de mapping lignes IA vers lignes document final
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Check, Sparkles, FileText, Package, UserRound, PenLine, Loader2, ChevronRight, Plus, X } from 'lucide-react'
import { orgGet } from '@/lib/orgApi'
import { fmtCurrency } from '@/lib/formatting'
import { INPUT, LINE_INPUT, BTN, BTN_SM } from '@/lib/formStyles'

// -- Types publiques ----------------------------------------------------------

export interface ImportLine {
  id: string
  position: number
  extracted_designation: string | null
  extracted_description: string | null
  extracted_reference: string | null
  extracted_quantity: number | null
  extracted_unit: string | null
  extracted_unit_price: number | null
  extracted_vat_rate: number | null
  extracted_total_ht: number | null
  match_confidence: number | null
}

export interface MappedLine {
  source: 'catalog' | 'client_product' | 'quote_line' | 'free'
  source_id: string | null
  source_label: string | null
  quote_id: string | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  vat_rate: number
  discount_percent: number
  product_id: string | null
}

export interface LineMapperProps {
  importLines: ImportLine[]
  clientId: string | null
  onLinesReady: (lines: MappedLine[]) => void
}

// -- Types internes -----------------------------------------------------------

interface CatalogProduct {
  id: string
  reference: string | null
  name: string
  description: string | null
  unit: string | null
  unit_price: number | null
  vat_rate: number
  is_client_variant?: boolean
  client_id?: string | null
}

interface QuoteLineResult {
  line_id: string
  position: number
  reference: string | null
  description: string | null
  quantity: number
  unit: string | null
  unit_price: number
  vat_rate: number
  discount_percent: number
  total_ht: number
  product_id: string | null
  quote_id: string
  quote_number: string
  quote_status: string
}

interface QuoteWithLines {
  id: string
  number: string
  status: string
  client_name: string | null
  subtotal_ht: number
  issue_date: string
  lines: QuoteDetailLine[]
}

interface QuoteDetailLine {
  id: string
  position: number
  reference: string | null
  description: string | null
  quantity: number
  unit: string | null
  unit_price: number
  vat_rate: number
  discount_percent: number
  total_ht: number
  product_id: string | null
}

// Une ligne IA peut avoir plusieurs sous-lignes mappees
interface SubMapping {
  id: string // unique key
  source: MappedLine['source']
  source_id: string | null
  source_label: string | null
  quote_id: string | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  vat_rate: number
  discount_percent: number
  product_id: string | null
}

interface LineMappingState {
  mapped: boolean
  subs: SubMapping[] // Une ou plusieurs sous-lignes
}

// -- Helpers ------------------------------------------------------------------

let _subId = 0
function nextSubId(): string {
  return `sub_${++_subId}_${Date.now()}`
}

function confidenceBadge(confidence: number | null) {
  if (confidence == null) return { label: '-', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.8) return { label: `${pct}%`, cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' }
  if (confidence >= 0.5) return { label: `${pct}%`, cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' }
  return { label: `${pct}%`, cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
}

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  catalog: { label: 'Catalogue', cls: 'bg-kerpta-100 text-kerpta-700 dark:bg-kerpta-900/40 dark:text-kerpta-400' },
  client_product: { label: 'Article client', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400' },
  quote_line: { label: 'Devis', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  free: { label: 'Saisie libre', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}

function makeFreeSub(line: ImportLine): SubMapping {
  return {
    id: nextSubId(),
    source: 'free',
    source_id: null,
    source_label: null,
    quote_id: null,
    description: line.extracted_designation || line.extracted_description || '',
    quantity: line.extracted_quantity ?? 1,
    unit: line.extracted_unit || 'u',
    unit_price: line.extracted_unit_price ?? 0,
    vat_rate: line.extracted_vat_rate ?? 20,
    discount_percent: 0,
    product_id: null,
  }
}

function makeQuoteLineSub(ql: QuoteDetailLine, quoteNumber: string, quoteId: string): SubMapping {
  return {
    id: nextSubId(),
    source: 'quote_line',
    source_id: ql.id,
    source_label: `${quoteNumber} L${ql.position + 1}`,
    quote_id: quoteId,
    description: ql.description || '',
    quantity: ql.quantity,
    unit: ql.unit || 'u',
    unit_price: ql.unit_price,
    vat_rate: ql.vat_rate,
    discount_percent: ql.discount_percent ?? 0,
    product_id: ql.product_id,
  }
}

// -- Auto-matching lignes IA <-> lignes devis --------------------------------

function autoMatchQuoteLines(importLines: ImportLine[], quoteLines: QuoteDetailLine[], quoteNumber: string, quoteId: string): Record<number, LineMappingState> {
  const result: Record<number, LineMappingState> = {}
  const usedQuoteLines = new Set<number>()

  for (const il of importLines) {
    let bestMatch: QuoteDetailLine | null = null
    let bestScore = 0

    for (const ql of quoteLines) {
      if (usedQuoteLines.has(ql.position)) continue
      let score = 0
      if (il.extracted_reference && ql.reference &&
          il.extracted_reference.toLowerCase().trim() === ql.reference.toLowerCase().trim()) {
        score += 100
      }
      const ilWords = (il.extracted_designation || il.extracted_description || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const qlWords = (ql.description || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
      if (ilWords.length > 0 && qlWords.length > 0) {
        const common = ilWords.filter(w => qlWords.some(qw => qw.includes(w) || w.includes(qw)))
        score += (common.length / Math.max(ilWords.length, qlWords.length)) * 50
      }
      if (il.extracted_unit_price != null && ql.unit_price != null && ql.unit_price > 0) {
        const ratio = Math.abs(il.extracted_unit_price - ql.unit_price) / ql.unit_price
        if (ratio < 0.05) score += 30
        else if (ratio < 0.15) score += 15
      }
      if (il.extracted_quantity != null && ql.quantity != null && il.extracted_quantity === ql.quantity) {
        score += 10
      }
      if (score > bestScore) {
        bestScore = score
        bestMatch = ql
      }
    }

    if (bestMatch && bestScore >= 20) {
      usedQuoteLines.add(bestMatch.position)
      result[il.position] = {
        mapped: true,
        subs: [makeQuoteLineSub(bestMatch, quoteNumber, quoteId)],
      }
    } else {
      result[il.position] = {
        mapped: true,
        subs: [makeFreeSub(il)],
      }
    }
  }
  return result
}

// -- Composant principal ------------------------------------------------------

export default function LineMapper({ importLines, clientId, onLinesReady }: LineMapperProps) {
  const [mappings, setMappings] = useState<Record<number, LineMappingState>>({})
  const [applied, setApplied] = useState(false)
  const [lastAppliedSnapshot, setLastAppliedSnapshot] = useState<string>('')
  const [showQuoteSearch, setShowQuoteSearch] = useState(false)
  const [quoteSearchQuery, setQuoteSearchQuery] = useState('')
  const [quotesWithLines, setQuotesWithLines] = useState<QuoteWithLines[]>([])
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null)
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quoteSearchRef = useRef<HTMLDivElement>(null)

  // Initialize mappings
  useEffect(() => {
    const init: Record<number, LineMappingState> = {}
    for (const line of importLines) {
      if (!mappings[line.position]) {
        init[line.position] = { mapped: false, subs: [] }
      }
    }
    if (Object.keys(init).length > 0) {
      setMappings((prev) => ({ ...init, ...prev }))
    }
  }, [importLines]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateMapping(position: number, patch: Partial<LineMappingState>) {
    setApplied(false)
    setMappings((prev) => ({
      ...prev,
      [position]: { ...prev[position], ...patch },
    }))
  }

  function updateSub(position: number, subId: string, patch: Partial<SubMapping>) {
    setMappings((prev) => {
      const m = prev[position]
      if (!m) return prev
      return {
        ...prev,
        [position]: {
          ...m,
          subs: m.subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
        },
      }
    })
  }

  function removeSub(position: number, subId: string) {
    setMappings((prev) => {
      const m = prev[position]
      if (!m) return prev
      const newSubs = m.subs.filter((s) => s.id !== subId)
      return {
        ...prev,
        [position]: {
          ...m,
          mapped: newSubs.length > 0,
          subs: newSubs,
        },
      }
    })
  }

  function addSubToLine(position: number, sub: SubMapping) {
    setMappings((prev) => {
      const m = prev[position] || { mapped: false, subs: [] }
      return {
        ...prev,
        [position]: {
          mapped: true,
          subs: [...m.subs, sub],
        },
      }
    })
  }

  function applyFreeForLine(line: ImportLine) {
    updateMapping(line.position, {
      mapped: true,
      subs: [makeFreeSub(line)],
    })
  }

  function applyFreeAll() {
    const updated: Record<number, LineMappingState> = {}
    for (const line of importLines) {
      updated[line.position] = {
        mapped: true,
        subs: [makeFreeSub(line)],
      }
    }
    setMappings(updated)
  }

  // -- Recherche devis avec pre-chargement ------------------------------------

  async function loadClientQuotes(search?: string) {
    setQuoteLoading(true)
    try {
      const params: Record<string, string> = { page_size: '10', status: 'draft,sent,accepted' }
      if (clientId) params.client_id = clientId
      if (search?.trim()) params.search = search.trim()
      const res = await orgGet<{ items: Array<{ id: string; number: string; status: string; client_name: string | null; subtotal_ht: number; issue_date: string }> }>('/quotes', params)

      // Charger les lignes de chaque devis
      const withLines: QuoteWithLines[] = await Promise.all(
        (res.items ?? []).map(async (q) => {
          try {
            const detail = await orgGet<{ lines: QuoteDetailLine[] }>(`/quotes/${q.id}`)
            return { ...q, lines: detail.lines ?? [] }
          } catch {
            return { ...q, lines: [] }
          }
        })
      )
      setQuotesWithLines(withLines)
    } catch {
      setQuotesWithLines([])
    } finally {
      setQuoteLoading(false)
    }
  }

  function searchQuotes(q: string) {
    setQuoteSearchQuery(q)
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current)
    quoteDebounceRef.current = setTimeout(() => {
      void loadClientQuotes(q)
    }, 300)
  }

  async function applyQuoteToAll(quote: QuoteWithLines) {
    setShowQuoteSearch(false)
    setQuoteSearchQuery('')
    if (quote.lines.length > 0) {
      const matched = autoMatchQuoteLines(importLines, quote.lines, quote.number, quote.id)
      setMappings(matched)
    } else {
      applyFreeAll()
    }
  }

  function applyQuoteLineToPosition(position: number, ql: QuoteDetailLine, quoteNumber: string, quoteId: string) {
    addSubToLine(position, makeQuoteLineSub(ql, quoteNumber, quoteId))
  }

  // Fermer dropdown devis au clic exterieur
  useEffect(() => {
    if (!showQuoteSearch) return
    function handle(e: MouseEvent) {
      if (quoteSearchRef.current && !quoteSearchRef.current.contains(e.target as Node)) {
        setShowQuoteSearch(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showQuoteSearch])

  // Pre-charger les devis du client quand on ouvre la recherche
  useEffect(() => {
    if (showQuoteSearch) {
      void loadClientQuotes('')
    }
  }, [showQuoteSearch, clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyCatalogProduct(position: number, product: CatalogProduct, line: ImportLine, isClientVariant: boolean) {
    addSubToLine(position, {
      id: nextSubId(),
      source: isClientVariant ? 'client_product' : 'catalog',
      source_id: product.id,
      source_label: product.reference || product.name,
      quote_id: null,
      description: product.description || product.name,
      quantity: line.extracted_quantity ?? 1,
      unit: product.unit || 'u',
      unit_price: product.unit_price ?? 0,
      vat_rate: product.vat_rate ?? 20,
      discount_percent: 0,
      product_id: product.id,
    })
  }

  function applyQuoteLine(position: number, ql: QuoteLineResult) {
    addSubToLine(position, {
      id: nextSubId(),
      source: 'quote_line',
      source_id: ql.line_id,
      source_label: `${ql.quote_number} L${ql.position + 1}`,
      quote_id: ql.quote_id,
      description: ql.description || '',
      quantity: ql.quantity,
      unit: ql.unit || 'u',
      unit_price: ql.unit_price,
      vat_rate: ql.vat_rate,
      discount_percent: ql.discount_percent ?? 0,
      product_id: ql.product_id,
    })
  }

  function handleApply() {
    const lines: MappedLine[] = []
    for (const il of importLines) {
      const m = mappings[il.position]
      if (!m || !m.mapped || m.subs.length === 0) {
        // Unmapped - saisie libre par defaut
        lines.push({
          source: 'free',
          source_id: null,
          source_label: null,
          quote_id: null,
          description: il.extracted_designation || il.extracted_description || '',
          quantity: il.extracted_quantity ?? 1,
          unit: il.extracted_unit || 'u',
          unit_price: il.extracted_unit_price ?? 0,
          vat_rate: il.extracted_vat_rate ?? 20,
          discount_percent: 0,
          product_id: null,
        })
      } else {
        // Plusieurs sous-lignes possibles par ligne IA
        for (const sub of m.subs) {
          lines.push({
            source: sub.source,
            source_id: sub.source_id,
            source_label: sub.source_label,
            quote_id: sub.quote_id,
            description: sub.description,
            quantity: sub.quantity,
            unit: sub.unit,
            unit_price: sub.unit_price,
            vat_rate: sub.vat_rate,
            discount_percent: sub.discount_percent,
            product_id: sub.product_id,
          })
        }
      }
    }
    const snapshot = JSON.stringify(lines)
    setLastAppliedSnapshot(snapshot)
    setApplied(true)
    onLinesReady(lines)
  }

  const allMapped = importLines.every((il) => mappings[il.position]?.mapped)
  // Verifier si les mappings ont change depuis le dernier apply
  const currentSnapshot = allMapped ? JSON.stringify(
    importLines.flatMap((il) => {
      const m = mappings[il.position]
      return m?.subs ?? []
    })
  ) : ''
  const hasChanges = !applied || currentSnapshot !== lastAppliedSnapshot

  const statusLabel: Record<string, string> = {
    draft: 'Brouillon',
    sent: 'Envoye',
    accepted: 'Accepte',
  }

  return (
    <div className="space-y-3">
      {/* Actions de masse */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <button onClick={applyFreeAll} className={BTN_SM}>
          <PenLine className="w-3.5 h-3.5" />
          Tout en saisie libre
        </button>

        {/* Importer un devis */}
        <div ref={quoteSearchRef} className="relative">
          <button
            onClick={() => {
              if (!clientId) return
              setShowQuoteSearch(!showQuoteSearch)
            }}
            className={BTN_SM}
            disabled={!clientId}
            title={clientId ? 'Mapper les lignes depuis un devis' : 'Selectionnez un client d\'abord'}
          >
            <FileText className="w-3.5 h-3.5" />
            Importer un devis
          </button>

          {showQuoteSearch && (
            <div className="absolute z-50 top-full left-0 mt-1 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    className={INPUT + ' pl-8 !h-[32px] !text-xs'}
                    value={quoteSearchQuery}
                    onChange={(e) => searchQuotes(e.target.value)}
                    placeholder="Rechercher un devis (numero, client)..."
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {quoteLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : quotesWithLines.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-gray-400 text-center">Aucun devis trouve</div>
                ) : (
                  quotesWithLines.map((q) => (
                    <div key={q.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                      {/* Devis header - clic = importer tout le devis */}
                      <div className="flex items-center gap-2 px-3 py-2 hover:bg-kerpta-50 dark:hover:bg-kerpta-900/20 transition">
                        <button
                          onMouseDown={(e) => { e.preventDefault(); setExpandedQuoteId(expandedQuoteId === q.id ? null : q.id) }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedQuoteId === q.id ? 'rotate-90' : ''}`} />
                        </button>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onMouseDown={(e) => { e.preventDefault(); applyQuoteToAll(q) }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-xs text-gray-800 dark:text-gray-200">{q.number}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400">{statusLabel[q.status] ?? q.status}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{fmtCurrency(q.subtotal_ht)} HT</span>
                            </div>
                          </div>
                          {q.client_name && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{q.client_name} - {q.issue_date}</div>
                          )}
                        </div>
                      </div>

                      {/* Lignes du devis (expandable) */}
                      {expandedQuoteId === q.id && q.lines.length > 0 && (
                        <div className="bg-gray-50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700">
                          {q.lines.map((ql) => (
                            <div
                              key={ql.id}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                // Ajouter cette ligne au premier import non-mappe, ou au premier
                                const target = importLines.find((il) => !mappings[il.position]?.mapped) || importLines[0]
                                if (target) applyQuoteLineToPosition(target.position, ql, q.number, q.id)
                              }}
                              className="px-3 py-1.5 pl-9 text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition flex items-center gap-2"
                            >
                              <span className="text-[10px] text-blue-500 font-mono shrink-0">L{ql.position + 1}</span>
                              <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{ql.description || '-'}</span>
                              <span className="text-gray-400 shrink-0">{ql.quantity} x {fmtCurrency(ql.unit_price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lignes IA */}
      {importLines.map((line) => (
        <LineMapperRow
          key={line.position}
          line={line}
          mapping={mappings[line.position]}
          clientId={clientId}
          onApplyFree={() => applyFreeForLine(line)}
          onApplyCatalog={(p, isClient) => applyCatalogProduct(line.position, p, line, isClient)}
          onApplyQuoteLine={(ql) => applyQuoteLine(line.position, ql)}
          onAddSub={(sub) => addSubToLine(line.position, sub)}
          onUpdateSub={(subId, field, value) => updateSub(line.position, subId, { [field]: value })}
          onRemoveSub={(subId) => removeSub(line.position, subId)}
          onReset={() => updateMapping(line.position, { mapped: false, subs: [] })}
        />
      ))}

      {/* Bottom actions */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex-1" />
        <button
          onClick={handleApply}
          disabled={!allMapped || !hasChanges}
          className={BTN}
          title={!allMapped ? 'Toutes les lignes doivent etre mappees' : !hasChanges ? 'Deja applique' : ''}
        >
          <Check className="w-4 h-4" />
          {applied && !hasChanges ? 'Applique' : `Appliquer (${importLines.filter((il) => mappings[il.position]?.mapped).length}/${importLines.length})`}
        </button>
      </div>
    </div>
  )
}

// -- Row component (multi-sub) ------------------------------------------------

function LineMapperRow({
  line,
  mapping,
  clientId,
  onApplyFree,
  onApplyCatalog,
  onApplyQuoteLine,
  onAddSub,
  onUpdateSub,
  onRemoveSub,
  onReset,
}: {
  line: ImportLine
  mapping: LineMappingState | undefined
  clientId: string | null
  onApplyFree: () => void
  onApplyCatalog: (product: CatalogProduct, isClientVariant: boolean) => void
  onApplyQuoteLine: (ql: QuoteLineResult) => void
  onAddSub: (sub: SubMapping) => void
  onUpdateSub: (subId: string, field: string, value: string | number) => void
  onRemoveSub: (subId: string) => void
  onReset: () => void
}) {
  const conf = confidenceBadge(line.match_confidence)
  const totalHt = (line.extracted_quantity ?? 0) * (line.extracted_unit_price ?? 0)
  const isMapped = mapping?.mapped ?? false
  const subs = mapping?.subs ?? []
  const [showAddSearch, setShowAddSearch] = useState(false)

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      {/* AI row - read only */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 p-3 rounded-t-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 min-w-0 truncate">
            {line.extracted_designation || line.extracted_description || '-'}
          </span>
          {line.extracted_reference && (
            <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">
              {line.extracted_reference}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${conf.cls}`}>
            {conf.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span>{line.extracted_quantity ?? '-'} x {line.extracted_unit_price != null ? fmtCurrency(line.extracted_unit_price) : '-'}</span>
          <span>=</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {line.extracted_total_ht != null ? fmtCurrency(line.extracted_total_ht) : fmtCurrency(totalHt)}
          </span>
          {line.extracted_unit && (
            <span className="text-gray-400">({line.extracted_unit})</span>
          )}
          {line.extracted_vat_rate != null && (
            <span className="text-gray-400">TVA {line.extracted_vat_rate}%</span>
          )}
        </div>
      </div>

      {/* Mapping row */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-b-lg">
        {!isMapped ? (
          <LineSearchDropdown
            clientId={clientId}
            onSelectCatalog={onApplyCatalog}
            onSelectQuoteLine={onApplyQuoteLine}
            onSelectQuoteFull={(subs) => {
              // Remplacer toutes les sous-lignes par les lignes du devis
              for (const sub of subs) onAddSub(sub)
            }}
            onSelectFree={onApplyFree}
          />
        ) : (
          <div className="space-y-2">
            {/* Header : badges + reset + ajouter */}
            <div className="flex items-center gap-2 flex-wrap">
              {subs.length > 1 && (
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                  {subs.length} lignes
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowAddSearch(!showAddSearch)}
                className="text-[10px] text-kerpta hover:text-kerpta-600 dark:text-kerpta-400 dark:hover:text-kerpta-300 transition flex items-center gap-0.5"
                title="Ajouter un article a cette ligne"
              >
                <Plus className="w-3 h-3" />
                Ajouter
              </button>
              <button
                onClick={onReset}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                title="Revenir a la recherche"
              >
                Reinitialiser
              </button>
            </div>

            {/* Search inline pour ajouter un article supplementaire */}
            {showAddSearch && (
              <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-2">
                <LineSearchDropdown
                  clientId={clientId}
                  onSelectCatalog={(p, isClient) => {
                    onAddSub({
                      id: nextSubId(),
                      source: isClient ? 'client_product' : 'catalog',
                      source_id: p.id,
                      source_label: p.reference || p.name,
                      quote_id: null,
                      description: p.description || p.name,
                      quantity: line.extracted_quantity ?? 1,
                      unit: p.unit || 'u',
                      unit_price: p.unit_price ?? 0,
                      vat_rate: p.vat_rate ?? 20,
                      discount_percent: 0,
                      product_id: p.id,
                    })
                    setShowAddSearch(false)
                  }}
                  onSelectQuoteLine={(ql) => {
                    onAddSub({
                      id: nextSubId(),
                      source: 'quote_line',
                      source_id: ql.line_id,
                      source_label: `${ql.quote_number} L${ql.position + 1}`,
                      quote_id: ql.quote_id,
                      description: ql.description || '',
                      quantity: ql.quantity,
                      unit: ql.unit || 'u',
                      unit_price: ql.unit_price,
                      vat_rate: ql.vat_rate,
                      discount_percent: ql.discount_percent ?? 0,
                      product_id: ql.product_id,
                    })
                    setShowAddSearch(false)
                  }}
                  onSelectQuoteFull={(subs) => {
                    for (const sub of subs) onAddSub(sub)
                    setShowAddSearch(false)
                  }}
                  onSelectFree={() => {
                    onAddSub(makeFreeSub(line))
                    setShowAddSearch(false)
                  }}
                />
              </div>
            )}

            {/* Sub-lines */}
            {subs.map((sub, si) => {
              const badge = SOURCE_BADGES[sub.source]
              return (
                <div key={sub.id} className={`space-y-1.5 ${si > 0 ? 'pt-2 border-t border-gray-100 dark:border-gray-700/50' : ''}`}>
                  {/* Source badge + remove */}
                  <div className="flex items-center gap-2">
                    {badge && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.cls}`}>
                        {sub.source === 'quote_line' && sub.source_label
                          ? `Devis ${sub.source_label}`
                          : badge.label}
                      </span>
                    )}
                    {sub.source_label && sub.source !== 'quote_line' && sub.source !== 'free' && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{sub.source_label}</span>
                    )}
                    <div className="flex-1" />
                    {subs.length > 1 && (
                      <button
                        onClick={() => onRemoveSub(sub.id)}
                        className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition"
                        title="Supprimer cette sous-ligne"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Editable fields */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-5">
                      <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Description</label>
                      <input
                        className={LINE_INPUT}
                        value={sub.description}
                        onChange={(e) => onUpdateSub(sub.id, 'description', e.target.value)}
                        placeholder="Description"
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Quantite</label>
                      <input
                        className={LINE_INPUT + ' text-right'}
                        type="number"
                        step="any"
                        value={sub.quantity}
                        onChange={(e) => onUpdateSub(sub.id, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Unite</label>
                      <input
                        className={LINE_INPUT}
                        value={sub.unit}
                        onChange={(e) => onUpdateSub(sub.id, 'unit', e.target.value)}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">PU HT</label>
                      <input
                        className={LINE_INPUT + ' text-right'}
                        type="number"
                        step="any"
                        value={sub.unit_price}
                        onChange={(e) => onUpdateSub(sub.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">TVA %</label>
                      <select
                        className={LINE_INPUT + ' text-right'}
                        value={String(sub.vat_rate)}
                        onChange={(e) => onUpdateSub(sub.id, 'vat_rate', parseFloat(e.target.value) || 0)}
                      >
                        <option value="0">0%</option>
                        <option value="2.1">2.1%</option>
                        <option value="5.5">5.5%</option>
                        <option value="10">10%</option>
                        <option value="20">20%</option>
                        {![0, 2.1, 5.5, 10, 20].includes(sub.vat_rate) && (
                          <option value={String(sub.vat_rate)}>{sub.vat_rate}%</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// -- Search dropdown (reutilisable par ligne et par ajout) --------------------

function LineSearchDropdown({
  clientId,
  onSelectCatalog,
  onSelectQuoteLine,
  onSelectQuoteFull,
  onSelectFree,
}: {
  clientId: string | null
  onSelectCatalog: (product: CatalogProduct, isClientVariant: boolean) => void
  onSelectQuoteLine: (ql: QuoteLineResult) => void
  onSelectQuoteFull?: (subs: SubMapping[]) => void
  onSelectFree: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([])
  const [clientResults, setClientResults] = useState<CatalogProduct[]>([])
  const [quoteResults, setQuoteResults] = useState<QuoteLineResult[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Pre-charger les lignes devis du client au montage
  useEffect(() => {
    if (clientId && !initialLoaded) {
      setInitialLoaded(true)
      void doSearch('', true)
    }
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = useCallback(
    async (q: string, _isInitial = false) => {
      setLoading(true)
      try {
        const promises: Promise<void>[] = []

        // Catalogue general (min 1 char)
        if (q.trim().length >= 1) {
          promises.push(
            orgGet<{ items: CatalogProduct[] }>('/catalog/products', {
              search: q,
              page_size: 10,
            }).then((r) => setCatalogResults(r.items ?? []))
              .catch(() => setCatalogResults([]))
          )
        } else {
          setCatalogResults([])
        }

        // Articles client (min 2 chars) + lignes devis (toujours)
        if (clientId) {
          if (q.trim().length >= 1) {
            promises.push(
              orgGet<{ items: CatalogProduct[] }>('/catalog/products', {
                search: q,
                client_id: clientId,
                page_size: 10,
              }).then((r) => setClientResults(r.items ?? []))
                .catch(() => setClientResults([]))
            )
          } else {
            setClientResults([])
          }

          // Lignes devis : toujours charger
          const qlParams: Record<string, string> = {
            client_id: clientId,
            status: 'draft,sent,accepted',
            page_size: '20',
          }
          if (q.trim().length >= 1) qlParams.search = q.trim()
          promises.push(
            orgGet<{ items: QuoteLineResult[] }>('/quotes/lines', qlParams)
              .then((r) => setQuoteResults(r.items ?? []))
              .catch(() => setQuoteResults([]))
          )
        }

        await Promise.all(promises)
      } finally {
        setLoading(false)
      }
    },
    [clientId],
  )

  function handleChange(value: string) {
    setQuery(value)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void doSearch(value)
    }, 300)
  }

  function handleFocus() {
    setOpen(true)
    if (quoteResults.length === 0 && clientId) {
      void doSearch(query)
    }
  }

  // Grouper les lignes devis par devis
  const quoteGroups: Map<string, { quoteId: string; quoteNumber: string; quoteStatus: string; lines: QuoteLineResult[] }> = new Map()
  for (const ql of quoteResults) {
    const existing = quoteGroups.get(ql.quote_id)
    if (existing) {
      existing.lines.push(ql)
    } else {
      quoteGroups.set(ql.quote_id, {
        quoteId: ql.quote_id,
        quoteNumber: ql.quote_number,
        quoteStatus: ql.quote_status,
        lines: [ql],
      })
    }
  }

  function handleSelectQuoteFull(group: { quoteId: string; quoteNumber: string; lines: QuoteLineResult[] }) {
    if (!onSelectQuoteFull) return
    const subs: SubMapping[] = group.lines.map((ql) => ({
      id: nextSubId(),
      source: 'quote_line' as const,
      source_id: ql.line_id,
      source_label: `${group.quoteNumber} L${ql.position + 1}`,
      quote_id: group.quoteId,
      description: ql.description || '',
      quantity: ql.quantity,
      unit: ql.unit || 'u',
      unit_price: ql.unit_price,
      vat_rate: ql.vat_rate,
      discount_percent: ql.discount_percent ?? 0,
      product_id: ql.product_id,
    }))
    onSelectQuoteFull(subs)
    setOpen(false)
    setQuery('')
  }

  const hasContent = quoteGroups.size > 0 || clientResults.length > 0 || catalogResults.length > 0

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          className={INPUT + ' pl-8 !h-[34px] !text-xs'}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          placeholder="Rechercher un article, un devis..."
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-kerpta rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && (hasContent || true) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto">

          {/* Section Devis - groupes par devis */}
          {quoteGroups.size > 0 && (
            <div>
              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                <FileText className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Devis
                </span>
              </div>
              {Array.from(quoteGroups.values()).map((group) => (
                <div key={group.quoteId}>
                  {/* Header devis - clic = selectionner tout le devis */}
                  <div className="flex items-center gap-1.5 px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition cursor-pointer border-b border-gray-50 dark:border-gray-700/50">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setExpandedQuote(expandedQuote === group.quoteId ? null : group.quoteId)
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${expandedQuote === group.quoteId ? 'rotate-90' : ''}`} />
                    </button>
                    <div
                      className="flex-1 min-w-0"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelectQuoteFull(group)
                      }}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-blue-700 dark:text-blue-400">{group.quoteNumber}</span>
                        <span className="text-[10px] text-gray-400">
                          {group.lines.length} ligne{group.lines.length > 1 ? 's' : ''} - Tout importer
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lignes individuelles du devis */}
                  {expandedQuote === group.quoteId && group.lines.map((ql) => (
                    <div
                      key={ql.line_id}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onSelectQuoteLine(ql)
                        setOpen(false)
                        setQuery('')
                      }}
                      className="px-3 py-1.5 pl-8 text-xs cursor-pointer hover:bg-kerpta-50 dark:hover:bg-kerpta-900/20 transition flex items-center gap-2"
                    >
                      <span className="text-[10px] text-blue-500 font-mono shrink-0">L{ql.position + 1}</span>
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{ql.description || '-'}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">{ql.quantity} x {fmtCurrency(ql.unit_price)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Section Articles client */}
          {clientResults.length > 0 && (
            <div>
              {quoteGroups.size > 0 && <div className="border-t border-gray-100 dark:border-gray-700" />}
              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                <UserRound className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Articles client
                </span>
              </div>
              {clientResults.map((p) => (
                <div
                  key={`client_${p.id}`}
                  onMouseDown={(e) => { e.preventDefault(); onSelectCatalog(p, true); setOpen(false); setQuery('') }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-kerpta-50 dark:hover:bg-kerpta-900/20 transition"
                >
                  <div className="text-gray-800 dark:text-gray-200 truncate">{p.name}</div>
                  {(p.reference || p.unit_price != null) && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {p.reference ? `${p.reference} - ` : ''}{p.unit_price != null ? fmtCurrency(p.unit_price) : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Section Catalogue general */}
          {catalogResults.length > 0 && (
            <div>
              {(quoteGroups.size > 0 || clientResults.length > 0) && <div className="border-t border-gray-100 dark:border-gray-700" />}
              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                <Package className="w-3 h-3 text-kerpta" />
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Catalogue general
                </span>
              </div>
              {catalogResults.map((p) => (
                <div
                  key={p.id}
                  onMouseDown={(e) => { e.preventDefault(); onSelectCatalog(p, false); setOpen(false); setQuery('') }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-kerpta-50 dark:hover:bg-kerpta-900/20 transition"
                >
                  <div className="text-gray-800 dark:text-gray-200 truncate">{p.name}</div>
                  {(p.reference || p.unit_price != null) && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {p.reference ? `${p.reference} - ` : ''}{p.unit_price != null ? fmtCurrency(p.unit_price) : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Saisie libre */}
          <div className="border-t border-gray-100 dark:border-gray-700">
            <div className="px-3 py-1.5 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
              <PenLine className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Saisie libre
              </span>
            </div>
            <div
              onMouseDown={(e) => { e.preventDefault(); onSelectFree(); setOpen(false); setQuery('') }}
              className="px-3 py-2 text-xs cursor-pointer hover:bg-kerpta-50 dark:hover:bg-kerpta-900/20 transition"
            >
              <div className="text-gray-800 dark:text-gray-200">Utiliser les valeurs IA</div>
            </div>
          </div>

          {!loading && !hasContent && (
            <div className="px-3 py-2 text-xs text-gray-400 text-center">Aucun resultat</div>
          )}
        </div>
      )}

      {/* Quick action: apply free directly */}
      {!open && (
        <button
          onClick={onSelectFree}
          className="mt-1.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition flex items-center gap-1"
        >
          <PenLine className="w-3 h-3" />
          Utiliser les valeurs IA directement
        </button>
      )}
    </div>
  )
}

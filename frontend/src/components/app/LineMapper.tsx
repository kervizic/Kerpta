// Kerpta - Composant de mapping lignes IA vers lignes document final
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Check, Sparkles, FileText, Package, UserRound, PenLine, ChevronDown } from 'lucide-react'
import { orgGet } from '@/lib/orgApi'
import { fmtCurrency } from '@/lib/formatting'
import { INPUT, LINE_INPUT, BTN, BTN_SM, LABEL } from '@/lib/formStyles'

// -- Types --------------------------------------------------------------------

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

type SearchResultSection = {
  label: string
  icon: React.ReactNode
  items: SearchResultItem[]
}

type SearchResultItem = {
  type: 'catalog' | 'client_product' | 'quote_line' | 'free'
  id: string
  label: string
  sublabel?: string
  data: CatalogProduct | QuoteLineResult | null
}

interface LineMappingState {
  mapped: boolean
  source: MappedLine['source']
  source_id: string | null
  source_label: string | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  vat_rate: number
  discount_percent: number
  product_id: string | null
}

// -- Helpers ------------------------------------------------------------------

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

// -- Composant principal ------------------------------------------------------

export default function LineMapper({ importLines, clientId, onLinesReady }: LineMapperProps) {
  const [mappings, setMappings] = useState<Record<number, LineMappingState>>({})

  // Initialize mappings from import lines
  useEffect(() => {
    const init: Record<number, LineMappingState> = {}
    for (const line of importLines) {
      if (!mappings[line.position]) {
        init[line.position] = {
          mapped: false,
          source: 'free',
          source_id: null,
          source_label: null,
          description: '',
          quantity: 0,
          unit: '',
          unit_price: 0,
          vat_rate: 0,
          discount_percent: 0,
          product_id: null,
        }
      }
    }
    if (Object.keys(init).length > 0) {
      setMappings((prev) => ({ ...init, ...prev }))
    }
  }, [importLines]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateMapping(position: number, patch: Partial<LineMappingState>) {
    setMappings((prev) => ({
      ...prev,
      [position]: { ...prev[position], ...patch },
    }))
  }

  function applyFreeForLine(line: ImportLine) {
    updateMapping(line.position, {
      mapped: true,
      source: 'free',
      source_id: null,
      source_label: null,
      description: line.extracted_designation || line.extracted_description || '',
      quantity: line.extracted_quantity ?? 1,
      unit: line.extracted_unit || 'u',
      unit_price: line.extracted_unit_price ?? 0,
      vat_rate: line.extracted_vat_rate ?? 20,
      discount_percent: 0,
      product_id: null,
    })
  }

  function applyFreeAll() {
    const updated: Record<number, LineMappingState> = { ...mappings }
    for (const line of importLines) {
      updated[line.position] = {
        mapped: true,
        source: 'free',
        source_id: null,
        source_label: null,
        description: line.extracted_designation || line.extracted_description || '',
        quantity: line.extracted_quantity ?? 1,
        unit: line.extracted_unit || 'u',
        unit_price: line.extracted_unit_price ?? 0,
        vat_rate: line.extracted_vat_rate ?? 20,
        discount_percent: 0,
        product_id: null,
      }
    }
    setMappings(updated)
  }

  function applyCatalogProduct(position: number, product: CatalogProduct, line: ImportLine, isClientVariant: boolean) {
    updateMapping(position, {
      mapped: true,
      source: isClientVariant ? 'client_product' : 'catalog',
      source_id: product.id,
      source_label: product.reference || product.name,
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
    updateMapping(position, {
      mapped: true,
      source: 'quote_line',
      source_id: ql.line_id,
      source_label: `${ql.quote_number} L${ql.position + 1}`,
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
    const lines: MappedLine[] = importLines.map((il) => {
      const m = mappings[il.position]
      if (!m || !m.mapped) {
        // Unmapped line - use AI values as free
        return {
          source: 'free' as const,
          source_id: null,
          source_label: null,
          description: il.extracted_designation || il.extracted_description || '',
          quantity: il.extracted_quantity ?? 1,
          unit: il.extracted_unit || 'u',
          unit_price: il.extracted_unit_price ?? 0,
          vat_rate: il.extracted_vat_rate ?? 20,
          discount_percent: 0,
          product_id: null,
        }
      }
      return {
        source: m.source,
        source_id: m.source_id,
        source_label: m.source_label,
        description: m.description,
        quantity: m.quantity,
        unit: m.unit,
        unit_price: m.unit_price,
        vat_rate: m.vat_rate,
        discount_percent: m.discount_percent,
        product_id: m.product_id,
      }
    })
    onLinesReady(lines)
  }

  const allMapped = importLines.every((il) => mappings[il.position]?.mapped)

  return (
    <div className="space-y-3">
      {importLines.map((line) => (
        <LineMapperRow
          key={line.position}
          line={line}
          mapping={mappings[line.position]}
          clientId={clientId}
          onApplyFree={() => applyFreeForLine(line)}
          onApplyCatalog={(p, isClient) => applyCatalogProduct(line.position, p, line, isClient)}
          onApplyQuoteLine={(ql) => applyQuoteLine(line.position, ql)}
          onUpdateField={(field, value) => updateMapping(line.position, { [field]: value })}
        />
      ))}

      {/* Bottom actions */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
        <button onClick={applyFreeAll} className={BTN_SM}>
          <PenLine className="w-3.5 h-3.5" />
          Tout en saisie libre
        </button>
        <div className="flex-1" />
        <button
          onClick={handleApply}
          disabled={!allMapped}
          className={BTN}
          title={allMapped ? '' : 'Toutes les lignes doivent etre mappees'}
        >
          <Check className="w-4 h-4" />
          Appliquer ({importLines.filter((il) => mappings[il.position]?.mapped).length}/{importLines.length})
        </button>
      </div>
    </div>
  )
}

// -- Row component ------------------------------------------------------------

function LineMapperRow({
  line,
  mapping,
  clientId,
  onApplyFree,
  onApplyCatalog,
  onApplyQuoteLine,
  onUpdateField,
}: {
  line: ImportLine
  mapping: LineMappingState | undefined
  clientId: string | null
  onApplyFree: () => void
  onApplyCatalog: (product: CatalogProduct, isClientVariant: boolean) => void
  onApplyQuoteLine: (ql: QuoteLineResult) => void
  onUpdateField: (field: string, value: string | number) => void
}) {
  const conf = confidenceBadge(line.match_confidence)
  const totalHt = (line.extracted_quantity ?? 0) * (line.extracted_unit_price ?? 0)
  const isMapped = mapping?.mapped ?? false
  const sourceBadge = isMapped ? SOURCE_BADGES[mapping!.source] : null

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* AI row - read only */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 p-3">
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
      <div className="bg-white dark:bg-gray-800 p-3">
        {!isMapped ? (
          <LineSearchDropdown
            line={line}
            clientId={clientId}
            onSelectCatalog={onApplyCatalog}
            onSelectQuoteLine={onApplyQuoteLine}
            onSelectFree={onApplyFree}
          />
        ) : (
          <div className="space-y-2">
            {/* Source badge + reset */}
            <div className="flex items-center gap-2">
              {sourceBadge && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceBadge.cls}`}>
                  {mapping!.source === 'quote_line' && mapping!.source_label
                    ? `Devis ${mapping!.source_label}`
                    : sourceBadge.label}
                </span>
              )}
              {mapping!.source_label && mapping!.source !== 'quote_line' && mapping!.source !== 'free' && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{mapping!.source_label}</span>
              )}
              <div className="flex-1" />
              <button
                onClick={onApplyFree}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                title="Repasser en saisie libre"
              >
                Modifier source
              </button>
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12 md:col-span-5">
                <input
                  className={LINE_INPUT}
                  value={mapping!.description}
                  onChange={(e) => onUpdateField('description', e.target.value)}
                  placeholder="Description"
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <input
                  className={LINE_INPUT + ' text-right'}
                  type="number"
                  step="any"
                  value={mapping!.quantity}
                  onChange={(e) => onUpdateField('quantity', parseFloat(e.target.value) || 0)}
                  placeholder="Qte"
                />
              </div>
              <div className="col-span-3 md:col-span-1">
                <input
                  className={LINE_INPUT}
                  value={mapping!.unit}
                  onChange={(e) => onUpdateField('unit', e.target.value)}
                  placeholder="Unite"
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <input
                  className={LINE_INPUT + ' text-right'}
                  type="number"
                  step="any"
                  value={mapping!.unit_price}
                  onChange={(e) => onUpdateField('unit_price', parseFloat(e.target.value) || 0)}
                  placeholder="PU HT"
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <input
                  className={LINE_INPUT + ' text-right'}
                  type="number"
                  step="any"
                  value={mapping!.vat_rate}
                  onChange={(e) => onUpdateField('vat_rate', parseFloat(e.target.value) || 0)}
                  placeholder="TVA%"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// -- Search dropdown ----------------------------------------------------------

function LineSearchDropdown({
  line,
  clientId,
  onSelectCatalog,
  onSelectQuoteLine,
  onSelectFree,
}: {
  line: ImportLine
  clientId: string | null
  onSelectCatalog: (product: CatalogProduct, isClientVariant: boolean) => void
  onSelectQuoteLine: (ql: QuoteLineResult) => void
  onSelectFree: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([])
  const [clientResults, setClientResults] = useState<CatalogProduct[]>([])
  const [quoteResults, setQuoteResults] = useState<QuoteLineResult[]>([])
  const [loading, setLoading] = useState(false)
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

  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setCatalogResults([])
        setClientResults([])
        setQuoteResults([])
        return
      }
      setLoading(true)
      try {
        const promises: Promise<void>[] = []

        // Catalog products (general)
        promises.push(
          orgGet<{ items: CatalogProduct[] }>('/catalog/products', {
            search: q,
            page_size: 10,
          }).then((r) => setCatalogResults(r.items ?? []))
            .catch(() => setCatalogResults([]))
        )

        // Client variants
        if (clientId) {
          promises.push(
            orgGet<{ items: CatalogProduct[] }>('/catalog/products', {
              search: q,
              client_id: clientId,
              page_size: 10,
            }).then((r) => setClientResults(r.items ?? []))
              .catch(() => setClientResults([]))
          )

          // Quote lines
          promises.push(
            orgGet<{ items: QuoteLineResult[] }>('/quotes/lines', {
              search: q,
              client_id: clientId,
              status: 'accepted,sent',
              page_size: 10,
            }).then((r) => setQuoteResults(r.items ?? []))
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

  // Build sections
  const sections: SearchResultSection[] = []

  if (catalogResults.length > 0) {
    sections.push({
      label: 'Catalogue',
      icon: <Package className="w-3 h-3 text-kerpta" />,
      items: catalogResults.map((p) => ({
        type: 'catalog' as const,
        id: p.id,
        label: p.name,
        sublabel: p.reference ? `${p.reference} - ${p.unit_price != null ? fmtCurrency(p.unit_price) : '-'}` : (p.unit_price != null ? fmtCurrency(p.unit_price) : undefined),
        data: p,
      })),
    })
  }

  if (clientResults.length > 0) {
    sections.push({
      label: 'Articles client',
      icon: <UserRound className="w-3 h-3 text-violet-500" />,
      items: clientResults.map((p) => ({
        type: 'client_product' as const,
        id: `client_${p.id}`,
        label: p.name,
        sublabel: p.reference ? `${p.reference} - ${p.unit_price != null ? fmtCurrency(p.unit_price) : '-'}` : (p.unit_price != null ? fmtCurrency(p.unit_price) : undefined),
        data: p,
      })),
    })
  }

  if (quoteResults.length > 0) {
    sections.push({
      label: 'Devis',
      icon: <FileText className="w-3 h-3 text-blue-500" />,
      items: quoteResults.map((ql) => ({
        type: 'quote_line' as const,
        id: ql.line_id,
        label: ql.description || '-',
        sublabel: `${ql.quote_number} L${ql.position + 1} - ${fmtCurrency(ql.unit_price)}`,
        data: ql,
      })),
    })
  }

  // Always show free option
  sections.push({
    label: 'Saisie libre',
    icon: <PenLine className="w-3 h-3 text-gray-400" />,
    items: [{
      type: 'free' as const,
      id: 'free',
      label: 'Utiliser les valeurs IA',
      data: null,
    }],
  })

  const hasResults = query.trim().length >= 2

  function handleSelect(item: SearchResultItem) {
    if (item.type === 'free') {
      onSelectFree()
    } else if (item.type === 'catalog') {
      onSelectCatalog(item.data as CatalogProduct, false)
    } else if (item.type === 'client_product') {
      onSelectCatalog(item.data as CatalogProduct, true)
    } else if (item.type === 'quote_line') {
      onSelectQuoteLine(item.data as QuoteLineResult)
    }
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          className={INPUT + ' pl-8 !h-[34px] !text-xs'}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
          placeholder="Rechercher un article, un devis..."
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-kerpta rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && hasResults && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {sections.map((section, si) => (
            <div key={si}>
              {si > 0 && <div className="border-t border-gray-100 dark:border-gray-700" />}
              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                {section.icon}
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {section.label}
                </span>
              </div>
              {section.items.map((item) => (
                <div
                  key={item.id}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-kerpta-50 dark:hover:bg-kerpta-900/20 transition"
                >
                  <div className="text-gray-800 dark:text-gray-200 truncate">{item.label}</div>
                  {item.sublabel && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{item.sublabel}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!loading && catalogResults.length === 0 && clientResults.length === 0 && quoteResults.length === 0 && (
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

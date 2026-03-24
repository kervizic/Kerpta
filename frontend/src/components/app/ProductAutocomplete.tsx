// Kerpta — Autocomplete articles catalogue
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, useRef, useCallback } from 'react'
import { orgGet } from '@/lib/orgApi'
import { fmtPrice } from '@/lib/formatting'

export interface AutocompleteProduct {
  id: string
  reference: string | null
  name: string
  description: string | null
  unit: string | null
  unit_price: number | null
  vat_rate: number
}

interface ProductAutocompleteProps {
  value: string
  onChange: (text: string) => void
  onSelect: (product: AutocompleteProduct) => void
  clientId?: string | null
  className?: string
  placeholder?: string
  disabled?: boolean
}

export default function ProductAutocomplete({
  value,
  onChange,
  onSelect,
  clientId,
  className = '',
  placeholder = 'Désignation',
  disabled,
}: ProductAutocompleteProps) {
  const [results, setResults] = useState<AutocompleteProduct[]>([])
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fermer au clic extérieur
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const search = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setResults([])
        setOpen(false)
        return
      }
      setLoading(true)
      try {
        const params: Record<string, unknown> = { search: query.trim(), page_size: 8 }
        if (clientId) params.client_id = clientId
        const data = await orgGet<{ items: AutocompleteProduct[] }>('/catalog/products', params)
        setResults(data.items)
        setOpen(data.items.length > 0)
        setHighlightIndex(-1)
      } catch {
        setResults([])
        setOpen(false)
      }
      setLoading(false)
    },
    [clientId],
  )

  function handleChange(text: string) {
    onChange(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void search(text), 300)
  }

  function handleSelect(product: AutocompleteProduct) {
    setOpen(false)
    setResults([])
    onSelect(product)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      handleSelect(results[highlightIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value.split('\n')[0]}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        disabled={disabled}
        title={value.includes('\n') ? value : undefined}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((p, i) => (
            <li
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p) }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-3 py-2 cursor-pointer transition ${
                i === highlightIndex ? 'bg-kerpta-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="text-xs font-medium text-gray-900 truncate">{p.name}</div>
              <div className="text-[10px] text-gray-400 flex gap-2">
                {p.reference && <span className="font-mono">{p.reference}</span>}
                {p.unit_price != null && <span>{fmtPrice(p.unit_price)}</span>}
                {p.unit && <span>/ {p.unit}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-3 h-3 border-2 border-kerpta-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

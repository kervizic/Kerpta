// Kerpta — Composant filtre inline par colonne
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Filter } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FilterOptionBase {
  /** Nom interne de la colonne (ex: "number", "status") */
  column: string
  /** Libellé affiché dans le header */
  label: string
}

interface TextFilter extends FilterOptionBase {
  type: 'text'
  placeholder?: string
}

interface SelectFilter extends FilterOptionBase {
  type: 'select'
  options: { value: string; label: string }[]
}

interface MultiSelectFilter extends FilterOptionBase {
  type: 'multi-select'
  options: { value: string; label: string }[]
}

interface DateRangeFilter extends FilterOptionBase {
  type: 'date-range'
}

export type FilterOption = TextFilter | SelectFilter | MultiSelectFilter | DateRangeFilter

export type FilterValues = Record<string, string | string[]>

// ── Composant FilterPopover ────────────────────────────────────────────────────

function FilterPopover({
  filter,
  value,
  onChange,
  onClose,
  anchorRect,
}: {
  filter: FilterOption
  value: string | string[]
  onChange: (val: string | string[]) => void
  onClose: () => void
  anchorRect: DOMRect
}) {
  const ref = useRef<HTMLDivElement>(null)
  // État local pour le champ texte — évite de re-render le parent à chaque frappe
  const [localText, setLocalText] = useState((value as string) || '')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Debounce : propage la valeur au parent après 400ms d'inactivité
  useEffect(() => {
    if (filter.type !== 'text') return
    const timer = setTimeout(() => { onChangeRef.current(localText) }, 400)
    return () => clearTimeout(timer)
  }, [localText, filter.type])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Calculer la position : en dessous du bouton, aligné à gauche
  // Si le popover dépasse à droite de l'écran, l'aligner à droite
  const top = anchorRect.bottom + 4
  let left = anchorRect.left

  // Vérifier que le popover ne dépasse pas à droite (estimation 200px de largeur)
  if (left + 200 > window.innerWidth) {
    left = window.innerWidth - 210
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-400'

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-black/50 p-3 min-w-[180px]"
      onClick={(e) => e.stopPropagation()}
    >
      {filter.type === 'text' && (
        <input
          type="text"
          autoFocus
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onChangeRef.current(localText); onClose() } }}
          placeholder={filter.placeholder || `Filtrer par ${filter.label.toLowerCase()}...`}
          className={inputCls}
        />
      )}

      {filter.type === 'select' && (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onChange('')}
            className={`text-left px-2.5 py-1.5 text-xs rounded-lg transition ${
              !value ? 'bg-kerpta-50 dark:bg-kerpta-900/30 text-kerpta-700 dark:text-kerpta-400 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Tous
          </button>
          {filter.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`text-left px-2.5 py-1.5 text-xs rounded-lg transition ${
                value === opt.value ? 'bg-kerpta-50 dark:bg-kerpta-900/30 text-kerpta-700 dark:text-kerpta-400 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {filter.type === 'multi-select' && (
        <div className="flex flex-col gap-1">
          {filter.options.map((opt) => {
            const selected = Array.isArray(value) && value.includes(opt.value)
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer transition ${
                  selected ? 'bg-kerpta-50 dark:bg-kerpta-900/30 text-kerpta-700 dark:text-kerpta-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const arr = Array.isArray(value) ? [...value] : []
                    if (selected) {
                      onChange(arr.filter((v) => v !== opt.value))
                    } else {
                      onChange([...arr, opt.value])
                    }
                  }}
                  className="rounded border-gray-300 text-kerpta focus:ring-kerpta-400 w-3.5 h-3.5"
                />
                {opt.label}
              </label>
            )
          })}
        </div>
      )}

      {filter.type === 'date-range' && (
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold mb-0.5 block">Du</label>
            <input
              type="date"
              value={Array.isArray(value) ? value[0] || '' : ''}
              onChange={(e) => {
                const arr = Array.isArray(value) ? [...value] : ['', '']
                arr[0] = e.target.value
                onChange(arr)
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold mb-0.5 block">Au</label>
            <input
              type="date"
              value={Array.isArray(value) ? value[1] || '' : ''}
              onChange={(e) => {
                const arr = Array.isArray(value) ? [...value] : ['', '']
                arr[1] = e.target.value
                onChange(arr)
              }}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* Bouton effacer */}
      {((filter.type === 'text' && localText) || (typeof value === 'string' && value && filter.type !== 'text') || (Array.isArray(value) && value.some(Boolean))) && (
        <button
          onClick={() => {
            if (filter.type === 'text') setLocalText('')
            onChange(filter.type === 'multi-select' || filter.type === 'date-range' ? [] : '')
          }}
          className="mt-2 w-full text-center text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 transition py-1"
        >
          Effacer le filtre
        </button>
      )}
    </div>,
    document.body,
  )
}

// ── Composant ColumnFilterHeader ───────────────────────────────────────────────

export default function ColumnFilterHeader({
  filter,
  value,
  onChange,
  align,
}: {
  filter: FilterOption
  value: string | string[]
  onChange: (val: string | string[]) => void
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect())
    }
    setOpen(true)
  }, [open])

  const isActive =
    (typeof value === 'string' && value !== '') ||
    (Array.isArray(value) && value.some(Boolean))

  return (
    <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''}`}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase transition ${
          isActive ? 'text-kerpta-600 dark:text-kerpta-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
        }`}
      >
        {filter.label}
        <Filter className={`w-3 h-3 ${isActive ? 'fill-kerpta-200' : ''}`} />
      </button>
      {open && anchorRect && (
        <FilterPopover
          filter={filter}
          value={value}
          onChange={(val) => { onChange(val); if (filter.type === 'select') setOpen(false) }}
          onClose={() => setOpen(false)}
          anchorRect={anchorRect}
        />
      )}
    </th>
  )
}

// Kerpta — Panneau de filtres mobile (slide-in depuis la droite)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect } from 'react'
import { X, Filter } from 'lucide-react'
import { type FilterOption, type FilterValues } from '@/components/app/ColumnFilter'
import { INPUT, SELECT, BTN } from '@/lib/formStyles'

/**
 * Panneau de filtres glissant depuis la droite sur mobile.
 * Affiche tous les filtres d'une liste dans un formulaire empilé.
 */
export default function MobileFilterPanel({
  filters,
  values,
  onChange,
  onClose,
}: {
  filters: FilterOption[]
  values: FilterValues
  onChange: (column: string, value: string | string[]) => void
  onClose: () => void
}) {
  // Local state pour éditer sans appliquer à chaque frappe
  const [local, setLocal] = useState<FilterValues>({ ...values })
  const [visible, setVisible] = useState(false)

  // Animation d'entrée
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  function apply() {
    for (const f of filters) {
      const v = local[f.column]
      if (v !== undefined) {
        onChange(f.column, v)
      }
    }
    handleClose()
  }

  function clear() {
    const empty: FilterValues = {}
    for (const f of filters) {
      const v = f.type === 'multi-select' || f.type === 'date-range' ? [] : ''
      empty[f.column] = v
      onChange(f.column, v)
    }
    setLocal(empty)
    handleClose()
  }

  const activeCount = Object.values(local).filter((v) =>
    (typeof v === 'string' && v) || (Array.isArray(v) && v.some(Boolean))
  ).length

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Panneau */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-[85vw] max-w-sm bg-white dark:bg-gray-800 shadow-2xl dark:shadow-black/50 flex flex-col transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-kerpta" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Filtres</h2>
            {activeCount > 0 && (
              <span className="text-[10px] bg-kerpta-100 dark:bg-kerpta-900/40 text-kerpta-700 dark:text-kerpta-400 px-2 py-0.5 rounded-full font-medium">
                {activeCount}
              </span>
            )}
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Filtres */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {filters.map((f) => (
            <div key={f.column}>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block uppercase tracking-wide">
                {f.label}
              </label>

              {f.type === 'text' && (
                <input
                  type="text"
                  value={(local[f.column] as string) || ''}
                  onChange={(e) => setLocal((prev) => ({ ...prev, [f.column]: e.target.value }))}
                  placeholder={f.placeholder || `Filtrer par ${f.label.toLowerCase()}...`}
                  className={INPUT}
                />
              )}

              {f.type === 'select' && (
                <select
                  value={(local[f.column] as string) || ''}
                  onChange={(e) => setLocal((prev) => ({ ...prev, [f.column]: e.target.value }))}
                  className={SELECT}
                >
                  <option value="">— Tous —</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}

              {f.type === 'multi-select' && (
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map((o) => {
                    const selected = ((local[f.column] as string[]) || []).includes(o.value)
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          const current = (local[f.column] as string[]) || []
                          const next = selected
                            ? current.filter((v) => v !== o.value)
                            : [...current, o.value]
                          setLocal((prev) => ({ ...prev, [f.column]: next }))
                        }}
                        className={`px-3 py-1.5 text-xs rounded-full border transition ${
                          selected
                            ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-300 dark:border-kerpta-600 text-kerpta-700 dark:text-kerpta-400 font-medium'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {f.type === 'date-range' && (() => {
                const dates = (local[f.column] as string[]) || ['', '']
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Du</span>
                      <input
                        type="date"
                        value={dates[0] || ''}
                        onChange={(e) => setLocal((prev) => ({ ...prev, [f.column]: [e.target.value, dates[1] || ''] }))}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">Au</span>
                      <input
                        type="date"
                        value={dates[1] || ''}
                        onChange={(e) => setLocal((prev) => ({ ...prev, [f.column]: [dates[0] || '', e.target.value] }))}
                        className={INPUT}
                      />
                    </div>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4 space-y-2">
          <button
            onClick={apply}
            className={`${BTN} w-full py-2.5`}
          >
            Appliquer les filtres
          </button>
          {activeCount > 0 && (
            <button
              onClick={clear}
              className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
            >
              Effacer tous les filtres
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

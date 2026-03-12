// Kerpta — Combobox unités (dropdown + saisie libre)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, useRef } from 'react'
import { orgGet } from '@/lib/orgApi'

interface UnitOption {
  id: string
  label: string
}

interface UnitComboboxProps {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}

export default function UnitCombobox({ value, onChange, className = '', placeholder = 'Unité' }: UnitComboboxProps) {
  const [units, setUnits] = useState<UnitOption[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    orgGet<UnitOption[]>('/billing/units')
      .then(setUnits)
      .catch(() => {})
  }, [])

  // Fermer au clic extérieur
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filtered = units.filter((u) =>
    u.label.toLowerCase().includes((search || value).toLowerCase())
  )

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setSearch(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((u) => (
            <li
              key={u.id}
              onClick={() => {
                onChange(u.label)
                setOpen(false)
              }}
              className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-orange-50 transition ${
                u.label === value ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-700'
              }`}
            >
              {u.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Kerpta — Sélecteur de date avec calendrier visuel
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { fr } from 'date-fns/locale/fr'
import { format, parse, isValid } from 'date-fns'
import { Calendar, X } from 'lucide-react'

import 'react-day-picker/style.css'

interface DatePickerProps {
  value: string // format YYYY-MM-DD
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  clearable?: boolean
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Sélectionner une date',
  className = '',
  disabled = false,
  clearable = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fermer au clic extérieur
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Parser la valeur YYYY-MM-DD en Date
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const validSelected = selected && isValid(selected) ? selected : undefined

  // Affichage formaté
  const displayValue = validSelected ? format(validSelected, 'dd MMM yyyy', { locale: fr }) : ''

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
    }
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        className={`flex items-center gap-2 text-left ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className={displayValue ? 'text-gray-900' : 'text-gray-400'}>
          {displayValue || placeholder}
        </span>
        {clearable && value && !disabled && (
          <X
            className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 ml-auto shrink-0"
            onClick={handleClear}
          />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg p-3 datepicker-kerpta">
          <DayPicker
            mode="single"
            selected={validSelected}
            onSelect={handleSelect}
            locale={fr}
            defaultMonth={validSelected || new Date()}
            showOutsideDays
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  )
}

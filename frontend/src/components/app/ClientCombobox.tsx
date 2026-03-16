// Kerpta — Combobox client avec recherche
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, useRef } from 'react'
import { Search, Plus } from 'lucide-react'
import { orgGet } from '@/lib/orgApi'

export interface ClientItem {
  id: string
  name: string
  billing_profile_id?: string | null
}

interface ClientComboboxProps {
  value: string
  onChange: (clientId: string) => void
  /** Callback avec l'objet client complet (pour récupérer billing_profile_id, etc.) */
  onSelect?: (client: ClientItem | null) => void
  onNewClient?: () => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export default function ClientCombobox({ value, onChange, onSelect, onNewClient, className = '', placeholder = 'Rechercher un client...', disabled }: ClientComboboxProps) {
  const [clients, setClients] = useState<ClientItem[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Charger les clients
  useEffect(() => {
    orgGet<{ items: ClientItem[] }>('/clients', { page_size: 100 })
      .then((d) => setClients(d.items))
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

  // Nom affiché du client sélectionné
  const selectedClient = clients.find((c) => c.id === value)
  const displayValue = open ? search : (selectedClient?.name || '')

  // Filtrer par recherche (chaque mot doit matcher)
  const filtered = search.trim()
    ? clients.filter((c) => {
        const words = search.toLowerCase().split(/\s+/)
        const name = c.name.toLowerCase()
        return words.every((w) => name.includes(w))
      })
    : clients

  function handleSelect(client: ClientItem) {
    onChange(client.id)
    onSelect?.(client)
    setSearch('')
    setOpen(false)
  }

  const totalItems = filtered.length + (onNewClient ? 1 : 0)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1))
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      if (highlightIndex < filtered.length) {
        handleSelect(filtered[highlightIndex])
      } else if (onNewClient) {
        setOpen(false)
        onNewClient()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }

  // Exposer la liste des clients pour le parent
  useEffect(() => {
    if (clients.length > 0 && value) {
      const client = clients.find((c) => c.id === value)
      if (client) {
        // Dispatch custom event pour notifier le parent du client sélectionné
        const event = new CustomEvent('client-loaded', { detail: client })
        ref.current?.dispatchEvent(event)
      }
    }
  }, [clients, value])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
            setHighlightIndex(-1)
            // Si on efface tout, désélectionner
            if (!e.target.value && value) {
              onChange('')
              onSelect?.(null)
            }
          }}
          onFocus={() => {
            setSearch(selectedClient?.name || '')
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${className} pl-8`}
          autoComplete="off"
          disabled={disabled}
        />
      </div>
      {open && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400 text-center">Aucun client trouvé</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(c) }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`px-3 py-2 text-sm cursor-pointer transition ${
                  i === highlightIndex ? 'bg-kerpta-50' : c.id === value ? 'bg-kerpta-50/50 text-kerpta-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {c.name}
              </li>
            ))
          )}
          {onNewClient && (
            <>
              <li className="border-t border-gray-100" />
              <li
                onMouseDown={(e) => { e.preventDefault(); setOpen(false); onNewClient() }}
                onMouseEnter={() => setHighlightIndex(filtered.length)}
                className={`px-3 py-2 text-sm cursor-pointer transition flex items-center gap-1.5 ${
                  highlightIndex === filtered.length ? 'bg-kerpta-50 text-kerpta-700' : 'text-kerpta-600 hover:bg-kerpta-50'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Nouveau client
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  )
}

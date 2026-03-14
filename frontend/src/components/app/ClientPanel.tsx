// Kerpta — Panneau client réutilisable (édition inline, auto-save)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Loader2, UserRound, Building2, Star,
  Plus, Trash2, ChevronDown, ChevronUp, Check, AlertTriangle,
} from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import { apiClient } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface ClientDetail {
  id: string
  type: string
  name: string
  siret: string | null
  email: string | null
  phone: string | null
  billing_profile_id: string | null
  billing_profile_name: string | null
  country_code: string
  company_siren: string | null
  vat_number: string | null
  billing_address: Record<string, string | null> | null
  shipping_address: Record<string, string | null> | null
  notes: string | null
  quote_count: number
  invoice_count: number
  contract_count: number
  total_invoiced: number
  total_paid: number
  balance: number
  created_at: string | null
  archived_at: string | null
}

interface ContactOut {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  is_primary: boolean
}

interface BillingProfileShort {
  id: string
  name: string
  payment_terms: number
  payment_term_type: string
  is_default: boolean
}

interface EtablissementOut {
  siret: string
  nic: string
  siege: boolean
  etat: string
  activite_principale: string | null
  adresse: { voie?: string | null; code_postal?: string | null; commune?: string | null } | null
}

interface CompanyDetailsOut {
  etablissements_actifs?: EtablissementOut[]
}

const INPUT = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white transition'
const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5'

function formatSiret(s: string): string {
  if (s.length === 14) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
  return s
}

function formatEtabAddress(a: EtablissementOut['adresse']): string {
  if (!a) return '—'
  return [a.voie, [a.code_postal, a.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'
}

// ── Composant principal ──────────────────────────────────────────────────────

interface ClientPanelProps {
  clientId: string
  /** Mode compact (pas de stats, pas de notes) — pour les formulaires devis/factures */
  compact?: boolean
  onClose?: () => void
}

export default function ClientPanel({ clientId, compact = false, onClose }: ClientPanelProps) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [contacts, setContacts] = useState<ContactOut[]>([])
  const [profiles, setProfiles] = useState<BillingProfileShort[]>([])
  const [etabs, setEtabs] = useState<EtablissementOut[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showContacts, setShowContacts] = useState(false)
  const [showAddress, setShowAddress] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Chargement ────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [c, ct, p] = await Promise.all([
        orgGet<ClientDetail>(`/clients/${clientId}`),
        orgGet<ContactOut[]>(`/clients/${clientId}/contacts`).catch(() => [] as ContactOut[]),
        orgGet<BillingProfileShort[]>('/billing/profiles').catch(() => [] as BillingProfileShort[]),
      ])
      setClient(c)
      setContacts(ct)
      setProfiles(p)

      // Charger les établissements si SIREN
      if (c.company_siren) {
        try {
          const { data } = await apiClient.get<CompanyDetailsOut>(`/companies/${c.company_siren}`)
          setEtabs(data.etablissements_actifs ?? [])
        } catch { /* pas critique */ }
      }
    } catch { /* */ }
    setLoading(false)
  }, [clientId])

  useEffect(() => { void loadAll() }, [loadAll])

  // ── Auto-save ─────────────────────────────────────────────────────────

  async function saveField(patch: Record<string, unknown>) {
    if (!client) return
    setSaveStatus('saving')
    try {
      const updated = await orgPatch<ClientDetail>(`/clients/${client.id}`, patch)
      setClient(updated)
      setSaveStatus('saved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────

  async function addContact() {
    if (!client) return
    try {
      await orgPost(`/clients/${client.id}/contacts`, { first_name: '', last_name: '', is_primary: contacts.length === 0 })
      const ct = await orgGet<ContactOut[]>(`/clients/${client.id}/contacts`)
      setContacts(ct)
    } catch { /* */ }
  }

  async function saveContact(contactId: string, patch: Record<string, unknown>) {
    if (!client) return
    try {
      await orgPatch(`/clients/${client.id}/contacts/${contactId}`, patch)
    } catch { /* */ }
  }

  async function deleteContact(contactId: string) {
    if (!client) return
    try {
      await orgDelete(`/clients/${client.id}/contacts/${contactId}`)
      setContacts((prev) => prev.filter((c) => c.id !== contactId))
    } catch { /* */ }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-400 text-center">
        Client introuvable
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center">
            {client.type === 'company' ? <Building2 className="w-4 h-4 text-orange-600" /> : <UserRound className="w-4 h-4 text-orange-600" />}
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-900">{client.name}</span>
            <span className="text-[11px] text-gray-400 ml-2">{client.type === 'company' ? 'Entreprise' : 'Particulier'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator status={saveStatus} />
          {onClose && (
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 transition">✕</button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* ── Infos principales ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <AutoSaveField label={client.type === 'company' ? 'Raison sociale' : 'Nom'} value={client.name} onSave={(v) => saveField({ name: v })} required />
          <AutoSaveField label="Email" value={client.email || ''} onSave={(v) => saveField({ email: v || null })} type="email" />
          <AutoSaveField label="Téléphone" value={client.phone || ''} onSave={(v) => saveField({ phone: v || null })} type="tel" />
          {client.type === 'company' && (
            <AutoSaveField label="TVA intracom." value={client.vat_number || ''} onSave={(v) => saveField({ vat_number: v || null })} />
          )}
        </div>

        {/* ── Profil de facturation ──────────────────────────────────── */}
        <div>
          <label className={LABEL}>Profil de facturation</label>
          <select
            value={client.billing_profile_id ?? ''}
            onChange={(e) => saveField({ billing_profile_id: e.target.value || null })}
            className={`${INPUT} bg-white`}
          >
            <option value="">Aucun profil</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.payment_terms}j {p.payment_term_type === 'net' ? 'net' : 'fin de mois'}
                {p.is_default ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* ── Établissement à facturer ──────────────────────────────── */}
        {client.type === 'company' && etabs.length > 0 && (
          <div>
            <label className={LABEL}>Établissement à facturer</label>
            <select
              value={client.siret || ''}
              onChange={(e) => saveField({ siret: e.target.value || null })}
              className={`${INPUT} bg-white`}
            >
              <option value="">— Sélectionner —</option>
              {etabs.map((e) => (
                <option key={e.siret} value={e.siret}>
                  {formatSiret(e.siret)} {e.siege ? '(Siège)' : ''} — {formatEtabAddress(e.adresse)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── Adresse de facturation ─────────────────────────────────── */}
        <div>
          <button
            onClick={() => setShowAddress(!showAddress)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
          >
            Adresse de facturation
            {showAddress ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showAddress && (
            <div className="mt-2 space-y-2">
              <AutoSaveField label="" value={client.billing_address?.voie || ''} placeholder="Adresse" onSave={(v) => saveField({ billing_address: { ...client.billing_address, voie: v || null } })} />
              <AutoSaveField label="" value={client.billing_address?.complement || ''} placeholder="Complément" onSave={(v) => saveField({ billing_address: { ...client.billing_address, complement: v || null } })} />
              <div className="grid grid-cols-2 gap-2">
                <AutoSaveField label="" value={client.billing_address?.code_postal || ''} placeholder="Code postal" onSave={(v) => saveField({ billing_address: { ...client.billing_address, code_postal: v || null } })} />
                <AutoSaveField label="" value={client.billing_address?.commune || ''} placeholder="Ville" onSave={(v) => saveField({ billing_address: { ...client.billing_address, commune: v || null } })} />
              </div>
            </div>
          )}
        </div>

        {/* ── Contacts ──────────────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setShowContacts(!showContacts)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
          >
            Contacts ({contacts.length})
            {showContacts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showContacts && (
            <div className="mt-2 space-y-3">
              {contacts.map((ct) => (
                <ContactRow
                  key={ct.id}
                  contact={ct}
                  onSave={(patch) => saveContact(ct.id, patch)}
                  onDelete={() => deleteContact(ct.id)}
                />
              ))}
              <button
                onClick={addContact}
                className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 transition"
              >
                <Plus className="w-3 h-3" /> Ajouter un contact
              </button>
            </div>
          )}
        </div>

        {/* ── Notes ──────────────────────────────────────────────────── */}
        {!compact && (
          <div>
            <label className={LABEL}>Notes internes</label>
            <AutoSaveTextarea value={client.notes || ''} onSave={(v) => saveField({ notes: v || null })} placeholder="Notes..." />
          </div>
        )}

        {/* ── Statistiques ──────────────────────────────────────────── */}
        {!compact && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
            <StatBadge label="Devis" value={String(client.quote_count)} />
            <StatBadge label="Facturé" value={Number(client.total_invoiced).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
            <StatBadge label="Solde" value={Number(client.balance).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} color={Number(client.balance) > 0 ? 'red' : 'green'} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  if (status === 'saving') return <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
  if (status === 'saved') return <Check className="w-3.5 h-3.5 text-green-500" />
  return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
}

function AutoSaveField({ label, value, onSave, type = 'text', placeholder, required }: {
  label: string
  value: string
  onSave: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  const [val, setVal] = useState(value)
  const initialRef = useRef(value)

  useEffect(() => { setVal(value); initialRef.current = value }, [value])

  function handleBlur() {
    if (val !== initialRef.current) {
      onSave(val)
      initialRef.current = val
    }
  }

  return (
    <div>
      {label && <label className={LABEL}>{label}</label>}
      <input
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
        placeholder={placeholder}
        required={required}
        className={INPUT}
      />
    </div>
  )
}

function AutoSaveTextarea({ value, onSave, placeholder }: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
}) {
  const [val, setVal] = useState(value)
  const initialRef = useRef(value)

  useEffect(() => { setVal(value); initialRef.current = value }, [value])

  function handleBlur() {
    if (val !== initialRef.current) {
      onSave(val)
      initialRef.current = val
    }
  }

  return (
    <textarea
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      rows={2}
      placeholder={placeholder}
      className={INPUT}
    />
  )
}

function ContactRow({ contact, onSave, onDelete }: {
  contact: ContactOut
  onSave: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  return (
    <div className="p-3 bg-gray-50 rounded-xl space-y-2 relative group">
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 p-1 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3 text-red-400" />
      </button>
      <div className="grid grid-cols-2 gap-2">
        <AutoSaveField label="" value={contact.last_name || ''} placeholder="Nom" onSave={(v) => onSave({ last_name: v || null })} />
        <AutoSaveField label="" value={contact.first_name || ''} placeholder="Prénom" onSave={(v) => onSave({ first_name: v || null })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <AutoSaveField label="" value={contact.email || ''} placeholder="Email" onSave={(v) => onSave({ email: v || null })} type="email" />
        <AutoSaveField label="" value={contact.phone || ''} placeholder="Tél" onSave={(v) => onSave({ phone: v || null })} type="tel" />
      </div>
      <AutoSaveField label="" value={contact.job_title || ''} placeholder="Poste" onSave={(v) => onSave({ job_title: v || null })} />
      {contact.is_primary && (
        <span className="inline-flex items-center gap-1 text-[10px] text-orange-600 font-semibold">
          <Star className="w-3 h-3" /> Contact principal
        </span>
      )}
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: string; color?: 'red' | 'green' }) {
  return (
    <div className="text-center px-2 py-1.5">
      <p className="text-[10px] text-gray-400 uppercase font-semibold">{label}</p>
      <p className={`text-sm font-bold ${color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

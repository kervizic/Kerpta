// Kerpta — Modale fiche client (édition inline, auto-save)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Loader2, UserRound, Building2, Star, X,
  Plus, Trash2, Check, AlertTriangle,
} from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import { apiClient } from '@/lib/api'
import CompanyInfoCard from '@/components/app/CompanyInfoCard'

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

function formatAddress(a: Record<string, string | null> | null | undefined): string {
  if (!a) return '—'
  const parts = [a.voie, a.complement, [a.code_postal, a.commune].filter(Boolean).join(' '), a.pays].filter(Boolean)
  return parts.join(', ') || '—'
}

// ── Composant principal (modale) ─────────────────────────────────────────────

interface ClientPanelProps {
  clientId: string
  /** Mode compact (pas de stats, pas de notes) — pour les formulaires devis/factures */
  compact?: boolean
  onClose: () => void
}

export default function ClientPanel({ clientId, compact = false, onClose }: ClientPanelProps) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [contacts, setContacts] = useState<ContactOut[]>([])
  const [profiles, setProfiles] = useState<BillingProfileShort[]>([])
  const [etabs, setEtabs] = useState<EtablissementOut[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full mx-4 max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── En-tête ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
              ) : client?.type === 'company' ? (
                <Building2 className="w-5 h-5 text-orange-600" />
              ) : (
                <UserRound className="w-5 h-5 text-orange-600" />
              )}
            </div>
            {client && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{client.name}</h2>
                <p className="text-xs text-gray-400">
                  {client.type === 'company' ? 'Entreprise' : 'Particulier'}
                  {client.siret && <span className="ml-2 font-mono">{formatSiret(client.siret)}</span>}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator status={saveStatus} />
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          </div>
        ) : !client ? (
          <div className="py-16 text-center text-gray-400 text-sm">Client introuvable</div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {/* ── Statistiques ──────────────────────────────────────── */}
            {!compact && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Devis</p>
                  <p className="text-2xl font-bold text-gray-900">{client.quote_count}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Facturé</p>
                  <p className="text-2xl font-bold text-gray-900">{Number(client.total_invoiced).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Solde</p>
                  <p className={`text-2xl font-bold ${Number(client.balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {Number(client.balance).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ── Colonne gauche : Infos éditables ────────────────── */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Informations</h3>

                <div className="space-y-3">
                  <AutoSaveField label={client.type === 'company' ? 'Raison sociale' : 'Nom'} value={client.name} onSave={(v) => saveField({ name: v })} required />
                  <AutoSaveField label="Email" value={client.email || ''} onSave={(v) => saveField({ email: v || null })} type="email" />
                  <AutoSaveField label="Téléphone" value={client.phone || ''} onSave={(v) => saveField({ phone: v || null })} type="tel" />
                  {client.type === 'company' && (
                    <AutoSaveField label="TVA intracommunautaire" value={client.vat_number || ''} onSave={(v) => saveField({ vat_number: v || null })} />
                  )}
                </div>

                {/* Profil de facturation */}
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

                {/* Établissement à facturer */}
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

                {/* Adresse de facturation */}
                <div>
                  <label className={LABEL}>Adresse de facturation</label>
                  <div className="space-y-2">
                    <AutoSaveField label="" value={client.billing_address?.voie || ''} placeholder="Adresse" onSave={(v) => saveField({ billing_address: { ...client.billing_address, voie: v || null } })} />
                    <AutoSaveField label="" value={client.billing_address?.complement || ''} placeholder="Complément" onSave={(v) => saveField({ billing_address: { ...client.billing_address, complement: v || null } })} />
                    <div className="grid grid-cols-2 gap-2">
                      <AutoSaveField label="" value={client.billing_address?.code_postal || ''} placeholder="Code postal" onSave={(v) => saveField({ billing_address: { ...client.billing_address, code_postal: v || null } })} />
                      <AutoSaveField label="" value={client.billing_address?.commune || ''} placeholder="Ville" onSave={(v) => saveField({ billing_address: { ...client.billing_address, commune: v || null } })} />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {!compact && (
                  <div>
                    <label className={LABEL}>Notes internes</label>
                    <AutoSaveTextarea value={client.notes || ''} onSave={(v) => saveField({ notes: v || null })} placeholder="Notes..." />
                  </div>
                )}
              </div>

              {/* ── Colonne droite : Contacts ──────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Contacts</h3>
                  <button
                    onClick={addContact}
                    className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 transition"
                  >
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div className="text-sm text-gray-400">
                    <p>Aucun contact</p>
                    <p className="mt-2">
                      <span className="text-gray-400">Email :</span> {client.email || '—'}
                    </p>
                    <p>
                      <span className="text-gray-400">Tél :</span> {client.phone || '—'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contacts.map((ct) => (
                      <ContactRow
                        key={ct.id}
                        contact={ct}
                        onSave={(patch) => saveContact(ct.id, patch)}
                        onDelete={() => deleteContact(ct.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Infos supplémentaires */}
                {!compact && (
                  <div className="pt-3 border-t border-gray-100 space-y-2 text-sm">
                    <p><span className="text-gray-400">Adresse :</span> <span className="text-gray-700">{formatAddress(client.billing_address)}</span></p>
                    <p><span className="text-gray-400">Factures :</span> <span className="text-gray-700">{client.invoice_count}</span></p>
                    <p><span className="text-gray-400">Contrats :</span> <span className="text-gray-700">{client.contract_count}</span></p>
                    <p><span className="text-gray-400">Payé :</span> <span className="text-gray-700">{Number(client.total_paid).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span></p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Données entreprise (INSEE) ──────────────────────── */}
            {client.company_siren && (
              <div>
                <CompanyInfoCard siren={client.company_siren} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  if (status === 'saving') return <span className="flex items-center gap-1 text-xs text-orange-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sauvegarde...</span>
  if (status === 'saved') return <span className="flex items-center gap-1 text-xs text-green-500"><Check className="w-3.5 h-3.5" /> Sauvegardé</span>
  return <span className="flex items-center gap-1 text-xs text-red-400"><AlertTriangle className="w-3.5 h-3.5" /> Erreur</span>
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
      rows={3}
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

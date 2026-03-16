// Kerpta — Modale fiche client (édition inline, auto-save)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Loader2, UserRound, Building2, Star, X, Pencil,
  Plus, Trash2, Check, AlertTriangle,
} from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import ModalOverlay from '@/components/app/ModalOverlay'
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
  siren: string
  denomination: string | null
  categorie_juridique_libelle: string | null
  activite_principale: string | null
  tva_intracom: string
  etablissements_actifs?: EtablissementOut[]
}

import { INPUT, SELECT } from '@/lib/formStyles'
const LABEL = 'block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5'

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
  compact?: boolean
  onClose: () => void
}

export default function ClientPanel({ clientId, compact = false, onClose }: ClientPanelProps) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [contacts, setContacts] = useState<ContactOut[]>([])
  const [profiles, setProfiles] = useState<BillingProfileShort[]>([])
  const [etabs, setEtabs] = useState<EtablissementOut[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingEtabs, setLoadingEtabs] = useState(false)
  const [showEtabSelector, setShowEtabSelector] = useState(false)
  const [freeAddressMode, setFreeAddressMode] = useState(false)
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
      setLoading(false)

      // Charger les établissements en arrière-plan (non bloquant)
      if (c.company_siren) {
        setLoadingEtabs(true)
        try {
          const { data } = await apiClient.get<CompanyDetailsOut>(`/companies/${c.company_siren}`)
          setEtabs(data.etablissements_actifs ?? [])
        } catch { /* pas critique */ }
        setLoadingEtabs(false)
      }
    } catch {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void loadAll() }, [loadAll])

  // ── Auto-save ─────────────────────────────────────────────────────────

  async function saveField(patch: Record<string, unknown>) {
    if (!client) return
    setSaveStatus('saving')
    try {
      await orgPatch(`/clients/${client.id}`, patch)
      // Recharger le client complet (le PATCH ne retourne que {status: "updated"})
      const refreshed = await orgGet<ClientDetail>(`/clients/${client.id}`)
      setClient(refreshed)
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

  // ── Sélection établissement ───────────────────────────────────────────

  function handleSelectEtab(etab: EtablissementOut) {
    // Met à jour le SIRET + adresse depuis l'établissement
    const addr = etab.adresse ? {
      voie: etab.adresse.voie || null,
      code_postal: etab.adresse.code_postal || null,
      commune: etab.adresse.commune || null,
      complement: null,
      pays: 'France',
    } : null
    saveField({ siret: etab.siret, billing_address: addr })
    setFreeAddressMode(false)
    setShowEtabSelector(false)
  }

  function handleFreeAddress() {
    setFreeAddressMode(true)
    setShowEtabSelector(false)
    // Efface le SIRET pour indiquer qu'on n'utilise pas un établissement INSEE
    saveField({ siret: null })
  }

  // ── Rendu ─────────────────────────────────────────────────────────────

  return (
    <ModalOverlay onClose={onClose} size="xl">
        {/* ── En-tête ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-kerpta-50 dark:bg-kerpta-900/30 border border-kerpta-200 dark:border-kerpta-700 flex items-center justify-center">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-kerpta" />
              ) : client?.type === 'company' ? (
                <Building2 className="w-5 h-5 text-kerpta-600" />
              ) : (
                <UserRound className="w-5 h-5 text-kerpta-600" />
              )}
            </div>
            {client && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{client.name}</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {client.type === 'company' ? 'Entreprise' : 'Particulier'}
                  {client.siret && <span className="ml-2 font-mono">{formatSiret(client.siret)}</span>}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator status={saveStatus} />
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
          </div>
        ) : !client ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">Client introuvable</div>
        ) : (
          <div className="px-6 py-5 space-y-6">

            {/* ── 1. Contacts ──────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Contacts</h3>
                <button
                  onClick={addContact}
                  className="flex items-center gap-1 text-xs text-kerpta hover:text-kerpta-600 transition"
                >
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>

              {contacts.length === 0 ? (
                <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                  <p>Aucun contact enregistré</p>
                  <div className="space-y-2">
                    <AutoSaveField label="Email" value={client.email || ''} onSave={(v) => saveField({ email: v || null })} type="email" />
                    <AutoSaveField label="Téléphone" value={client.phone || ''} onSave={(v) => saveField({ phone: v || null })} type="tel" />
                  </div>
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
            </section>

            {/* ── 2. Profil de facturation ──────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider mb-2">Profil de facturation</h3>
              <select
                value={client.billing_profile_id ?? ''}
                onChange={(e) => saveField({ billing_profile_id: e.target.value || null })}
                className={SELECT}
              >
                <option value="">Aucun profil</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.payment_terms}j {p.payment_term_type === 'net' ? 'net' : 'fin de mois'}
                    {p.is_default ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </section>

            {/* ── 3. Informations société ───────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider mb-3">Informations</h3>
              <div className="space-y-3">
                <AutoSaveField label={client.type === 'company' ? 'Raison sociale' : 'Nom'} value={client.name} onSave={(v) => saveField({ name: v })} required />
                {contacts.length > 0 && (
                  <>
                    <AutoSaveField label="Email" value={client.email || ''} onSave={(v) => saveField({ email: v || null })} type="email" />
                    <AutoSaveField label="Téléphone" value={client.phone || ''} onSave={(v) => saveField({ phone: v || null })} type="tel" />
                  </>
                )}
                {client.type === 'company' && (
                  client.company_siren && client.vat_number ? (
                    <div>
                      <label className={LABEL}>TVA intracommunautaire</label>
                      <p className="px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg font-mono">{client.vat_number}</p>
                    </div>
                  ) : (
                    <AutoSaveField label="TVA intracommunautaire" value={client.vat_number || ''} onSave={(v) => saveField({ vat_number: v || null })} />
                  )
                )}
              </div>
            </section>

            {/* ── 4. Établissement & Adresse ────────────────────────── */}
            {client.type === 'company' && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Établissement à facturer</h3>
                  <button
                    onClick={() => setShowEtabSelector(!showEtabSelector)}
                    className="flex items-center gap-1 text-xs text-kerpta hover:text-kerpta-600 transition"
                    title="Changer d'établissement"
                  >
                    <Pencil className="w-3 h-3" /> Modifier
                  </button>
                </div>

                {/* Adresse actuelle */}
                {freeAddressMode ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded uppercase">Saisie libre</span>
                    </div>
                    <AutoSaveField label="" value={client.billing_address?.voie || ''} placeholder="Adresse" onSave={(v) => saveField({ billing_address: { ...client.billing_address, voie: v || null } })} />
                    <AutoSaveField label="" value={client.billing_address?.complement || ''} placeholder="Complément" onSave={(v) => saveField({ billing_address: { ...client.billing_address, complement: v || null } })} />
                    <div className="grid grid-cols-2 gap-2">
                      <AutoSaveField label="" value={client.billing_address?.code_postal || ''} placeholder="Code postal" onSave={(v) => saveField({ billing_address: { ...client.billing_address, code_postal: v || null } })} />
                      <AutoSaveField label="" value={client.billing_address?.commune || ''} placeholder="Ville" onSave={(v) => saveField({ billing_address: { ...client.billing_address, commune: v || null } })} />
                    </div>
                    <AutoSaveField label="" value={client.billing_address?.pays || 'France'} placeholder="Pays" onSave={(v) => saveField({ billing_address: { ...client.billing_address, pays: v || null } })} />
                  </div>
                ) : client.siret ? (
                  <button
                    onClick={() => setShowEtabSelector(!showEtabSelector)}
                    className="w-full text-left p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm space-y-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                  >
                    <p className="font-mono font-medium text-gray-900 dark:text-white">{formatSiret(client.siret)}</p>
                    <p className="text-gray-600 dark:text-gray-300">{formatAddress(client.billing_address)}</p>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowEtabSelector(!showEtabSelector)}
                    className="w-full text-left text-sm text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 transition cursor-pointer"
                  >
                    Aucun établissement sélectionné — cliquez pour choisir
                  </button>
                )}

                {/* Chargement des établissements */}
                {loadingEtabs && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin" /> Chargement des établissements...
                  </div>
                )}

                {/* Sélecteur d'établissements */}
                {showEtabSelector && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Sélectionnez un établissement :</p>
                    {etabs.map((etab) => {
                      const isSelected = !freeAddressMode && client.siret === etab.siret
                      const isClosed = etab.etat !== 'A'
                      return (
                        <button
                          key={etab.siret}
                          onClick={() => handleSelectEtab(etab)}
                          className={`w-full text-left p-3 rounded-xl border transition ${
                            isSelected
                              ? 'border-kerpta-400 bg-kerpta-50 dark:bg-kerpta-900/30 ring-2 ring-kerpta-200'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                            <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">{formatSiret(etab.siret)}</span>
                            {etab.siege && <span className="px-1.5 py-0.5 bg-kerpta-100 dark:bg-kerpta-900/40 text-kerpta-700 dark:text-kerpta-400 text-[10px] font-semibold rounded uppercase">Siège</span>}
                            {isClosed && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded uppercase">Fermé</span>}
                            {isSelected && <Check className="w-4 h-4 text-kerpta-600 ml-auto shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">{formatEtabAddress(etab.adresse)}</p>
                          {etab.activite_principale && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 ml-6">APE : {etab.activite_principale}</p>
                          )}
                        </button>
                      )
                    })}

                    {/* Option Saisie libre */}
                    <button
                      onClick={handleFreeAddress}
                      className={`w-full text-left p-3 rounded-xl border transition ${
                        freeAddressMode
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 ring-2 ring-amber-200'
                          : 'border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Saisie libre</span>
                        {freeAddressMode && <Check className="w-4 h-4 text-amber-600 ml-auto shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-6">Saisir manuellement l'adresse de facturation</p>
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Adresse pour les particuliers (éditable directement) */}
            {client.type === 'individual' && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider mb-2">Adresse de facturation</h3>
                <div className="space-y-2">
                  <AutoSaveField label="" value={client.billing_address?.voie || ''} placeholder="Adresse" onSave={(v) => saveField({ billing_address: { ...client.billing_address, voie: v || null } })} />
                  <AutoSaveField label="" value={client.billing_address?.complement || ''} placeholder="Complément" onSave={(v) => saveField({ billing_address: { ...client.billing_address, complement: v || null } })} />
                  <div className="grid grid-cols-2 gap-2">
                    <AutoSaveField label="" value={client.billing_address?.code_postal || ''} placeholder="Code postal" onSave={(v) => saveField({ billing_address: { ...client.billing_address, code_postal: v || null } })} />
                    <AutoSaveField label="" value={client.billing_address?.commune || ''} placeholder="Ville" onSave={(v) => saveField({ billing_address: { ...client.billing_address, commune: v || null } })} />
                  </div>
                </div>
              </section>
            )}

            {/* ── 5. Notes ─────────────────────────────────────────── */}
            {!compact && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider mb-2">Notes internes</h3>
                <AutoSaveTextarea value={client.notes || ''} onSave={(v) => saveField({ notes: v || null })} placeholder="Notes..." />
              </section>
            )}

            {/* ── 6. Statistiques ──────────────────────────────────── */}
            {!compact && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider mb-3">Statistiques</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Devis</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{client.quote_count}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Facturé</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{(Number(client.total_invoiced) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Solde</p>
                    <p className={`text-xl font-bold ${(Number(client.balance) || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {(Number(client.balance) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <p>Factures : {client.invoice_count ?? 0}</p>
                  <p>Contrats : {client.contract_count ?? 0}</p>
                  <p>Payé : {(Number(client.total_paid) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
                </div>
              </section>
            )}

            {/* ── 7. Données entreprise (INSEE) ───────────────────── */}
            {client.company_siren && (
              <section>
                <CompanyInfoCard siren={client.company_siren} />
              </section>
            )}
          </div>
        )}
    </ModalOverlay>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  if (status === 'saving') return <span className="flex items-center gap-1 text-xs text-kerpta-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sauvegarde...</span>
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
    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-2 relative group">
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
        <span className="inline-flex items-center gap-1 text-[10px] text-kerpta-600 font-semibold">
          <Star className="w-3 h-3" /> Contact principal
        </span>
      )}
    </div>
  )
}

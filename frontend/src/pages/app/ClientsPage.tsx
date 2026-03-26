// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Loader2, Users,
  Building2, MapPin, CheckCircle2,
} from 'lucide-react'
import { orgGet, orgPost } from '@/lib/orgApi'
import { apiClient, httpError } from '@/lib/api'
import PageLayout from '@/components/app/PageLayout'
import ClientPanel from '@/components/app/ClientPanel'
import { COUNTRIES, getCountryMode } from '@/data/countries'
// ── Types ────────────────────────────────────────────────────────────────────

interface BillingProfileShort {
  id: string
  name: string
  payment_terms: number
  payment_term_type: string
  is_default: boolean
}

interface Client {
  id: string
  type: string
  name: string
  siret: string | null
  email: string | null
  phone: string | null
  billing_profile_id: string | null
  billing_profile_name: string | null
  created_at: string | null
  archived_at: string | null
}

interface PaginatedClients {
  items: Client[]
  total: number
  page: number
  page_size: number
}

interface CompanySearchResult {
  siren: string
  denomination: string | null
  sigle: string | null
  activite_principale: string | null
  categorie_juridique_libelle: string | null
  etat: string
  tva_intracom: string
  siege_adresse: Record<string, string | null> | null
  siret_siege: string | null
  ca: number | null
}

interface CompanyDetails {
  siren: string
  denomination: string | null
  sigle: string | null
  activite_principale: string | null
  categorie_juridique_libelle: string | null
  date_creation: string | null
  etat: string
  tva_intracom: string
  tranche_effectifs_libelle: string | null
  categorie_entreprise: string | null
  etablissements_actifs: Etablissement[]
  nombre_etablissements_actifs: number
}

interface Etablissement {
  siret: string
  nic: string
  siege: boolean
  etat: string
  activite_principale: string | null
  adresse: Record<string, string | null>
}

interface AddressSuggestion {
  label: string
  voie: string
  code_postal: string
  commune: string
}

import { INPUT, SELECT, BTN, OVERLAY_BACKDROP, OVERLAY_PANEL } from '@/lib/formStyles'

// -- Schema Zod pour le formulaire de creation client -------------------------

const clientSchema = z.object({
  type: z.enum(['company', 'individual']),
  name: z.string().min(1, 'Le nom est requis'),
  siren: z.string(),
  siret: z.string(),
  vatNumber: z.string(),
  contactLastName: z.string(),
  contactFirstName: z.string(),
  contactJobTitle: z.string(),
  contactEmail: z.string(),
  contactPhone: z.string(),
  billingProfileId: z.string(),
  notes: z.string(),
})

type ClientFormValues = z.infer<typeof clientSchema>

function formatAddress(a: Record<string, string | null> | null | undefined): string {
  if (!a) return '—'
  const parts = [a.voie, a.complement, [a.code_postal, a.commune].filter(Boolean).join(' '), a.pays].filter(Boolean)
  return parts.join(', ') || '—'
}

function formatSiret(s: string): string {
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')
}

// ── Liste des clients ─────────────────────────────────────────────────────────

function ClientsList() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading: loading } = useQuery({
    queryKey: ['clients', { search, page }],
    queryFn: () => orgGet<PaginatedClients>('/clients', { search: search || undefined, page }),
  })
  const clients = data?.items ?? []
  const total = data?.total ?? 0

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clients'] })

  return (
    <PageLayout
      icon={<Users className="w-5 h-5 text-kerpta" />}
      title="Clients"
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className={BTN}
        >
          <Plus className="w-4 h-4" /> Nouveau client
        </button>
      }
    >

        {/* Barre de recherche */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un client..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-400 bg-white dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
            </div>
          ) : clients.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun client trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">SIRET</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Tél</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="border-b border-gray-50 dark:border-gray-700 hover:bg-kerpta-50/50 dark:hover:bg-gray-700/50 cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.type === 'company' ? 'Entreprise' : 'Particulier'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{c.siret || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
            >
              Précédent
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
              Page {page} / {Math.ceil(total / 25)}
            </span>
            <button
              disabled={page * 25 >= total}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
            >
              Suivant
            </button>
          </div>
        )}
      {/* ── Modal fiche client ────────────────────────────────────── */}
      {selectedId && (
        <ClientPanel
          clientId={selectedId}
          onClose={() => { setSelectedId(null); void invalidate() }}
        />
      )}

      {/* ── Modal création client ──────────────────────────────────── */}
      {showCreate && (
        <CreateClientForm
          onClose={() => { setShowCreate(false); void invalidate() }}
        />
      )}
    </PageLayout>
  )
}

// ── Formulaire de création ───────────────────────────────────────────────────

export function CreateClientForm({ onClose, onCreated }: { onClose?: () => void; onCreated?: (id: string) => void } = {}) {
  const { register, handleSubmit: rhfSubmit, watch, setValue, formState: { isSubmitting } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      type: 'company', name: '', siren: '', siret: '', vatNumber: '',
      contactLastName: '', contactFirstName: '', contactJobTitle: '',
      contactEmail: '', contactPhone: '', billingProfileId: '', notes: '',
    },
  })

  const type = watch('type')
  const siren = watch('siren')
  const siret = watch('siret')
  const vatNumber = watch('vatNumber')
  const name = watch('name')

  // Pays
  const [countryCode, setCountryCode] = useState('FR')
  const [countrySearch, setCountrySearch] = useState('')
  const [showCountryDropdown, setShowCountryDropdown] = useState(false)
  const countryRef = useRef<HTMLDivElement>(null)

  // Adresse
  const [billingAddress, setBillingAddress] = useState({ voie: '', complement: '', code_postal: '', commune: '', pays: 'France' })
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const addressTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Resultats recherche
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null)
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([])
  const [selectedEtab, setSelectedEtab] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  // Reference data
  const [billingProfiles, setBillingProfiles] = useState<BillingProfileShort[]>([])
  const [error, setError] = useState('')

  const mode = type === 'company' ? getCountryMode(countryCode) : 'world'
  const hasSiren = mode === 'france' && siren.replace(/\s/g, '').length === 9

  // Click-outside ferme le dropdown pays
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setShowCountryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Charger les profils de facturation
  useEffect(() => {
    async function loadProfiles() {
      try {
        const profiles = await orgGet<BillingProfileShort[]>('/billing/profiles')
        setBillingProfiles(profiles)
        // Sélectionner le profil par défaut
        const defaultProfile = profiles.find((p: BillingProfileShort) => p.is_default)
        if (defaultProfile) setValue('billingProfileId', defaultProfile.id)
      } catch {
        // Pas critique
      }
    }
    void loadProfiles()
  }, [])

  const filteredCountries = countrySearch
    ? COUNTRIES.filter((c) => c.name.toLowerCase().startsWith(countrySearch.toLowerCase()))
    : COUNTRIES

  const countryName = COUNTRIES.find((c) => c.code === countryCode)?.name ?? countryCode

  // ── Recherche SIRENE / VIES ─────────────────────────────────────────────

  async function handleSearch(query: string) {
    const clean = query.replace(/\s/g, '')
    if (!clean) return
    setSearching(true)
    setError('')
    setCompanyDetails(null)
    setSearchResults([])
    setSelectedEtab(null)
    try {
      const data = await apiClient.get<CompanySearchResult[]>('/companies/search', { q: clean })
      setSearchResults(data)

      if (data.length > 0) {
        const first = data[0]
        if (first.denomination) setValue('name', first.denomination)
        if (first.tva_intracom) setValue('vatNumber', first.tva_intracom)
        if (first.siren) setValue('siren', first.siren)
        if (first.siret_siege) setValue('siret', first.siret_siege)

        // Pour un SIREN français, récupérer les établissements
        if (first.siren && first.siren.length === 9) {
          const details = await apiClient.get<CompanyDetails>(`/companies/${first.siren}`)
          setCompanyDetails(details)
          // Auto-sélectionner le siège
          const siege = details.etablissements_actifs.find((e: Etablissement) => e.siege)
          if (siege) handleSelectEtab(siege)
        }
      }
    } catch (err) {
      setError(httpError(err, 'Erreur lors de la recherche'))
    }
    setSearching(false)
  }

  function handleSelectEtab(etab: Etablissement) {
    setSelectedEtab(etab.siret)
    setValue('siret', etab.siret)
    setBillingAddress({
      voie: etab.adresse.voie ?? '',
      complement: etab.adresse.complement ?? '',
      code_postal: etab.adresse.code_postal ?? '',
      commune: etab.adresse.commune ?? '',
      pays: etab.adresse.pays ?? 'France',
    })
  }

  // ── Autocomplétion adresse ──────────────────────────────────────────────

  function handleAddressInput(value: string) {
    setBillingAddress((prev) => ({ ...prev, voie: value }))
    if (addressTimerRef.current) clearTimeout(addressTimerRef.current)
    if (value.length < 3 || countryCode !== 'FR' || hasSiren) {
      setAddressSuggestions([])
      return
    }
    addressTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(value)}&limit=5`)
        const json = await resp.json() as { features: Array<{ properties: { label: string; name: string; postcode: string; city: string } }> }
        setAddressSuggestions(
          json.features.map((f) => ({
            label: f.properties.label,
            voie: f.properties.name,
            code_postal: f.properties.postcode,
            commune: f.properties.city,
          }))
        )
      } catch {
        setAddressSuggestions([])
      }
    }, 300)
  }

  function selectAddressSuggestion(s: AddressSuggestion) {
    setBillingAddress({ voie: s.voie, complement: '', code_postal: s.code_postal, commune: s.commune, pays: 'France' })
    setAddressSuggestions([])
  }

  // ── Soumission ──────────────────────────────────────────────────────────

  async function onSubmit(data: ClientFormValues) {
    setError('')
    try {
      const cleanSiren = data.siren.replace(/\s/g, '')
      const result = await orgPost<{ id: string }>('/clients', {
        type: data.type,
        name: data.name,
        country_code: data.type === 'company' ? countryCode : 'FR',
        siret: data.siret.replace(/\s/g, '') || undefined,
        company_siren: cleanSiren.length === 9 ? cleanSiren : undefined,
        vat_number: data.vatNumber || undefined,
        email: data.contactEmail || undefined,
        phone: data.contactPhone || undefined,
        billing_address: billingAddress.voie ? billingAddress : undefined,
        billing_profile_id: data.billingProfileId || undefined,
        notes: data.notes || undefined,
      })

      const hasContact = data.contactLastName || data.contactFirstName || data.contactEmail || data.contactPhone || data.contactJobTitle
      if (hasContact) {
        await orgPost(`/clients/${result.id}/contacts`, {
          last_name: data.contactLastName || undefined,
          first_name: data.contactFirstName || undefined,
          email: data.contactEmail || undefined,
          phone: data.contactPhone || undefined,
          job_title: data.contactJobTitle || undefined,
          is_primary: true,
        })
      }

      if (onCreated) onCreated(result.id)
      else onClose?.()
    } catch (err) {
      setError(httpError(err, 'Erreur lors de la création'))
    }
  }

  const formBody = (
    <>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Nouveau client</h1>

        {error && (
          <div className="p-3 mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        <form onSubmit={rhfSubmit(onSubmit)} className="space-y-6">

          {/* ── Type ─────────────────────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
            <select
              {...register('type')}
              className={SELECT}
            >
              <option value="company">Entreprise</option>
              <option value="individual">Particulier</option>
            </select>
          </section>

          {/* ── Pays (entreprise) ─────────────────────────────────────────── */}
          {type === 'company' && (
            <section>
              <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Pays</label>
              <div className="relative" ref={countryRef}>
                <input
                  type="text"
                  value={showCountryDropdown ? countrySearch : countryName}
                  onChange={(e) => { setCountrySearch(e.target.value); setShowCountryDropdown(true) }}
                  onFocus={() => { setShowCountryDropdown(true); setCountrySearch('') }}
                  placeholder="Rechercher un pays..."
                  className={INPUT}
                />
                {showCountryDropdown && (
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/50">
                    {filteredCountries.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Aucun pays trouvé</div>
                    ) : (
                      filteredCountries.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setCountryCode(c.code)
                            setCountrySearch('')
                            setShowCountryDropdown(false)
                            setSearchResults([])
                            setCompanyDetails(null)
                            setSelectedEtab(null)
                            setValue('siren', '')
                            setValue('siret', '')
                            setValue('vatNumber', '')
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-kerpta-50 dark:hover:bg-kerpta-900/30 transition ${
                            c.code === countryCode ? 'bg-kerpta-50 dark:bg-kerpta-900/30 text-kerpta-600 dark:text-kerpta-400 font-medium' : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Identification ────────────────────────────────────────────── */}
          {type === 'company' && (
            <section className="space-y-3">
              <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Identification</label>

              {mode === 'france' && (
                <>
                  <div className="flex gap-2">
                    <input type="text" {...register('siren')} placeholder="SIREN (9 chiffres)" maxLength={11} className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => handleSearch(siren)} disabled={searching || siren.replace(/\s/g, '').length < 9} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50">
                      {searching ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <Search className="w-4 h-4 text-gray-500" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" {...register('siret')} placeholder="SIRET (14 chiffres)" maxLength={17} className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => handleSearch(siret)} disabled={searching || siret.replace(/\s/g, '').length < 14} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50">
                      <Search className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" {...register('vatNumber')} placeholder="TVA intracommunautaire" className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => handleSearch(vatNumber)} disabled={searching || vatNumber.length < 4} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50">
                      <Search className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </>
              )}

              {mode === 'eu' && (
                <div className="flex gap-2">
                  <input type="text" {...register('vatNumber')} placeholder="N° TVA intracommunautaire" className={`${INPUT} flex-1`} />
                  <button type="button" onClick={() => handleSearch(vatNumber)} disabled={searching || vatNumber.length < 4} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <Search className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              )}

              {mode === 'world' && (
                <input type="text" {...register('vatNumber')} placeholder="N° TVA" className={INPUT} />
              )}
            </section>
          )}

          {/* ── Nom / Raison sociale ──────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
              {type === 'company' ? 'Raison sociale' : 'Nom'}
            </label>
            <input type="text" {...register('name')} placeholder={type === 'company' ? 'Raison sociale' : 'Nom du client'} required className={INPUT} />
          </section>

          {/* ── Adresse de facturation ────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Adresse de facturation</label>
            {hasSiren && companyDetails ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                <MapPin className="w-3.5 h-3.5 inline mr-1" />
                Sélectionnez un établissement ci-dessous pour définir l'adresse.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input type="text" value={billingAddress.voie} onChange={(e) => handleAddressInput(e.target.value)} placeholder="Adresse" className={INPUT} />
                  {addressSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/50 max-h-48 overflow-y-auto">
                      {addressSuggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => selectAddressSuggestion(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-kerpta-50 dark:hover:bg-kerpta-900/30 transition text-gray-700 dark:text-gray-200">
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input type="text" value={billingAddress.complement} onChange={(e) => setBillingAddress((p) => ({ ...p, complement: e.target.value }))} placeholder="Complément d'adresse" className={INPUT} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={billingAddress.code_postal} onChange={(e) => setBillingAddress((p) => ({ ...p, code_postal: e.target.value }))} placeholder="Code postal" className={INPUT} />
                  <input type="text" value={billingAddress.commune} onChange={(e) => setBillingAddress((p) => ({ ...p, commune: e.target.value }))} placeholder="Ville" className={INPUT} />
                </div>
                <input type="text" value={billingAddress.pays} onChange={(e) => setBillingAddress((p) => ({ ...p, pays: e.target.value }))} placeholder="Pays" className={INPUT} />
              </div>
            )}
          </section>

          {/* ── Résultats SIRENE (sous tous les champs) ───────────────────── */}
          {companyDetails && (
            <section className="space-y-4">
              <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Informations entreprise</label>
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800 dark:text-green-400">Entreprise trouvée</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-gray-500 dark:text-gray-400">Dénomination :</span> <span className="text-gray-900 dark:text-white font-medium">{companyDetails.denomination ?? '—'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Forme juridique :</span> <span className="text-gray-900 dark:text-white">{companyDetails.categorie_juridique_libelle ?? '—'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">SIREN :</span> <span className="text-gray-900 dark:text-white font-mono">{companyDetails.siren}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">TVA intra :</span> <span className="text-gray-900 dark:text-white font-mono">{companyDetails.tva_intracom}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Code APE :</span> <span className="text-gray-900 dark:text-white">{companyDetails.activite_principale ?? '—'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Date création :</span> <span className="text-gray-900 dark:text-white">{companyDetails.date_creation ?? '—'}</span></div>
                  {companyDetails.tranche_effectifs_libelle && (
                    <div><span className="text-gray-500 dark:text-gray-400">Effectifs :</span> <span className="text-gray-900 dark:text-white">{companyDetails.tranche_effectifs_libelle}</span></div>
                  )}
                  {companyDetails.categorie_entreprise && (
                    <div><span className="text-gray-500 dark:text-gray-400">Catégorie :</span> <span className="text-gray-900 dark:text-white">{companyDetails.categorie_entreprise}</span></div>
                  )}
                </div>
              </div>

              {companyDetails.etablissements_actifs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Établissements actifs ({companyDetails.etablissements_actifs.length}{companyDetails.nombre_etablissements_actifs > companyDetails.etablissements_actifs.length ? ` / ${companyDetails.nombre_etablissements_actifs} au total` : ''})
                  </p>
                  <div className="space-y-2">
                    {companyDetails.etablissements_actifs.map((etab) => {
                      const isSelected = selectedEtab === etab.siret
                      return (
                        <button key={etab.siret} type="button" onClick={() => handleSelectEtab(etab)}
                          className={`w-full text-left p-3 rounded-xl border transition ${isSelected ? 'border-kerpta-400 bg-kerpta-50 dark:bg-kerpta-900/30 ring-2 ring-kerpta-200 dark:ring-kerpta-700' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">{formatSiret(etab.siret)}</span>
                            {etab.siege && <span className="px-1.5 py-0.5 bg-kerpta-100 dark:bg-kerpta-900/40 text-kerpta-700 dark:text-kerpta-400 text-[10px] font-semibold rounded uppercase">Siège</span>}
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-kerpta-600 ml-auto" />}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">{formatAddress(etab.adresse)}</p>
                          {etab.activite_principale && <p className="text-xs text-gray-400 dark:text-gray-500 ml-6 mt-0.5">APE : {etab.activite_principale}</p>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Résultats VIES (entreprise UE sans SIREN) */}
          {!companyDetails && searchResults.length > 0 && (
            <section>
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800 dark:text-green-400">Entreprise trouvée (VIES)</span>
                </div>
                <div className="text-sm space-y-1">
                  <div><span className="text-gray-500 dark:text-gray-400">Dénomination :</span> <span className="text-gray-900 dark:text-white font-medium">{searchResults[0].denomination ?? '—'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">TVA :</span> <span className="text-gray-900 dark:text-white font-mono">{searchResults[0].tva_intracom}</span></div>
                  {searchResults[0].siege_adresse && (
                    <div><span className="text-gray-500 dark:text-gray-400">Adresse :</span> <span className="text-gray-900 dark:text-white">{formatAddress(searchResults[0].siege_adresse)}</span></div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Contact (optionnel) ──────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Contact (optionnel)</label>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" {...register('contactLastName')} placeholder="Nom" className={INPUT} />
                <input type="text" {...register('contactFirstName')} placeholder="Prénom" className={INPUT} />
              </div>
              <input type="text" {...register('contactJobTitle')} placeholder="Poste" className={INPUT} />
              <div className="grid grid-cols-2 gap-2">
                <input type="email" {...register('contactEmail')} placeholder="Email" className={INPUT} />
                <input type="tel" {...register('contactPhone')} placeholder="Téléphone" className={INPUT} />
              </div>
            </div>
          </section>

          {/* ── Profil de facturation ──────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Profil de facturation</label>
            {billingProfiles.length > 0 ? (
              <select
                {...register('billingProfileId')}
                className={SELECT}
              >
                <option value="">Aucun profil</option>
                {billingProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.payment_terms}j {p.payment_term_type === 'net' ? 'net' : p.payment_term_type === 'end_of_month' ? 'fin de mois' : `le ${p.payment_terms}`}
                    {p.is_default ? ' (par défaut)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Aucun profil de facturation. Créez-en un dans Paramètres &gt; Facturation.
              </p>
            )}
          </section>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea {...register('notes')} rows={3} placeholder="Notes internes..." className={INPUT} />
          </section>

          {/* ── Boutons ──────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onClose?.()} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">Annuler</button>
            <button type="submit" disabled={isSubmitting || !name} className={BTN}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
            </button>
          </div>
        </form>
    </>
  )

  return (
    <div className={OVERLAY_BACKDROP} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${OVERLAY_PANEL} px-3 md:px-6 py-4 md:py-6`} onClick={(e) => e.stopPropagation()}>
        {formBody}
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ClientsPage() {
  return <ClientsList />
}

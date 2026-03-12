// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, Search, UserRound, ArrowLeft, Loader2,
  Building2, MapPin, CheckCircle2,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost } from '@/lib/orgApi'
import { apiClient } from '@/lib/api'
import { COUNTRIES, getCountryMode } from '@/data/countries'
import axios from 'axios'

// ── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  type: string
  name: string
  siret: string | null
  email: string | null
  phone: string | null
  payment_terms: number
  created_at: string | null
  archived_at: string | null
}

interface ClientDetail extends Client {
  country_code: string
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

function httpError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown }
    if (typeof d?.detail === 'string') return d.detail
  }
  return fallback
}

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent'

const PAYMENT_TERMS_OPTIONS = [
  { value: 0, label: 'Comptant' },
  { value: 15, label: '15 jours' },
  { value: 30, label: '30 jours' },
  { value: 45, label: '45 jours' },
  { value: 60, label: '60 jours' },
]

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
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<PaginatedClients>('/clients', { search: search || undefined, page })
      setClients(data.items)
      setTotal(data.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, search])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
          <button
            onClick={() => navigate('/app/clients/new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Nouveau client
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un client..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : clients.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun client trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
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
                    onClick={() => navigate(`/app/clients/${c.id}`)}
                    className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500">{c.type === 'company' ? 'Entreprise' : 'Particulier'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.siret || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
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
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              Précédent
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-500">
              Page {page} / {Math.ceil(total / 25)}
            </span>
            <button
              disabled={page * 25 >= total}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Formulaire de création ───────────────────────────────────────────────────

function CreateClientForm() {
  // Type
  const [type, setType] = useState<'company' | 'individual'>('company')

  // Pays
  const [countryCode, setCountryCode] = useState('FR')
  const [countrySearch, setCountrySearch] = useState('')
  const [showCountryDropdown, setShowCountryDropdown] = useState(false)
  const countryRef = useRef<HTMLDivElement>(null)

  // Identification
  const [siren, setSiren] = useState('')
  const [siret, setSiret] = useState('')
  const [vatNumber, setVatNumber] = useState('')

  // Nom
  const [name, setName] = useState('')

  // Adresse
  const [billingAddress, setBillingAddress] = useState({ voie: '', complement: '', code_postal: '', commune: '', pays: 'France' })
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const addressTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Résultats recherche
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null)
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([])
  const [selectedEtab, setSelectedEtab] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  // Contact
  const [contactLastName, setContactLastName] = useState('')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactJobTitle, setContactJobTitle] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  // Divers
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
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
      const { data } = await apiClient.get<CompanySearchResult[]>('/companies/search', { params: { q: clean } })
      setSearchResults(data)

      if (data.length > 0) {
        const first = data[0]
        if (first.denomination) setName(first.denomination)
        if (first.tva_intracom) setVatNumber(first.tva_intracom)
        if (first.siren) setSiren(first.siren)
        if (first.siret_siege) setSiret(first.siret_siege)

        // Pour un SIREN français, récupérer les établissements
        if (first.siren && first.siren.length === 9) {
          const { data: details } = await apiClient.get<CompanyDetails>(`/companies/${first.siren}`)
          setCompanyDetails(details)
          // Auto-sélectionner le siège
          const siege = details.etablissements_actifs.find((e) => e.siege)
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
    setSiret(etab.siret)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const result = await orgPost<{ id: string }>('/clients', {
        type,
        name,
        country_code: type === 'company' ? countryCode : 'FR',
        siret: siret.replace(/\s/g, '') || undefined,
        // company_siren envoyé seulement si le SIREN existe dans le cache local
        // (le sync Celery nightly le remplira — ne pas envoyer sinon FK violation)
        vat_number: vatNumber || undefined,
        email: contactEmail || undefined,
        phone: contactPhone || undefined,
        billing_address: billingAddress.voie ? billingAddress : undefined,
        payment_terms: paymentTerms,
        notes: notes || undefined,
      })

      // Créer le contact si au moins un champ rempli
      const hasContact = contactLastName || contactFirstName || contactEmail || contactPhone || contactJobTitle
      if (hasContact) {
        await orgPost(`/clients/${result.id}/contacts`, {
          last_name: contactLastName || undefined,
          first_name: contactFirstName || undefined,
          email: contactEmail || undefined,
          phone: contactPhone || undefined,
          job_title: contactJobTitle || undefined,
          is_primary: true,
        })
      }

      navigate(`/app/clients/${result.id}`)
    } catch (err) {
      setError(httpError(err, 'Erreur lors de la création'))
    }
    setSaving(false)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/app/clients')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <h1 className="text-xl font-semibold text-gray-900 mb-6">Nouveau client</h1>

        {error && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Type ─────────────────────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'company' | 'individual')}
              className={`${INPUT} bg-white`}
            >
              <option value="company">Entreprise</option>
              <option value="individual">Particulier</option>
            </select>
          </section>

          {/* ── Pays (entreprise) ─────────────────────────────────────────── */}
          {type === 'company' && (
            <section>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Pays</label>
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
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    {filteredCountries.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">Aucun pays trouvé</div>
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
                            setSiren('')
                            setSiret('')
                            setVatNumber('')
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 transition ${
                            c.code === countryCode ? 'bg-orange-50 text-orange-600 font-medium' : 'text-gray-700'
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
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Identification</label>

              {mode === 'france' && (
                <>
                  <div className="flex gap-2">
                    <input type="text" value={siren} onChange={(e) => setSiren(e.target.value)} placeholder="SIREN (9 chiffres)" maxLength={11} className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => handleSearch(siren)} disabled={searching || siren.replace(/\s/g, '').length < 9} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50">
                      {searching ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <Search className="w-4 h-4 text-gray-500" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="SIRET (14 chiffres)" maxLength={17} className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => handleSearch(siret)} disabled={searching || siret.replace(/\s/g, '').length < 14} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50">
                      <Search className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="TVA intracommunautaire" className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => handleSearch(vatNumber)} disabled={searching || vatNumber.length < 4} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50">
                      <Search className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </>
              )}

              {mode === 'eu' && (
                <div className="flex gap-2">
                  <input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="N° TVA intracommunautaire" className={`${INPUT} flex-1`} />
                  <button type="button" onClick={() => handleSearch(vatNumber)} disabled={searching || vatNumber.length < 4} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <Search className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              )}

              {mode === 'world' && (
                <input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="N° TVA" className={INPUT} />
              )}
            </section>
          )}

          {/* ── Nom / Raison sociale ──────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {type === 'company' ? 'Raison sociale' : 'Nom'}
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'company' ? 'Raison sociale' : 'Nom du client'} required className={INPUT} />
          </section>

          {/* ── Adresse de facturation ────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Adresse de facturation</label>
            {hasSiren && companyDetails ? (
              <p className="text-sm text-gray-500 italic">
                <MapPin className="w-3.5 h-3.5 inline mr-1" />
                Sélectionnez un établissement ci-dessous pour définir l'adresse.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input type="text" value={billingAddress.voie} onChange={(e) => handleAddressInput(e.target.value)} placeholder="Adresse" className={INPUT} />
                  {addressSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {addressSuggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => selectAddressSuggestion(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 transition text-gray-700">
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
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Informations entreprise</label>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Entreprise trouvée</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-gray-500">Dénomination :</span> <span className="text-gray-900 font-medium">{companyDetails.denomination ?? '—'}</span></div>
                  <div><span className="text-gray-500">Forme juridique :</span> <span className="text-gray-900">{companyDetails.categorie_juridique_libelle ?? '—'}</span></div>
                  <div><span className="text-gray-500">SIREN :</span> <span className="text-gray-900 font-mono">{companyDetails.siren}</span></div>
                  <div><span className="text-gray-500">TVA intra :</span> <span className="text-gray-900 font-mono">{companyDetails.tva_intracom}</span></div>
                  <div><span className="text-gray-500">Code APE :</span> <span className="text-gray-900">{companyDetails.activite_principale ?? '—'}</span></div>
                  <div><span className="text-gray-500">Date création :</span> <span className="text-gray-900">{companyDetails.date_creation ?? '—'}</span></div>
                  {companyDetails.tranche_effectifs_libelle && (
                    <div><span className="text-gray-500">Effectifs :</span> <span className="text-gray-900">{companyDetails.tranche_effectifs_libelle}</span></div>
                  )}
                  {companyDetails.categorie_entreprise && (
                    <div><span className="text-gray-500">Catégorie :</span> <span className="text-gray-900">{companyDetails.categorie_entreprise}</span></div>
                  )}
                </div>
              </div>

              {companyDetails.etablissements_actifs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Établissements actifs ({companyDetails.etablissements_actifs.length}{companyDetails.nombre_etablissements_actifs > companyDetails.etablissements_actifs.length ? ` / ${companyDetails.nombre_etablissements_actifs} au total` : ''})
                  </p>
                  <div className="space-y-2">
                    {companyDetails.etablissements_actifs.map((etab) => {
                      const isSelected = selectedEtab === etab.siret
                      return (
                        <button key={etab.siret} type="button" onClick={() => handleSelectEtab(etab)}
                          className={`w-full text-left p-3 rounded-xl border transition ${isSelected ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-mono font-medium text-gray-900">{formatSiret(etab.siret)}</span>
                            {etab.siege && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded uppercase">Siège</span>}
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-orange-600 ml-auto" />}
                          </div>
                          <p className="text-xs text-gray-500 ml-6">{formatAddress(etab.adresse)}</p>
                          {etab.activite_principale && <p className="text-xs text-gray-400 ml-6 mt-0.5">APE : {etab.activite_principale}</p>}
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
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Entreprise trouvée (VIES)</span>
                </div>
                <div className="text-sm space-y-1">
                  <div><span className="text-gray-500">Dénomination :</span> <span className="text-gray-900 font-medium">{searchResults[0].denomination ?? '—'}</span></div>
                  <div><span className="text-gray-500">TVA :</span> <span className="text-gray-900 font-mono">{searchResults[0].tva_intracom}</span></div>
                  {searchResults[0].siege_adresse && (
                    <div><span className="text-gray-500">Adresse :</span> <span className="text-gray-900">{formatAddress(searchResults[0].siege_adresse)}</span></div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Contact (optionnel) ──────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Contact (optionnel)</label>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} placeholder="Nom" className={INPUT} />
                <input type="text" value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} placeholder="Prénom" className={INPUT} />
              </div>
              <input type="text" value={contactJobTitle} onChange={(e) => setContactJobTitle(e.target.value)} placeholder="Poste" className={INPUT} />
              <div className="grid grid-cols-2 gap-2">
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className={INPUT} />
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Téléphone" className={INPUT} />
              </div>
            </div>
          </section>

          {/* ── Conditions de paiement ────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Conditions de paiement</label>
            <select value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} className={`${INPUT} bg-white`}>
              {PAYMENT_TERMS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </section>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes internes..." className={INPUT} />
          </section>

          {/* ── Boutons ──────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => navigate('/app/clients')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Annuler</button>
            <button type="submit" disabled={saving || !name} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Détail client ─────────────────────────────────────────────────────────────

function ClientDetailView({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [contacts, setContacts] = useState<ContactOut[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      orgGet<ClientDetail>(`/clients/${clientId}`),
      orgGet<ContactOut[]>(`/clients/${clientId}/contacts`).catch(() => [] as ContactOut[]),
    ])
      .then(([c, ct]) => { setClient(c); setContacts(ct) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    )
  }
  if (!client) {
    return <div className="flex-1 flex justify-center items-center text-gray-400">Client introuvable</div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={() => navigate('/app/clients')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
            <UserRound className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{client.name}</h1>
            <p className="text-sm text-gray-400">
              {client.type === 'company' ? 'Entreprise' : 'Particulier'}
              {client.siret && <span className="ml-2 font-mono">{client.siret}</span>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Devis</p>
            <p className="text-2xl font-bold text-gray-900">{client.quote_count}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Facturé</p>
            <p className="text-2xl font-bold text-gray-900">{Number(client.total_invoiced).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Solde</p>
            <p className={`text-2xl font-bold ${Number(client.balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {Number(client.balance).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Contacts</h2>
            {contacts.length === 0 ? (
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-400">Email :</span> {client.email || '—'}</p>
                <p><span className="text-gray-400">Tél :</span> {client.phone || '—'}</p>
                <p><span className="text-gray-400">TVA :</span> {client.vat_number || '—'}</p>
                <p><span className="text-gray-400">Conditions :</span> {client.payment_terms} jours</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((ct) => (
                  <div key={ct.id} className="text-sm space-y-0.5">
                    <p className="font-medium text-gray-900">
                      {[ct.first_name, ct.last_name].filter(Boolean).join(' ') || '—'}
                      {ct.is_primary && <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded uppercase">Principal</span>}
                    </p>
                    {ct.job_title && <p className="text-gray-500">{ct.job_title}</p>}
                    {ct.email && <p className="text-gray-500">{ct.email}</p>}
                    {ct.phone && <p className="text-gray-500">{ct.phone}</p>}
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100 text-sm">
                  <p><span className="text-gray-400">TVA :</span> {client.vat_number || '—'}</p>
                  <p><span className="text-gray-400">Conditions :</span> {client.payment_terms} jours</p>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Informations</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-400">Adresse :</span> {formatAddress(client.billing_address)}</p>
              <p><span className="text-gray-400">Devis :</span> {client.quote_count}</p>
              <p><span className="text-gray-400">Factures :</span> {client.invoice_count}</p>
              <p><span className="text-gray-400">Contrats :</span> {client.contract_count}</p>
              <p><span className="text-gray-400">Payé :</span> {Number(client.total_paid).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ClientsPage({ path }: { path: string }) {
  if (path === '/app/clients/new') {
    return <CreateClientForm />
  }
  const match = path.match(/^\/app\/clients\/(.+)$/)
  if (match) {
    return <ClientDetailView clientId={match[1]} />
  }
  return <ClientsList />
}

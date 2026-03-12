// Kerpta — Page d'onboarding (création ou rattachement d'organisation)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState } from 'react'
import { Building2, Users, ArrowLeft, Search, CheckCircle2, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { navigate } from '@/hooks/useRoute'
import axios from 'axios'

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'choice' | 'create' | 'join' | 'join-pending'

interface CompanyLookup {
  siren: string
  denomination: string | null
  sigle: string | null
  categorie_juridique_libelle: string | null
  activite_principale: string | null
  tva_intracom: string
  siege_adresse: {
    voie: string | null
    code_postal: string | null
    commune: string | null
  } | null
  siret_siege: string | null
  ca: number | null
}

// Correspondance libellé forme juridique → valeur du <select>
const LEGAL_FORM_DROPDOWN: Record<string, string> = {
  'Entrepreneur individuel': 'EI',
  'Artisan-commerçant': 'EI',
  'Agent commercial': 'EI',
  EURL: 'EURL',
  SARL: 'SARL',
  SAS: 'SAS',
  SASU: 'SAS',
  SA: 'SA',
  'SA cotée': 'SA',
  SNC: 'SNC',
  SCI: 'SCI',
  'Société civile': 'SCI',
  Association: 'Association',
  'Association loi 1901': 'Association',
}

interface OrgSearchResult {
  org_id: string
  org_name: string
  org_siret: string | null
  org_siren: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function httpError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: string } | undefined
    return d?.detail ?? fallback
  }
  return fallback
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('choice')
  const [pendingOrgName, setPendingOrgName] = useState('')
  const { fetchOrgs } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold">
            <span className="text-gray-900">KER</span>
            <span className="text-orange-500">PTA</span>
          </span>
        </div>

        {step === 'choice' && <ChoiceStep onSelect={setStep} />}

        {step === 'create' && (
          <CreateStep
            onBack={() => setStep('choice')}
            onSuccess={async () => {
              await fetchOrgs()
              navigate('/app')
            }}
          />
        )}

        {step === 'join' && (
          <JoinStep
            onBack={() => setStep('choice')}
            onSuccess={(orgName) => {
              setPendingOrgName(orgName)
              setStep('join-pending')
            }}
          />
        )}

        {step === 'join-pending' && (
          <JoinPendingStep
            orgName={pendingOrgName}
            onNewOrg={() => setStep('choice')}
          />
        )}
      </div>
    </div>
  )
}

// ── Étape 1 : Choix ───────────────────────────────────────────────────────────

function ChoiceStep({ onSelect }: { onSelect: (step: Step) => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Bienvenue sur Kerpta</h1>
      <p className="text-sm text-gray-500 mb-8">
        Avant de commencer, configurez votre espace de travail.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => onSelect('create')}
          className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50/50 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0 group-hover:bg-orange-100 transition">
            <Building2 className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Créer mon entreprise</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Je crée un nouvel espace et j'en deviens l'administrateur.
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect('join')}
          className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50/50 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 group-hover:bg-orange-50 group-hover:border-orange-200 transition">
            <Users className="w-5 h-5 text-gray-500 group-hover:text-orange-600 transition" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Rejoindre une structure</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Mon entreprise est déjà sur Kerpta — je demande à la rejoindre.
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Étape 2a : Créer une organisation ─────────────────────────────────────────

function CreateStep({
  onBack,
  onSuccess,
}: {
  onBack: () => void
  onSuccess: () => void
}) {
  const [siret, setSiret] = useState('')
  const [searching, setSearching] = useState(false)
  const [lookupResult, setLookupResult] = useState<CompanyLookup | null>(null)
  const [searchError, setSearchError] = useState('')

  const [name, setName] = useState('')
  const [legalForm, setLegalForm] = useState('')
  const [vatRegime, setVatRegime] = useState('')
  const [accountingRegime] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function lookupSiret() {
    const clean = siret.replace(/\s/g, '')
    if (clean.length < 9) {
      setSearchError('Saisissez au moins 9 chiffres (SIREN ou SIRET)')
      return
    }
    setSearching(true)
    setSearchError('')
    setLookupResult(null)
    try {
      const { data } = await apiClient.get<CompanyLookup[]>(`/companies/search?q=${clean}`)
      if (!data.length) {
        setSearchError('Aucune entreprise trouvée pour ce SIREN/SIRET')
        return
      }
      const c = data[0]
      setLookupResult(c)
      setName(c.denomination ?? c.sigle ?? '')
      // Pré-remplir la forme juridique si reconnue dans le dropdown
      const mappedForm = LEGAL_FORM_DROPDOWN[c.categorie_juridique_libelle ?? ''] ?? ''
      setLegalForm(mappedForm)
      // Pré-remplir franchise de base si CA ≤ 36 800 € (seuil prestations de services)
      if (c.ca !== null && c.ca > 0 && c.ca <= 36800) {
        setVatRegime('none')
      }
    } catch (err) {
      setSearchError(httpError(err, 'Erreur lors de la recherche'))
    } finally {
      setSearching(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setSaveError('Le nom est obligatoire')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const siren9 = siret.replace(/\s/g, '').slice(0, 9) || undefined
      const siret14 = siret.replace(/\s/g, '').length === 14 ? siret.replace(/\s/g, '') : undefined
      const address = lookupResult?.siege_adresse
        ? {
            voie: lookupResult.siege_adresse.voie,
            code_postal: lookupResult.siege_adresse.code_postal,
            commune: lookupResult.siege_adresse.commune,
            pays: 'France',
          }
        : undefined
      await apiClient.post('/organizations', {
        name: name.trim(),
        siret: siret14 ?? null,
        siren: siren9 ?? null,
        legal_form: legalForm || null,
        vat_regime: vatRegime || null,
        accounting_regime: accountingRegime || null,
        email: email || null,
        phone: phone || null,
        ape_code: lookupResult?.activite_principale ?? null,
        address: address ?? null,
      })
      onSuccess()
    } catch (err) {
      setSaveError(httpError(err, 'Erreur lors de la création'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Créer mon entreprise</h2>
      <p className="text-sm text-gray-500 mb-6">
        Saisissez votre SIRET pour pré-remplir les informations.
      </p>

      {/* SIRET lookup */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
          SIRET ou SIREN
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void lookupSiret()}
            placeholder="362 521 879 00034"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => void lookupSiret()}
            disabled={searching}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition flex items-center gap-1.5"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Rechercher
          </button>
        </div>
        {searchError && <p className="text-xs text-red-600 mt-1.5">{searchError}</p>}
        {lookupResult && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
            ✓ {lookupResult.denomination ?? lookupResult.sigle} trouvé — champs pré-remplis
          </div>
        )}
      </div>

      <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
            Nom de l'entreprise <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Forme juridique
            </label>
            <select
              value={legalForm}
              onChange={(e) => setLegalForm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white"
            >
              <option value="">— Sélectionner —</option>
              <option>SAS</option>
              <option>SARL</option>
              <option>EI</option>
              <option>EURL</option>
              <option>AE</option>
              <option>SNC</option>
              <option>SA</option>
              <option>SCI</option>
              <option>Association</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Régime TVA
            </label>
            <select
              value={vatRegime}
              onChange={(e) => setVatRegime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white"
            >
              <option value="">— Sélectionner —</option>
              <option value="none">Franchise de base (sans TVA)</option>
              <option value="quarterly">Trimestrielle</option>
              <option value="monthly">Mensuelle</option>
              <option value="annual">Annuelle</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Email professionnel
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            />
          </div>
        </div>

        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {saveError}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Création en cours…' : 'Créer ma structure →'}
        </button>
      </form>
    </div>
  )
}

// ── Étape 2b : Rejoindre une organisation ─────────────────────────────────────

function JoinStep({
  onBack,
  onSuccess,
}: {
  onBack: () => void
  onSuccess: (orgName: string) => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<OrgSearchResult[] | null>(null)
  const [searchError, setSearchError] = useState('')
  const [selected, setSelected] = useState<OrgSearchResult | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  async function searchOrgs() {
    if (query.trim().length < 2) return
    setSearching(true)
    setSearchError('')
    setResults(null)
    setSelected(null)
    try {
      const { data } = await apiClient.get<OrgSearchResult[]>(
        `/organizations/search?q=${encodeURIComponent(query.trim())}`
      )
      setResults(data)
      if (!data.length) setSearchError('Aucune structure trouvée pour cette recherche')
    } catch (err) {
      setSearchError(httpError(err, 'Erreur lors de la recherche'))
    } finally {
      setSearching(false)
    }
  }

  async function sendRequest() {
    if (!selected) return
    setSending(true)
    setSendError('')
    try {
      await apiClient.post(`/organizations/${selected.org_id}/join-requests`, {
        message: message.trim() || null,
      })
      onSuccess(selected.org_name)
    } catch (err) {
      setSendError(httpError(err, "Erreur lors de l'envoi de la demande"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Rejoindre une structure</h2>
      <p className="text-sm text-gray-500 mb-6">
        Recherchez par nom ou SIREN. L'administrateur de la structure sera notifié.
      </p>

      {/* Recherche */}
      {!selected && (
        <>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchOrgs()}
              placeholder="Nom de l'entreprise ou SIREN…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => void searchOrgs()}
              disabled={searching || query.trim().length < 2}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg text-sm font-medium text-gray-700 transition flex items-center gap-1.5"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Rechercher
            </button>
          </div>

          {searchError && <p className="text-sm text-red-600 mb-3">{searchError}</p>}

          {results && results.length > 0 && (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.org_id}>
                  <button
                    onClick={() => setSelected(r)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50/40 transition text-left"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{r.org_name}</div>
                      {r.org_siren && (
                        <div className="text-xs text-gray-400 mt-0.5">SIREN {r.org_siren}</div>
                      )}
                    </div>
                    <span className="text-xs text-orange-500 font-medium">Sélectionner →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Confirmation + message */}
      {selected && (
        <div className="space-y-4">
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">{selected.org_name}</div>
              {selected.org_siren && (
                <div className="text-xs text-gray-500 mt-0.5">SIREN {selected.org_siren}</div>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-gray-400 hover:text-gray-700 transition"
            >
              Changer
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Message (optionnel)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Présentez-vous en quelques mots…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
            />
          </div>

          {sendError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {sendError}
            </div>
          )}

          <button
            onClick={() => void sendRequest()}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
          >
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            {sending ? 'Envoi en cours…' : 'Envoyer ma demande →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Étape 3 : Demande envoyée (attente) ───────────────────────────────────────

function JoinPendingStep({
  orgName,
  onNewOrg,
}: {
  orgName: string
  onNewOrg: () => void
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-7 h-7 text-green-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Demande envoyée</h2>
      <p className="text-sm text-gray-500 mb-1">
        Votre demande pour rejoindre{' '}
        <span className="font-medium text-gray-800">{orgName}</span> est en attente.
      </p>
      <p className="text-sm text-gray-400 mb-8">
        L'administrateur de la structure vous répondra par email.
      </p>
      <button
        onClick={onNewOrg}
        className="text-sm text-orange-600 hover:text-orange-700 font-medium underline-offset-2 hover:underline transition"
      >
        Créer ma propre structure à la place
      </button>
    </div>
  )
}

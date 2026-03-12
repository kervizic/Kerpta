// Kerpta — Page de configuration de la structure (siège, établissements, facturation)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Building, MapPin, Phone, Mail, Info, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddressOut {
  voie?: string | null
  complement?: string | null
  code_postal?: string | null
  commune?: string | null
  pays?: string
}

interface EtablissementOut {
  siret: string
  nic: string
  siege: boolean
  activite_principale?: string | null
  adresse?: AddressOut | null
}

interface OrgDetail {
  org_id: string
  org_name: string
  org_siret?: string | null
  org_siren?: string | null
  org_logo_url?: string | null
  vat_number?: string | null
  legal_form?: string | null
  address?: Record<string, string> | null
  email?: string | null
  phone?: string | null
  vat_regime?: string | null
  accounting_regime?: string | null
  rcs_city?: string | null
  capital?: string | null
  ape_code?: string | null
  billing_siret?: string | null
  etablissements?: EtablissementOut[]
}

interface CompanyDetails {
  siren: string
  denomination?: string | null
  siege?: EtablissementOut | null
  etablissements_actifs?: EtablissementOut[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAddress(a: AddressOut | null | undefined): string {
  if (!a) return ''
  return [a.voie, a.complement, a.code_postal && a.commune ? `${a.code_postal} ${a.commune}` : (a.commune ?? a.code_postal)]
    .filter(Boolean)
    .join(', ')
}

function httpError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown } | undefined
    const detail = d?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string }
      return first?.msg ?? fallback
    }
    if (err.response?.status) return `Erreur ${err.response.status} — ${fallback}`
  }
  return fallback
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function OrgSettingsPage() {
  const { activeOrgId, orgs } = useAuthStore()
  const activeOrg = orgs?.find((o) => o.org_id === activeOrgId) ?? orgs?.[0] ?? null

  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [etablissements, setEtablissements] = useState<EtablissementOut[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Champs modifiables
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [vatRegime, setVatRegime] = useState('')
  const [accountingRegime, setAccountingRegime] = useState('')
  const [billingSiret, setBillingSiret] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Chargement initial
  useEffect(() => {
    if (!activeOrg) return

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const { data } = await apiClient.get<OrgDetail>(`/organizations/${activeOrg!.org_id}`)
        setOrg(data)
        setEmail(data.email ?? '')
        setPhone(data.phone ?? '')
        setVatRegime(data.vat_regime ?? '')
        setAccountingRegime(data.accounting_regime ?? '')
        setBillingSiret(data.billing_siret ?? '')

        // Charger les établissements depuis l'API INSEE si on a un SIREN
        if (data.org_siren) {
          try {
            const { data: company } = await apiClient.get<CompanyDetails>(`/companies/${data.org_siren}`)
            if (company?.etablissements_actifs?.length) {
              setEtablissements(company.etablissements_actifs)
            } else if (company?.siege) {
              setEtablissements([company.siege])
            }
          } catch {
            // Pas critique — on affiche juste les données locales
          }
        }
      } catch (err) {
        setLoadError(httpError(err, 'Impossible de charger les données de la structure'))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [activeOrg])

  async function handleSave() {
    if (!org) return
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      const payload: Record<string, string | null> = {}
      if (email !== (org.email ?? '')) payload.email = email || null
      if (phone !== (org.phone ?? '')) payload.phone = phone || null
      if (vatRegime !== (org.vat_regime ?? '')) payload.vat_regime = vatRegime || null
      if (accountingRegime !== (org.accounting_regime ?? '')) payload.accounting_regime = accountingRegime || null
      if (billingSiret !== (org.billing_siret ?? '')) payload.billing_siret = billingSiret || null

      if (Object.keys(payload).length === 0) {
        setSaveSuccess(true)
        return
      }

      await apiClient.patch(`/organizations/${org.org_id}`, payload)
      setOrg((prev) => prev ? { ...prev, ...payload } : prev)
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(httpError(err, 'Erreur lors de la sauvegarde'))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    )
  }

  if (loadError || !org) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-500 text-sm">{loadError ?? 'Erreur inconnue'}</p>
      </div>
    )
  }

  const addressStr = org.address ? formatAddress(org.address as AddressOut) : null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* En-tête */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building className="w-5 h-5 text-orange-500" />
            Ma structure
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Informations légales et paramètres de facturation
          </p>
        </div>

        {/* Informations légales (lecture seule) */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Informations légales
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">Dénomination</span>
              <span className="font-medium text-gray-900">{org.org_name}</span>
            </div>
            {org.legal_form && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Forme juridique</span>
                <span className="font-medium text-gray-900">{org.legal_form}</span>
              </div>
            )}
            {org.org_siren && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">SIREN</span>
                <span className="font-mono text-gray-900">{org.org_siren}</span>
              </div>
            )}
            {org.org_siret && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">SIRET siège</span>
                <span className="font-mono text-gray-900">{org.org_siret}</span>
              </div>
            )}
            {org.vat_number && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">TVA intracommunautaire</span>
                <span className="font-mono text-gray-900">{org.vat_number}</span>
              </div>
            )}
            {org.ape_code && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Code APE</span>
                <span className="font-mono text-gray-900">{org.ape_code}</span>
              </div>
            )}
            {org.rcs_city && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">RCS</span>
                <span className="text-gray-900">{org.rcs_city}</span>
              </div>
            )}
            {org.capital && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Capital social</span>
                <span className="text-gray-900">{parseFloat(org.capital).toLocaleString('fr-FR')} €</span>
              </div>
            )}
            {addressStr && (
              <div className="col-span-2">
                <span className="text-gray-400 block text-xs mb-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Adresse
                </span>
                <span className="text-gray-900">{addressStr}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1 pt-1">
            <Info className="w-3 h-3 shrink-0" />
            Ces informations proviennent du registre INSEE. Pour les modifier, mettez à jour votre SIREN sur{' '}
            <a href="https://www.infogreffe.fr" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">
              Infogreffe
            </a>.
          </p>
        </section>

        {/* Coordonnées modifiables */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Coordonnées
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email de contact
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@monentreprise.fr"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3" /> Téléphone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 1 23 45 67 89"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>
        </section>

        {/* Régimes fiscaux */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Régimes fiscaux
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Régime TVA</label>
              <select
                value={vatRegime}
                onChange={(e) => setVatRegime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              >
                <option value="">Non renseigné</option>
                <option value="none">Franchise en base (non assujetti)</option>
                <option value="quarterly">Trimestriel</option>
                <option value="monthly">Mensuel</option>
                <option value="annual">Annuel</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Régime comptable</label>
              <select
                value={accountingRegime}
                onChange={(e) => setAccountingRegime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              >
                <option value="">Non renseigné</option>
                <option value="micro">Micro-entreprise</option>
                <option value="simplified">Simplifié</option>
                <option value="real">Réel normal</option>
              </select>
            </div>
          </div>
        </section>

        {/* Établissements + choix pour la facturation */}
        {etablissements.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Établissements
            </h2>
            <p className="text-xs text-gray-400">
              Sélectionnez l'établissement qui apparaîtra sur vos factures.
            </p>
            <div className="space-y-2">
              {etablissements.map((etab) => {
                const isSelected = billingSiret === etab.siret || (!billingSiret && etab.siege)
                return (
                  <button
                    key={etab.siret}
                    onClick={() => setBillingSiret(etab.siret)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                      isSelected
                        ? 'border-orange-400 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-900">{etab.siret}</span>
                          {etab.siege && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                              Siège
                            </span>
                          )}
                        </div>
                        {etab.adresse && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {formatAddress(etab.adresse)}
                          </p>
                        )}
                        {etab.activite_principale && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            APE : {etab.activite_principale}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Bouton Enregistrer */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Sauvegardé
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1.5 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" />
              {saveError}
            </span>
          )}
        </div>

      </div>
    </div>
  )
}

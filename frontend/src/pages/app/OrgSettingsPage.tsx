// Kerpta — Page de configuration de la structure (siège, établissements, facturation, logo)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  Building,
  MapPin,
  Phone,
  Mail,
  Globe,
  Info,
  CheckCircle,
  AlertCircle,
  Loader2,
  ImagePlus,
  Trash2,
  Upload,
  PenLine,
  RefreshCw,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import CompanyInfoCard from '@/components/app/CompanyInfoCard'
import { InfoHint } from '@/components/ui/InfoHint'

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
  /** "A" = actif, "F" = fermé/cessé selon l'INSEE — un établissement fermé ne peut pas être sélectionné pour la facturation */
  etat?: string
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
  vat_exigibility?: string | null
  accounting_regime?: string | null
  rcs_city?: string | null
  capital?: string | null
  ape_code?: string | null
  billing_siret?: string | null
  website?: string | null
  manual_fields?: string[]
  has_logo?: boolean
  etablissements?: EtablissementOut[]
}

interface CompanyDetails {
  siren: string
  denomination?: string | null
  categorie_juridique_libelle?: string | null
  tva_intracom?: string | null
  activite_principale?: string | null
  siege?: EtablissementOut | null
  etablissements_actifs?: EtablissementOut[]
  nombre_etablissements_actifs?: number
}

interface OrgLogoOut {
  organization_id: string
  logo_b64: string
  original_name?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  width_px?: number | null
  height_px?: number | null
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  return `${Math.round(bytes / 1024)} KB`
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function OrgSettingsPage() {
  const { activeOrgId, orgs } = useAuthStore()
  const activeOrg = orgs?.find((o) => o.org_id === activeOrgId) ?? orgs?.[0] ?? null

  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [etablissements, setEtablissements] = useState<EtablissementOut[]>([])
  const [nombreEtabsTotal, setNombreEtabsTotal] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Champs modifiables — coordonnées
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [vatRegime, setVatRegime] = useState('')
  const [vatExigibility, setVatExigibility] = useState('encaissements')
  const [accountingRegime, setAccountingRegime] = useState('')
  const [billingSiret, setBillingSiret] = useState('')

  // Champs en mode manuel (par champ, synchronisables : name, legal_form, siren, siret, vat_number, ape_code, address)
  const [manualFields, setManualFields] = useState<string[]>([])
  // Données SIRENE cachées (pour restaurer lors du retour en auto)
  const [sireneData, setSireneData] = useState<CompanyDetails | null>(null)

  // Champs légaux éditables
  const [editName, setEditName] = useState('')
  const [editLegalForm, setEditLegalForm] = useState('')
  const [editSiret, setEditSiret] = useState('')
  const [editSiren, setEditSiren] = useState('')
  const [editVatNumber, setEditVatNumber] = useState('')
  const [editApeCode, setEditApeCode] = useState('')
  const [editRcsCity, setEditRcsCity] = useState('')
  const [editCapital, setEditCapital] = useState('')
  const [editAddrVoie, setEditAddrVoie] = useState('')
  const [editAddrComplement, setEditAddrComplement] = useState('')
  const [editAddrCp, setEditAddrCp] = useState('')
  const [editAddrCommune, setEditAddrCommune] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Logo
  const [currentLogo, setCurrentLogo] = useState<OrgLogoOut | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoDeleting, setLogoDeleting] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoSuccess, setLogoSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Info-bulle aide auto/manuel


  // Chargement initial
  useEffect(() => {
    if (!activeOrg) return

    async function load() {
      setLoading(true)
      setLoadError(null)
      // Reset des données de l'org précédente
      setCurrentLogo(null)
      setLogoPreview(null)
      setLogoFile(null)
      setLogoError(null)
      setLogoSuccess(false)
      setEtablissements([])
      setNombreEtabsTotal(0)
      try {
        const { data } = await apiClient.get<OrgDetail>(`/organizations/${activeOrg!.org_id}`)
        setOrg(data)
        setEmail(data.email ?? '')
        setPhone(data.phone ?? '')
        setWebsite(data.website ?? '')
        setVatRegime(data.vat_regime ?? '')
        setVatExigibility(data.vat_exigibility ?? 'encaissements')
        setAccountingRegime(data.accounting_regime ?? '')
        setBillingSiret(data.billing_siret ?? '')
        setManualFields(data.manual_fields ?? [])

        // Champs légaux éditables
        setEditName(data.org_name ?? '')
        setEditLegalForm(data.legal_form ?? '')
        setEditSiret(data.org_siret ?? '')
        setEditSiren(data.org_siren ?? '')
        setEditVatNumber(data.vat_number ?? '')
        setEditApeCode(data.ape_code ?? '')
        setEditRcsCity(data.rcs_city ?? '')
        setEditCapital(data.capital ?? '')
        const addr = data.address as AddressOut | null
        setEditAddrVoie(addr?.voie ?? '')
        setEditAddrComplement(addr?.complement ?? '')
        setEditAddrCp(addr?.code_postal ?? '')
        setEditAddrCommune(addr?.commune ?? '')

        // Charger le logo si présent
        if (data.has_logo) {
          try {
            const { data: logo } = await apiClient.get<OrgLogoOut>(
              `/organizations/${activeOrg!.org_id}/logo`
            )
            setCurrentLogo(logo)
          } catch {
            // Logo introuvable — pas critique
          }
        }

        // Charger les établissements et données SIRENE si on a un SIREN
        if (data.org_siren) {
          try {
            const { data: company } = await apiClient.get<CompanyDetails>(`/companies/${data.org_siren}`)
            setSireneData(company)
            const etabs = company?.etablissements_actifs?.length
              ? company.etablissements_actifs
              : company?.siege ? [company.siege] : []
            setEtablissements(etabs)
            setNombreEtabsTotal(company?.nombre_etablissements_actifs ?? etabs.length)
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

  // Sélection d'un fichier logo (preview local immédiate)
  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoError(null)
    setLogoSuccess(false)

    // Vérif côté client (5 MB max)
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Le fichier est trop volumineux (max 5 MB)')
      return
    }

    const accepted = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!accepted.includes(file.type)) {
      setLogoError('Format non supporté. Formats acceptés : PNG, JPG, WebP')
      return
    }

    setLogoFile(file)
    // Aperçu local immédiat
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleLogoUpload() {
    if (!org || !logoFile) return
    setLogoUploading(true)
    setLogoError(null)
    setLogoSuccess(false)
    try {
      const formData = new FormData()
      formData.append('file', logoFile)
      const { data } = await apiClient.post<OrgLogoOut>(
        `/organizations/${org.org_id}/logo`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setCurrentLogo(data)
      setLogoPreview(null)
      setLogoFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setOrg((prev) => prev ? { ...prev, has_logo: true } : prev)
      setLogoSuccess(true)
    } catch (err) {
      setLogoError(httpError(err, 'Erreur lors de l\'upload du logo'))
    } finally {
      setLogoUploading(false)
    }
  }

  function handleLogoCancelPreview() {
    setLogoFile(null)
    setLogoPreview(null)
    setLogoError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleLogoDelete() {
    if (!org) return
    setLogoDeleting(true)
    setLogoError(null)
    setLogoSuccess(false)
    try {
      await apiClient.delete(`/organizations/${org.org_id}/logo`)
      setCurrentLogo(null)
      setOrg((prev) => prev ? { ...prev, has_logo: false } : prev)
    } catch (err) {
      setLogoError(httpError(err, 'Erreur lors de la suppression du logo'))
    } finally {
      setLogoDeleting(false)
    }
  }

  // Formes juridiques sans capital social
  const formsWithoutCapital = ['EI', 'AE']
  const currentLegalForm = manualFields.includes('legal_form') ? editLegalForm : (org?.legal_form ?? '')
  const hasCapital = !formsWithoutCapital.includes(currentLegalForm)

  // Champs synchronisables depuis data.gouv / SIRENE
  const syncableFields = ['name', 'legal_form', 'siren', 'siret', 'vat_number', 'ape_code', 'address'] as const
  type SyncableField = typeof syncableFields[number]

  /** Vérifie si un champ est en mode manuel */
  function isManual(field: SyncableField): boolean {
    return manualFields.includes(field)
  }

  /** Bascule un champ entre auto et manuel */
  function toggleFieldManual(field: SyncableField) {
    if (isManual(field)) {
      // Retour en auto — restaurer la valeur SIRENE depuis le cache
      setManualFields((prev) => prev.filter((f) => f !== field))
      if (sireneData) {
        const siege = sireneData.siege ?? null
        switch (field) {
          case 'name':
            setEditName(sireneData.denomination ?? org?.org_name ?? '')
            break
          case 'legal_form':
            setEditLegalForm(org?.legal_form ?? '')
            break
          case 'siren':
            setEditSiren(sireneData.siren ?? '')
            break
          case 'siret':
            setEditSiret(siege?.siret ?? org?.org_siret ?? '')
            break
          case 'vat_number':
            setEditVatNumber(sireneData.tva_intracom ?? org?.vat_number ?? '')
            break
          case 'ape_code':
            setEditApeCode(siege?.activite_principale ?? sireneData.activite_principale ?? '')
            break
          case 'address':
            if (siege?.adresse) {
              setEditAddrVoie(siege.adresse.voie ?? '')
              setEditAddrComplement(siege.adresse.complement ?? '')
              setEditAddrCp(siege.adresse.code_postal ?? '')
              setEditAddrCommune(siege.adresse.commune ?? '')
            }
            break
        }
      }
    } else {
      // Passage en manuel — on garde la valeur actuelle
      setManualFields((prev) => [...prev, field])
    }
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      const payload: Record<string, unknown> = {}
      // Champs toujours éditables
      if (email !== (org.email ?? '')) payload.email = email || null
      if (phone !== (org.phone ?? '')) payload.phone = phone || null
      if (website !== (org.website ?? '')) payload.website = website || null
      if (vatRegime !== (org.vat_regime ?? '')) payload.vat_regime = vatRegime || null
      if (vatExigibility !== (org.vat_exigibility ?? 'encaissements')) payload.vat_exigibility = vatExigibility || 'encaissements'
      if (accountingRegime !== (org.accounting_regime ?? '')) payload.accounting_regime = accountingRegime || null
      if (billingSiret !== (org.billing_siret ?? '')) payload.billing_siret = billingSiret || null

      // Toujours envoyer manual_fields (la liste des champs en mode manuel)
      const prevManual = org.manual_fields ?? []
      if (JSON.stringify(manualFields.sort()) !== JSON.stringify([...prevManual].sort())) {
        payload.manual_fields = manualFields
      }

      // Champs synchronisables — éditables seulement si en mode manuel
      if (manualFields.includes('name') && editName !== (org.org_name ?? '')) payload.name = editName || null
      if (manualFields.includes('legal_form') && editLegalForm !== (org.legal_form ?? '')) payload.legal_form = editLegalForm || null
      if (manualFields.includes('siret') && editSiret !== (org.org_siret ?? '')) payload.siret = editSiret || null
      if (manualFields.includes('siren') && editSiren !== (org.org_siren ?? '')) payload.siren = editSiren || null
      if (manualFields.includes('vat_number') && editVatNumber !== (org.vat_number ?? '')) payload.vat_number = editVatNumber || null
      if (manualFields.includes('ape_code') && editApeCode !== (org.ape_code ?? '')) payload.ape_code = editApeCode || null

      // Champs toujours éditables (pas dans SIRENE)
      if (editRcsCity !== (org.rcs_city ?? '')) payload.rcs_city = editRcsCity || null
      if (editCapital !== (org.capital ?? '')) payload.capital = editCapital ? parseFloat(editCapital) : null

      // Adresse — éditable si en mode manuel
      if (manualFields.includes('address')) {
        const prevAddr = org.address as AddressOut | null
        const addrChanged =
          editAddrVoie !== (prevAddr?.voie ?? '') ||
          editAddrComplement !== (prevAddr?.complement ?? '') ||
          editAddrCp !== (prevAddr?.code_postal ?? '') ||
          editAddrCommune !== (prevAddr?.commune ?? '')
        if (addrChanged) {
          payload.address = {
            voie: editAddrVoie || null,
            complement: editAddrComplement || null,
            code_postal: editAddrCp || null,
            commune: editAddrCommune || null,
          }
        }
      }

      if (Object.keys(payload).length === 0) {
        setSaveSuccess(true)
        return
      }

      await apiClient.patch(`/organizations/${org.org_id}`, payload)
      // Mettre à jour l'état local
      const updatedOrg = { ...org }
      if (payload.email !== undefined) updatedOrg.email = payload.email as string | null
      if (payload.phone !== undefined) updatedOrg.phone = payload.phone as string | null
      if (payload.website !== undefined) updatedOrg.website = payload.website as string | null
      if (payload.vat_regime !== undefined) updatedOrg.vat_regime = payload.vat_regime as string | null
      if (payload.vat_exigibility !== undefined) updatedOrg.vat_exigibility = payload.vat_exigibility as string | null
      if (payload.accounting_regime !== undefined) updatedOrg.accounting_regime = payload.accounting_regime as string | null
      if (payload.billing_siret !== undefined) updatedOrg.billing_siret = payload.billing_siret as string | null
      if (payload.manual_fields !== undefined) updatedOrg.manual_fields = payload.manual_fields as string[]
      if (payload.name !== undefined) updatedOrg.org_name = payload.name as string
      if (payload.legal_form !== undefined) updatedOrg.legal_form = payload.legal_form as string | null
      if (payload.siret !== undefined) updatedOrg.org_siret = payload.siret as string | null
      if (payload.siren !== undefined) updatedOrg.org_siren = payload.siren as string | null
      if (payload.vat_number !== undefined) updatedOrg.vat_number = payload.vat_number as string | null
      if (payload.ape_code !== undefined) updatedOrg.ape_code = payload.ape_code as string | null
      if (payload.rcs_city !== undefined) updatedOrg.rcs_city = payload.rcs_city as string | null
      if (payload.capital !== undefined) updatedOrg.capital = payload.capital != null ? String(payload.capital) : null
      if (payload.address !== undefined) updatedOrg.address = payload.address as Record<string, string> | null
      setOrg(updatedOrg)
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
  // Image à afficher dans la section logo : preview local en priorité, sinon logo actuel
  const displayedLogoSrc = logoPreview ?? currentLogo?.logo_b64 ?? null

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

        {/* Logo */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-gray-400" />
            Logo
          </h2>
          <p className="text-xs text-gray-400">
            Apparaît en haut de vos devis et factures. Format PNG, JPG ou WebP — max 5 MB.
            Le logo sera automatiquement redimensionné à 400×400 px maximum.
          </p>

          <div className="flex items-start gap-5">
            {/* Aperçu */}
            <div className={`relative w-28 h-28 rounded-xl border-2 flex items-center justify-center shrink-0 transition ${
              displayedLogoSrc
                ? 'border-orange-300 bg-orange-50'
                : 'border-dashed border-gray-200 bg-gray-50'
            }`}>
              {displayedLogoSrc ? (
                <img
                  src={displayedLogoSrc}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              ) : (
                <ImagePlus className="w-8 h-8 text-gray-300" />
              )}
              {logoPreview && (
                <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  Aperçu
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex-1 space-y-3">
              {/* Infos logo actuel */}
              {currentLogo && !logoPreview && (
                <div className="text-xs text-gray-400 space-y-0.5">
                  {currentLogo.original_name && (
                    <p className="truncate max-w-[200px]">{currentLogo.original_name}</p>
                  )}
                  {currentLogo.size_bytes && (
                    <p>{formatBytes(currentLogo.size_bytes)}{currentLogo.width_px && currentLogo.height_px ? ` · ${currentLogo.width_px}×${currentLogo.height_px} px` : ''}</p>
                  )}
                </div>
              )}

              {/* Input fichier (caché) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoFileChange}
              />

              {/* Boutons selon l'état */}
              {!logoPreview ? (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:border-orange-300 hover:text-orange-600 transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {currentLogo ? 'Changer le logo' : 'Choisir un logo'}
                  </button>
                  {currentLogo && (
                    <button
                      onClick={handleLogoDelete}
                      disabled={logoDeleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-100 text-red-500 rounded-lg hover:bg-red-50 hover:border-red-200 transition disabled:opacity-50"
                    >
                      {logoDeleting
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                      Supprimer
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleLogoUpload}
                    disabled={logoUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition disabled:opacity-60"
                  >
                    {logoUploading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Upload className="w-3.5 h-3.5" />
                    }
                    Enregistrer ce logo
                  </button>
                  <button
                    onClick={handleLogoCancelPreview}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    Annuler
                  </button>
                </div>
              )}

              {/* Messages retour logo */}
              {logoError && (
                <p className="flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {logoError}
                </p>
              )}
              {logoSuccess && (
                <p className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  Logo enregistré avec succès
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Informations légales — toggle auto/manuel par champ */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
              Informations légales
            </h2>
            <InfoHint size="md">
              <p className="font-medium text-gray-700 dark:text-gray-200">Mode auto / manuel par champ</p>
              <p>
                Les champs synchronisés depuis le SIRENE sont en lecture seule par défaut.
                Pour chaque champ, vous pouvez :
              </p>
              <ul className="space-y-1 ml-1">
                <li className="flex items-center gap-1.5">
                  <PenLine className="w-3 h-3 text-orange-500 dark:text-orange-400 shrink-0" />
                  <span>Passer en <strong>mode manuel</strong> pour saisir une valeur personnalisée</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 text-orange-500 dark:text-orange-400 shrink-0" />
                  <span>Revenir en <strong>mode auto</strong> pour restaurer la valeur SIRENE</span>
                </li>
              </ul>
              <p className="text-gray-500 dark:text-gray-400 pt-0.5">
                Le capital social et la ville RCS sont toujours éditables (absents du SIRENE).
              </p>
            </InfoHint>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {/* Dénomination */}
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs">Dénomination</span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('name')}
                  title={isManual('name') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('name')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('name') ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              ) : (
                <span className="font-medium text-gray-900">{org.org_name || '—'}</span>
              )}
            </div>

            {/* Forme juridique */}
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs">Forme juridique</span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('legal_form')}
                  title={isManual('legal_form') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('legal_form')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('legal_form') ? (
                <select
                  value={editLegalForm}
                  onChange={(e) => setEditLegalForm(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">Non renseigné</option>
                  <option value="SAS">SAS</option>
                  <option value="SASU">SASU</option>
                  <option value="SARL">SARL</option>
                  <option value="EURL">EURL</option>
                  <option value="SA">SA</option>
                  <option value="SNC">SNC</option>
                  <option value="SCI">SCI</option>
                  <option value="EI">EI (Entreprise Individuelle)</option>
                  <option value="AE">AE (Auto-Entrepreneur)</option>
                </select>
              ) : (
                <span className="font-medium text-gray-900">{org.legal_form || '—'}</span>
              )}
            </div>

            {/* SIREN */}
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs">SIREN</span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('siren')}
                  title={isManual('siren') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('siren')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('siren') ? (
                <input
                  type="text"
                  value={editSiren}
                  onChange={(e) => setEditSiren(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="123456789"
                  maxLength={9}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              ) : (
                <span className="font-mono text-gray-900">{org.org_siren || '—'}</span>
              )}
            </div>

            {/* SIRET siège */}
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs">SIRET siège</span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('siret')}
                  title={isManual('siret') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('siret')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('siret') ? (
                <input
                  type="text"
                  value={editSiret}
                  onChange={(e) => setEditSiret(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  placeholder="12345678901234"
                  maxLength={14}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              ) : (
                <span className="font-mono text-gray-900">{org.org_siret || '—'}</span>
              )}
            </div>

            {/* TVA intracommunautaire */}
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs">N° TVA intracommunautaire</span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('vat_number')}
                  title={isManual('vat_number') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('vat_number')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('vat_number') ? (
                <input
                  type="text"
                  value={editVatNumber}
                  onChange={(e) => setEditVatNumber(e.target.value)}
                  placeholder="FR12345678901"
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              ) : (
                <span className="font-mono text-gray-900">{org.vat_number || '—'}</span>
              )}
            </div>

            {/* Code APE */}
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs">Code APE</span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('ape_code')}
                  title={isManual('ape_code') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('ape_code')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('ape_code') ? (
                <input
                  type="text"
                  value={editApeCode}
                  onChange={(e) => setEditApeCode(e.target.value)}
                  placeholder="6201Z"
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              ) : (
                <span className="font-mono text-gray-900">{org.ape_code || '—'}</span>
              )}
            </div>

            {/* RCS — toujours éditable (pas dans SIRENE) */}
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">RCS de...</span>
              <input
                type="text"
                value={editRcsCity}
                onChange={(e) => setEditRcsCity(e.target.value)}
                placeholder="Paris"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            {/* Capital social — toujours éditable (pas dans SIRENE), masqué pour EI/AE */}
            {hasCapital && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Capital social</span>
                <div className="relative">
                  <input
                    type="number"
                    value={editCapital}
                    onChange={(e) => setEditCapital(e.target.value)}
                    placeholder="10000"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                </div>
              </div>
            )}

            {/* Adresse */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-400 text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Adresse
                </span>
                <button
                  type="button"
                  onClick={() => toggleFieldManual('address')}
                  title={isManual('address') ? 'Restaurer depuis SIRENE' : 'Modifier manuellement'}
                  className="text-gray-300 hover:text-orange-500 transition p-0.5"
                >
                  {isManual('address')
                    ? <RefreshCw className="w-3 h-3" />
                    : <PenLine className="w-3 h-3" />
                  }
                </button>
              </div>
              {isManual('address') ? (
                <>
                  <input
                    type="text"
                    value={editAddrVoie}
                    onChange={(e) => setEditAddrVoie(e.target.value)}
                    placeholder="Numéro et voie"
                    className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  <input
                    type="text"
                    value={editAddrComplement}
                    onChange={(e) => setEditAddrComplement(e.target.value)}
                    placeholder="Complément d'adresse (optionnel)"
                    className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editAddrCp}
                      onChange={(e) => setEditAddrCp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      placeholder="Code postal"
                      maxLength={5}
                      className="px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <input
                      type="text"
                      value={editAddrCommune}
                      onChange={(e) => setEditAddrCommune(e.target.value)}
                      placeholder="Commune"
                      className="px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </>
              ) : (
                <span className="text-gray-900">{addressStr || '—'}</span>
              )}
            </div>
          </div>
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
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Globe className="w-3 h-3" /> Site web
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.monentreprise.fr"
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
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                Régime de déclaration TVA
                <InfoHint>
                  <p className="font-medium text-gray-700 dark:text-gray-200">Fréquence de déclaration de TVA :</p>
                  <p>• <strong>Franchise en base</strong> : pas de TVA collectée ni déduite (micro-entrepreneurs, CA &lt; seuils).</p>
                  <p>• <strong>Trimestriel</strong> : déclaration CA3 tous les trimestres.</p>
                  <p>• <strong>Mensuel</strong> : déclaration CA3 chaque mois (TVA &gt; 4 000 €/an).</p>
                  <p>• <strong>Annuel</strong> : déclaration CA12 une fois par an (régime simplifié).</p>
                </InfoHint>
              </label>
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
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                Régime comptable
                <InfoHint>
                  <p className="font-medium text-gray-700 dark:text-gray-200">Régime d'imposition :</p>
                  <p>• <strong>Micro</strong> : comptabilité simplifiée, abattement forfaitaire sur le CA.</p>
                  <p>• <strong>Simplifié</strong> : bilan et compte de résultat simplifiés.</p>
                  <p>• <strong>Réel normal</strong> : comptabilité complète, obligatoire au-delà de certains seuils.</p>
                </InfoHint>
              </label>
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

          {/* Exigibilité TVA — visible uniquement si assujetti */}
          {vatRegime && vatRegime !== 'none' && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                Exigibilité de la TVA
                <InfoHint>
                  <p className="font-medium text-gray-700 dark:text-gray-200">Quand la TVA est-elle due ?</p>
                  <p>• <strong>Sur les encaissements</strong> : la TVA est due au moment où vous recevez le paiement du client. C'est le régime par défaut pour les prestations de services.</p>
                  <p>• <strong>Sur les débits</strong> : la TVA est due dès l'émission de la facture, qu'elle soit payée ou non. C'est le régime par défaut pour les ventes de biens.</p>
                  <p className="text-gray-500 dark:text-gray-400">Ce choix est un choix fiscal de l'entreprise qui apparaîtra sur vos factures.</p>
                </InfoHint>
              </label>
              <select
                value={vatExigibility}
                onChange={(e) => setVatExigibility(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white max-w-xs"
              >
                <option value="encaissements">Sur les encaissements</option>
                <option value="debits">Sur les débits</option>
              </select>
            </div>
          )}

          {vatRegime === 'none' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              En franchise en base, la mention « TVA non applicable, art. 293 B du CGI » sera ajoutée automatiquement à vos documents.
            </p>
          )}
        </section>

        {/* Établissements + choix pour la facturation */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Établissements
            </h2>
            {etablissements.length > 0 && (() => {
              const closedCount = etablissements.filter(e => e.etat === 'F').length
              const activeCount = etablissements.length - closedCount
              return (
                <div className="flex items-center gap-1.5">
                  {activeCount > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {activeCount} actif{activeCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {closedCount > 0 && (
                    <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">
                      {closedCount} fermé{closedCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>

          {etablissements.length === 0 && !org.org_siren && (
            <p className="text-xs text-gray-400">
              Aucun SIREN renseigné — les établissements ne peuvent pas être récupérés.
            </p>
          )}

          {etablissements.length === 0 && org.org_siren && (
            <p className="text-xs text-gray-400">
              Aucun établissement actif trouvé dans le registre INSEE.
            </p>
          )}

          {etablissements.length > 0 && (
            <>
              <p className="text-xs text-gray-500">
                Cochez l'établissement à faire apparaître sur vos devis, factures et bons de commande.
              </p>
              <div className="space-y-2">
                {etablissements.map((etab) => {
                  const isClosed = etab.etat === 'F'
                  const isSelected = !isClosed && (billingSiret
                    ? billingSiret === etab.siret
                    : etab.siege)
                  const siretFormatted = etab.siret.length === 14
                    ? `${etab.siret.slice(0, 3)} ${etab.siret.slice(3, 6)} ${etab.siret.slice(6, 9)} ${etab.siret.slice(9)}`
                    : etab.siret
                  return (
                    <button
                      key={etab.siret}
                      onClick={() => !isClosed && setBillingSiret(etab.siret)}
                      disabled={isClosed}
                      title={isClosed ? 'Établissement cessé — ne peut pas être sélectionné pour la facturation' : undefined}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${
                        isClosed
                          ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'border-orange-400 bg-orange-50'
                            : 'border-gray-200 hover:border-orange-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Radio visuel */}
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition ${
                          isClosed
                            ? 'border-gray-200 bg-gray-100'
                            : isSelected
                              ? 'border-orange-500 bg-orange-500'
                              : 'border-gray-300'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-mono text-sm tracking-wide ${isClosed ? 'text-gray-400' : 'text-gray-900'}`}>
                              {siretFormatted}
                            </span>
                            {etab.siege && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                                Siège social
                              </span>
                            )}
                            {isClosed && (
                              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium shrink-0">
                                Fermé
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                                Facturation
                              </span>
                            )}
                          </div>
                          {etab.adresse && (
                            <p className="text-xs text-gray-400 mt-1">
                              {formatAddress(etab.adresse)}
                            </p>
                          )}
                          {etab.activite_principale && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Code APE : {etab.activite_principale}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Note si l'API ne retourne pas tous les établissements */}
              {nombreEtabsTotal > etablissements.length && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  {nombreEtabsTotal - etablissements.length} établissement(s) supplémentaire(s) non affiché(s) — consultez{' '}
                  <a
                    href={`https://www.pappers.fr/entreprise/${org.org_siren}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:underline"
                  >
                    Pappers
                  </a>{' '}
                  pour la liste complète.
                </p>
              )}
            </>
          )}
        </section>

        {/* Données INSEE enrichies */}
        {org.org_siren && (
          <CompanyInfoCard siren={org.org_siren} hideIdentity />
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

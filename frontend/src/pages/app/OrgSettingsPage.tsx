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
  Users,
  Plus,
  UserPlus,
  X,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import CompanyInfoCard from '@/components/app/CompanyInfoCard'
import { InfoHint } from '@/components/ui/InfoHint'
import { BTN_SM } from '@/lib/formStyles'

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
  capital_variable?: boolean | null
  ape_code?: string | null
  billing_siret?: string | null
  website?: string | null
  objet_social?: string | null
  date_cloture_exercice?: string | null
  date_immatriculation_rcs?: string | null
  last_enriched_at?: string | null
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

interface ShareholderRepresentative {
  id: string
  first_name: string
  last_name: string
  quality?: string | null
  created_at: string
}

interface Shareholder {
  id: string
  type: 'physical' | 'legal'
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  company_siren?: string | null
  address?: Record<string, string> | null
  quality?: string | null
  shares_count?: number | null
  ownership_pct?: number | null
  entry_date?: string | null
  exit_date?: string | null
  representatives: ShareholderRepresentative[]
  created_at: string
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

  // Auto-save on blur — micro-feedback par champ
  const [savingField, setSavingField] = useState<string | null>(null)
  const [savedField, setSavedField] = useState<string | null>(null)

  // Logo
  const [currentLogo, setCurrentLogo] = useState<OrgLogoOut | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoDeleting, setLogoDeleting] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoSuccess, setLogoSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Actualisation enrichissement
  const [enriching, setEnriching] = useState(false)
  const [enrichSuccess, setEnrichSuccess] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)

  // Associés
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [shAdding, setShAdding] = useState(false)

  // Info-bulle aide auto/manuel

  /** Met à jour tous les états depuis les données org */
  function applyOrgData(data: OrgDetail) {
    setOrg(data)
    setEmail(data.email ?? '')
    setPhone(data.phone ?? '')
    setWebsite(data.website ?? '')
    setVatRegime(data.vat_regime ?? '')
    setVatExigibility(data.vat_exigibility ?? 'encaissements')
    setAccountingRegime(data.accounting_regime ?? '')
    setBillingSiret(data.billing_siret ?? '')
    setManualFields(data.manual_fields ?? [])
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
  }

  /** Vérifie si l'enrichissement est stale (jamais fait ou > 24h) */
  function isEnrichmentStale(data: OrgDetail): boolean {
    if (!data.org_siren) return false // Pas de SIREN → rien à enrichir
    if (!data.last_enriched_at) return true // Jamais enrichi
    const lastEnriched = new Date(data.last_enriched_at)
    const hoursAgo = (Date.now() - lastEnriched.getTime()) / (1000 * 60 * 60)
    return hoursAgo > 24
  }

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
        applyOrgData(data)

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

        // Charger les associés
        try {
          const { data: sh } = await apiClient.get<Shareholder[]>(
            `/organizations/${activeOrg!.org_id}/shareholders`
          )
          setShareholders(sh)
        } catch {
          // Pas critique
        }

        // Auto-enrichissement si données stale (> 24h ou jamais enrichies)
        if (isEnrichmentStale(data)) {
          setEnriching(true)
          try {
            await apiClient.post(`/organizations/${activeOrg!.org_id}/enrich`)
            // Recharger les données fraîches
            const { data: fresh } = await apiClient.get<OrgDetail>(`/organizations/${activeOrg!.org_id}`)
            applyOrgData(fresh)
            // Recharger aussi les établissements SIRENE
            if (fresh.org_siren) {
              try {
                const { data: company } = await apiClient.get<CompanyDetails>(`/companies/${fresh.org_siren}`)
                setSireneData(company)
                const etabs = company?.etablissements_actifs?.length
                  ? company.etablissements_actifs
                  : company?.siege ? [company.siege] : []
                setEtablissements(etabs)
                setNombreEtabsTotal(company?.nombre_etablissements_actifs ?? etabs.length)
              } catch {
                // Pas critique
              }
            }
          } catch {
            // Enrichissement auto échoué — pas critique, on garde les données existantes
          } finally {
            setEnriching(false)
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

  /** Actualise les données data.gouv + INPI pour cette organisation */
  async function handleEnrich() {
    if (!activeOrg) return
    setEnriching(true)
    setEnrichError(null)
    setEnrichSuccess(false)
    try {
      await apiClient.post(`/organizations/${activeOrg.org_id}/enrich`)
      // Recharger les données fraîches
      const { data } = await apiClient.get<OrgDetail>(`/organizations/${activeOrg.org_id}`)
      applyOrgData(data)
      setEnrichSuccess(true)
      setTimeout(() => setEnrichSuccess(false), 4000)
    } catch (err) {
      setEnrichError(httpError(err, "Erreur lors de l'actualisation"))
      setTimeout(() => setEnrichError(null), 5000)
    } finally {
      setEnriching(false)
    }
  }

  // ── CRUD Associés ───────────────────────────────────────────────────────────

  async function handleAddShareholder() {
    if (!org) return
    setShAdding(true)
    try {
      const { data } = await apiClient.post<Shareholder>(
        `/organizations/${org.org_id}/shareholders`,
        { type: 'physical' }
      )
      setShareholders((prev) => [...prev, data])
    } catch {
      // silent
    } finally {
      setShAdding(false)
    }
  }

  async function handleUpdateShareholder(shId: string, field: string, value: unknown) {
    if (!org) return
    try {
      const { data } = await apiClient.patch<Shareholder>(
        `/organizations/${org.org_id}/shareholders/${shId}`,
        { [field]: value || null }
      )
      setShareholders((prev) => prev.map((s) => (s.id === shId ? data : s)))
    } catch {
      // silent
    }
  }

  async function handleDeleteShareholder(shId: string) {
    if (!org) return
    try {
      await apiClient.delete(`/organizations/${org.org_id}/shareholders/${shId}`)
      setShareholders((prev) => prev.filter((s) => s.id !== shId))
    } catch {
      // silent
    }
  }

  async function handleAddRepresentative(shId: string) {
    if (!org) return
    try {
      const { data: rep } = await apiClient.post<ShareholderRepresentative>(
        `/organizations/${org.org_id}/shareholders/${shId}/representatives`,
        { first_name: '', last_name: '' }
      )
      setShareholders((prev) =>
        prev.map((s) =>
          s.id === shId ? { ...s, representatives: [...s.representatives, rep] } : s
        )
      )
    } catch {
      // silent
    }
  }

  async function handleUpdateRepresentative(shId: string, repId: string, field: string, value: string) {
    if (!org) return
    try {
      const { data: rep } = await apiClient.patch<ShareholderRepresentative>(
        `/organizations/${org.org_id}/shareholders/${shId}/representatives/${repId}`,
        { [field]: value || null }
      )
      setShareholders((prev) =>
        prev.map((s) =>
          s.id === shId
            ? { ...s, representatives: s.representatives.map((r) => (r.id === repId ? rep : r)) }
            : s
        )
      )
    } catch {
      // silent
    }
  }

  async function handleDeleteRepresentative(shId: string, repId: string) {
    if (!org) return
    try {
      await apiClient.delete(
        `/organizations/${org.org_id}/shareholders/${shId}/representatives/${repId}`
      )
      setShareholders((prev) =>
        prev.map((s) =>
          s.id === shId
            ? { ...s, representatives: s.representatives.filter((r) => r.id !== repId) }
            : s
        )
      )
    } catch {
      // silent
    }
  }

  // Formes juridiques sans capital social
  const formsWithoutCapital = ['EI', 'AE']
  const currentLegalForm = manualFields.includes('legal_form') ? editLegalForm : (org?.legal_form ?? '')
  const hasCapital = !formsWithoutCapital.includes(currentLegalForm)

  // Champs synchronisables depuis data.gouv / SIRENE / INPI
  const syncableFields = ['name', 'legal_form', 'siren', 'siret', 'vat_number', 'ape_code', 'address', 'capital', 'capital_variable', 'objet_social', 'date_cloture_exercice', 'date_immatriculation_rcs'] as const
  type SyncableField = typeof syncableFields[number]

  /** Vérifie si un champ est en mode manuel */
  function isManual(field: SyncableField): boolean {
    return manualFields.includes(field)
  }

  /** Bascule un champ entre auto et manuel — sauvegarde immédiatement */
  function toggleFieldManual(field: SyncableField) {
    if (isManual(field)) {
      // Retour en auto — restaurer la valeur SIRENE depuis le cache
      const newManualFields = manualFields.filter((f) => f !== field)
      setManualFields(newManualFields)
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
      void saveField('manual_fields', { manual_fields: newManualFields })
    } else {
      // Passage en manuel — on garde la valeur actuelle
      const newManualFields = [...manualFields, field]
      setManualFields(newManualFields)
      void saveField('manual_fields', { manual_fields: newManualFields })
    }
  }

  /** Sauvegarde un ou plusieurs champs vers l'API (auto-save on blur) */
  async function saveField(fieldKey: string, payload: Record<string, unknown>) {
    if (!org || Object.keys(payload).length === 0) return
    setSavingField(fieldKey)
    setSavedField(null)
    try {
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
      setSavedField(fieldKey)
      setTimeout(() => setSavedField((prev) => (prev === fieldKey ? null : prev)), 2000)
    } catch {
      // Silencieux — l'utilisateur verra que la valeur n'a pas changé au prochain rechargement
    } finally {
      setSavingField(null)
    }
  }

  /** Sauvegarde un champ texte si sa valeur a changé par rapport à l'état org */
  function blurSave(fieldKey: string, apiField: string, value: string, orgValue: string | null | undefined) {
    const current = value || null
    const original = orgValue ?? null
    if (current !== original) {
      void saveField(fieldKey, { [apiField]: current })
    }
  }

  /** Sauvegarde l'adresse complète (4 champs groupés) */
  function blurSaveAddress() {
    if (!org) return
    const prevAddr = org.address as AddressOut | null
    const addrChanged =
      editAddrVoie !== (prevAddr?.voie ?? '') ||
      editAddrComplement !== (prevAddr?.complement ?? '') ||
      editAddrCp !== (prevAddr?.code_postal ?? '') ||
      editAddrCommune !== (prevAddr?.commune ?? '')
    if (addrChanged) {
      void saveField('address', {
        address: {
          voie: editAddrVoie || null,
          complement: editAddrComplement || null,
          code_postal: editAddrCp || null,
          commune: editAddrCommune || null,
        },
      })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-kerpta animate-spin" />
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
            <Building className="w-5 h-5 text-kerpta" />
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
                ? 'border-kerpta-300 bg-kerpta-50'
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
                <span className="absolute -top-2 -right-2 bg-kerpta text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:border-kerpta-300 hover:text-kerpta-600 transition"
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
                    className={BTN_SM}
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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                Informations légales
              </h2>
              <button
                type="button"
                onClick={handleEnrich}
                disabled={enriching}
                title="Actualiser depuis data.gouv et INPI"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-kerpta-600 hover:bg-kerpta-50 rounded-md transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${enriching ? 'animate-spin' : ''}`} />
                {enriching ? 'Actualisation…' : 'Actualiser'}
              </button>
              {enrichSuccess && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Données à jour
                </span>
              )}
              {enrichError && (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {enrichError}
                </span>
              )}
            </div>
            <InfoHint size="md">
              <p className="font-medium text-gray-700 dark:text-gray-200">Mode auto / manuel par champ</p>
              <p>
                Les champs synchronisés depuis le SIRENE sont en lecture seule par défaut.
                Pour chaque champ, vous pouvez :
              </p>
              <ul className="space-y-1 ml-1">
                <li className="flex items-center gap-1.5">
                  <PenLine className="w-3 h-3 text-kerpta dark:text-kerpta-400 shrink-0" />
                  <span>Passer en <strong>mode manuel</strong> pour saisir une valeur personnalisée</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 text-kerpta dark:text-kerpta-400 shrink-0" />
                  <span>Revenir en <strong>mode auto</strong> pour restaurer la valeur SIRENE</span>
                </li>
              </ul>
              <p className="text-gray-500 dark:text-gray-400 pt-0.5">
                La ville RCS est toujours éditable. Le capital et l'objet social sont synchronisés depuis l'INPI.
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                  onBlur={() => blurSave('name', 'name', editName, org.org_name)}
                  className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                  onChange={(e) => {
                    setEditLegalForm(e.target.value)
                    void saveField('legal_form', { legal_form: e.target.value || null })
                  }}
                  className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                  onBlur={() => blurSave('siren', 'siren', editSiren, org.org_siren)}
                  placeholder="123456789"
                  maxLength={9}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                  onBlur={() => blurSave('siret', 'siret', editSiret, org.org_siret)}
                  placeholder="12345678901234"
                  maxLength={14}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                  onBlur={() => blurSave('vat_number', 'vat_number', editVatNumber, org.vat_number)}
                  placeholder="FR12345678901"
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                  onBlur={() => blurSave('ape_code', 'ape_code', editApeCode, org.ape_code)}
                  placeholder="6201Z"
                  className="w-full px-3 py-1.5 text-sm font-mono border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                onBlur={() => blurSave('rcs_city', 'rcs_city', editRcsCity, org.rcs_city)}
                placeholder="Paris"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
              />
            </div>

            {/* Capital social — syncable depuis INPI, masqué pour EI/AE */}
            {hasCapital && (
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-gray-400 text-xs">Capital social</span>
                  <button
                    type="button"
                    onClick={() => toggleFieldManual('capital')}
                    title={isManual('capital') ? 'Restaurer depuis INPI' : 'Modifier manuellement'}
                    className="text-gray-300 hover:text-kerpta transition p-0.5"
                  >
                    {isManual('capital')
                      ? <RefreshCw className="w-3 h-3" />
                      : <PenLine className="w-3 h-3" />
                    }
                  </button>
                </div>
                {isManual('capital') ? (
                  <div className="relative">
                    <input
                      type="number"
                      value={editCapital}
                      onChange={(e) => setEditCapital(e.target.value)}
                      onBlur={() => {
                        if (editCapital !== (org.capital ?? '')) {
                          void saveField('capital', { capital: editCapital ? parseFloat(editCapital) : null })
                        }
                      }}
                      placeholder="10000"
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-1.5 pr-8 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-700">
                    {org?.capital ? `${parseFloat(org.capital).toLocaleString('fr-FR')} €` : '—'}
                    {org?.capital_variable && <span className="text-gray-400 text-xs ml-1">(variable)</span>}
                  </span>
                )}
              </div>
            )}

            {/* Date d'immatriculation RCS — lecture seule depuis INPI */}
            {org?.date_immatriculation_rcs && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Immatriculation RCS</span>
                <span className="text-sm text-gray-700">
                  {new Date(org.date_immatriculation_rcs).toLocaleDateString('fr-FR')}
                </span>
              </div>
            )}

            {/* Date de clôture d'exercice — lecture seule depuis INPI */}
            {org?.date_cloture_exercice && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Clôture exercice</span>
                <span className="text-sm text-gray-700">
                  {org.date_cloture_exercice.length === 4
                    ? `${org.date_cloture_exercice.slice(0, 2)}/${org.date_cloture_exercice.slice(2)}`
                    : org.date_cloture_exercice}
                </span>
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
                  className="text-gray-300 hover:text-kerpta transition p-0.5"
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
                    onBlur={blurSaveAddress}
                    placeholder="Numéro et voie"
                    className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                  <input
                    type="text"
                    value={editAddrComplement}
                    onChange={(e) => setEditAddrComplement(e.target.value)}
                    onBlur={blurSaveAddress}
                    placeholder="Complément d'adresse (optionnel)"
                    className="w-full px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editAddrCp}
                      onChange={(e) => setEditAddrCp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      onBlur={blurSaveAddress}
                      placeholder="Code postal"
                      maxLength={5}
                      className="px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                    />
                    <input
                      type="text"
                      value={editAddrCommune}
                      onChange={(e) => setEditAddrCommune(e.target.value)}
                      onBlur={blurSaveAddress}
                      placeholder="Commune"
                      className="px-3 py-1.5 text-sm border border-amber-300 bg-amber-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                    />
                  </div>
                </>
              ) : (
                <span className="text-gray-900">{addressStr || '—'}</span>
              )}
            </div>

            {/* Objet social — lecture seule depuis INPI */}
            {org?.objet_social && (
              <div className="col-span-2">
                <span className="text-gray-400 block text-xs mb-0.5">Objet social</span>
                <p className="text-sm text-gray-700 leading-relaxed">{org.objet_social}</p>
              </div>
            )}
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
                onBlur={() => blurSave('email', 'email', email, org.email)}
                placeholder="contact@monentreprise.fr"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                onBlur={() => blurSave('phone', 'phone', phone, org.phone)}
                placeholder="+33 1 23 45 67 89"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                onBlur={() => blurSave('website', 'website', website, org.website)}
                placeholder="https://www.monentreprise.fr"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
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
                onChange={(e) => {
                  setVatRegime(e.target.value)
                  void saveField('vat_regime', { vat_regime: e.target.value || null })
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300 bg-white"
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
                onChange={(e) => {
                  setAccountingRegime(e.target.value)
                  void saveField('accounting_regime', { accounting_regime: e.target.value || null })
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300 bg-white"
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
                onChange={(e) => {
                  setVatExigibility(e.target.value)
                  void saveField('vat_exigibility', { vat_exigibility: e.target.value || 'encaissements' })
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300 bg-white max-w-xs"
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
                      onClick={() => {
                        if (!isClosed) {
                          setBillingSiret(etab.siret)
                          void saveField('billing_siret', { billing_siret: etab.siret })
                        }
                      }}
                      disabled={isClosed}
                      title={isClosed ? 'Établissement cessé — ne peut pas être sélectionné pour la facturation' : undefined}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${
                        isClosed
                          ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'border-kerpta-400 bg-kerpta-50'
                            : 'border-gray-200 hover:border-kerpta-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Radio visuel */}
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition ${
                          isClosed
                            ? 'border-gray-200 bg-gray-100'
                            : isSelected
                              ? 'border-kerpta bg-kerpta'
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
                              <span className="text-xs bg-kerpta-100 text-kerpta-700 px-1.5 py-0.5 rounded font-medium shrink-0">
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
                    className="text-kerpta hover:underline"
                  >
                    Pappers
                  </a>{' '}
                  pour la liste complète.
                </p>
              )}
            </>
          )}
        </section>

        {/* Associés */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Associés
            </h2>
            <button
              onClick={handleAddShareholder}
              disabled={shAdding}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-kerpta-600 bg-kerpta-50 hover:bg-kerpta-100 rounded-lg transition disabled:opacity-60"
            >
              {shAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Ajouter
            </button>
          </div>

          {shareholders.length === 0 && (
            <p className="text-xs text-gray-400">
              Aucun associé enregistré. Ajoutez vos associés pour pouvoir générer les PV d'AG.
            </p>
          )}

          {shareholders.map((sh) => (
            <div key={sh.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              {/* En-tête associé : type toggle + suppression */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <select
                    value={sh.type}
                    onChange={(e) => handleUpdateShareholder(sh.id, 'type', e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300 bg-white"
                  >
                    <option value="physical">Personne physique</option>
                    <option value="legal">Personne morale</option>
                  </select>
                </div>
                <button
                  onClick={() => handleDeleteShareholder(sh.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition"
                  title="Supprimer cet associé"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Champs personne physique */}
              {sh.type === 'physical' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prénom</label>
                    <input
                      type="text"
                      defaultValue={sh.first_name ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== (sh.first_name ?? ''))
                          handleUpdateShareholder(sh.id, 'first_name', e.target.value)
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nom</label>
                    <input
                      type="text"
                      defaultValue={sh.last_name ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== (sh.last_name ?? ''))
                          handleUpdateShareholder(sh.id, 'last_name', e.target.value)
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                    />
                  </div>
                </div>
              )}

              {/* Champs personne morale */}
              {sh.type === 'legal' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Dénomination sociale</label>
                      <input
                        type="text"
                        defaultValue={sh.company_name ?? ''}
                        onBlur={(e) => {
                          if (e.target.value !== (sh.company_name ?? ''))
                            handleUpdateShareholder(sh.id, 'company_name', e.target.value)
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SIREN</label>
                      <input
                        type="text"
                        defaultValue={sh.company_siren ?? ''}
                        maxLength={9}
                        onBlur={(e) => {
                          if (e.target.value !== (sh.company_siren ?? ''))
                            handleUpdateShareholder(sh.id, 'company_siren', e.target.value)
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300 font-mono"
                      />
                    </div>
                  </div>

                  {/* Représentants */}
                  <div className="ml-4 border-l-2 border-kerpta-200 pl-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">Représentants</span>
                      <button
                        onClick={() => handleAddRepresentative(sh.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-kerpta-600 hover:bg-kerpta-50 rounded transition"
                      >
                        <UserPlus className="w-3 h-3" /> Ajouter
                      </button>
                    </div>
                    {sh.representatives.length === 0 && (
                      <p className="text-xs text-gray-400 italic">Aucun représentant</p>
                    )}
                    {sh.representatives.map((rep) => (
                      <div key={rep.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          defaultValue={rep.first_name}
                          placeholder="Prénom"
                          onBlur={(e) => {
                            if (e.target.value !== rep.first_name)
                              handleUpdateRepresentative(sh.id, rep.id, 'first_name', e.target.value)
                          }}
                          className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                        />
                        <input
                          type="text"
                          defaultValue={rep.last_name}
                          placeholder="Nom"
                          onBlur={(e) => {
                            if (e.target.value !== rep.last_name)
                              handleUpdateRepresentative(sh.id, rep.id, 'last_name', e.target.value)
                          }}
                          className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                        />
                        <input
                          type="text"
                          defaultValue={rep.quality ?? ''}
                          placeholder="Qualité"
                          onBlur={(e) => {
                            if (e.target.value !== (rep.quality ?? ''))
                              handleUpdateRepresentative(sh.id, rep.id, 'quality', e.target.value)
                          }}
                          className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                        />
                        <button
                          onClick={() => handleDeleteRepresentative(sh.id, rep.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition shrink-0"
                          title="Supprimer ce représentant"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Champs communs */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Qualité</label>
                  <input
                    type="text"
                    defaultValue={sh.quality ?? ''}
                    placeholder="Gérant, président…"
                    onBlur={(e) => {
                      if (e.target.value !== (sh.quality ?? ''))
                        handleUpdateShareholder(sh.id, 'quality', e.target.value)
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nb de parts</label>
                  <input
                    type="number"
                    defaultValue={sh.shares_count ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value ? parseInt(e.target.value) : null
                      if (v !== (sh.shares_count ?? null))
                        handleUpdateShareholder(sh.id, 'shares_count', v)
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">% détention</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={sh.ownership_pct ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : null
                      if (v !== (sh.ownership_pct ?? null))
                        handleUpdateShareholder(sh.id, 'ownership_pct', v)
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date d'entrée</label>
                  <input
                    type="date"
                    defaultValue={sh.entry_date ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (sh.entry_date ?? ''))
                        handleUpdateShareholder(sh.id, 'entry_date', e.target.value || null)
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                </div>
              </div>

              {/* Date de sortie (optionnel) */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date de sortie</label>
                  <input
                    type="date"
                    defaultValue={sh.exit_date ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (sh.exit_date ?? ''))
                        handleUpdateShareholder(sh.id, 'exit_date', e.target.value || null)
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 mb-1">Adresse</label>
                  <input
                    type="text"
                    defaultValue={sh.address ? [sh.address.voie, sh.address.code_postal, sh.address.commune].filter(Boolean).join(', ') : ''}
                    placeholder="12 rue de la Paix, 75002 Paris"
                    onBlur={(e) => {
                      const val = e.target.value.trim()
                      if (!val) {
                        handleUpdateShareholder(sh.id, 'address', null)
                        return
                      }
                      // Parse simple : tout en voie
                      const parts = val.split(',').map(p => p.trim())
                      const addr: Record<string, string> = {}
                      if (parts.length >= 1) addr.voie = parts[0]
                      if (parts.length >= 2) {
                        // Essayer de séparer code postal et commune
                        const match = parts[1].match(/^(\d{5})\s+(.+)$/)
                        if (match) {
                          addr.code_postal = match[1]
                          addr.commune = match[2]
                        } else {
                          addr.commune = parts[1]
                        }
                      }
                      if (parts.length >= 3) addr.commune = parts[2]
                      handleUpdateShareholder(sh.id, 'address', addr)
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-300"
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Données INSEE enrichies */}
        {org.org_siren && (
          <CompanyInfoCard siren={org.org_siren} hideIdentity />
        )}

        {/* Indicateur de sauvegarde automatique */}
        {(savingField || savedField) && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 justify-end">
            {savingField && <Loader2 className="w-3 h-3 animate-spin text-kerpta-400" />}
            {savingField && 'Enregistrement…'}
            {!savingField && savedField && (
              <>
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-green-600">Sauvegardé</span>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

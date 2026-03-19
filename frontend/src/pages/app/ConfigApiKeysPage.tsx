// Kerpta — Page de configuration des clés API
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Sections : Providers OAuth + APIs externes (INPI)

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldOff,
  X,
} from 'lucide-react'
import { BTN } from '@/lib/formStyles'
import PageLayout from '@/components/app/PageLayout'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProviderCfg {
  enabled: boolean
  client_id: string
  client_secret: string
}

interface ApiKeysData {
  auth_url: string
  oauth_config: Record<string, ProviderCfg>
  api_keys: Record<string, Record<string, string>>
}

// ── Zod Schemas ─────────────────────────────────────────────────────────────

const inpiSchema = z.object({
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis'),
})
type InpiFormData = z.infer<typeof inpiSchema>

const s3Schema = z.object({
  endpoint: z.string().min(1, 'Endpoint requis'),
  access_key: z.string().min(1, 'Access Key requis'),
  secret_key: z.string(),
  bucket: z.string().min(1, 'Bucket requis'),
  region: z.string(),
  base_path: z.string(),
})
type S3FormData = z.infer<typeof s3Schema>

// Lien vers la console développeur de chaque provider
const PROVIDER_CONSOLE: Record<string, { url: string; label: string; hint: string }> = {
  google: {
    url: 'https://console.cloud.google.com/apis/credentials',
    label: 'Google Cloud Console',
    hint: 'Créer un projet → API & Services → Credentials → OAuth 2.0 Client ID (type : Web application). Ajouter {auth_url}/auth/v1/callback dans "Authorized redirect URIs".',
  },
  microsoft: {
    url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
    label: 'Azure Portal — App Registrations',
    hint: 'Nouveau enregistrement → Comptes : "Any AAD directory + personal" → URI de redirection : {auth_url}/auth/v1/callback. Copier Application (client) ID et créer un Client Secret.',
  },
  github: {
    url: 'https://github.com/settings/developers',
    label: 'GitHub Developer Settings',
    hint: 'OAuth Apps → New OAuth App. Authorization callback URL : {auth_url}/auth/v1/callback. Générer un Client Secret.',
  },
  apple: {
    url: 'https://developer.apple.com/account/resources/identifiers/list/serviceId',
    label: 'Apple Developer — Services IDs',
    hint: "Créer un Services ID → activer \"Sign In with Apple\" → configurer le domaine et l'URL de retour : {auth_url}/auth/v1/callback.",
  },
  linkedin: {
    url: 'https://www.linkedin.com/developers/apps',
    label: 'LinkedIn Developers',
    hint: 'Create app → Products → "Sign In with LinkedIn using OpenID Connect". Redirect URL : {auth_url}/auth/v1/callback.',
  },
  facebook: {
    url: 'https://developers.facebook.com/apps',
    label: 'Meta for Developers',
    hint: 'Create App → Facebook Login → Settings. OAuth Redirect URI : {auth_url}/auth/v1/callback.',
  },
  twitter: {
    url: 'https://developer.twitter.com/en/portal/dashboard',
    label: 'Twitter Developer Portal',
    hint: 'Créer un projet et une application → Keys and tokens. Activer OAuth 2.0 et ajouter {auth_url}/auth/v1/callback comme Callback URI.',
  },
  discord: {
    url: 'https://discord.com/developers/applications',
    label: 'Discord Developer Portal',
    hint: 'New Application → OAuth2 → Add Redirect : {auth_url}/auth/v1/callback. Copier Client ID et reset le Client Secret.',
  },
  salesforce: {
    url: 'https://login.salesforce.com',
    label: 'Salesforce Setup',
    hint: "Setup → Apps → App Manager → New Connected App. Callback URL : {auth_url}/auth/v1/callback. Activer \"Enable OAuth Settings\".",
  },
}

const KNOWN_PROVIDERS = [
  { key: 'google', label: 'Google' },
  { key: 'microsoft', label: 'Microsoft' },
  { key: 'github', label: 'GitHub' },
  { key: 'apple', label: 'Apple' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'twitter', label: 'X (Twitter)' },
  { key: 'discord', label: 'Discord' },
  { key: 'salesforce', label: 'Salesforce' },
]

// ── Composants utilitaires ────────────────────────────────────────────────────

function StatusBadge({ ok, message }: { ok: boolean | null; message: string }) {
  if (ok === null) return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
        ok
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-red-50 text-red-600 border border-red-200'
      }`}
    >
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {message}
    </span>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  registration,
  error,
}: {
  label: string
  value?: string
  onChange?: (v: string) => void
  type?: string
  placeholder?: string
  registration?: ReturnType<ReturnType<typeof useForm>['register']>
  error?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg bg-gray-50 border text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-kerpta-400 focus:ring-1 focus:ring-kerpta-400/20 transition ${
          error ? 'border-red-300' : 'border-gray-200'
        }`}
        {...(registration
          ? registration
          : { value: value ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) }
        )}
      />
      {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
    </div>
  )
}

// ── Composant Provider OAuth ──────────────────────────────────────────────────

function ProviderRow({
  providerKey,
  label,
  config,
  authUrl,
  onChange,
}: {
  providerKey: string
  label: string
  config: ProviderCfg
  authUrl: string
  onChange: (cfg: ProviderCfg) => void
}) {
  const [expanded, setExpanded] = useState(config.enabled)
  const [showHelp, setShowHelp] = useState(false)

  const console_ = PROVIDER_CONSOLE[providerKey]
  const helpHint = console_?.hint.replace(/{auth_url}/g, authUrl || '…') ?? ''

  return (
    <div
      className={`rounded-xl border transition-all ${
        config.enabled ? 'border-kerpta-300 bg-kerpta-50' : 'border-gray-200 bg-white'
      }`}
    >
      {/* En-tête du provider */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          {/* Toggle actif/inactif */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              const next = !config.enabled
              onChange({ ...config, enabled: next })
              if (next) setExpanded(true)
            }}
            className={`relative inline-flex rounded-full transition-colors focus:outline-none ${
              config.enabled ? 'bg-kerpta' : 'bg-gray-300'
            }`}
            style={{ minWidth: '2.5rem', height: '1.375rem' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${config.enabled ? 'text-gray-900' : 'text-gray-500'}`}
          >
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Bouton aide — ouvre la procédure inline */}
          {console_ && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowHelp((h) => !h)
                if (!expanded) setExpanded(true)
              }}
              title="Procédure de configuration"
              className="p-1 rounded-md text-gray-400 hover:text-kerpta-600 hover:bg-kerpta-50 transition"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Zone aide + champs client_id / client_secret */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Aide contextuelle */}
          {showHelp && console_ && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 leading-relaxed">
              <div className="font-semibold mb-1 flex items-center justify-between gap-2 flex-wrap">
                <span>Procédure {label}</span>
                <a
                  href={console_.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                >
                  {console_.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-blue-700">{helpHint}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField
              label="Client ID"
              value={config.client_id}
              onChange={(v) => onChange({ ...config, client_id: v })}
              placeholder="Identifiant OAuth"
            />
            <InputField
              label="Client Secret"
              value={config.client_secret}
              onChange={(v) => onChange({ ...config, client_secret: v })}
              type="password"
              placeholder="Secret OAuth"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ConfigApiKeysPage() {
  const { isAdmin } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiKeysData | null>(null)

  // État local des providers OAuth
  const [providers, setProviders] = useState<Record<string, ProviderCfg>>({})
  const [oauthSaving, setOauthSaving] = useState(false)
  const [oauthStatus, setOauthStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [restarting, setRestarting] = useState(false)

  // État local INPI (react-hook-form + Zod)
  const inpiForm = useForm<InpiFormData>({
    resolver: zodResolver(inpiSchema),
    defaultValues: { username: '', password: '' },
  })
  const [inpiStatus, setInpiStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [showInpiHelp, setShowInpiHelp] = useState(false)

  // État local S3 (react-hook-form + Zod)
  const s3Form = useForm<S3FormData>({
    resolver: zodResolver(s3Schema),
    defaultValues: { endpoint: '', access_key: '', secret_key: '', bucket: '', region: '', base_path: '' },
  })
  const [s3Status, setS3Status] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    // isAdmin === null : fetchMe pas encore terminé → on attend
    if (isAdmin === null) return
    if (!isAdmin) {
      setLoading(false)
      return
    }
    apiClient
      .get<ApiKeysData>('/config/api-keys')
      .then((d) => {
        setData(d)
        const initial: Record<string, ProviderCfg> = {}
        for (const { key } of KNOWN_PROVIDERS) {
          initial[key] = d.oauth_config[key] ?? { enabled: false, client_id: '', client_secret: '' }
        }
        setProviders(initial)
        // Charger les identifiants INPI existants
        const inpiData = d.api_keys?.inpi
        if (inpiData) {
          inpiForm.reset({
            username: inpiData.username || '',
            password: '', // Le mot de passe est masqué côté serveur
          })
        }
        // Charger la config S3 existante
        const s3Data = d.api_keys?.s3
        if (s3Data) {
          s3Form.reset({
            endpoint: s3Data.endpoint || '',
            access_key: s3Data.access_key || '',
            secret_key: '', // Le secret est masqué côté serveur
            bucket: s3Data.bucket || '',
            region: s3Data.region || '',
            base_path: s3Data.base_path || '',
          })
        }
      })
      .catch(() => {
        /* 401 → intercepteur redirige vers /login */
      })
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function saveOAuth() {
    setOauthSaving(true)
    setOauthStatus(null)
    try {
      await apiClient.put('/config/oauth', { providers })
      setOauthStatus({ ok: true, msg: 'Providers enregistrés' })
      setRestarting(true)
      setTimeout(() => setRestarting(false), 10000)
    } catch {
      setOauthStatus({ ok: false, msg: "Erreur lors de l'enregistrement" })
    } finally {
      setOauthSaving(false)
    }
  }

  async function saveInpi(values: InpiFormData) {
    setInpiStatus(null)
    try {
      await apiClient.put('/config/external-keys', {
        inpi: { username: values.username, password: values.password },
      })
      setInpiStatus({ ok: true, msg: 'Identifiants INPI enregistrés' })
    } catch {
      setInpiStatus({ ok: false, msg: "Erreur lors de l'enregistrement" })
    }
  }

  async function saveS3(values: S3FormData) {
    setS3Status(null)
    try {
      await apiClient.put('/config/external-keys', { s3: values })
      setS3Status({ ok: true, msg: 'Configuration S3 enregistrée' })
    } catch {
      setS3Status({ ok: false, msg: "Erreur lors de l'enregistrement" })
    }
  }

  // ── Accès non-admin ──
  if (!loading && isAdmin === false) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-gray-900 font-semibold mb-2">Accès restreint</h2>
          <p className="text-gray-500 text-sm">
            Cette page est réservée aux administrateurs de la plateforme.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-kerpta border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const authUrl = data?.auth_url ?? ''
  const hasInpiConfigured = !!(data?.api_keys?.inpi?.username)

  return (
    <PageLayout
      icon={<KeyRound className="w-5 h-5 text-kerpta" />}
      title="Cles API"
      subtitle="Providers OAuth et connexions aux APIs externes"
    >

        {/* ── Section INPI / RNE ──────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900">
                INPI — Registre National des Entreprises
              </h2>
            </div>
            {hasInpiConfigured && (
              <StatusBadge ok={true} message="Configuré" />
            )}
          </div>

          <p className="text-sm text-gray-600 mb-4">
            L'API INPI permet de récupérer automatiquement le <strong>capital social</strong>,
            l'<strong>objet social</strong>, la <strong>date de clôture d'exercice</strong> et
            la <strong>date d'immatriculation RCS</strong> — des données absentes de l'API publique
            data.gouv.
          </p>

          {/* Aide : comment créer un compte INPI */}
          <button
            onClick={() => setShowInpiHelp((h) => !h)}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium mb-4 transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Comment obtenir un compte API INPI ?
            {showInpiHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showInpiHelp && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 mb-4 text-xs text-blue-800 leading-relaxed space-y-2">
              <div className="font-semibold text-blue-900 flex items-center justify-between gap-2 flex-wrap">
                <span>Créer un compte API INPI (gratuit)</span>
                <a
                  href="https://data.inpi.fr/register"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                >
                  data.inpi.fr
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-blue-700">
                <li>
                  Se rendre sur{' '}
                  <a
                    href="https://data.inpi.fr/register"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-900"
                  >
                    data.inpi.fr/register
                  </a>{' '}
                  et créer un compte gratuit (email + mot de passe).
                </li>
                <li>
                  Valider l'email de confirmation reçu dans votre boîte mail.
                </li>
                <li>
                  Se connecter sur{' '}
                  <a
                    href="https://data.inpi.fr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-900"
                  >
                    data.inpi.fr
                  </a>{' '}
                  avec vos identifiants.
                </li>
                <li>
                  L'accès API est <strong>automatiquement activé</strong> avec le compte.
                  Il n'y a pas de clé API à générer — l'authentification se fait
                  par <strong>email + mot de passe</strong> directement.
                </li>
                <li>
                  Saisir ci-dessous l'email et le mot de passe du compte INPI.
                </li>
              </ol>
              <div className="mt-2 pt-2 border-t border-blue-200 text-blue-600 space-y-1">
                <p>
                  <strong>Quota :</strong> 10 000 requêtes/jour (largement suffisant).
                </p>
                <p>
                  <strong>Données fournies :</strong> capital social, objet social, date de clôture
                  d'exercice, date d'immatriculation RCS, durée de la société, dirigeants détaillés.
                </p>
              </div>
            </div>
          )}

          {/* Champs identifiants INPI */}
          <form onSubmit={inpiForm.handleSubmit(saveInpi)} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label="Email du compte INPI"
                registration={inpiForm.register('username')}
                error={inpiForm.formState.errors.username?.message}
                placeholder="contact@example.fr"
              />
              <InputField
                label="Mot de passe INPI"
                registration={inpiForm.register('password')}
                error={inpiForm.formState.errors.password?.message}
                type="password"
                placeholder="Mot de passe du compte"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={inpiForm.formState.isSubmitting}
                className={`${BTN} px-5 py-2.5 rounded-xl`}
              >
                {inpiForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
              {inpiStatus && <StatusBadge ok={inpiStatus.ok} message={inpiStatus.msg} />}
            </div>
          </form>
        </section>

        {/* ── Section S3 — Stockage plateforme ────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900">
                Stockage S3 — Backup plateforme
              </h2>
            </div>
            {!!(data?.api_keys?.s3?.endpoint) && (
              <StatusBadge ok={true} message="Configuré" />
            )}
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Le stockage S3 est utilisé pour sauvegarder <strong>tous les documents</strong> de la plateforme
            (factures, devis, pièces jointes, RIB…). Compatible OVH Object Storage, AWS S3, Scaleway, Backblaze B2.
          </p>

          <form onSubmit={s3Form.handleSubmit(saveS3)} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div>
              <InputField
                label="Endpoint URL *"
                registration={s3Form.register('endpoint')}
                error={s3Form.formState.errors.endpoint?.message}
                placeholder="https://s3.gra.io.cloud.ovh.net"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">URL du service S3 (OVH, AWS, Scaleway…)</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label="Access Key *"
                registration={s3Form.register('access_key')}
                error={s3Form.formState.errors.access_key?.message}
                placeholder="AKIAIOSFODNN7EXAMPLE"
              />
              <InputField
                label="Secret Key *"
                registration={s3Form.register('secret_key')}
                type="password"
                placeholder="wJalrXUtnFEMI/K7MDENG..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label="Bucket *"
                registration={s3Form.register('bucket')}
                error={s3Form.formState.errors.bucket?.message}
                placeholder="kerpta-documents"
              />
              <InputField
                label="Région"
                registration={s3Form.register('region')}
                placeholder="gra (optionnel)"
              />
            </div>

            <div>
              <InputField
                label="Chemin de base"
                registration={s3Form.register('base_path')}
                placeholder="kerpta/ (optionnel)"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Préfixe des fichiers dans le bucket</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={s3Form.formState.isSubmitting}
                className={`${BTN} px-5 py-2.5 rounded-xl`}
              >
                {s3Form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
              {s3Status && <StatusBadge ok={s3Status.ok} message={s3Status.msg} />}
            </div>
          </form>
        </section>

        {/* ── Section OAuth ─────────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Providers OAuth</h2>
          </div>

          {/* Notice statique — redémarrage GoTrue */}
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              <strong className="text-amber-900">Indisponibilité courte</strong> — Toute
              modification entraîne un redémarrage de GoTrue (serveur d'authentification).
              La connexion sera inaccessible environ{' '}
              <strong className="text-amber-900">5 à 10 secondes</strong> après la sauvegarde.
            </span>
          </div>

          {/* Bannière post-sauvegarde — redémarrage GoTrue en cours */}
          {restarting && (
            <div className="flex items-center gap-3 rounded-xl bg-kerpta-50 border border-kerpta-300 px-4 py-3 mb-4">
              <RefreshCw className="w-4 h-4 text-kerpta animate-spin shrink-0" />
              <p className="text-sm font-semibold text-kerpta-800">
                GoTrue redémarre — la connexion est temporairement indisponible (~10 s)
              </p>
            </div>
          )}

          {authUrl && (
            <p className="text-xs text-gray-500 mb-4">
              Instance GoTrue :{' '}
              <code className="text-gray-700 bg-gray-100 px-1 rounded">{authUrl}</code>
            </p>
          )}

          <div className="space-y-2 mb-4">
            {KNOWN_PROVIDERS.map(({ key, label }) => (
              <ProviderRow
                key={key}
                providerKey={key}
                label={label}
                authUrl={authUrl}
                config={providers[key] ?? { enabled: false, client_id: '', client_secret: '' }}
                onChange={(cfg) => setProviders((prev) => ({ ...prev, [key]: cfg }))}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveOAuth}
              disabled={oauthSaving}
              className={`${BTN} px-5 py-2.5 rounded-xl`}
            >
              {oauthSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer les providers
            </button>
            {oauthStatus && <StatusBadge ok={oauthStatus.ok} message={oauthStatus.msg} />}
          </div>
        </section>

    </PageLayout>
  )
}

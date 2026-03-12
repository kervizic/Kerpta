// Kerpta — Page de configuration des clés API
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Section 1 : Providers OAuth (Google, Microsoft, GitHub, …)
// Section 2 : INSEE / Sirene API (clé API unique — header X-INSEE-Api-Key-Integration)

import { useEffect, useState } from 'react'
import axios from 'axios'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldOff,
  X,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProviderCfg {
  enabled: boolean
  client_id: string
  client_secret: string
}

interface ApiKeysData {
  auth_url: string
  oauth_config: Record<string, ProviderCfg>
  api_keys: {
    insee_api_key: string
  }
}

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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 transition"
      />
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
        config.enabled ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'
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
              config.enabled ? 'bg-orange-500' : 'bg-gray-300'
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
              className="p-1 rounded-md text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition"
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
  const [restartCountdown, setRestartCountdown] = useState(0)

  // État local INSEE
  const [inseeApiKey, setInseeApiKey] = useState('')
  const [inseeSaving, setInseeSaving] = useState(false)
  const [inseeSaveStatus, setInseeSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [inseeTesting, setInseeTesting] = useState(false)
  const [inseeTestStatus, setInseeTestStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    // isAdmin === null : fetchMe pas encore terminé → on attend
    if (isAdmin === null) return
    if (!isAdmin) {
      setLoading(false)
      return
    }
    apiClient
      .get<ApiKeysData>('/config/api-keys')
      .then(({ data: d }) => {
        setData(d)
        const initial: Record<string, ProviderCfg> = {}
        for (const { key } of KNOWN_PROVIDERS) {
          initial[key] = d.oauth_config[key] ?? { enabled: false, client_id: '', client_secret: '' }
        }
        setProviders(initial)
        setInseeApiKey(d.api_keys.insee_api_key)
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
      // Compte à rebours de 10 secondes pendant le redémarrage de GoTrue
      const DURATION = 10
      setRestarting(true)
      setRestartCountdown(DURATION)
      const timer = setInterval(() => {
        setRestartCountdown((n) => {
          if (n <= 1) {
            clearInterval(timer)
            setRestarting(false)
            return 0
          }
          return n - 1
        })
      }, 1000)
    } catch {
      setOauthStatus({ ok: false, msg: "Erreur lors de l'enregistrement" })
    } finally {
      setOauthSaving(false)
    }
  }

  function httpErrorMsg(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      if (status === 403) return 'Accès refusé (403) — rechargez la page'
      if (status === 401) return 'Non authentifié (401) — reconnectez-vous'
      if (status === 422) return err.response?.data?.detail ?? `Données invalides (422)`
      if (status) return `Erreur serveur (${status})`
      return 'Serveur inaccessible — vérifiez votre connexion'
    }
    return fallback
  }

  async function saveInsee() {
    setInseeSaving(true)
    setInseeSaveStatus(null)
    try {
      await apiClient.put('/config/api-keys', { insee_api_key: inseeApiKey })
      setInseeSaveStatus({ ok: true, msg: 'Clé INSEE enregistrée' })
    } catch (err) {
      setInseeSaveStatus({ ok: false, msg: httpErrorMsg(err, "Erreur lors de l'enregistrement") })
    } finally {
      setInseeSaving(false)
    }
  }

  async function testInsee() {
    setInseeTesting(true)
    setInseeTestStatus(null)
    try {
      const { data: result } = await apiClient.post<{
        ok: boolean
        denomination?: string
        http_status?: number
        error?: string
      }>('/config/api-keys/insee-test')
      if (result.ok) {
        setInseeTestStatus({ ok: true, msg: `Connexion réussie ✓` })
      } else {
        setInseeTestStatus({ ok: false, msg: result.error ?? 'Échec de la connexion' })
      }
    } catch (err) {
      setInseeTestStatus({ ok: false, msg: httpErrorMsg(err, 'Erreur réseau') })
    } finally {
      setInseeTesting(false)
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
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const authUrl = data?.auth_url ?? ''

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Clés API</h1>
            <p className="text-sm text-gray-500">Providers OAuth et connexions aux APIs externes</p>
          </div>
        </div>

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

          {/* Bannière de compte à rebours post-sauvegarde */}
          {restarting && (
            <div className="flex items-center gap-3 rounded-xl bg-orange-50 border border-orange-300 px-4 py-3 mb-4">
              <RefreshCw className="w-4 h-4 text-orange-500 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-800">
                  GoTrue redémarre — connexion temporairement indisponible
                </p>
                <p className="text-xs text-orange-600 mt-0.5">
                  Disponible dans environ{' '}
                  <strong>{restartCountdown} seconde{restartCountdown > 1 ? 's' : ''}</strong>
                </p>
              </div>
              {/* Barre de progression */}
              <div className="w-16 h-1.5 rounded-full bg-orange-200 overflow-hidden shrink-0">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(restartCountdown / 10) * 100}%` }}
                />
              </div>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              {oauthSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer les providers
            </button>
            {oauthStatus && <StatusBadge ok={oauthStatus.ok} message={oauthStatus.msg} />}
          </div>
        </section>

        {/* Séparateur */}
        <div className="border-t border-gray-200 mb-10" />

        {/* ── Section INSEE ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">INSEE / Sirene API</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Recherche de sociétés par SIRET, SIREN, dénomination
              </p>
            </div>
            <a
              href="https://portail-api.insee.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 transition"
            >
              Portail INSEE
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-xs text-blue-800 leading-relaxed">
            <strong className="text-blue-900">Authentification par clé API</strong> — Inscrivez-vous
            sur le portail INSEE, créez une application et abonnez-vous à l'API Sirene. La clé est
            transmise dans le header{' '}
            <code className="text-orange-600 bg-white border border-orange-200 px-1 rounded">
              X-INSEE-Api-Key-Integration
            </code>{' '}
            à validité illimitée (révocable depuis le portail).
          </div>

          <div className="mb-4">
            <InputField
              label="Clé API INSEE"
              value={inseeApiKey}
              onChange={setInseeApiKey}
              type="password"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={saveInsee}
              disabled={inseeSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              {inseeSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </button>

            <button
              onClick={testInsee}
              disabled={inseeTesting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold transition"
            >
              {inseeTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Tester la connexion
            </button>

            {inseeSaveStatus && (
              <StatusBadge ok={inseeSaveStatus.ok} message={inseeSaveStatus.msg} />
            )}
            {inseeTestStatus && (
              <StatusBadge ok={inseeTestStatus.ok} message={inseeTestStatus.msg} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

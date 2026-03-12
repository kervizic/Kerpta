// Kerpta — Page de configuration des clés API
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Section 1 : Providers OAuth (Google, Microsoft, GitHub, …)
// Section 2 : INSEE / Sirene API (Consumer Key + Consumer Secret)

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
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
    insee_consumer_key: string
    insee_consumer_secret: string
  }
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
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
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
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition"
      />
    </div>
  )
}

// ── Composant Provider OAuth ──────────────────────────────────────────────────

function ProviderRow({
  label,
  config,
  onChange,
}: {
  providerKey: string
  label: string
  config: ProviderCfg
  onChange: (cfg: ProviderCfg) => void
}) {
  const [expanded, setExpanded] = useState(config.enabled)

  return (
    <div
      className={`rounded-xl border transition-all ${
        config.enabled
          ? 'border-indigo-500/30 bg-indigo-500/5'
          : 'border-white/5 bg-slate-800/30'
      }`}
    >
      {/* En-tête du provider */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          {/* Toggle actif */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              const next = !config.enabled
              onChange({ ...config, enabled: next })
              if (next) setExpanded(true)
            }}
            className={`relative inline-flex w-10 h-5.5 rounded-full transition-colors focus:outline-none ${
              config.enabled ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
            style={{ minWidth: '2.5rem', height: '1.375rem' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${config.enabled ? 'text-white' : 'text-slate-400'}`}>
            {label}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {/* Champs client_id / client_secret */}
      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ConfigApiKeysPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiKeysData | null>(null)

  // État local des providers OAuth
  const [providers, setProviders] = useState<Record<string, ProviderCfg>>({})
  const [oauthSaving, setOauthSaving] = useState(false)
  const [oauthStatus, setOauthStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [restarting, setRestarting] = useState(false)

  // État local INSEE
  const [inseeKey, setInseeKey] = useState('')
  const [inseeSecret, setInseeSecret] = useState('')
  const [inseeSaving, setInseeSaving] = useState(false)
  const [inseeSaveStatus, setInseeSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [inseeTesting, setInseeTesting] = useState(false)
  const [inseeTestStatus, setInseeTestStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    apiClient
      .get<ApiKeysData>('/config/api-keys')
      .then(({ data: d }) => {
        setData(d)
        // Initialise les providers avec les connus + les données existantes
        const initial: Record<string, ProviderCfg> = {}
        for (const { key } of KNOWN_PROVIDERS) {
          initial[key] = d.oauth_config[key] ?? { enabled: false, client_id: '', client_secret: '' }
        }
        setProviders(initial)
        setInseeKey(d.api_keys.insee_consumer_key)
        setInseeSecret(d.api_keys.insee_consumer_secret)
      })
      .catch(() => {
        /* 401 → apiClient intercepteur redirige vers /login */
      })
      .finally(() => setLoading(false))
  }, [])

  async function saveOAuth() {
    setOauthSaving(true)
    setOauthStatus(null)
    try {
      await apiClient.put('/config/oauth', { providers })
      setOauthStatus({ ok: true, msg: 'Enregistré — GoTrue redémarre…' })
      setRestarting(true)
      setTimeout(() => setRestarting(false), 8000)
    } catch {
      setOauthStatus({ ok: false, msg: 'Erreur lors de l\'enregistrement' })
    } finally {
      setOauthSaving(false)
    }
  }

  async function saveInsee() {
    setInseeSaving(true)
    setInseeSaveStatus(null)
    try {
      await apiClient.put('/config/api-keys', {
        insee_consumer_key: inseeKey,
        insee_consumer_secret: inseeSecret,
      })
      setInseeSaveStatus({ ok: true, msg: 'Clés INSEE enregistrées' })
    } catch {
      setInseeSaveStatus({ ok: false, msg: 'Erreur lors de l\'enregistrement' })
    } finally {
      setInseeSaving(false)
    }
  }

  async function testInsee() {
    setInseeTesting(true)
    setInseeTestStatus(null)
    try {
      const { data: result } = await apiClient.post<{ ok: boolean; expires_in?: number; error?: string }>(
        '/config/api-keys/insee-test'
      )
      if (result.ok) {
        const days = result.expires_in ? Math.round(result.expires_in / 86400) : 7
        setInseeTestStatus({ ok: true, msg: `Connexion réussie — token valide ${days} jours` })
      } else {
        setInseeTestStatus({ ok: false, msg: result.error ?? 'Échec de la connexion' })
      }
    } catch {
      setInseeTestStatus({ ok: false, msg: 'Erreur réseau' })
    } finally {
      setInseeTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Clés API</h1>
            <p className="text-sm text-slate-400">Providers OAuth et connexions aux APIs externes</p>
          </div>
        </div>

        {/* ── Section OAuth ─────────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Providers OAuth</h2>
            {restarting && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" />
                GoTrue en redémarrage…
              </span>
            )}
          </div>

          {data?.auth_url && (
            <p className="text-xs text-slate-500 mb-4">
              Instance GoTrue :{' '}
              <code className="text-slate-400 bg-slate-800 px-1 rounded">{data.auth_url}</code>
            </p>
          )}

          <div className="space-y-2 mb-4">
            {KNOWN_PROVIDERS.map(({ key, label }) => (
              <ProviderRow
                key={key}
                providerKey={key}
                label={label}
                config={providers[key] ?? { enabled: false, client_id: '', client_secret: '' }}
                onChange={(cfg) => setProviders((prev) => ({ ...prev, [key]: cfg }))}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveOAuth}
              disabled={oauthSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              {oauthSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer les providers
            </button>
            {oauthStatus && <StatusBadge ok={oauthStatus.ok} message={oauthStatus.msg} />}
          </div>
        </section>

        {/* Séparateur */}
        <div className="border-t border-white/5 mb-10" />

        {/* ── Section INSEE ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">INSEE / Sirene API</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Recherche de sociétés par SIRET, SIREN, dénomination
              </p>
            </div>
            <a
              href="https://portail-api.insee.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              Portail INSEE
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 mb-4 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Flux OAuth2 client_credentials</strong> — Inscrivez-vous
            sur le portail INSEE et créez une application pour obtenir votre Consumer Key et Consumer
            Secret. Le token généré (Bearer) est valide 7 jours et se renouvelle automatiquement.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <InputField
              label="Consumer Key"
              value={inseeKey}
              onChange={setInseeKey}
              placeholder="votre_consumer_key"
            />
            <InputField
              label="Consumer Secret"
              value={inseeSecret}
              onChange={setInseeSecret}
              type="password"
              placeholder={inseeSecret.startsWith('••••') ? inseeSecret : 'votre_consumer_secret'}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={saveInsee}
              disabled={inseeSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              {inseeSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </button>

            <button
              onClick={testInsee}
              disabled={inseeTesting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white text-sm font-semibold transition"
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

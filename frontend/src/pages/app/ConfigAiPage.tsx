// Kerpta — Page de configuration Intelligence Artificielle (super-admin)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { adminClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Zap,
  X,
  Circle,
  BarChart3,
  Settings2,
  Cpu,
  Eye,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { BTN_SM, BTN_SECONDARY, INPUT, SELECT, CARD, OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER } from '@/lib/formStyles'
import PageLayout from '@/components/app/PageLayout'

// ── Types ────────────────────────────────────────────────────────────────────

interface AiProvider {
  id: string
  name: string
  type: string
  base_url: string | null
  is_active: boolean
  last_check_at: string | null
  last_check_ok: boolean | null
  model_count: number
}

interface AiModel {
  id: string
  provider_id: string
  provider_name: string
  provider_type: string
  model_id: string
  display_name: string
  capabilities: string[] | null
  context_window: number | null
  is_active: boolean
}

interface AiConfig {
  ai_enabled: boolean
  ai_litellm_base_url: string | null
  has_master_key: boolean
  ai_features: Record<string, boolean> | null
  roles: { vl: AiModel | null; instruct: AiModel | null; thinking: AiModel | null }
}

interface UsageStats {
  total_tokens_in: number
  total_tokens_out: number
  total_calls: number
  calls_by_role: Record<string, number>
  daily_stats: { date: string; tokens_in: number; tokens_out: number; calls: number }[] | null
  top_organizations: { name: string; tokens: number }[] | null
}

interface Toast {
  type: 'success' | 'error' | 'info'
  message: string
}

const PROVIDER_TYPES = [
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'vllm', label: 'vLLM (local GPU)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai_compatible', label: 'Compatible OpenAI' },
]

const FEATURES = [
  { key: 'ocr', label: 'OCR factures', role: 'vl', desc: 'Scan et extraction structuree' },
  { key: 'categorize', label: 'Categorisation PCG', role: 'instruct', desc: 'Suggestion de compte comptable' },
  { key: 'chat', label: 'Assistant chat', role: 'instruct', desc: 'Chat contextuel sidebar' },
  { key: 'generate', label: 'Aide a la redaction', role: 'instruct', desc: 'Generation PV, mails, descriptions' },
  { key: 'analysis', label: 'Analyse financiere', role: 'thinking', desc: 'Questions complexes sur le bilan' },
]

// ── Schemas Zod ─────────────────────────────────────────────────────────────

const configSchema = z.object({
  litellmUrl: z.string(),
  litellmKey: z.string(),
  aiEnabled: z.boolean(),
})
type ConfigFormValues = z.infer<typeof configSchema>

const providerSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  type: z.string(),
  base_url: z.string(),
  api_key: z.string(),
})
type ProviderFormValues = z.infer<typeof providerSchema>

// ── Toast component ─────────────────────────────────────────────────────────

function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400',
    error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-700 dark:text-red-400',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400',
  }
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : AlertCircle

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border text-sm shadow-lg ${colors[toast.type]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{toast.message}</span>
      <button onClick={onClose} className="ml-2"><X className="w-3.5 h-3.5" /></button>
    </div>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function ConfigAiPage() {
  const { isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = useCallback((type: Toast['type'], message: string) => {
    setToast({ type, message })
  }, [])

  // Config form (useForm)
  const configForm = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: { litellmUrl: '', litellmKey: '', aiEnabled: false },
  })
  const aiEnabled = configForm.watch('aiEnabled')

  // Features - lu depuis config, sauvegarde auto au clic

  // Provider modal
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [editProvider, setEditProvider] = useState<AiProvider | null>(null)
  const [providerSaving, setProviderSaving] = useState(false)
  const providerForm = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: { name: '', type: 'ollama', base_url: '', api_key: '' },
  })
  const provType = providerForm.watch('type')

  // Sections ouvertes/fermees
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    general: true, providers: true, models: true, roles: true, features: true, usage: true,
  })

  const toggleSection = (s: string) => setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }))

  const { data: queryData, isLoading: loading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: async () => {
      const [cfgRes, provRes, modRes, usageRes] = await Promise.all([
        adminClient.get<AiConfig>('/ai/config'),
        adminClient.get<AiProvider[]>('/ai/providers'),
        adminClient.get<AiModel[]>('/ai/models'),
        adminClient.get<UsageStats>('/ai/usage'),
      ])
      return {
        config: cfgRes,
        providers: provRes,
        models: modRes,
        usage: usageRes,
      }
    },
    enabled: isAdmin === true,
  })

  const config = queryData?.config ?? null
  const providers = queryData?.providers ?? []
  const models = queryData?.models ?? []
  const usage = queryData?.usage ?? null

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['ai-config'] })

  useEffect(() => {
    if (!config) return
    configForm.reset({
      aiEnabled: config.ai_enabled,
      litellmUrl: config.ai_litellm_base_url || 'http://litellm:4000',
      litellmKey: '',
    })
  }, [config])

  if (isAdmin === null) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
  if (!isAdmin) return <div className="max-w-4xl mx-auto px-6 py-8"><p className="text-red-500">Acces reserve aux administrateurs plateforme.</p></div>
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>

  const activeModels = models.filter((m) => m.is_active)

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function saveConfig() {
    setSaving(true)
    try {
      const vals = configForm.getValues()
      await adminClient.put('/ai/config', {
        ai_enabled: vals.aiEnabled,
        ai_litellm_base_url: vals.litellmUrl || null,
        ai_litellm_master_key: vals.litellmKey || undefined,
      })
      showToast('success', 'Configuration sauvegardee')
      invalidate()
    } catch {
      showToast('error', 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function toggleFeature(key: string, newValue: boolean) {
    try {
      const updated = { ...(config?.ai_features || {}), [key]: newValue }
      await adminClient.put('/ai/config', { ai_features: updated })
      showToast('success', `${key} ${newValue ? 'active' : 'desactive'}`)
      invalidate()
    } catch {
      showToast('error', 'Erreur lors de la sauvegarde')
    }
  }

  async function saveRole(field: string, modelId: string) {
    try {
      const payload: Record<string, string | null> = {
        vl: config?.roles?.vl?.id || null,
        instruct: config?.roles?.instruct?.id || null,
        thinking: config?.roles?.thinking?.id || null,
      }
      payload[field] = modelId || null
      await adminClient.put('/ai/roles', payload)
      showToast('success', `Role ${field.toUpperCase()} mis a jour`)
      invalidate()
    } catch {
      showToast('error', 'Erreur lors de la sauvegarde du role')
    }
  }

  async function testLitellm() {
    try {
      const res = await adminClient.post<{ ok: boolean; message: string }>('/ai/config/test')
      if (res.ok) {
        showToast('success', res.message)
      } else {
        showToast('error', res.message)
      }
    } catch {
      showToast('error', 'Erreur de communication avec le serveur')
    }
  }

  async function syncProvider(id: string) {
    try {
      const res = await adminClient.post<{ message: string }>(`/ai/providers/${id}/sync`)
      showToast('success', res.message)
      invalidate()
    } catch {
      showToast('error', 'Erreur lors de la synchronisation')
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm('Supprimer ce fournisseur et tous ses modeles ?')) return
    try {
      await adminClient.delete(`/ai/providers/${id}`)
      showToast('success', 'Fournisseur supprime')
      invalidate()
    } catch {
      showToast('error', 'Erreur lors de la suppression')
    }
  }

  const saveProvider = providerForm.handleSubmit(async (data) => {
    setProviderSaving(true)
    try {
      if (editProvider) {
        const res = await adminClient.put<{ ok: boolean; test: { success: boolean; message: string }; synced: number }>(`/ai/providers/${editProvider.id}`, data)
        setShowProviderModal(false)
        setEditProvider(null)
        if (res.test?.success) {
          showToast('success', `Fournisseur modifie - ${res.synced} modeles synchronises`)
        } else {
          showToast('error', `Fournisseur modifie mais connexion echouee : ${res.test?.message || 'erreur inconnue'}`)
        }
      } else {
        const res = await adminClient.post<{ id: string; test: { success: boolean; message: string }; synced: number }>('/ai/providers', data)
        setShowProviderModal(false)
        setEditProvider(null)
        if (res.test?.success) {
          showToast('success', `Fournisseur ajoute - ${res.synced} modeles synchronises`)
        } else {
          showToast('error', `Fournisseur ajoute mais connexion echouee : ${res.test?.message || 'erreur inconnue'}`)
        }
      }
      invalidate()
    } catch {
      showToast('error', 'Erreur lors de la sauvegarde du fournisseur')
    } finally {
      setProviderSaving(false)
    }
  })

  async function toggleModel(id: string, active: boolean) {
    await adminClient.put(`/ai/models/${id}`, { is_active: !active })
    invalidate()
  }

  async function deleteModel(id: string) {
    if (!confirm('Supprimer ce modele ?')) return
    await adminClient.delete(`/ai/models/${id}`)
    invalidate()
  }

  function sectionHeader(key: string, title: string, icon: React.ReactNode) {
    return (
      <button
        onClick={() => toggleSection(key)}
        className="flex items-center justify-between w-full py-3"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{title}</h2>
        </div>
        {openSections[key] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
    )
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <PageLayout
      icon={<BrainCircuit className="w-5 h-5 text-kerpta" />}
      title="Intelligence Artificielle"
      subtitle="Configuration du proxy LiteLLM, fournisseurs et modeles"
    >
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

      <div className="space-y-6">

      {/* Section 1 - General */}
      <section className={CARD + ' p-5'}>
        {sectionHeader('general', 'General', <Settings2 className="w-4 h-4 text-gray-400" />)}
        {openSections.general && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-40">Module IA</span>
              <span className={`px-3 py-1.5 text-xs rounded-full border ${aiEnabled ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'}`}>
                {aiEnabled ? 'Active (auto)' : 'Inactif - ajoutez un fournisseur avec des modeles'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-40">LiteLLM URL</span>
              <input className={INPUT + ' flex-1'} {...configForm.register('litellmUrl')} placeholder="http://litellm:4000" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-40">Master Key</span>
              <input className={INPUT + ' flex-1'} type="password" {...configForm.register('litellmKey')} placeholder={config?.has_master_key ? '••••••••' : 'Non configuree'} />
            </div>
            <div className="flex gap-2">
              <button onClick={testLitellm} className={BTN_SM} disabled={!configForm.watch('litellmUrl')}>
                <Zap className="w-3.5 h-3.5" /> Tester la connexion
              </button>
              <button onClick={saveConfig} className={BTN_SM} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Sauvegarder
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 2 - Fournisseurs */}
      <section className={CARD + ' p-5'}>
        {sectionHeader('providers', 'Fournisseurs', <Cpu className="w-4 h-4 text-gray-400" />)}
        {openSections.providers && (
          <div className="space-y-3 pt-2">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <Circle className={`w-3 h-3 ${p.last_check_ok ? 'fill-green-500 text-green-500' : p.last_check_ok === false ? 'fill-red-500 text-red-500' : 'fill-gray-300 text-gray-300'}`} />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono ml-2">{p.type}</span>
                    <p className="text-xs text-gray-400">{p.model_count} modeles - {p.base_url || 'API cloud'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => syncProvider(p.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="Synchroniser les modeles">
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <button onClick={() => { setEditProvider(p); providerForm.reset({ name: p.name, type: p.type, base_url: p.base_url || '', api_key: '' }); setShowProviderModal(true) }} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="Editer">
                    <Pencil className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <button onClick={() => deleteProvider(p.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => { setEditProvider(null); providerForm.reset({ name: '', type: 'ollama', base_url: '', api_key: '' }); setShowProviderModal(true) }}
              className={BTN_SM}
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter un fournisseur
            </button>
          </div>
        )}
      </section>

      {/* Section 3 - Modeles */}
      <section className={CARD + ' p-5'}>
        {sectionHeader('models', 'Modeles', <BrainCircuit className="w-4 h-4 text-gray-400" />)}
        {openSections.models && (
          <div className="space-y-4 pt-2">
            {providers.map((p) => {
              const pModels = models.filter((m) => m.provider_id === p.id)
              if (pModels.length === 0) return null
              return (
                <div key={p.id}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2">{p.name}</p>
                  <div className="space-y-1">
                    {pModels.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 dark:text-gray-200">{m.display_name}</span>
                          {m.capabilities?.map((c) => (
                            <span key={c} className="text-[10px] bg-kerpta-50 dark:bg-kerpta-900/30 text-kerpta-600 dark:text-kerpta-400 px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleModel(m.id, m.is_active)}
                            className={`px-2 py-0.5 text-[10px] rounded-full border transition ${m.is_active ? 'bg-kerpta-50 border-kerpta-200 text-kerpta-700 dark:bg-kerpta-900/30 dark:border-kerpta-700 dark:text-kerpta-400' : 'bg-gray-100 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-600'}`}
                          >
                            {m.is_active ? 'Actif' : 'Inactif'}
                          </button>
                          <button onClick={() => deleteModel(m.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                            <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 4 - Roles (sauvegarde auto au changement) */}
      <section className={CARD + ' p-5'}>
        {sectionHeader('roles', 'Roles', <Eye className="w-4 h-4 text-gray-400" />)}
        {openSections.roles && (
          <div className="space-y-4 pt-2">
            {([
              { label: 'VL (Vision)', field: 'vl', desc: 'OCR, lecture documents' },
              { label: 'Instruct', field: 'instruct', desc: 'Categorisation, chat, redaction' },
              { label: 'Thinking', field: 'thinking', desc: 'Analyse financiere complexe' },
            ]).map((r) => (
              <div key={r.label} className="flex items-center gap-3">
                <div className="w-40">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{r.label}</span>
                  <p className="text-[10px] text-gray-400">{r.desc}</p>
                </div>
                <select
                  className={SELECT + ' flex-1'}
                  value={
                    r.field === 'vl' ? (config?.roles?.vl?.id || '') :
                    r.field === 'instruct' ? (config?.roles?.instruct?.id || '') :
                    (config?.roles?.thinking?.id || '')
                  }
                  onChange={(e) => saveRole(r.field, e.target.value)}
                >
                  <option value="">Non configure</option>
                  {activeModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name} ({m.provider_name})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 5 - Fonctionnalites (sauvegarde auto au clic) */}
      <section className={CARD + ' p-5'}>
        {sectionHeader('features', 'Fonctionnalites', <Settings2 className="w-4 h-4 text-gray-400" />)}
        {openSections.features && (
          <div className="space-y-3 pt-2">
            {FEATURES.map((f) => {
              const roleVl = config?.roles?.vl?.id
              const roleInstruct = config?.roles?.instruct?.id
              const roleThinking = config?.roles?.thinking?.id
              const roleAssigned = f.role === 'vl' ? !!roleVl : f.role === 'thinking' ? !!roleThinking : !!roleInstruct
              const feats = config?.ai_features || {}
              const enabled = feats[f.key] !== false && roleAssigned
              return (
                <div key={f.key} className={`flex items-center justify-between px-3 py-2 rounded-lg ${!roleAssigned ? 'opacity-50' : ''}`}>
                  <div>
                    <span className="text-sm text-gray-800 dark:text-gray-200">{f.label}</span>
                    <p className="text-[10px] text-gray-400">{f.desc} - requiert : {f.role.toUpperCase()}</p>
                  </div>
                  <button
                    onClick={() => { if (roleAssigned) toggleFeature(f.key, !enabled) }}
                    disabled={!roleAssigned}
                    className={`px-3 py-1.5 text-xs rounded-full border transition ${enabled ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'}`}
                  >
                    {enabled ? 'Active' : 'Desactive'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 6 - Usage */}
      <section className={CARD + ' p-5'}>
        {sectionHeader('usage', 'Usage (30 jours)', <BarChart3 className="w-4 h-4 text-gray-400" />)}
        {openSections.usage && usage && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{usage.total_calls}</p>
                <p className="text-xs text-gray-400">Appels</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{(usage.total_tokens_in / 1000).toFixed(1)}k</p>
                <p className="text-xs text-gray-400">Tokens in</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{(usage.total_tokens_out / 1000).toFixed(1)}k</p>
                <p className="text-xs text-gray-400">Tokens out</p>
              </div>
            </div>

            {Object.keys(usage.calls_by_role).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Par role</p>
                <div className="flex gap-4">
                  {Object.entries(usage.calls_by_role).map(([role, count]) => (
                    <span key={role} className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">{role.toUpperCase()}</span> : {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {usage.daily_stats && usage.daily_stats.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Graphique quotidien</p>
                <div className="flex items-end gap-1 h-24">
                  {usage.daily_stats.map((d) => {
                    const maxTokens = Math.max(...usage.daily_stats!.map((x) => x.tokens_in + x.tokens_out), 1)
                    const h = ((d.tokens_in + d.tokens_out) / maxTokens) * 100
                    return (
                      <div key={d.date} className="flex-1 min-w-0" title={`${d.date}: ${d.calls} appels`}>
                        <div className="bg-kerpta-400 dark:bg-kerpta-500 rounded-t" style={{ height: `${Math.max(h, 2)}%` }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {usage.top_organizations && usage.top_organizations.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Top organisations</p>
                <div className="space-y-1">
                  {usage.top_organizations.map((o, i) => (
                    <div key={o.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{i + 1}. {o.name}</span>
                      <span className="text-gray-400">{(o.tokens / 1000).toFixed(1)}k tokens</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modal fournisseur */}
      {showProviderModal && (
        <div className={OVERLAY_BACKDROP} onClick={() => setShowProviderModal(false)}>
          <div className={OVERLAY_PANEL + ' max-w-md'} onClick={(e) => e.stopPropagation()}>
            <div className={OVERLAY_HEADER}>
              <h3 className="text-sm font-semibold">{editProvider ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</h3>
              <button onClick={() => setShowProviderModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <form onSubmit={saveProvider} className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nom</label>
                <input className={INPUT} {...providerForm.register('name')} placeholder="Mon Ollama" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type</label>
                <select className={SELECT} {...providerForm.register('type')}>
                  {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {!['openai', 'anthropic', 'mistral', 'google'].includes(provType) && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">URL</label>
                  <input className={INPUT} {...providerForm.register('base_url')} placeholder="http://ollama:11434" />
                </div>
              )}
              {provType !== 'ollama' && provType !== 'vllm' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Cle API {provType === 'openai_compatible' && <span className="text-gray-400">(optionnel pour serveurs locaux)</span>}</label>
                  <input className={INPUT} type="password" {...providerForm.register('api_key')} placeholder={provType === 'openai_compatible' ? 'Laisser vide si non requise' : 'sk-...'} />
                </div>
              )}
              <p className="text-[10px] text-gray-400">La connexion sera testee et les modeles synchronises automatiquement.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowProviderModal(false)} className={BTN_SECONDARY}>Annuler</button>
                <button type="submit" className={BTN_SM} disabled={!providerForm.watch('name') || providerSaving}>
                  {providerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {editProvider ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </PageLayout>
  )
}

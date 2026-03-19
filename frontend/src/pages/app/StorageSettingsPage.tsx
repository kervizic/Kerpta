// Kerpta — Page de configuration du stockage externe
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HardDrive, Cloud, Server, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink } from 'lucide-react'
import { orgGet, orgPost, orgDelete } from '@/lib/orgApi'
import ModalOverlay from '@/components/app/ModalOverlay'
import { BTN } from '@/lib/formStyles'
import PageLayout from '@/components/app/PageLayout'

// ── Types ────────────────────────────────────────────────────────────────────

type ProviderKey = 'google_drive' | 'onedrive' | 'dropbox' | 'ftp'

interface StorageConnection {
  id: string
  provider: ProviderKey
  label: string
  connected_at: string
  account_email?: string
}

interface FtpFormData {
  host: string
  port: string
  username: string
  password: string
  path: string
  use_sftp: boolean
}

interface ProviderInfo {
  key: ProviderKey
  label: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  borderColor: string
}

// ── Providers ────────────────────────────────────────────────────────────────

const PROVIDERS: ProviderInfo[] = [
  {
    key: 'google_drive',
    label: 'Google Drive',
    description: 'Stockez vos documents sur votre Google Drive professionnel ou personnel.',
    icon: <Cloud className="w-6 h-6" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    key: 'onedrive',
    label: 'Microsoft OneDrive',
    description: 'Connectez votre OneDrive ou SharePoint pour stocker vos fichiers.',
    icon: <Cloud className="w-6 h-6" />,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
  },
  {
    key: 'dropbox',
    label: 'Dropbox',
    description: 'Synchronisez automatiquement vos documents vers Dropbox.',
    icon: <Cloud className="w-6 h-6" />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
  },
  {
    key: 'ftp',
    label: 'FTP / SFTP',
    description: 'Envoyez vos fichiers vers un serveur FTP ou SFTP de votre choix.',
    icon: <Server className="w-6 h-6" />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
]

// ── Composant carte provider ─────────────────────────────────────────────────

function ProviderCard({
  provider,
  connection,
  onConnect,
  onDisconnect,
  loading,
}: {
  provider: ProviderInfo
  connection: StorageConnection | null
  onConnect: (key: ProviderKey) => void
  onDisconnect: (id: string) => void
  loading: boolean
}) {
  const isConnected = !!connection

  return (
    <div
      className={`rounded-xl border-2 p-5 transition-all ${
        isConnected
          ? `${provider.borderColor} ${provider.bgColor}`
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Icône */}
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            isConnected ? `${provider.bgColor} ${provider.color}` : 'bg-gray-100 text-gray-400'
          }`}
        >
          {provider.icon}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900">{provider.label}</h3>
            {isConnected && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" />
                Connecté
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500 mb-3">{provider.description}</p>

          {isConnected && connection && (
            <div className="mb-3 p-2.5 rounded-lg bg-white/60 border border-white/80">
              {connection.account_email && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Compte :</span> {connection.account_email}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                Connecté le {new Date(connection.connected_at).toLocaleDateString('fr-FR')}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <button
                onClick={() => onDisconnect(connection!.id)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Déconnecter
              </button>
            ) : (
              <button
                onClick={() => onConnect(provider.key)}
                disabled={loading}
                className={BTN}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                Connecter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal FTP ────────────────────────────────────────────────────────────────

function FtpModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: FtpFormData) => void
  loading: boolean
}) {
  const [form, setForm] = useState<FtpFormData>({
    host: '',
    port: '21',
    username: '',
    password: '',
    path: '/',
    use_sftp: false,
  })

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  const inputCls =
    'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-kerpta-400 focus:border-kerpta-400 outline-none transition'

  return (
    <ModalOverlay onClose={onClose} size="md" title="Connexion FTP / SFTP">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Hôte</label>
              <input
                type="text"
                required
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="ftp.exemple.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
              <input
                type="number"
                required
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Identifiant</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Répertoire distant</label>
            <input
              type="text"
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              placeholder="/kerpta/"
              className={inputCls}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.use_sftp}
              onChange={(e) =>
                setForm({ ...form, use_sftp: e.target.checked, port: e.target.checked ? '22' : '21' })
              }
              className="w-4 h-4 rounded border-gray-300 text-kerpta focus:ring-kerpta-400"
            />
            <span className="text-sm text-gray-700">Utiliser SFTP (recommandé)</span>
          </label>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`${BTN} gap-2`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Connecter
            </button>
          </div>
        </form>
    </ModalOverlay>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function StorageSettingsPage() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['storage-connections'] })

  const { data: connections = [], isLoading: loading } = useQuery({
    queryKey: ['storage-connections'],
    queryFn: () => orgGet<StorageConnection[]>('/storage/connections').catch(() => [] as StorageConnection[]),
  })

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [ftpOpen, setFtpOpen] = useState(false)
  const [error, setError] = useState('')

  function getConnection(provider: ProviderKey): StorageConnection | null {
    return connections.find((c) => c.provider === provider) ?? null
  }

  async function handleConnect(provider: ProviderKey) {
    if (provider === 'ftp') {
      setFtpOpen(true)
      return
    }
    // OAuth providers — demander l'URL d'auth au backend
    setActionLoading(provider)
    setError('')
    try {
      const { auth_url } = await orgPost<{ auth_url: string }>('/storage/connect', { provider })
      // Rediriger vers l'OAuth du provider
      window.location.href = auth_url
    } catch {
      setError(`Impossible de se connecter à ${provider}. L'intégration sera disponible prochainement.`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleFtpSubmit(data: FtpFormData) {
    setActionLoading('ftp')
    setError('')
    try {
      await orgPost('/storage/connect', { provider: 'ftp', ...data })
      setFtpOpen(false)
      invalidate()
    } catch {
      setError('Impossible de se connecter au serveur FTP. Vérifiez les paramètres.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDisconnect(id: string) {
    setActionLoading(id)
    setError('')
    try {
      await orgDelete(`/storage/connections/${id}`)
      invalidate()
    } catch {
      setError('Erreur lors de la déconnexion.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <PageLayout
      icon={<HardDrive className="w-5 h-5 text-kerpta" />}
      title="Stockage externe"
      subtitle="Connectez un service de stockage pour sauvegarder automatiquement vos documents."
    >

        {/* Info */}
        <div className="mt-6 mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-800">
            <strong>Comment ça marche ?</strong> Connectez un service de stockage ci-dessous.
            Vos devis, factures et autres documents seront automatiquement sauvegardés sur votre
            espace de stockage, dans un dossier dédié <code className="bg-amber-100 px-1 rounded">Kerpta/</code>.
          </p>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Liste des providers */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-kerpta animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                connection={getConnection(provider.key)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                loading={actionLoading === provider.key || actionLoading === getConnection(provider.key)?.id}
              />
            ))}
          </div>
        )}

        {/* Note de sécurité */}
        <div className="mt-8 p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Sécurité :</strong> Vos documents sont envoyés directement vers votre espace de stockage.
            Les identifiants de connexion sont chiffrés et ne sont jamais exposés.
            Les PDF de factures et devis sont automatiquement sauvegardés à chaque impression.
          </p>
        </div>

      {/* Modal FTP */}
      <FtpModal
        open={ftpOpen}
        onClose={() => setFtpOpen(false)}
        onSubmit={handleFtpSubmit}
        loading={actionLoading === 'ftp'}
      />

    </PageLayout>
  )
}

// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, UserRound, ArrowLeft, Loader2 } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost } from '@/lib/orgApi'
import axios from 'axios'

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
  billing_address: Record<string, unknown> | null
  shipping_address: Record<string, unknown> | null
  notes: string | null
  quote_count: number
  invoice_count: number
  contract_count: number
  total_invoiced: number
  total_paid: number
  balance: number
}

interface PaginatedClients {
  items: Client[]
  total: number
  page: number
  page_size: number
}

function httpError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown }
    if (typeof d?.detail === 'string') return d.detail
  }
  return fallback
}

// ── Liste des clients ─────────────────────────────────────────────────────────

function ClientsList() {
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

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
            onClick={() => setShowCreate(true)}
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

        {/* Modal création */}
        {showCreate && (
          <CreateClientModal
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); void load() }}
          />
        )}
      </div>
    </div>
  )
}

// ── Modal de création ─────────────────────────────────────────────────────────

function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('company')
  const [siret, setSiret] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await orgPost('/clients', {
        name, type,
        siret: siret || undefined,
        email: email || undefined,
        phone: phone || undefined,
      })
      onCreated()
    } catch (err) {
      setError(httpError(err, 'Erreur lors de la création'))
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Nouveau client</h2>
        {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
            <option value="company">Entreprise</option>
            <option value="individual">Particulier</option>
          </select>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom / Raison sociale" required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
          {type === 'company' && (
            <input type="text" value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="SIRET (14 chiffres)" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
          )}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Annuler</button>
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

function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    orgGet<ClientDetail>(`/clients/${clientId}`)
      .then(setClient)
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
        <button
          onClick={() => navigate('/app/clients')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition"
        >
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
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Contact</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-400">Email :</span> {client.email || '—'}</p>
              <p><span className="text-gray-400">Tél :</span> {client.phone || '—'}</p>
              <p><span className="text-gray-400">TVA :</span> {client.vat_number || '—'}</p>
              <p><span className="text-gray-400">Conditions :</span> {client.payment_terms} jours</p>
            </div>
          </section>
          <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Statistiques</h2>
            <div className="space-y-2 text-sm">
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
  const match = path.match(/^\/app\/clients\/(.+)$/)
  if (match) {
    return <ClientDetail clientId={match[1]} />
  }
  return <ClientsList />
}

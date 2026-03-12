// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Loader2 } from 'lucide-react'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import axios from 'axios'

interface Product {
  id: string
  reference: string | null
  name: string
  description: string | null
  unit: string | null
  vat_rate: number
  unit_price: number | null
  is_in_catalog: boolean
  archived_at: string | null
}

function httpError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown }
    if (typeof d?.detail === 'string') return d.detail
  }
  return fallback
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<{ items: Product[]; total: number }>('/catalog/products', { search: search || undefined, page })
      setProducts(data.items)
      setTotal(data.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, search])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Catalogue</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Nouvel article
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un article..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun article trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  <th className="px-4 py-3">Réf.</th>
                  <th className="px-4 py-3">Désignation</th>
                  <th className="px-4 py-3">Unité</th>
                  <th className="px-4 py-3 text-right">Prix HT</th>
                  <th className="px-4 py-3 text-right">TVA</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setEditId(p.id)}
                    className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition"
                  >
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.reference || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.unit || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {p.unit_price != null ? `${Number(p.unit_price).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{Number(p.vat_rate)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Précédent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Suivant</button>
          </div>
        )}

        {showCreate && (
          <ProductModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load() }} />
        )}
        {editId && (
          <ProductModal productId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); void load() }} />
        )}
      </div>
    </div>
  )
}

function ProductModal({ productId, onClose, onSaved }: { productId?: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [reference, setReference] = useState('')
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [vatRate, setVatRate] = useState('20')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingData, setLoadingData] = useState(!!productId)

  useEffect(() => {
    if (!productId) return
    orgGet<Product>(`/catalog/products/${productId}`)
      .then((p) => {
        setName(p.name)
        setReference(p.reference || '')
        setUnit(p.unit || '')
        setUnitPrice(p.unit_price != null ? String(p.unit_price) : '')
        setVatRate(String(p.vat_rate))
        setDescription(p.description || '')
      })
      .catch(() => setError('Erreur chargement'))
      .finally(() => setLoadingData(false))
  }, [productId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        name,
        reference: reference || undefined,
        unit: unit || undefined,
        unit_price: unitPrice ? Number(unitPrice) : undefined,
        vat_rate: Number(vatRate),
        description: description || undefined,
      }
      if (productId) {
        await orgPatch(`/catalog/products/${productId}`, body)
      } else {
        await orgPost('/catalog/products', body)
      }
      onSaved()
    } catch (err) {
      setError(httpError(err, 'Erreur'))
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{productId ? 'Modifier' : 'Nouvel'} article</h2>
        {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {loadingData ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Désignation" required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="grid grid-cols-2 gap-3">
              <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unité (m², h, u...)" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Prix HT" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
              <option value="20">TVA 20%</option>
              <option value="10">TVA 10%</option>
              <option value="5.5">TVA 5,5%</option>
              <option value="2.1">TVA 2,1%</option>
              <option value="0">TVA 0%</option>
            </select>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Annuler</button>
              <button type="submit" disabled={saving || !name} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : productId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

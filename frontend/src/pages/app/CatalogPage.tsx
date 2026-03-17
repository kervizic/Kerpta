// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Loader2, Trash2, Archive, ArchiveRestore, Pencil,
  Layers, ShoppingCart, Users, BarChart3, X,
} from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import UnitCombobox from '@/components/app/UnitCombobox'
import ModalOverlay from '@/components/app/ModalOverlay'
import axios from 'axios'

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  reference: string | null
  name: string
  description: string | null
  unit: string | null
  vat_rate: number
  account_code: string | null
  client_id: string | null
  is_in_catalog: boolean
  purchase_price: number | null
  sale_price_mode: string
  unit_price: number | null
  sale_price_coefficient_id: string | null
  coefficient_name: string | null
  coefficient_value: number | null
  is_composite: boolean
  created_at: string | null
  archived_at: string | null
}

interface Variant {
  id: string
  product_id: string
  client_id: string
  client_name: string | null
  variant_index: number
  override_reference: string | null
  override_name: string | null
  price_mode: string
  unit_price: number | null
  price_coefficient_id: string | null
  coefficient_name: string | null
  coefficient_value: number | null
  is_active: boolean
}

interface Coefficient {
  id: string
  name: string
  value: number
  client_id: string | null
  client_name: string | null
}

interface PurchaseLink {
  id: string
  product_id: string
  supplier_id: string | null
  supplier_name: string | null
  supplier_reference: string | null
  purchase_price: number | null
  sale_price_mode: string
  fixed_sale_price: number | null
  price_coefficient_id: string | null
  coefficient_name: string | null
  coefficient_value: number | null
  is_default: boolean
}

interface QuantityDiscount {
  id: string
  product_id: string
  client_id: string | null
  client_name: string | null
  min_quantity: number
  discount_percent: number
}

interface ClientSimple { id: string; name: string }

function httpError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown }
    if (typeof d?.detail === 'string') return d.detail
  }
  return fallback
}

import { INPUT, SELECT, BTN } from '@/lib/formStyles'
const BTN_SECONDARY = 'px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition'

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac'
}

// ── Sub-routing ─────────────────────────────────────────────────────────────

export default function CatalogPage({ path }: { path: string }) {
  const detailMatch = path.match(/^\/app\/catalogue\/([^/]+)$/)
  if (detailMatch) {
    return <ProductsList initialSelectedId={detailMatch[1]} />
  }
  return <ProductsList />
}

// ── Liste des articles ──────────────────────────────────────────────────────

function ProductsList({ initialSelectedId }: { initialSelectedId?: string } = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)
  const [showNewModal, setShowNewModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { search: search || undefined, page }
      if (showArchived) params.include_archived = true
      const data = await orgGet<{ items: Product[]; total: number }>('/catalog/products', params)
      setProducts(data.items)
      setTotal(data.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, search, showArchived])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Catalogue</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowArchived(!showArchived); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition ${
                showArchived
                  ? 'bg-kerpta-50 border-kerpta-200 text-kerpta-700 dark:bg-kerpta-900/30 dark:border-kerpta-700 dark:text-kerpta-400'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Archive className="w-4 h-4" /> Archives
            </button>
            <button onClick={() => setShowNewModal(true)} className={`flex items-center gap-1.5 ${BTN}`}>
              <Plus className="w-4 h-4" /> Nouvel article
            </button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un article..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-400"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-kerpta" /></div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun article trouv&eacute;</div>
          ) : (<>
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                  <th className="px-4 py-3">R&eacute;f.</th>
                  <th className="px-4 py-3">D&eacute;signation</th>
                  <th className="px-4 py-3">Unit&eacute;</th>
                  <th className="px-4 py-3 text-right">Prix HT</th>
                  <th className="px-4 py-3 text-right">TVA</th>
                  <th className="px-4 py-3 text-center">Mode</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)}
                    className="border-b border-gray-50 dark:border-gray-700 hover:bg-kerpta-50/50 dark:hover:bg-kerpta-900/30 cursor-pointer transition">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{p.reference || '\u2014'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <span className={p.archived_at ? 'text-gray-400 dark:text-gray-500' : ''}>{p.name}</span>
                      {p.archived_at && <span className="ml-2 text-[10px] bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded-full">Archivé</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.unit || '\u2014'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmtPrice(p.unit_price)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{Number(p.vat_rate)} %</td>
                    <td className="px-4 py-3 text-center">
                      {p.sale_price_mode === 'coefficient' ? (
                        <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                          {p.coefficient_name || 'Coef'} &times;{Number(p.coefficient_value)}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Fixe</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2 p-3">
              {products.map((p) => (
                <div key={p.id} onClick={() => setSelectedId(p.id)}
                  className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 hover:bg-kerpta-50/50 dark:hover:bg-kerpta-900/30 cursor-pointer transition">
                  <div className="flex items-center justify-between">
                    <span className={`font-medium text-sm ${p.archived_at ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{p.name}</span>
                    {p.archived_at && <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded-full">Archivé</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{p.reference || '—'}</span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmtPrice(p.unit_price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700">Pr&eacute;c&eacute;dent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700">Suivant</button>
          </div>
        )}

        {/* Modale détail article */}
        {selectedId && (
          <ProductDetailModal
            productId={selectedId}
            onClose={() => { setSelectedId(null); void load() }}
          />
        )}

        {/* Modale création article */}
        {showNewModal && (
          <NewProductModal
            onClose={() => setShowNewModal(false)}
            onCreated={(id) => { setShowNewModal(false); setSelectedId(id); void load() }}
          />
        )}
      </div>
    </div>
  )
}

// ── Formulaire création article (overlay) ──────────────────────────────────

function NewProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [reference, setReference] = useState('')
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [vatRate, setVatRate] = useState('20')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name,
        reference: reference || undefined,
        unit: unit || undefined,
        unit_price: unitPrice ? Number(unitPrice) : undefined,
        vat_rate: Number(vatRate),
        sale_price_mode: 'fixed',
        is_in_catalog: true,
      }
      const result = await orgPost<{ id: string }>('/catalog/products', body)
      onCreated(result.id)
    } catch (err) {
      setError(httpError(err, 'Erreur'))
    }
    setSaving(false)
  }

  return (
    <ModalOverlay onClose={onClose} size="lg" title="Nouvel article">
      {error && <div className="p-3 mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Désignation *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} placeholder="Nom de l'article" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Référence</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={INPUT} placeholder="Réf." />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Unité</label>
            <UnitCombobox value={unit} onChange={setUnit} className={INPUT} placeholder="Unité" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Prix unitaire HT</label>
            <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={INPUT} placeholder="0,00" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">TVA</label>
            <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={SELECT}>
              <option value="20">TVA 20%</option>
              <option value="10">TVA 10%</option>
              <option value="5.5">TVA 5,5%</option>
              <option value="2.1">TVA 2,1%</option>
              <option value="0">TVA 0%</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
          <button type="submit" disabled={saving || !name} className={BTN}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ── D&eacute;tail article ──────────────────────────────────────────────────────────

export function ProductDetailModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'variants' | 'purchases' | 'discounts'>('variants')
  const [archiving, setArchiving] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [unarchiving, setUnarchiving] = useState(false)

  // Édition inline
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [editingRef, setEditingRef] = useState(false)
  const [editRef, setEditRef] = useState('')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editFieldValue, setEditFieldValue] = useState('')
  const [savingField, setSavingField] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = await orgGet<Product>(`/catalog/products/${productId}`)
      setProduct(p)
    } catch { onClose() }
    setLoading(false)
  }, [productId, onClose])

  useEffect(() => { void load() }, [load])

  async function saveField(field: string, value: unknown) {
    setSavingField(true)
    try {
      await orgPatch(`/catalog/products/${productId}`, { [field]: value })
      void load()
    } catch { /* ignore */ }
    setSavingField(false)
    setEditingName(false)
    setEditingRef(false)
    setEditingField(null)
  }

  async function handleArchive() {
    setArchiving(true)
    try {
      await orgDelete(`/catalog/products/${productId}`)
      onClose()
    } catch { /* ignore */ }
    setArchiving(false)
  }

  async function handleUnarchive() {
    setUnarchiving(true)
    try {
      await orgPatch(`/catalog/products/${productId}/unarchive`, {})
      void load()
    } catch { /* ignore */ }
    setUnarchiving(false)
  }

  const tabs = [
    { key: 'variants' as const, label: 'Variantes', icon: Users },
    { key: 'purchases' as const, label: 'Achats', icon: ShoppingCart },
    { key: 'discounts' as const, label: 'Paliers', icon: BarChart3 },
  ]

  return (
    <ModalOverlay onClose={onClose} size="full">
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10 rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-kerpta-50 dark:bg-kerpta-900/30 border border-kerpta-200 dark:border-kerpta-700 flex items-center justify-center shrink-0">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-kerpta" /> : <Layers className="w-5 h-5 text-kerpta-600" />}
            </div>
            {product && (
              <div className="min-w-0 flex-1">
                {editingName ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => { if (editName.trim() && editName !== product.name) saveField('name', editName.trim()); else setEditingName(false) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } else if (e.key === 'Escape') setEditingName(false) }}
                    className="text-lg font-semibold text-gray-900 dark:text-white w-full px-2 py-0.5 border border-kerpta-300 dark:bg-gray-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-kerpta-400"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 group">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{product.name}</h2>
                    <button onClick={() => { setEditName(product.name); setEditingName(true) }}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition opacity-0 group-hover:opacity-100">
                      <Pencil className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {editingRef ? (
                    <input
                      autoFocus
                      value={editRef}
                      onChange={(e) => setEditRef(e.target.value)}
                      onBlur={() => { saveField('reference', editRef.trim() || null); setEditingRef(false) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setEditingRef(false) }}
                      placeholder="Référence"
                      className="text-xs text-gray-500 dark:text-gray-400 font-mono px-1.5 py-0.5 border border-kerpta-300 dark:bg-gray-900 rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 w-32"
                    />
                  ) : (
                    <button onClick={() => { setEditRef(product.reference || ''); setEditingRef(true) }}
                      className="text-xs text-gray-500 dark:text-gray-400 font-mono hover:text-kerpta-600 dark:hover:text-kerpta-400 transition">
                      {product.reference || '+ Réf.'}
                    </button>
                  )}
                  {product.archived_at && <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded-full">Archivé</span>}
                                    {product.sale_price_mode === 'coefficient' && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                      {product.coefficient_name} ×{Number(product.coefficient_value)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {product && (
              <>
                {product.archived_at ? (
                  <button onClick={handleUnarchive} disabled={unarchiving}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-green-200 text-green-600 rounded-lg hover:bg-green-50 transition disabled:opacity-50">
                    {unarchiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArchiveRestore className="w-3 h-3" />} Désarchiver
                  </button>
                ) : (
                  <button onClick={() => setShowArchiveConfirm(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
                    <Archive className="w-3 h-3" /> Archiver
                  </button>
                )}
              </>
            )}
            {savingField && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
          </div>
        ) : !product ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">Article introuvable</div>
        ) : (
          <div className="px-4 md:px-6 py-5">
            {/* Infos résumées — éditables au clic */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              <EditableInfoCard
                label="Prix HT"
                value={fmtPrice(product.unit_price)}
                editingField={editingField}
                fieldKey="unit_price"
                editFieldValue={editFieldValue}
                onStartEdit={() => { setEditingField('unit_price'); setEditFieldValue(product.unit_price != null ? String(product.unit_price) : '') }}
                onChangeValue={setEditFieldValue}
                onSave={() => saveField('unit_price', editFieldValue ? Number(editFieldValue) : null)}
                onCancel={() => setEditingField(null)}
                inputType="number"
                inputStep="0.01"
              />
              <EditableInfoCard
                label="Prix achat"
                value={fmtPrice(product.purchase_price)}
                editingField={editingField}
                fieldKey="purchase_price"
                editFieldValue={editFieldValue}
                onStartEdit={() => { setEditingField('purchase_price'); setEditFieldValue(product.purchase_price != null ? String(product.purchase_price) : '') }}
                onChangeValue={setEditFieldValue}
                onSave={() => saveField('purchase_price', editFieldValue ? Number(editFieldValue) : null)}
                onCancel={() => setEditingField(null)}
                inputType="number"
                inputStep="0.01"
              />
              <EditableInfoCard
                label="TVA"
                value={`${Number(product.vat_rate)} %`}
                editingField={editingField}
                fieldKey="vat_rate"
                editFieldValue={editFieldValue}
                onStartEdit={() => { setEditingField('vat_rate'); setEditFieldValue(String(product.vat_rate)) }}
                onChangeValue={setEditFieldValue}
                onSave={() => saveField('vat_rate', Number(editFieldValue))}
                onCancel={() => setEditingField(null)}
                selectOptions={[
                  { value: '20', label: '20 %' }, { value: '10', label: '10 %' },
                  { value: '5.5', label: '5,5 %' }, { value: '2.1', label: '2,1 %' },
                  { value: '0', label: '0 %' },
                ]}
              />
              <EditableInfoCard
                label="Unité"
                value={product.unit || '—'}
                editingField={editingField}
                fieldKey="unit"
                editFieldValue={editFieldValue}
                onStartEdit={() => { setEditingField('unit'); setEditFieldValue(product.unit || '') }}
                onChangeValue={setEditFieldValue}
                onSave={() => saveField('unit', editFieldValue || null)}
                onCancel={() => setEditingField(null)}
              />
              <EditableInfoCard
                label="Compte"
                value={product.account_code || '—'}
                editingField={editingField}
                fieldKey="account_code"
                editFieldValue={editFieldValue}
                onStartEdit={() => { setEditingField('account_code'); setEditFieldValue(product.account_code || '') }}
                onChangeValue={setEditFieldValue}
                onSave={() => saveField('account_code', editFieldValue || null)}
                onCancel={() => setEditingField(null)}
              />
            </div>

            {/* Description editable */}
            <div
              className={`border rounded-xl p-3 mb-5 transition cursor-pointer group ${
                editingField === 'description'
                  ? 'border-kerpta-300 bg-kerpta-50/30 dark:bg-kerpta-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-kerpta-200 dark:hover:border-kerpta-700'
              }`}
              onClick={() => { if (editingField !== 'description') { setEditingField('description'); setEditFieldValue(product.description || '') } }}
            >
              <div className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center justify-between mb-1">
                Description
                {editingField !== 'description' && <Pencil className="w-2.5 h-2.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition" />}
              </div>
              {editingField === 'description' ? (
                <textarea
                  autoFocus
                  value={editFieldValue}
                  onChange={(e) => setEditFieldValue(e.target.value)}
                  onBlur={() => { saveField('description', editFieldValue.trim() || null); setEditingField(null) }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null) }}
                  rows={3}
                  placeholder="Description de l'article..."
                  className="w-full text-sm text-gray-600 dark:text-gray-300 px-1 py-0.5 border border-kerpta-300 dark:bg-gray-900 rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 resize-y"
                />
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{product.description || 'Aucune description'}</p>
              )}
            </div>

            {/* Onglets */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
              <div className="flex gap-1">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition ${
                      tab === t.key ? 'border-kerpta text-kerpta-600 dark:text-kerpta-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}>
                    <t.icon className="w-3 h-3" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenu onglet */}
            {tab === 'variants' && <VariantsTab productId={productId} />}
            {tab === 'purchases' && <PurchaseLinksTab productId={productId} />}
            {tab === 'discounts' && <QuantityDiscountsTab productId={productId} />}
          </div>
        )}

        {/* Confirm archivage */}
        {showArchiveConfirm && (
          <ModalOverlay onClose={() => setShowArchiveConfirm(false)} size="sm" title="Archiver cet article ?" nested>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">L&apos;article ne sera plus visible dans le catalogue mais restera dans l&apos;historique.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowArchiveConfirm(false)} className={BTN_SECONDARY}>Annuler</button>
                <button onClick={handleArchive} disabled={archiving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Archiver'}
                </button>
              </div>
          </ModalOverlay>
        )}
    </ModalOverlay>
  )
}

function EditableInfoCard({ label, value, editingField, fieldKey, editFieldValue, onStartEdit, onChangeValue, onSave, onCancel, inputType, inputStep, selectOptions }: {
  label: string; value: string; editingField: string | null; fieldKey: string
  editFieldValue: string; onStartEdit: () => void; onChangeValue: (v: string) => void
  onSave: () => void; onCancel: () => void
  inputType?: string; inputStep?: string
  selectOptions?: { value: string; label: string }[]
}) {
  const isEditing = editingField === fieldKey
  return (
    <div
      className={`border rounded-xl p-3 transition cursor-pointer group ${isEditing ? 'border-kerpta-300 bg-kerpta-50/30 dark:bg-kerpta-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-kerpta-200 dark:hover:border-kerpta-700'}`}
      onClick={() => { if (!isEditing) onStartEdit() }}
    >
      <div className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center justify-between">
        {label}
        {!isEditing && <Pencil className="w-2.5 h-2.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition" />}
      </div>
      {isEditing ? (
        selectOptions ? (
          <select
            autoFocus
            value={editFieldValue}
            onChange={(e) => { onChangeValue(e.target.value); }}
            onBlur={onSave}
            className="w-full mt-1 text-sm font-semibold text-gray-900 dark:text-white px-1 py-0.5 border border-kerpta-300 rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 bg-white dark:bg-gray-900"
          >
            {selectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            autoFocus
            type={inputType || 'text'}
            step={inputStep}
            value={editFieldValue}
            onChange={(e) => onChangeValue(e.target.value)}
            onBlur={onSave}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') onCancel() }}
            className="w-full mt-1 text-sm font-semibold text-gray-900 dark:text-white px-1 py-0.5 border border-kerpta-300 dark:bg-gray-900 rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400"
          />
        )
      ) : (
        <div className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{value}</div>
      )}
    </div>
  )
}

// ── Onglet Variantes client ─────────────────────────────────────────────────

function VariantsTab({ productId }: { productId: string }) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState<ClientSimple[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<Variant[]>(`/catalog/products/${productId}/variants`)
      setVariants(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [productId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    orgGet<{ items: ClientSimple[] }>('/clients', { page_size: 100 }).then(d => setClients(d.items)).catch(() => {})
  }, [])

  async function handleDelete(variantId: string) {
    try {
      await orgDelete(`/catalog/products/${productId}/variants/${variantId}`)
      void load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{variants.length} variante(s) client</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN}`}>
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : variants.length === 0 ? (
        <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">Aucune variante client</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">R&eacute;f. client</th>
                <th className="px-4 py-3">D&eacute;signation</th>
                <th className="px-4 py-3">Mode prix</th>
                <th className="px-4 py-3 text-right">Prix</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {variants.map(v => (
                <tr key={v.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{v.client_name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{v.override_reference || '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.override_name || '\u2014'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      v.price_mode === 'inherit' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
                      v.price_mode === 'coefficient' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    }`}>
                      {v.price_mode === 'inherit' ? 'H\u00e9rit\u00e9' : v.price_mode === 'coefficient' ? `${v.coefficient_name} \u00d7${Number(v.coefficient_value)}` : 'Fixe'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{v.price_mode === 'fixed' ? fmtPrice(v.unit_price) : '\u2014'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <VariantFormModal productId={productId} clients={clients}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load() }} />
      )}
    </div>
  )
}

function VariantFormModal({ productId, clients, onClose, onSaved }: {
  productId: string; clients: ClientSimple[]; onClose: () => void; onSaved: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [overrideRef, setOverrideRef] = useState('')
  const [overrideName, setOverrideName] = useState('')
  const [priceMode, setPriceMode] = useState('inherit')
  const [unitPrice, setUnitPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await orgPost(`/catalog/products/${productId}/variants`, {
        client_id: clientId,
        override_reference: overrideRef || undefined,
        override_name: overrideName || undefined,
        price_mode: priceMode,
        unit_price: priceMode === 'fixed' && unitPrice ? Number(unitPrice) : undefined,
      })
      onSaved()
    } catch (err) { setError(httpError(err, 'Erreur')) }
    setSaving(false)
  }

  return (
    <ModalOverlay onClose={onClose} size="md" title="Nouvelle variante client">
        {error && <div className="p-3 mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={clientId} onChange={e => setClientId(e.target.value)} required className={SELECT}>
            <option value="">Client *</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="text" value={overrideRef} onChange={e => setOverrideRef(e.target.value)} placeholder="Référence client" className={INPUT} />
          <input type="text" value={overrideName} onChange={e => setOverrideName(e.target.value)} placeholder="Désignation client" className={INPUT} />
          <div className="flex gap-4">
            {['inherit', 'fixed', 'coefficient'].map(m => (
              <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                <input type="radio" name="variantPriceMode" value={m} checked={priceMode === m}
                  onChange={() => setPriceMode(m)} className="text-kerpta-600 focus:ring-kerpta-400" />
                {m === 'inherit' ? 'Hériter' : m === 'fixed' ? 'Fixe' : 'Coefficient'}
              </label>
            ))}
          </div>
          {priceMode === 'fixed' && (
            <input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
              placeholder="Prix unitaire HT" className={INPUT} />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving || !clientId} className={BTN}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
            </button>
          </div>
        </form>
    </ModalOverlay>
  )
}

// ── Onglet Achats liés ──────────────────────────────────────────────────────

function PurchaseLinksTab({ productId }: { productId: string }) {
  const [links, setLinks] = useState<PurchaseLink[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<PurchaseLink[]>(`/catalog/products/${productId}/purchase-links`)
      setLinks(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [productId])

  useEffect(() => { void load() }, [load])

  async function handleDelete(linkId: string) {
    try {
      await orgDelete(`/catalog/products/${productId}/purchase-links/${linkId}`)
      void load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{links.length} lien(s) achat</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN}`}>
          <Plus className="w-3.5 h-3.5" /> Lier un achat
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : links.length === 0 ? (
        <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun lien achat fournisseur</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                <th className="px-4 py-3">Fournisseur</th>
                <th className="px-4 py-3">R&eacute;f.</th>
                <th className="px-4 py-3 text-right">Achat HT</th>
                <th className="px-4 py-3">Mode vente</th>
                <th className="px-4 py-3 text-right">Vente HT</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {l.supplier_name || '\u2014'}
                    {l.is_default && <span className="ml-1.5 text-[10px] bg-kerpta-100 text-kerpta-700 dark:bg-kerpta-900/40 dark:text-kerpta-400 px-1.5 py-0.5 rounded-full">D&eacute;faut</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{l.supplier_reference || '\u2014'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmtPrice(l.purchase_price)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      l.sale_price_mode === 'coefficient' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    }`}>
                      {l.sale_price_mode === 'coefficient' ? `${l.coefficient_name} \u00d7${Number(l.coefficient_value)}` : 'Fixe'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">
                    {l.sale_price_mode === 'fixed' ? fmtPrice(l.fixed_sale_price) :
                      l.purchase_price && l.coefficient_value ? fmtPrice(Number(l.purchase_price) * Number(l.coefficient_value)) : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(l.id)} className="text-gray-400 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PurchaseLinkFormModal productId={productId}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load() }} />
      )}
    </div>
  )
}

function PurchaseLinkFormModal({ productId, onClose, onSaved }: {
  productId: string; onClose: () => void; onSaved: () => void
}) {
  const [supplierRef, setSupplierRef] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [salePriceMode, setSalePriceMode] = useState('coefficient')
  const [fixedSalePrice, setFixedSalePrice] = useState('')
  const [coefficientId, setCoefficientId] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [coefficients, setCoefficients] = useState<Coefficient[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    orgGet<Coefficient[]>('/catalog/coefficients').then(setCoefficients).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await orgPost(`/catalog/products/${productId}/purchase-links`, {
        supplier_reference: supplierRef || undefined,
        purchase_price: purchasePrice ? Number(purchasePrice) : undefined,
        sale_price_mode: salePriceMode,
        fixed_sale_price: salePriceMode === 'fixed' && fixedSalePrice ? Number(fixedSalePrice) : undefined,
        price_coefficient_id: salePriceMode === 'coefficient' && coefficientId ? coefficientId : undefined,
        is_default: isDefault,
      })
      onSaved()
    } catch (err) { setError(httpError(err, 'Erreur')) }
    setSaving(false)
  }

  return (
    <ModalOverlay onClose={onClose} size="md" title="Lier un achat">
        {error && <div className="p-3 mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="Référence fournisseur" className={INPUT} />
          <input type="number" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="Prix d'achat HT" className={INPUT} />
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
              <input type="radio" name="linkPriceMode" value="coefficient" checked={salePriceMode === 'coefficient'}
                onChange={() => setSalePriceMode('coefficient')} className="text-kerpta-600 focus:ring-kerpta-400" />
              Coefficient
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
              <input type="radio" name="linkPriceMode" value="fixed" checked={salePriceMode === 'fixed'}
                onChange={() => setSalePriceMode('fixed')} className="text-kerpta-600 focus:ring-kerpta-400" />
              Prix fixe
            </label>
          </div>
          {salePriceMode === 'coefficient' ? (
            <select value={coefficientId} onChange={e => setCoefficientId(e.target.value)} className={SELECT}>
              <option value="">Coefficient</option>
              {coefficients.map(c => <option key={c.id} value={c.id}>{c.name} (×{Number(c.value)})</option>)}
            </select>
          ) : (
            <input type="number" step="0.01" value={fixedSalePrice} onChange={e => setFixedSalePrice(e.target.value)}
              placeholder="Prix de vente fixe HT" className={INPUT} />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
              className="rounded border-gray-300 text-kerpta-600 focus:ring-kerpta-400" />
            Achat par défaut
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving} className={BTN}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
            </button>
          </div>
        </form>
    </ModalOverlay>
  )
}


// ── Onglet Paliers quantit&eacute; ─────────────────────────────────────────────────

function QuantityDiscountsTab({ productId }: { productId: string }) {
  const [discounts, setDiscounts] = useState<QuantityDiscount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<QuantityDiscount[]>(`/catalog/products/${productId}/quantity-discounts`)
      setDiscounts(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [productId])

  useEffect(() => { void load() }, [load])

  async function handleDelete(discountId: string) {
    try {
      await orgDelete(`/catalog/products/${productId}/quantity-discounts/${discountId}`)
      void load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{discounts.length} palier(s)</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN}`}>
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : discounts.length === 0 ? (
        <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">Aucun palier de remise quantit&eacute;</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                <th className="px-4 py-3">Qt&eacute; min.</th>
                <th className="px-4 py-3">Remise</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {discounts.map(d => (
                <tr key={d.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{Number(d.min_quantity)}</td>
                  <td className="px-4 py-3 text-kerpta-600 dark:text-kerpta-400 font-semibold">-{Number(d.discount_percent)} %</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.client_name || 'Tous'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(d.id)} className="text-gray-400 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <DiscountFormModal productId={productId}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load() }} />
      )}
    </div>
  )
}

function DiscountFormModal({ productId, onClose, onSaved }: {
  productId: string; onClose: () => void; onSaved: () => void
}) {
  const [minQuantity, setMinQuantity] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [clients, setClients] = useState<ClientSimple[]>([])
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    orgGet<{ items: ClientSimple[] }>('/clients', { page_size: 100 }).then(d => setClients(d.items)).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await orgPost(`/catalog/products/${productId}/quantity-discounts`, {
        min_quantity: Number(minQuantity),
        discount_percent: Number(discountPercent),
        client_id: clientId || undefined,
      })
      onSaved()
    } catch (err) { setError(httpError(err, 'Erreur')) }
    setSaving(false)
  }

  return (
    <ModalOverlay onClose={onClose} size="md" title="Ajouter un palier">
        {error && <div className="p-3 mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="number" step="0.01" min="0.01" value={minQuantity} onChange={e => setMinQuantity(e.target.value)}
            placeholder="Quantité minimum *" required className={INPUT} />
          <input type="number" step="0.01" min="0.01" max="100" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)}
            placeholder="Remise en % *" required className={INPUT} />
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={SELECT}>
            <option value="">Tous les clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving || !minQuantity || !discountPercent} className={BTN}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
            </button>
          </div>
        </form>
    </ModalOverlay>
  )
}

// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Loader2, ArrowLeft, Trash2, Archive, Pencil,
  Layers, ShoppingCart, Users, BarChart3, X,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
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

interface Component {
  id: string
  parent_product_id: string
  component_product_id: string
  component_name: string | null
  component_reference: string | null
  component_unit_price: number | null
  quantity: number
  unit: string | null
  position: number
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

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent'
const BTN_PRIMARY = 'px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50'
const BTN_SECONDARY = 'px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition'

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac'
}

// ── Sub-routing ─────────────────────────────────────────────────────────────

export default function CatalogPage({ path }: { path: string }) {
  if (path === '/app/catalogue/new') {
    return <ProductFormPage />
  }
  const match = path.match(/^\/app\/catalogue\/([^/]+)\/edit$/)
  if (match) {
    return <ProductFormPage productId={match[1]} />
  }
  const detailMatch = path.match(/^\/app\/catalogue\/([^/]+)$/)
  if (detailMatch) {
    return <ProductDetailPage productId={detailMatch[1]} />
  }
  return <ProductsList />
}

// ── Liste des articles ──────────────────────────────────────────────────────

function ProductsList() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

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
          <button onClick={() => navigate('/app/catalogue/new')} className={`flex items-center gap-1.5 ${BTN_PRIMARY}`}>
            <Plus className="w-4 h-4" /> Nouvel article
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un article..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun article trouv&eacute;</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
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
                  <tr key={p.id} onClick={() => navigate(`/app/catalogue/${p.id}`)}
                    className="border-b border-gray-50 hover:bg-orange-50/50 cursor-pointer transition">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.reference || '\u2014'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.name}
                      {p.is_composite && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Compos&eacute;</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.unit || '\u2014'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtPrice(p.unit_price)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{Number(p.vat_rate)} %</td>
                    <td className="px-4 py-3 text-center">
                      {p.sale_price_mode === 'coefficient' ? (
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                          {p.coefficient_name || 'Coef'} &times;{Number(p.coefficient_value)}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Fixe</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > 25 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Pr&eacute;c&eacute;dent</button>
            <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} / {Math.ceil(total / 25)}</span>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">Suivant</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Formulaire cr&eacute;ation/&eacute;dition (pleine page) ──────────────────────────────

function ProductFormPage({ productId }: { productId?: string }) {
  const [name, setName] = useState('')
  const [reference, setReference] = useState('')
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [vatRate, setVatRate] = useState('20')
  const [description, setDescription] = useState('')
  const [accountCode, setAccountCode] = useState('')
  const [salePriceMode, setSalePriceMode] = useState('fixed')
  const [coefficientId, setCoefficientId] = useState('')
  const [isInCatalog, setIsInCatalog] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingData, setLoadingData] = useState(!!productId)
  const [coefficients, setCoefficients] = useState<Coefficient[]>([])

  useEffect(() => {
    orgGet<Coefficient[]>('/catalog/coefficients').then(setCoefficients).catch(() => {})
  }, [])

  useEffect(() => {
    if (!productId) return
    orgGet<Product>(`/catalog/products/${productId}`)
      .then((p) => {
        setName(p.name)
        setReference(p.reference || '')
        setUnit(p.unit || '')
        setUnitPrice(p.unit_price != null ? String(p.unit_price) : '')
        setPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : '')
        setVatRate(String(p.vat_rate))
        setDescription(p.description || '')
        setAccountCode(p.account_code || '')
        setSalePriceMode(p.sale_price_mode)
        setCoefficientId(p.sale_price_coefficient_id || '')
        setIsInCatalog(p.is_in_catalog)
      })
      .catch(() => setError('Erreur chargement'))
      .finally(() => setLoadingData(false))
  }, [productId])

  const selectedCoef = coefficients.find(c => c.id === coefficientId)
  const computedPrice = salePriceMode === 'coefficient' && purchasePrice && selectedCoef
    ? (Number(purchasePrice) * Number(selectedCoef.value)).toFixed(2)
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name,
        reference: reference || undefined,
        unit: unit || undefined,
        vat_rate: Number(vatRate),
        description: description || undefined,
        account_code: accountCode || undefined,
        sale_price_mode: salePriceMode,
        is_in_catalog: isInCatalog,
        purchase_price: purchasePrice ? Number(purchasePrice) : undefined,
      }
      if (salePriceMode === 'fixed') {
        body.unit_price = unitPrice ? Number(unitPrice) : undefined
        body.sale_price_coefficient_id = null
      } else {
        body.sale_price_coefficient_id = coefficientId || undefined
        body.unit_price = null
      }
      if (productId) {
        await orgPatch(`/catalog/products/${productId}`, body)
        navigate(`/app/catalogue/${productId}`)
      } else {
        const result = await orgPost<{ id: string }>('/catalog/products', body)
        navigate(`/app/catalogue/${result.id}`)
      }
    } catch (err) {
      setError(httpError(err, 'Erreur'))
    }
    setSaving(false)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button onClick={() => navigate(productId ? `/app/catalogue/${productId}` : '/app/catalogue')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <h1 className="text-xl font-semibold text-gray-900 mb-6">
          {productId ? 'Modifier l\u2019article' : 'Nouvel article'}
        </h1>

        {error && <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {loadingData ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Infos principales */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Informations</h2>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="D&eacute;signation *" required className={INPUT} />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="R&eacute;f&eacute;rence" className={INPUT} />
                <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit&eacute; (m&sup2;, h, u...)" className={INPUT} />
              </div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className={INPUT} />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} placeholder="Compte comptable (706000)" className={INPUT} />
                <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={`${INPUT} bg-white`}>
                  <option value="20">TVA 20%</option>
                  <option value="10">TVA 10%</option>
                  <option value="5.5">TVA 5,5%</option>
                  <option value="2.1">TVA 2,1%</option>
                  <option value="0">TVA 0%</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={isInCatalog} onChange={(e) => setIsInCatalog(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-400" />
                Visible dans le catalogue g&eacute;n&eacute;ral
              </label>
            </div>

            {/* Prix */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Prix de vente</h2>
              <input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Prix d&apos;achat HT" className={INPUT} />

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="priceMode" value="fixed" checked={salePriceMode === 'fixed'}
                    onChange={() => setSalePriceMode('fixed')} className="text-orange-600 focus:ring-orange-400" />
                  Prix fixe
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="priceMode" value="coefficient" checked={salePriceMode === 'coefficient'}
                    onChange={() => setSalePriceMode('coefficient')} className="text-orange-600 focus:ring-orange-400" />
                  Coefficient
                </label>
              </div>

              {salePriceMode === 'fixed' ? (
                <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="Prix unitaire HT" className={INPUT} />
              ) : (
                <div className="space-y-2">
                  <select value={coefficientId} onChange={(e) => setCoefficientId(e.target.value)} className={`${INPUT} bg-white`}>
                    <option value="">S&eacute;lectionner un coefficient</option>
                    {coefficients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} (&times;{Number(c.value)}){c.client_name ? ` \u2014 ${c.client_name}` : ''}</option>
                    ))}
                  </select>
                  {computedPrice && (
                    <p className="text-sm text-gray-500">
                      Prix calcul&eacute; : <span className="font-semibold text-gray-700">{fmtPrice(Number(computedPrice))}</span>
                      <span className="text-xs text-gray-400 ml-1">({fmtPrice(Number(purchasePrice))} &times; {Number(selectedCoef?.value)})</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => navigate(productId ? `/app/catalogue/${productId}` : '/app/catalogue')} className={BTN_SECONDARY}>Annuler</button>
              <button type="submit" disabled={saving || !name} className={BTN_PRIMARY}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : productId ? 'Enregistrer' : 'Cr\u00e9er'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── D&eacute;tail article ──────────────────────────────────────────────────────────

function ProductDetailPage({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'variants' | 'purchases' | 'components' | 'discounts'>('variants')
  const [archiving, setArchiving] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = await orgGet<Product>(`/catalog/products/${productId}`)
      setProduct(p)
    } catch { navigate('/app/catalogue') }
    setLoading(false)
  }, [productId])

  useEffect(() => { void load() }, [load])

  async function handleArchive() {
    setArchiving(true)
    try {
      await orgDelete(`/catalog/products/${productId}`)
      navigate('/app/catalogue')
    } catch { /* ignore */ }
    setArchiving(false)
  }

  if (loading || !product) {
    return <div className="flex-1 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  }

  const tabs = [
    { key: 'variants' as const, label: 'Variantes client', icon: Users },
    { key: 'purchases' as const, label: 'Achats li\u00e9s', icon: ShoppingCart },
    { key: 'components' as const, label: 'Composition', icon: Layers },
    { key: 'discounts' as const, label: 'Paliers quantit\u00e9', icon: BarChart3 },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Retour */}
        <button onClick={() => navigate('/app/catalogue')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Catalogue
        </button>

        {/* En-t&ecirc;te */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{product.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {product.reference && <span className="text-sm text-gray-500 font-mono">{product.reference}</span>}
              {product.is_in_catalog && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Catalogue</span>}
              {product.is_composite && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Compos&eacute;</span>}
              {product.sale_price_mode === 'coefficient' && (
                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                  {product.coefficient_name} &times;{Number(product.coefficient_value)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/app/catalogue/${productId}/edit`)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
            <button onClick={() => setShowArchiveConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
              <Archive className="w-3.5 h-3.5" /> Archiver
            </button>
          </div>
        </div>

        {/* Infos r&eacute;sum&eacute;es */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <InfoCard label="Prix HT" value={fmtPrice(product.unit_price)} />
          <InfoCard label="Prix achat" value={fmtPrice(product.purchase_price)} />
          <InfoCard label="TVA" value={`${Number(product.vat_rate)} %`} />
          <InfoCard label="Unit&eacute;" value={product.unit || '\u2014'} />
        </div>

        {product.description && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
            <p className="text-sm text-gray-600">{product.description}</p>
          </div>
        )}

        {/* Onglets */}
        <div className="border-b border-gray-200 mb-4">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  tab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu onglet */}
        {tab === 'variants' && <VariantsTab productId={productId} />}
        {tab === 'purchases' && <PurchaseLinksTab productId={productId} />}
        {tab === 'components' && <ComponentsTab productId={productId} />}
        {tab === 'discounts' && <QuantityDiscountsTab productId={productId} />}

        {/* Confirm archivage */}
        {showArchiveConfirm && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowArchiveConfirm(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Archiver cet article ?</h3>
              <p className="text-sm text-gray-500 mb-4">L&apos;article ne sera plus visible dans le catalogue mais restera dans l&apos;historique.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowArchiveConfirm(false)} className={BTN_SECONDARY}>Annuler</button>
                <button onClick={handleArchive} disabled={archiving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Archiver'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-gray-900 mt-1">{value}</div>
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
    orgGet<{ items: ClientSimple[] }>('/clients', { page_size: 200 }).then(d => setClients(d.items)).catch(() => {})
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
        <p className="text-sm text-gray-500">{variants.length} variante(s) client</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN_PRIMARY}`}>
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : variants.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">Aucune variante client</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
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
                <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{v.client_name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{v.override_reference || '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-600">{v.override_name || '\u2014'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      v.price_mode === 'inherit' ? 'bg-gray-100 text-gray-500' :
                      v.price_mode === 'coefficient' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {v.price_mode === 'inherit' ? 'H\u00e9rit\u00e9' : v.price_mode === 'coefficient' ? `${v.coefficient_name} \u00d7${Number(v.coefficient_value)}` : 'Fixe'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{v.price_mode === 'fixed' ? fmtPrice(v.unit_price) : '\u2014'}</td>
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Nouvelle variante client</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={clientId} onChange={e => setClientId(e.target.value)} required className={`${INPUT} bg-white`}>
            <option value="">Client *</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="text" value={overrideRef} onChange={e => setOverrideRef(e.target.value)} placeholder="R&eacute;f&eacute;rence client" className={INPUT} />
          <input type="text" value={overrideName} onChange={e => setOverrideName(e.target.value)} placeholder="D&eacute;signation client" className={INPUT} />
          <div className="flex gap-4">
            {['inherit', 'fixed', 'coefficient'].map(m => (
              <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="radio" name="variantPriceMode" value={m} checked={priceMode === m}
                  onChange={() => setPriceMode(m)} className="text-orange-600 focus:ring-orange-400" />
                {m === 'inherit' ? 'H\u00e9riter' : m === 'fixed' ? 'Fixe' : 'Coefficient'}
              </label>
            ))}
          </div>
          {priceMode === 'fixed' && (
            <input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
              placeholder="Prix unitaire HT" className={INPUT} />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving || !clientId} className={BTN_PRIMARY}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cr\u00e9er'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Onglet Achats li&eacute;s ──────────────────────────────────────────────────────

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
        <p className="text-sm text-gray-500">{links.length} lien(s) achat</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN_PRIMARY}`}>
          <Plus className="w-3.5 h-3.5" /> Lier un achat
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : links.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">Aucun lien achat fournisseur</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
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
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {l.supplier_name || '\u2014'}
                    {l.is_default && <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">D&eacute;faut</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{l.supplier_reference || '\u2014'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtPrice(l.purchase_price)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      l.sale_price_mode === 'coefficient' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {l.sale_price_mode === 'coefficient' ? `${l.coefficient_name} \u00d7${Number(l.coefficient_value)}` : 'Fixe'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Lier un achat</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="R&eacute;f&eacute;rence fournisseur" className={INPUT} />
          <input type="number" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="Prix d&apos;achat HT" className={INPUT} />
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="radio" name="linkPriceMode" value="coefficient" checked={salePriceMode === 'coefficient'}
                onChange={() => setSalePriceMode('coefficient')} className="text-orange-600 focus:ring-orange-400" />
              Coefficient
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="radio" name="linkPriceMode" value="fixed" checked={salePriceMode === 'fixed'}
                onChange={() => setSalePriceMode('fixed')} className="text-orange-600 focus:ring-orange-400" />
              Prix fixe
            </label>
          </div>
          {salePriceMode === 'coefficient' ? (
            <select value={coefficientId} onChange={e => setCoefficientId(e.target.value)} className={`${INPUT} bg-white`}>
              <option value="">Coefficient</option>
              {coefficients.map(c => <option key={c.id} value={c.id}>{c.name} (&times;{Number(c.value)})</option>)}
            </select>
          ) : (
            <input type="number" step="0.01" value={fixedSalePrice} onChange={e => setFixedSalePrice(e.target.value)}
              placeholder="Prix de vente fixe HT" className={INPUT} />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-400" />
            Achat par d&eacute;faut
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cr\u00e9er'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Onglet Composition ──────────────────────────────────────────────────────

function ComponentsTab({ productId }: { productId: string }) {
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<Component[]>(`/catalog/products/${productId}/components`)
      setComponents(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [productId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    orgGet<{ items: Product[] }>('/catalog/products', { page_size: 100 }).then(d => setCatalogProducts(d.items.filter(p => p.id !== productId))).catch(() => {})
  }, [productId])

  async function handleDelete(componentId: string) {
    try {
      await orgDelete(`/catalog/products/${productId}/components/${componentId}`)
      void load()
    } catch { /* ignore */ }
  }

  const totalValue = components.reduce((sum, c) => sum + (Number(c.component_unit_price || 0) * Number(c.quantity)), 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500">{components.length} composant(s)</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN_PRIMARY}`}>
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : components.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">Aucun composant</div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  <th className="px-4 py-3">Composant</th>
                  <th className="px-4 py-3">R&eacute;f.</th>
                  <th className="px-4 py-3 text-right">Qt&eacute;</th>
                  <th className="px-4 py-3">Unit&eacute;</th>
                  <th className="px-4 py-3 text-right">PU HT</th>
                  <th className="px-4 py-3 text-right">Sous-total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {components.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.component_name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.component_reference || '\u2014'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{Number(c.quantity)}</td>
                    <td className="px-4 py-3 text-gray-500">{c.unit || '\u2014'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtPrice(c.component_unit_price)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmtPrice(Number(c.component_unit_price || 0) * Number(c.quantity))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-500 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-500">Total valorisation</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtPrice(totalValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <ComponentFormModal productId={productId} products={catalogProducts}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load() }} />
      )}
    </div>
  )
}

function ComponentFormModal({ productId, products, onClose, onSaved }: {
  productId: string; products: Product[]; onClose: () => void; onSaved: () => void
}) {
  const [componentProductId, setComponentProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await orgPost(`/catalog/products/${productId}/components`, {
        component_product_id: componentProductId,
        quantity: Number(quantity),
        unit: unit || undefined,
      })
      onSaved()
    } catch (err) { setError(httpError(err, 'Erreur')) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Ajouter un composant</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={componentProductId} onChange={e => setComponentProductId(e.target.value)} required className={`${INPUT} bg-white`}>
            <option value="">Article composant *</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.reference ? `(${p.reference})` : ''}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="0.01" min="0.01" value={quantity} onChange={e => setQuantity(e.target.value)}
              placeholder="Quantit&eacute; *" required className={INPUT} />
            <input type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unit&eacute;" className={INPUT} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving || !componentProductId} className={BTN_PRIMARY}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
        <p className="text-sm text-gray-500">{discounts.length} palier(s)</p>
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-sm ${BTN_PRIMARY}`}>
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : discounts.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">Aucun palier de remise quantit&eacute;</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                <th className="px-4 py-3">Qt&eacute; min.</th>
                <th className="px-4 py-3">Remise</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {discounts.map(d => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{Number(d.min_quantity)}</td>
                  <td className="px-4 py-3 text-orange-600 font-semibold">-{Number(d.discount_percent)} %</td>
                  <td className="px-4 py-3 text-gray-600">{d.client_name || 'Tous'}</td>
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
    orgGet<{ items: ClientSimple[] }>('/clients', { page_size: 200 }).then(d => setClients(d.items)).catch(() => {})
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Ajouter un palier</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="number" step="0.01" min="0.01" value={minQuantity} onChange={e => setMinQuantity(e.target.value)}
            placeholder="Quantit&eacute; minimum *" required className={INPUT} />
          <input type="number" step="0.01" min="0.01" max="100" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)}
            placeholder="Remise en % *" required className={INPUT} />
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={`${INPUT} bg-white`}>
            <option value="">Tous les clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
            <button type="submit" disabled={saving || !minQuantity || !discountPercent} className={BTN_PRIMARY}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cr\u00e9er'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

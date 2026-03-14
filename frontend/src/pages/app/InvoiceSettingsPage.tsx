// Kerpta — Paramètres facturation (comptes bancaires, profils, unités)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, Pencil, Trash2, Star, X } from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import BillingProfileModal, { type BillingProfileData } from '@/components/app/BillingProfileModal'

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 transition'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string
  label: string
  bank_name: string | null
  iban: string
  bic: string | null
  is_default: boolean
}

interface Unit {
  id: string
  label: string
  position: number
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className={`bg-white rounded-2xl shadow-xl w-full mx-4 max-h-[85vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── Section Comptes bancaires ────────────────────────────────────────────────

function BankAccountsSection() {
  const [items, setItems] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<BankAccount | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  // form state
  const [label, setLabel] = useState('')
  const [bankName, setBankName] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await orgGet<BankAccount[]>('/billing/bank-accounts')) } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function openModal(item: BankAccount | 'new') {
    if (item === 'new') {
      setLabel(''); setBankName(''); setIban(''); setBic(''); setIsDefault(false)
    } else {
      setLabel(item.label); setBankName(item.bank_name || ''); setIban(item.iban); setBic(item.bic || ''); setIsDefault(item.is_default)
    }
    setModal(item)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = { label, bank_name: bankName || null, iban, bic: bic || null, is_default: isDefault }
    try {
      if (modal === 'new') {
        await orgPost('/billing/bank-accounts', body)
      } else if (modal) {
        await orgPatch(`/billing/bank-accounts/${modal.id}`, body)
      }
      setModal(null)
      await load()
    } catch { /* */ }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce compte bancaire ?')) return
    try { await orgDelete(`/billing/bank-accounts/${id}`); await load() } catch { /* */ }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Comptes bancaires</h2>
        <button onClick={() => openModal('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Aucun compte bancaire</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
            <th className="px-3 py-2">Libellé</th><th className="px-3 py-2">Banque</th><th className="px-3 py-2">IBAN</th><th className="px-3 py-2">BIC</th><th className="px-3 py-2 text-center">Défaut</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-3 py-2 font-medium text-gray-900">{a.label}</td>
              <td className="px-3 py-2 text-gray-500">{a.bank_name || '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-600">{a.iban}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{a.bic || '—'}</td>
              <td className="px-3 py-2 text-center">{a.is_default && <Star className="w-4 h-4 text-orange-500 mx-auto" />}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => openModal(a)} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {modal !== null && (
        <Modal title={modal === 'new' ? 'Nouveau compte bancaire' : 'Modifier le compte'} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé *" required className={INPUT} />
            <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Nom de la banque" className={INPUT} />
            <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IBAN *" required className={INPUT} />
            <input type="text" value={bic} onChange={(e) => setBic(e.target.value)} placeholder="BIC" className={INPUT} />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
              Compte par défaut
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">Annuler</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg transition disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

// ── Section Profils de facturation ──────────────────────────────────────────

function BillingProfilesSection() {
  const [items, setItems] = useState<BillingProfileData[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<BillingProfileData | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await orgGet<BillingProfileData[]>('/billing/profiles')) } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce profil de facturation ?')) return
    try { await orgDelete(`/billing/profiles/${id}`); await load() } catch { /* */ }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Profils de facturation</h2>
        <button onClick={() => setModal('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Aucun profil de facturation</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
            <th className="px-3 py-2">Nom</th><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Délai</th><th className="px-3 py-2">Méthode</th><th className="px-3 py-2 text-center">Défaut</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>{items.map((p) => (
            <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-3 py-2 font-medium text-gray-900">{p.name}</td>
              <td className="px-3 py-2 text-gray-500">{p.bank_account_label || '—'}</td>
              <td className="px-3 py-2 text-gray-500">
                {p.payment_terms}j{' '}
                {p.payment_term_type === 'end_of_month' ? 'fin de mois' : p.payment_term_type === 'end_of_month_the' ? `fin de mois le ${p.payment_term_day ?? '—'}` : 'net'}
              </td>
              <td className="px-3 py-2 text-gray-500 capitalize">{p.payment_method || '—'}</td>
              <td className="px-3 py-2 text-center">{p.is_default && <Star className="w-4 h-4 text-orange-500 mx-auto" />}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => setModal(p)} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {modal !== null && (
        <BillingProfileModal
          profile={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </section>
  )
}

// ── Section Unités ────────────────────────────────────────────────────────────

function UnitsSection() {
  const [items, setItems] = useState<Unit[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<Unit[]>('/billing/units')
      setItems(data)
      setEdits(Object.fromEntries(data.map((u) => [u.id, u.label])))
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function addRow() {
    setNewLabel('')
    setItems((prev) => [...prev, { id: '__new__', label: '', position: prev.length }])
    setEdits((prev) => ({ ...prev, __new__: '' }))
  }

  async function removeRow(id: string) {
    if (id === '__new__') {
      setItems((prev) => prev.filter((u) => u.id !== '__new__'))
      setEdits((prev) => { const { __new__, ...rest } = prev; return rest })
      return
    }
    try { await orgDelete(`/billing/units/${id}`); await load() } catch { /* */ }
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Create new items
      for (const item of items) {
        if (item.id === '__new__') {
          const label = (edits['__new__'] || '').trim()
          if (label) await orgPost('/billing/units', { label, position: items.length })
        }
      }
      // Update existing items
      for (const item of items) {
        if (item.id !== '__new__' && edits[item.id] !== undefined && edits[item.id].trim() !== item.label) {
          await orgPatch(`/billing/units/${item.id}`, { label: edits[item.id].trim() })
        }
      }
      await load()
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Unités</h2>
          <p className="text-xs text-gray-400 mt-0.5">Unités de mesure disponibles dans les formulaires</p>
        </div>
        <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {items.map((u) => (
              <div key={u.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={edits[u.id] ?? u.label}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  placeholder="Libellé de l'unité..."
                  className={`flex-1 ${INPUT}`}
                />
                <button onClick={() => removeRow(u.id)} className="p-1.5 rounded hover:bg-red-50 transition" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ── Section Modes de règlement ────────────────────────────────────────────────

interface PaymentMethodItem {
  id: string
  label: string
  position: number
}

function PaymentMethodsSection() {
  const [items, setItems] = useState<PaymentMethodItem[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orgGet<PaymentMethodItem[]>('/billing/payment-methods')
      setItems(data)
      setEdits(Object.fromEntries(data.map((m) => [m.id, m.label])))
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function addRow() {
    setItems((prev) => [...prev, { id: '__new__', label: '', position: prev.length }])
    setEdits((prev) => ({ ...prev, __new__: '' }))
  }

  async function removeRow(id: string) {
    if (id === '__new__') {
      setItems((prev) => prev.filter((m) => m.id !== '__new__'))
      setEdits((prev) => { const { __new__, ...rest } = prev; return rest })
      return
    }
    try { await orgDelete(`/billing/payment-methods/${id}`); await load() } catch { /* */ }
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Create new items
      for (const item of items) {
        if (item.id === '__new__') {
          const label = (edits['__new__'] || '').trim()
          if (label) await orgPost('/billing/payment-methods', { label })
        }
      }
      // Update existing items
      for (const item of items) {
        if (item.id !== '__new__' && edits[item.id] !== undefined && edits[item.id].trim() !== item.label) {
          await orgPatch(`/billing/payment-methods/${item.id}`, { label: edits[item.id].trim() })
        }
      }
      await load()
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Modes de règlement</h2>
          <p className="text-xs text-gray-400 mt-0.5">Méthodes de paiement disponibles dans les profils de facturation</p>
        </div>
        <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {items.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={edits[m.id] ?? m.label}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  placeholder="Libellé du mode de règlement..."
                  className={`flex-1 ${INPUT}`}
                />
                <button onClick={() => removeRow(m.id)} className="p-1.5 rounded hover:bg-red-50 transition" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ── Section Taux de TVA ──────────────────────────────────────────────────────

interface VatRate { rate: string; label: string }

function VatRatesSection() {
  const [rates, setRates] = useState<VatRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orgGet<VatRate[]>('/billing/vat-rates')
      .then(setRates)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function updateRate(index: number, field: keyof VatRate, value: string) {
    setRates((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function removeRate(index: number) {
    setRates((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index))
  }

  function addRate() {
    setRates((prev) => [...prev, { rate: '', label: '' }])
  }

  async function handleSave() {
    const cleaned = rates.filter((r) => r.rate.trim())
    if (cleaned.length === 0) return
    setSaving(true)
    try {
      const result = await orgPatch<VatRate[]>('/billing/vat-rates', cleaned)
      setRates(result)
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Taux de TVA</h2>
          <p className="text-xs text-gray-400 mt-0.5">Taux disponibles dans les formulaires de devis et factures</p>
        </div>
        <button onClick={addRate} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {rates.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-24">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={r.rate}
                    onChange={(e) => updateRate(i, 'rate', e.target.value)}
                    placeholder="Taux %"
                    className={INPUT}
                  />
                </div>
                <input
                  type="text"
                  value={r.label}
                  onChange={(e) => updateRate(i, 'label', e.target.value)}
                  placeholder="Libellé (ex: Normal, Réduit...)"
                  className={`flex-1 ${INPUT}`}
                />
                <button onClick={() => removeRate(i)} className="p-1.5 rounded hover:bg-red-50 transition" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || rates.filter((r) => r.rate.trim()).length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

// ── Section Colonnes du document ─────────────────────────────────────────

interface ColumnConfig {
  reference: boolean
  description: boolean
  quantity: boolean
  unit: boolean
  unit_price: boolean
  vat_rate: boolean
  discount_percent: boolean
  total_ht: boolean
}

const COLUMN_LABELS: Record<keyof ColumnConfig, { label: string; locked?: boolean }> = {
  reference: { label: 'Référence' },
  description: { label: 'Désignation', locked: true },
  quantity: { label: 'Quantité', locked: true },
  unit: { label: 'Unité' },
  unit_price: { label: 'Prix unitaire HT', locked: true },
  vat_rate: { label: 'Taux TVA' },
  discount_percent: { label: 'Remise %' },
  total_ht: { label: 'Total HT', locked: true },
}

function DocumentColumnsSection() {
  const [columns, setColumns] = useState<ColumnConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orgGet<ColumnConfig>('/billing/document-columns')
      .then(setColumns)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggle(key: keyof ColumnConfig) {
    if (!columns || COLUMN_LABELS[key].locked) return
    const updated = { ...columns, [key]: !columns[key] }
    setColumns(updated)
    setSaving(true)
    try {
      await orgPatch('/billing/document-columns', updated)
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Colonnes du document</h2>
          <p className="text-xs text-gray-400 mt-0.5">Colonnes affichées sur les devis, factures et PDF</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : columns ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(COLUMN_LABELS) as (keyof ColumnConfig)[]).map((key) => {
            const { label, locked } = COLUMN_LABELS[key]
            const enabled = columns[key]
            return (
              <label
                key={key}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition cursor-pointer select-none ${
                  locked ? 'border-gray-100 bg-gray-50 cursor-default' :
                  enabled ? 'border-orange-200 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={locked}
                  onClick={() => toggle(key)}
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    locked ? 'bg-gray-300 cursor-default' : enabled ? 'bg-orange-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition ${
                    enabled ? 'translate-x-3' : 'translate-x-0'
                  }`} />
                </button>
                <span className={`text-sm ${locked ? 'text-gray-400' : 'text-gray-700'}`}>
                  {label}
                  {locked && <span className="text-[10px] text-gray-400 ml-1">(obligatoire)</span>}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

// ── Page principale ──────────────────────────────────────────────────────

export default function InvoiceSettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Paramètres de vente</h1>
        <DocumentColumnsSection />
        <BankAccountsSection />
        <BillingProfilesSection />
        <PaymentMethodsSection />
        <VatRatesSection />
        <UnitsSection />
      </div>
    </div>
  )
}

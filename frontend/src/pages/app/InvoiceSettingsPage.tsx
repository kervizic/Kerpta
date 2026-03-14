// Kerpta — Paramètres facturation (comptes bancaires, profils, unités)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, Pencil, Trash2, Star } from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import BillingProfileModal, { type BillingProfileData } from '@/components/app/BillingProfileModal'
import ModalOverlay from '@/components/app/ModalOverlay'

import { INPUT } from '@/lib/formStyles'

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
    <ModalOverlay onClose={onClose} size={wide ? 'xl' : 'lg'} title={title}>
      {children}
    </ModalOverlay>
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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Comptes bancaires</h2>
        <button onClick={() => openModal('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Aucun compte bancaire</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
            <th className="px-3 py-2">Libellé</th><th className="px-3 py-2">Banque</th><th className="px-3 py-2">IBAN</th><th className="px-3 py-2">BIC</th><th className="px-3 py-2 text-center">Défaut</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{a.label}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{a.bank_name || '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{a.iban}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{a.bic || '—'}</td>
              <td className="px-3 py-2 text-center">{a.is_default && <Star className="w-4 h-4 text-orange-500 mx-auto" />}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => openModal(a)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
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
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
              Compte par défaut
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">Annuler</button>
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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Profils de facturation</h2>
        <button onClick={() => setModal('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Aucun profil de facturation</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
            <th className="px-3 py-2">Nom</th><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Délai</th><th className="px-3 py-2">Méthode</th><th className="px-3 py-2 text-center">Défaut</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>{items.map((p) => (
            <tr key={p.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{p.name}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.bank_account_label || '—'}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                {p.payment_terms}j{' '}
                {p.payment_term_type === 'end_of_month' ? 'fin de mois' : p.payment_term_type === 'end_of_month_the' ? `fin de mois le ${p.payment_term_day ?? '—'}` : 'net'}
              </td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400 capitalize">{p.payment_method || '—'}</td>
              <td className="px-3 py-2 text-center">{p.is_default && <Star className="w-4 h-4 text-orange-500 mx-auto" />}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => setModal(p)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /></button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Unités</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Unités de mesure disponibles dans les formulaires</p>
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
                <button onClick={() => removeRow(u.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-500" />
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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Modes de règlement</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Méthodes de paiement disponibles dans les profils de facturation</p>
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
                <button onClick={() => removeRow(m.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-500" />
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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Taux de TVA</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Taux disponibles dans les formulaires de devis et factures</p>
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
                <button onClick={() => removeRate(i)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-500" />
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

// ── Section Types de documents (devis) ─────────────────────────────────────

interface DocType {
  key: string
  title: string
  columns: Record<string, boolean>
}

const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: 'reference', label: 'Réf.' },
  { key: 'description', label: 'Désignation' },
  { key: 'quantity', label: 'Qté' },
  { key: 'unit', label: 'Unité' },
  { key: 'unit_price', label: 'PU HT' },
  { key: 'vat_rate', label: 'TVA %' },
  { key: 'discount_percent', label: 'Rem. %' },
  { key: 'total_ht', label: 'Total HT' },
]

function QuoteDocumentTypesSection() {
  const [types, setTypes] = useState<DocType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editColumns, setEditColumns] = useState<Record<string, boolean>>({})
  const [addMode, setAddMode] = useState(false)

  useEffect(() => {
    orgGet<DocType[]>('/billing/quote-document-types')
      .then(setTypes)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function save(updated: DocType[]) {
    setSaving(true)
    try {
      const result = await orgPatch('/billing/quote-document-types', updated)
      setTypes(result as unknown as DocType[])
    } catch { /* */ }
    setSaving(false)
  }

  function startEdit(idx: number) {
    const t = types[idx]
    setEditIdx(idx)
    setEditKey(t.key)
    setEditTitle(t.title)
    setEditColumns({ ...t.columns })
    setAddMode(false)
  }

  function startAdd() {
    setEditIdx(null)
    setEditKey('')
    setEditTitle('')
    setEditColumns({
      reference: true, description: true, quantity: true, unit: true,
      unit_price: true, vat_rate: true, discount_percent: true, total_ht: true,
    })
    setAddMode(true)
  }

  function cancelEdit() {
    setEditIdx(null)
    setAddMode(false)
  }

  async function confirmEdit() {
    if (!editKey.trim() || !editTitle.trim()) return
    const entry: DocType = {
      key: editKey.trim().toLowerCase().replace(/\s+/g, '_'),
      title: editTitle.trim(),
      columns: editColumns,
    }
    let updated: DocType[]
    if (addMode) {
      updated = [...types, entry]
    } else if (editIdx !== null) {
      updated = types.map((t, i) => (i === editIdx ? entry : t))
    } else return

    await save(updated)
    setEditIdx(null)
    setAddMode(false)
  }

  async function remove(idx: number) {
    if (types.length <= 1) return
    const updated = types.filter((_, i) => i !== idx)
    await save(updated)
  }

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Types de documents</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Types disponibles lors de la création d'un devis, avec leurs colonnes</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
          <button onClick={startAdd} className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 font-medium transition">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : (
        <div className="space-y-2">
          {types.map((t, idx) => (
            <div key={t.key} className="border border-gray-200 dark:border-gray-700 rounded-lg">
              {editIdx === idx ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Clé (identifiant)</label>
                      <input value={editKey} onChange={(e) => setEditKey(e.target.value)} className={INPUT} placeholder="ex: devis" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Titre affiché sur le document</label>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} placeholder="ex: Devis" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">Colonnes visibles</label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_COLUMNS.map((col) => {
                        const on = editColumns[col.key] !== false
                        const locked = col.key === 'description' || col.key === 'unit_price'
                        return (
                          <button
                            key={col.key}
                            type="button"
                            disabled={locked}
                            onClick={() => setEditColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                            className={`px-2.5 py-1 text-xs rounded-full border transition ${
                              locked ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-default' :
                              on ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {col.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={confirmEdit} disabled={!editKey.trim() || !editTitle.trim()} className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-400 transition disabled:opacity-50">
                      Enregistrer
                    </button>
                    <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{t.title}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">{t.key}</span>
                    <div className="flex gap-1">
                      {ALL_COLUMNS.filter((c) => t.columns[c.key] !== false).map((c) => (
                        <span key={c.key} className="text-[10px] bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded">{c.label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(idx)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="Modifier">
                      <Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    </button>
                    {types.length > 1 && (
                      <button onClick={() => remove(idx)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition" title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {addMode && (
            <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-4 space-y-3 bg-orange-50/30 dark:bg-orange-900/20">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Clé (identifiant)</label>
                  <input value={editKey} onChange={(e) => setEditKey(e.target.value)} className={INPUT} placeholder="ex: pro_forma" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Titre affiché sur le document</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} placeholder="ex: Pro forma" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Colonnes visibles</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_COLUMNS.map((col) => {
                    const on = editColumns[col.key] !== false
                    const locked = col.key === 'description' || col.key === 'unit_price'
                    return (
                      <button
                        key={col.key}
                        type="button"
                        disabled={locked}
                        onClick={() => setEditColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                        className={`px-2.5 py-1 text-xs rounded-full border transition ${
                          locked ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-default' :
                          on ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        {col.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={confirmEdit} disabled={!editKey.trim() || !editTitle.trim()} className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-400 transition disabled:opacity-50">
                  Ajouter
                </button>
                <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Colonnes du document</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Colonnes affichées sur les devis, factures et PDF</p>
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
                  locked ? 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 cursor-default' :
                  enabled ? 'border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={locked}
                  onClick={() => toggle(key)}
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    locked ? 'bg-gray-300 dark:bg-gray-600 cursor-default' : enabled ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition ${
                    enabled ? 'translate-x-3' : 'translate-x-0'
                  }`} />
                </button>
                <span className={`text-sm ${locked ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                  {label}
                  {locked && <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">(obligatoire)</span>}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

// ── Section Arrondis ─────────────────────────────────────────────────────

interface RoundingConfig {
  quantity_display: number
  quantity_calc: number
  unit_price_display: number
  unit_price_calc: number
}

const ROUNDING_FIELDS: { key: keyof RoundingConfig; label: string; group: string }[] = [
  { key: 'quantity_display', label: 'Quantité — affichage', group: 'Quantité' },
  { key: 'quantity_calc', label: 'Quantité — calcul', group: 'Quantité' },
  { key: 'unit_price_display', label: 'Prix unitaire — affichage', group: 'Prix unitaire' },
  { key: 'unit_price_calc', label: 'Prix unitaire — calcul', group: 'Prix unitaire' },
]

const DECIMAL_OPTIONS = [
  { value: 0, label: '1 (0 décimale)' },
  { value: 1, label: '0,1 (1 décimale)' },
  { value: 2, label: '0,01 (2 décimales)' },
  { value: 3, label: '0,001 (3 décimales)' },
  { value: 4, label: '0,0001 (4 décimales)' },
  { value: 5, label: '0,00001 (5 décimales)' },
  { value: 6, label: '0,000001 (6 décimales)' },
]

function RoundingSection() {
  const [config, setConfig] = useState<RoundingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orgGet<RoundingConfig>('/billing/rounding')
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(key: keyof RoundingConfig, value: number) {
    if (!config) return
    const updated = { ...config, [key]: value }
    setConfig(updated)
    setSaving(true)
    try {
      await orgPatch('/billing/rounding', updated)
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Arrondis</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Précision des quantités et prix sur les documents et dans les calculs</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : config ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ROUNDING_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-700 dark:text-gray-200">{field.label}</span>
              <select
                value={config[field.key]}
                onChange={(e) => handleChange(field.key, parseInt(e.target.value))}
                className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-gray-800 dark:text-gray-200"
              >
                {DECIMAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
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
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Paramètres de vente</h1>
        <BankAccountsSection />
        <BillingProfilesSection />
        <PaymentMethodsSection />
        <VatRatesSection />
        <UnitsSection />
        <QuoteDocumentTypesSection />
        <DocumentColumnsSection />
        <RoundingSection />
      </div>
    </div>
  )
}

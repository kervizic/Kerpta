// Kerpta — Paramètres facturation (comptes bancaires, profils, unités)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, Pencil, Trash2, Star, X, GripVertical } from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'

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

interface BillingProfile {
  id: string
  name: string
  bank_account_id: string | null
  bank_account_label: string | null
  bank_account_iban: string | null
  payment_terms: number
  payment_method: string | null
  late_penalty_rate: number | null
  discount_rate: number | null
  legal_mentions: string | null
  footer: string | null
  is_default: boolean
}

interface Unit {
  id: string
  label: string
  position: number
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
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
  const [items, setItems] = useState<BillingProfile[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<BillingProfile | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  // form state
  const [name, setName] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('30')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [latePenaltyRate, setLatePenaltyRate] = useState('')
  const [discountRate, setDiscountRate] = useState('')
  const [legalMentions, setLegalMentions] = useState('')
  const [footer, setFooter] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profiles, accounts] = await Promise.all([
        orgGet<BillingProfile[]>('/billing/profiles'),
        orgGet<BankAccount[]>('/billing/bank-accounts'),
      ])
      setItems(profiles)
      setBankAccounts(accounts)
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function openModal(item: BillingProfile | 'new') {
    if (item === 'new') {
      setName(''); setBankAccountId(''); setPaymentTerms('30'); setPaymentMethod('')
      setLatePenaltyRate(''); setDiscountRate(''); setLegalMentions(''); setFooter(''); setIsDefault(false)
    } else {
      setName(item.name); setBankAccountId(item.bank_account_id || ''); setPaymentTerms(String(item.payment_terms))
      setPaymentMethod(item.payment_method || ''); setLatePenaltyRate(item.late_penalty_rate ? String(item.late_penalty_rate) : '')
      setDiscountRate(item.discount_rate ? String(item.discount_rate) : '')
      setLegalMentions(item.legal_mentions || ''); setFooter(item.footer || ''); setIsDefault(item.is_default)
    }
    setModal(item)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = {
      name,
      bank_account_id: bankAccountId || null,
      payment_terms: parseInt(paymentTerms) || 30,
      payment_method: paymentMethod || null,
      late_penalty_rate: latePenaltyRate ? parseFloat(latePenaltyRate) : null,
      discount_rate: discountRate ? parseFloat(discountRate) : null,
      legal_mentions: legalMentions || null,
      footer: footer || null,
      is_default: isDefault,
    }
    try {
      if (modal === 'new') {
        await orgPost('/billing/profiles', body)
      } else if (modal) {
        await orgPatch(`/billing/profiles/${modal.id}`, body)
      }
      setModal(null)
      await load()
    } catch { /* */ }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce profil de facturation ?')) return
    try { await orgDelete(`/billing/profiles/${id}`); await load() } catch { /* */ }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Profils de facturation</h2>
        <button onClick={() => openModal('new')} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition">
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
              <td className="px-3 py-2 text-gray-500">{p.payment_terms} jours</td>
              <td className="px-3 py-2 text-gray-500 capitalize">{p.payment_method || '—'}</td>
              <td className="px-3 py-2 text-center">{p.is_default && <Star className="w-4 h-4 text-orange-500 mx-auto" />}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => openModal(p)} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {modal !== null && (
        <Modal title={modal === 'new' ? 'Nouveau profil' : 'Modifier le profil'} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du profil *" required className={INPUT} />
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={`${INPUT} bg-white`}>
              <option value="">— Compte bancaire —</option>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.iban.slice(-4)})</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Délai de paiement (jours)</label>
                <input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Mode de paiement</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`${INPUT} bg-white`}>
                  <option value="">—</option>
                  <option value="virement">Virement</option>
                  <option value="cheque">Chèque</option>
                  <option value="carte">Carte</option>
                  <option value="especes">Espèces</option>
                  <option value="prelevement">Prélèvement</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Pénalités de retard (%)</label>
                <input type="number" step="0.01" value={latePenaltyRate} onChange={(e) => setLatePenaltyRate(e.target.value)} placeholder="Ex: 10.00" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Escompte (%)</label>
                <input type="number" step="0.01" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} placeholder="Ex: 1.00" className={INPUT} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Mentions légales</label>
              <textarea value={legalMentions} onChange={(e) => setLegalMentions(e.target.value)} rows={3} className={INPUT} placeholder="Mentions à afficher en bas de page" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pied de page</label>
              <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className={INPUT} placeholder="Texte personnalisé du pied de page" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
              Profil par défaut
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

// ── Section Unités ────────────────────────────────────────────────────────────

function UnitsSection() {
  const [items, setItems] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await orgGet<Unit[]>('/billing/units')) } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setAdding(true)
    try {
      await orgPost('/billing/units', { label: newLabel.trim(), position: items.length })
      setNewLabel('')
      await load()
    } catch { /* */ }
    setAdding(false)
  }

  async function handleDelete(id: string) {
    try { await orgDelete(`/billing/units/${id}`); await load() } catch { /* */ }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Unités</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {items.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700">
                {u.label}
                <button onClick={() => handleDelete(u.id)} className="p-0.5 rounded-full hover:bg-red-100 transition">
                  <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nouvelle unité..."
              className={`flex-1 ${INPUT}`}
            />
            <button type="submit" disabled={adding || !newLabel.trim()} className="px-3 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </form>
        </>
      )}
    </section>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function InvoiceSettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Paramètres de facturation</h1>
        <BankAccountsSection />
        <BillingProfilesSection />
        <UnitsSection />
      </div>
    </div>
  )
}

// Kerpta — Paramètres facturation (comptes bancaires, profils, unités)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Loader2, Pencil, Trash2, Star, X, Eye, EyeOff, Info } from 'lucide-react'
import { orgGet, orgPost, orgPatch, orgDelete } from '@/lib/orgApi'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

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
  payment_term_type: string
  payment_term_day: number | null
  payment_method: string | null
  late_penalty_rate: number | null
  discount_rate: number | null
  recovery_fee: number
  early_payment_discount: boolean
  payment_note: string | null
  legal_mentions_auto: boolean
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

// ── Génération auto des mentions légales ─────────────────────────────────────
// Basé sur les obligations françaises : articles L.441-10 à L.441-16
// et D.441-5 du Code de Commerce, art. 293 B du CGI.

const VAT_LABELS: Record<string, string> = {
  encaissements: 'TVA acquittée sur les encaissements.',
  debits: 'TVA acquittée sur les débits.',
  non_assujetti: 'TVA non applicable, art. 293 B du CGI.',
  franchise: 'TVA non applicable, art. 293 B du CGI.',
}

function buildLegalMentions(opts: {
  vatRegime: string
  latePenaltyRate: string
  recoveryFee: string
  earlyDiscount: boolean
  discountRate: string
}) {
  const lines: string[] = []

  // 1. Régime TVA (obligatoire si exonéré)
  lines.push(VAT_LABELS[opts.vatRegime] || VAT_LABELS.encaissements)

  // 2. Pénalités de retard (obligatoire — art. L.441-10 C. com.)
  // Taux minimum légal = 3× le taux d'intérêt légal
  // Taux recommandé par défaut = taux de refinancement BCE + 10 pts
  const penalty = parseFloat(opts.latePenaltyRate)
  if (penalty > 0) {
    lines.push(
      `En cas de retard de paiement, une pénalité de ${penalty.toFixed(2)} % annuel sera exigible ` +
      `à compter du jour suivant la date d'échéance (art. L.441-10 du Code de Commerce).`
    )
  } else {
    lines.push(
      `En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal en vigueur sera exigible ` +
      `à compter du jour suivant la date d'échéance (art. L.441-10 du Code de Commerce).`
    )
  }

  // 3. Indemnité forfaitaire de recouvrement (obligatoire — art. D.441-5 C. com.)
  const fee = parseFloat(opts.recoveryFee)
  if (fee > 0) {
    lines.push(
      `Conformément à l'article D.441-5 du Code de Commerce, tout retard de paiement entraîne de plein droit ` +
      `une indemnité forfaitaire pour frais de recouvrement de ${fee.toFixed(2)} €.`
    )
  }

  // 4. Escompte (obligatoire de mentionner — art. L.441-9 I al.5 C. com.)
  if (opts.earlyDiscount && parseFloat(opts.discountRate) > 0) {
    lines.push(`Escompte pour paiement anticipé : ${parseFloat(opts.discountRate).toFixed(2)} %.`)
  } else {
    lines.push(`Pas d'escompte pour paiement anticipé.`)
  }

  return lines.join('\n')
}

// ── Section Profils de facturation ──────────────────────────────────────────

function BillingProfilesSection() {
  const { activeOrgId } = useAuthStore()
  const [items, setItems] = useState<BillingProfile[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<BillingProfile | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  // Régime TVA de l'organisation (récupéré depuis l'API org)
  const [orgVatRegime, setOrgVatRegime] = useState<string | null>(null)
  const [orgVatExigibility, setOrgVatExigibility] = useState('encaissements')

  // form state
  const [name, setName] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('30')
  const [paymentTermType, setPaymentTermType] = useState('net')
  const [paymentTermDay, setPaymentTermDay] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [latePenaltyRate, setLatePenaltyRate] = useState('')
  const [discountRate, setDiscountRate] = useState('')
  const [recoveryFee, setRecoveryFee] = useState('40.00')
  const [earlyPaymentDiscount, setEarlyPaymentDiscount] = useState(false)
  const [paymentNote, setPaymentNote] = useState('')
  const [legalMentionsAuto, setLegalMentionsAuto] = useState(true)
  const [legalMentions, setLegalMentions] = useState('')
  const [footer, setFooter] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Dériver le régime TVA effectif pour les mentions légales
  const effectiveVatRegime = orgVatRegime === 'none' ? 'franchise' : orgVatExigibility

  // Texte auto-généré (recalculé en temps réel)
  const autoText = useMemo(
    () => buildLegalMentions({ vatRegime: effectiveVatRegime, latePenaltyRate, recoveryFee, earlyDiscount: earlyPaymentDiscount, discountRate }),
    [effectiveVatRegime, latePenaltyRate, recoveryFee, earlyPaymentDiscount, discountRate],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profiles, accounts, methods] = await Promise.all([
        orgGet<BillingProfile[]>('/billing/profiles'),
        orgGet<BankAccount[]>('/billing/bank-accounts'),
        orgGet<PaymentMethodItem[]>('/billing/payment-methods'),
      ])
      setItems(profiles)
      setBankAccounts(accounts)
      setPaymentMethods(methods)

      // Charger les infos TVA de l'org
      if (activeOrgId) {
        try {
          const { data: orgData } = await apiClient.get<{ vat_regime: string | null; vat_exigibility: string | null }>(`/organizations/${activeOrgId}`)
          setOrgVatRegime(orgData.vat_regime ?? null)
          setOrgVatExigibility(orgData.vat_exigibility ?? 'encaissements')
        } catch { /* */ }
      }
    } catch { /* */ }
    setLoading(false)
  }, [activeOrgId])

  useEffect(() => { void load() }, [load])

  async function openModal(item: BillingProfile | 'new') {
    // Toujours refetch les comptes bancaires pour avoir la liste à jour
    try { setBankAccounts(await orgGet<BankAccount[]>('/billing/bank-accounts')) } catch { /* */ }

    if (item === 'new') {
      setName(''); setBankAccountId(''); setPaymentTerms('30'); setPaymentTermType('net'); setPaymentTermDay('')
      setPaymentMethod(''); setLatePenaltyRate(''); setDiscountRate('')
      setRecoveryFee('40.00'); setEarlyPaymentDiscount(false)
      setPaymentNote(''); setLegalMentionsAuto(true); setLegalMentions(''); setFooter(''); setIsDefault(false)
    } else {
      setName(item.name); setBankAccountId(item.bank_account_id || ''); setPaymentTerms(String(item.payment_terms))
      setPaymentTermType(item.payment_term_type || 'net'); setPaymentTermDay(item.payment_term_day ? String(item.payment_term_day) : '')
      setPaymentMethod(item.payment_method || ''); setLatePenaltyRate(item.late_penalty_rate ? String(item.late_penalty_rate) : '')
      setDiscountRate(item.discount_rate ? String(item.discount_rate) : '')
      setRecoveryFee(String(item.recovery_fee ?? 40))
      setEarlyPaymentDiscount(item.early_payment_discount ?? false)
      setPaymentNote(item.payment_note || ''); setLegalMentionsAuto(item.legal_mentions_auto ?? true)
      setLegalMentions(item.legal_mentions || ''); setFooter(item.footer || ''); setIsDefault(item.is_default)
    }
    setShowPreview(false)
    setModal(item)
  }

  function handleToggleAuto(checked: boolean) {
    setLegalMentionsAuto(checked)
    if (checked) {
      // Repasser en auto → on écrase le texte manuel
      setLegalMentions('')
    } else {
      // Passer en manuel → on copie le texte auto dans le textarea
      setLegalMentions(autoText)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = {
      name,
      bank_account_id: bankAccountId || null,
      payment_terms: parseInt(paymentTerms) || 30,
      payment_term_type: paymentTermType,
      payment_term_day: paymentTermType === 'end_of_month_the' && paymentTermDay ? parseInt(paymentTermDay) : null,
      payment_method: paymentMethod || null,
      late_penalty_rate: latePenaltyRate ? parseFloat(latePenaltyRate) : null,
      discount_rate: discountRate ? parseFloat(discountRate) : null,
      recovery_fee: parseFloat(recoveryFee) || 40,
      early_payment_discount: earlyPaymentDiscount,
      payment_note: paymentNote || null,
      legal_mentions_auto: legalMentionsAuto,
      legal_mentions: legalMentionsAuto ? autoText : (legalMentions || null),
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
              <td className="px-3 py-2 text-gray-500">
                {p.payment_terms}j{' '}
                {p.payment_term_type === 'end_of_month' ? 'fin de mois' : p.payment_term_type === 'end_of_month_the' ? `fin de mois le ${p.payment_term_day ?? '—'}` : 'net'}
              </td>
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
        <Modal title={modal === 'new' ? 'Nouveau profil' : 'Modifier le profil'} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-4">
            {/* ── Identité ── */}
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du profil *" required className={INPUT} />
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={`${INPUT} bg-white`}>
              <option value="">— Compte bancaire —</option>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.iban.slice(-4)})</option>)}
            </select>

            {/* ── Conditions de paiement ── */}
            <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
              <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Conditions de paiement</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Délai (jours)</label>
                  <input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Type de délai</label>
                  <select value={paymentTermType} onChange={(e) => setPaymentTermType(e.target.value)} className={`${INPUT} bg-white`}>
                    <option value="net">Net (date de facture + jours)</option>
                    <option value="end_of_month">Fin de mois</option>
                    <option value="end_of_month_the">Fin de mois le...</option>
                  </select>
                </div>
              </div>
              {paymentTermType === 'end_of_month_the' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Jour du mois</label>
                  <input type="number" min={1} max={31} value={paymentTermDay} onChange={(e) => setPaymentTermDay(e.target.value)} placeholder="Ex: 15" className={INPUT} />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Mode de règlement</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`${INPUT} bg-white`}>
                  <option value="">—</option>
                  {paymentMethods.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
                </select>
              </div>
            </fieldset>

            {/* ── Mentions légales ── */}
            <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
              <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Mentions légales</legend>

              {/* Toggle auto / manuel */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={legalMentionsAuto}
                    onChange={(e) => handleToggleAuto(e.target.checked)}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                  />
                  Mode automatique
                </label>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition"
                >
                  {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPreview ? 'Masquer' : 'Aperçu'}
                </button>
              </div>

              {/* Régime TVA (lecture seule — configuré dans Ma structure) */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>
                  Régime TVA : <strong>{
                    orgVatRegime === 'none'
                      ? 'Franchise en base (art. 293 B du CGI)'
                      : orgVatExigibility === 'debits'
                        ? 'TVA sur les débits'
                        : 'TVA sur les encaissements'
                  }</strong>
                  <span className="text-gray-400"> — modifiable dans </span>
                  <a href="/app/config/structure" className="text-orange-500 hover:underline">Ma structure</a>
                </span>
              </div>

              {legalMentionsAuto ? (
                <>
                  {/* Champs structurés */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Indemnité de recouvrement</label>
                      <div className="relative">
                        <input type="number" step="0.01" value={recoveryFee} onChange={(e) => setRecoveryFee(e.target.value)} className={INPUT} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Pénalités de retard (% annuel)</label>
                      <input type="number" step="0.01" value={latePenaltyRate} onChange={(e) => setLatePenaltyRate(e.target.value)} placeholder="Vide = 3x taux légal" className={INPUT} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Taux d'escompte (%)</label>
                      <input type="number" step="0.01" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} placeholder="Ex: 1.50" className={INPUT} disabled={!earlyPaymentDiscount} />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={earlyPaymentDiscount}
                          onChange={(e) => setEarlyPaymentDiscount(e.target.checked)}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                        />
                        Escompte pour paiement anticipé
                      </label>
                    </div>
                  </div>

                  {/* Aperçu auto */}
                  {showPreview && (
                    <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Aperçu des mentions générées</p>
                      <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{autoText}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Mode manuel */}
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Mode manuel : vous pouvez modifier librement le texte ci-dessous. Repassez en automatique pour régénérer.
                  </p>
                  <textarea
                    value={legalMentions}
                    onChange={(e) => setLegalMentions(e.target.value)}
                    rows={6}
                    className={INPUT}
                    placeholder="Saisissez vos mentions légales personnalisées..."
                  />
                </>
              )}
            </fieldset>

            {/* ── Note de règlement ── */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Note de règlement (ex: affacturage, coordonnées factor...)</label>
              <textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={2} className={INPUT} placeholder="Pour être libératoire, votre règlement doit être effectué à l'ordre de..." />
            </div>

            {/* ── Pied de page ── */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pied de page personnalisé</label>
              <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className={INPUT} placeholder="Texte libre en bas du document" />
            </div>

            {/* ── Options ── */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
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

// ── Section Modes de règlement ────────────────────────────────────────────────

interface PaymentMethodItem {
  id: string
  label: string
  position: number
}

function PaymentMethodsSection() {
  const [items, setItems] = useState<PaymentMethodItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await orgGet<PaymentMethodItem[]>('/billing/payment-methods')) } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setAdding(true)
    try {
      await orgPost('/billing/payment-methods', { label: newLabel.trim() })
      setNewLabel('')
      await load()
    } catch { /* */ }
    setAdding(false)
  }

  async function handleDelete(id: string) {
    try { await orgDelete(`/billing/payment-methods/${id}`); await load() } catch { /* */ }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Modes de règlement</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {items.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700">
                {m.label}
                <button onClick={() => handleDelete(m.id)} className="p-0.5 rounded-full hover:bg-red-100 transition">
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
              placeholder="Nouveau mode de règlement..."
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
        <h1 className="text-xl font-semibold text-gray-900">Paramètres de vente</h1>
        <BankAccountsSection />
        <BillingProfilesSection />
        <PaymentMethodsSection />
        <UnitsSection />
      </div>
    </div>
  )
}

// Kerpta — Modale d'édition de profil de facturation (composant partagé)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useMemo } from 'react'
import { Loader2, X, Eye, EyeOff, Info } from 'lucide-react'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 transition'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillingProfileData {
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

interface BankAccount { id: string; label: string; iban: string }
interface PaymentMethodItem { id: string; label: string }

// ── Mentions légales auto ─────────────────────────────────────────────────────

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
  lines.push(VAT_LABELS[opts.vatRegime] || VAT_LABELS.encaissements)
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
  const fee = parseFloat(opts.recoveryFee)
  if (fee > 0) {
    lines.push(
      `Conformément à l'article D.441-5 du Code de Commerce, tout retard de paiement entraîne de plein droit ` +
      `une indemnité forfaitaire pour frais de recouvrement de ${fee.toFixed(2)} €.`
    )
  }
  if (opts.earlyDiscount && parseFloat(opts.discountRate) > 0) {
    lines.push(`Escompte pour paiement anticipé : ${parseFloat(opts.discountRate).toFixed(2)} %.`)
  } else {
    lines.push(`Pas d'escompte pour paiement anticipé.`)
  }
  return lines.join('\n')
}

// ── Composant modale ──────────────────────────────────────────────────────────

interface Props {
  /** Profile à éditer, ou null pour créer un nouveau */
  profile: BillingProfileData | null
  onClose: () => void
  onSaved: () => void
}

export default function BillingProfileModal({ profile, onClose, onSaved }: Props) {
  const isNew = !profile
  const { activeOrgId } = useAuthStore()

  // Données de référence
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([])
  const [orgVatRegime, setOrgVatRegime] = useState<string | null>(null)
  const [orgVatExigibility, setOrgVatExigibility] = useState('encaissements')
  const [loadingRef, setLoadingRef] = useState(true)

  // Form state
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
  const [saving, setSaving] = useState(false)

  // Charger les données de référence + pré-remplir le formulaire
  useEffect(() => {
    async function load() {
      try {
        const [accounts, methods] = await Promise.all([
          orgGet<BankAccount[]>('/billing/bank-accounts'),
          orgGet<PaymentMethodItem[]>('/billing/payment-methods'),
        ])
        setBankAccounts(accounts)
        setPaymentMethods(methods)

        if (activeOrgId) {
          try {
            const { data: orgData } = await apiClient.get<{ vat_regime: string | null; vat_exigibility: string | null }>(`/organizations/${activeOrgId}`)
            setOrgVatRegime(orgData.vat_regime ?? null)
            setOrgVatExigibility(orgData.vat_exigibility ?? 'encaissements')
          } catch { /* */ }
        }
      } catch { /* */ }
      setLoadingRef(false)
    }
    void load()

    // Pré-remplir si édition
    if (profile) {
      setName(profile.name)
      setBankAccountId(profile.bank_account_id || '')
      setPaymentTerms(String(profile.payment_terms))
      setPaymentTermType(profile.payment_term_type || 'net')
      setPaymentTermDay(profile.payment_term_day ? String(profile.payment_term_day) : '')
      setPaymentMethod(profile.payment_method || '')
      setLatePenaltyRate(profile.late_penalty_rate ? String(profile.late_penalty_rate) : '')
      setDiscountRate(profile.discount_rate ? String(profile.discount_rate) : '')
      setRecoveryFee(String(profile.recovery_fee ?? 40))
      setEarlyPaymentDiscount(profile.early_payment_discount ?? false)
      setPaymentNote(profile.payment_note || '')
      setLegalMentionsAuto(profile.legal_mentions_auto ?? true)
      setLegalMentions(profile.legal_mentions || '')
      setFooter(profile.footer || '')
      setIsDefault(profile.is_default)
    }
  }, [profile, activeOrgId])

  const effectiveVatRegime = orgVatRegime === 'none' ? 'franchise' : orgVatExigibility

  const autoText = useMemo(
    () => buildLegalMentions({ vatRegime: effectiveVatRegime, latePenaltyRate, recoveryFee, earlyDiscount: earlyPaymentDiscount, discountRate }),
    [effectiveVatRegime, latePenaltyRate, recoveryFee, earlyPaymentDiscount, discountRate],
  )

  function handleToggleAuto(checked: boolean) {
    setLegalMentionsAuto(checked)
    if (checked) {
      setLegalMentions('')
    } else {
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
      if (isNew) {
        await orgPost('/billing/profiles', body)
      } else {
        await orgPatch(`/billing/profiles/${profile.id}`, body)
      }
      onSaved()
      onClose()
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full mx-4 max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{isNew ? 'Nouveau profil' : 'Modifier le profil'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="px-5 py-4">
          {loadingRef ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              {/* Identité */}
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du profil *" required className={INPUT} />
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={`${INPUT} bg-white`}>
                <option value="">— Compte bancaire —</option>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.iban.slice(-4)})</option>)}
              </select>

              {/* Conditions de paiement */}
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

              {/* Mentions légales */}
              <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Mentions légales</legend>

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
                    {showPreview && (
                      <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Aperçu des mentions générées</p>
                        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{autoText}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
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

              {/* Note de règlement */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Note de règlement (ex: affacturage, coordonnées factor...)</label>
                <textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={2} className={INPUT} placeholder="Pour être libératoire, votre règlement doit être effectué à l'ordre de..." />
              </div>

              {/* Pied de page */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Pied de page personnalisé</label>
                <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className={INPUT} placeholder="Texte libre en bas du document" />
              </div>

              {/* Options */}
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
                Profil par défaut
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">Annuler</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg transition disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

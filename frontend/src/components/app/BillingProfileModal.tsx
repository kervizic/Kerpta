// Kerpta - Modale d'edition de profil de facturation (composant partage)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Eye, EyeOff, Info } from 'lucide-react'
import { orgGet, orgPost, orgPatch } from '@/lib/orgApi'
import ModalOverlay from '@/components/app/ModalOverlay'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

import { INPUT, SELECT, BTN, TEXTAREA } from '@/lib/formStyles'

// -- Types --------------------------------------------------------------------

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

// -- Schema Zod ---------------------------------------------------------------

const schema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  bankAccountId: z.string(),
  paymentTerms: z.string(),
  paymentTermType: z.string(),
  paymentTermDay: z.string(),
  paymentMethod: z.string(),
  latePenaltyRate: z.string(),
  discountRate: z.string(),
  recoveryFee: z.string(),
  earlyPaymentDiscount: z.boolean(),
  paymentNote: z.string(),
  legalMentionsAuto: z.boolean(),
  legalMentions: z.string(),
  isDefault: z.boolean(),
})

type FormValues = z.infer<typeof schema>

// -- Mentions l\u00e9gales auto ----------------------------------------------------

const VAT_LABELS: Record<string, string> = {
  encaissements: 'TVA acquitt\u00e9e sur les encaissements.',
  debits: 'TVA acquitt\u00e9e sur les d\u00e9bits.',
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
      `En cas de retard de paiement, une p\u00e9nalit\u00e9 de ${penalty.toFixed(2)} % annuel sera exigible ` +
      `\u00e0 compter du jour suivant la date d'\u00e9ch\u00e9ance (art. L.441-10 du Code de Commerce).`
    )
  } else {
    lines.push(
      `En cas de retard de paiement, une p\u00e9nalit\u00e9 \u00e9gale \u00e0 3 fois le taux d'int\u00e9r\u00eat l\u00e9gal en vigueur sera exigible ` +
      `\u00e0 compter du jour suivant la date d'\u00e9ch\u00e9ance (art. L.441-10 du Code de Commerce).`
    )
  }
  const fee = parseFloat(opts.recoveryFee)
  if (fee > 0) {
    lines.push(
      `Conform\u00e9ment \u00e0 l'article D.441-5 du Code de Commerce, tout retard de paiement entra\u00eene de plein droit ` +
      `une indemnit\u00e9 forfaitaire pour frais de recouvrement de ${fee.toFixed(2)} \u20ac.`
    )
  }
  if (opts.earlyDiscount && parseFloat(opts.discountRate) > 0) {
    lines.push(`Escompte pour paiement anticip\u00e9 : ${parseFloat(opts.discountRate).toFixed(2)} %.`)
  } else {
    lines.push(`Pas d'escompte pour paiement anticip\u00e9.`)
  }
  return lines.join('\n')
}

// -- Composant modale ---------------------------------------------------------

interface Props {
  profile: BillingProfileData | null
  onClose: () => void
  onSaved: () => void
}

function getDefaults(profile: BillingProfileData | null): FormValues {
  if (profile) {
    return {
      name: profile.name,
      bankAccountId: profile.bank_account_id || '',
      paymentTerms: String(profile.payment_terms),
      paymentTermType: profile.payment_term_type || 'net',
      paymentTermDay: profile.payment_term_day ? String(profile.payment_term_day) : '',
      paymentMethod: profile.payment_method || '',
      latePenaltyRate: profile.late_penalty_rate ? String(profile.late_penalty_rate) : '',
      discountRate: profile.discount_rate ? String(profile.discount_rate) : '',
      recoveryFee: String(profile.recovery_fee ?? 40),
      earlyPaymentDiscount: profile.early_payment_discount ?? false,
      paymentNote: profile.payment_note || '',
      legalMentionsAuto: profile.legal_mentions_auto ?? true,
      legalMentions: profile.legal_mentions || '',
      isDefault: profile.is_default,
    }
  }
  return {
    name: '',
    bankAccountId: '',
    paymentTerms: '30',
    paymentTermType: 'net',
    paymentTermDay: '',
    paymentMethod: '',
    latePenaltyRate: '',
    discountRate: '',
    recoveryFee: '40.00',
    earlyPaymentDiscount: false,
    paymentNote: '',
    legalMentionsAuto: true,
    legalMentions: '',
    isDefault: false,
  }
}

export default function BillingProfileModal({ profile, onClose, onSaved }: Props) {
  const isNew = !profile
  const { activeOrgId } = useAuthStore()

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([])
  const [orgVatRegime, setOrgVatRegime] = useState<string | null>(null)
  const [orgVatExigibility, setOrgVatExigibility] = useState('encaissements')
  const [loadingRef, setLoadingRef] = useState(true)
  const [showPreview, setShowPreview] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaults(profile),
  })

  const paymentTermType = watch('paymentTermType')
  const legalMentionsAuto = watch('legalMentionsAuto')
  const earlyPaymentDiscount = watch('earlyPaymentDiscount')
  const latePenaltyRate = watch('latePenaltyRate')
  const discountRate = watch('discountRate')
  const recoveryFee = watch('recoveryFee')

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
  }, [activeOrgId])

  const effectiveVatRegime = orgVatRegime === 'none' ? 'franchise' : orgVatExigibility

  const autoText = useMemo(
    () => buildLegalMentions({ vatRegime: effectiveVatRegime, latePenaltyRate, recoveryFee, earlyDiscount: earlyPaymentDiscount, discountRate }),
    [effectiveVatRegime, latePenaltyRate, recoveryFee, earlyPaymentDiscount, discountRate],
  )

  function handleToggleAuto(checked: boolean) {
    setValue('legalMentionsAuto', checked)
    if (checked) {
      setValue('legalMentions', '')
    } else {
      setValue('legalMentions', autoText)
    }
  }

  async function onSubmit(data: FormValues) {
    const body = {
      name: data.name,
      bank_account_id: data.bankAccountId || null,
      payment_terms: parseInt(data.paymentTerms) || 30,
      payment_term_type: data.paymentTermType,
      payment_term_day: data.paymentTermType === 'end_of_month_the' && data.paymentTermDay ? parseInt(data.paymentTermDay) : null,
      payment_method: data.paymentMethod || null,
      late_penalty_rate: data.latePenaltyRate ? parseFloat(data.latePenaltyRate) : null,
      discount_rate: data.discountRate ? parseFloat(data.discountRate) : null,
      recovery_fee: parseFloat(data.recoveryFee) || 40,
      early_payment_discount: data.earlyPaymentDiscount,
      payment_note: data.paymentNote || null,
      legal_mentions_auto: data.legalMentionsAuto,
      legal_mentions: data.legalMentionsAuto ? autoText : (data.legalMentions || null),
      is_default: data.isDefault,
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
  }

  return (
    <ModalOverlay onClose={onClose} size="xl" title={isNew ? 'Nouveau profil' : 'Modifier le profil'}>
        <div>
          {loadingRef ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <input type="text" {...register('name')} placeholder="Nom du profil *" required className={INPUT} />
              <select {...register('bankAccountId')} className={SELECT}>
                <option value="">- Compte bancaire -</option>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.iban.slice(-4)})</option>)}
              </select>

              <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Conditions de paiement</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">D\u00e9lai (jours)</label>
                    <input type="number" {...register('paymentTerms')} className={INPUT} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Type de d\u00e9lai</label>
                    <select {...register('paymentTermType')} className={SELECT}>
                      <option value="net">Net (date de facture + jours)</option>
                      <option value="end_of_month">Fin de mois</option>
                      <option value="end_of_month_the">Fin de mois le...</option>
                    </select>
                  </div>
                </div>
                {paymentTermType === 'end_of_month_the' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Jour du mois</label>
                    <input type="number" min={1} max={31} {...register('paymentTermDay')} placeholder="Ex: 15" className={INPUT} />
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Mode de r\u00e8glement</label>
                  <select {...register('paymentMethod')} className={SELECT}>
                    <option value="">-</option>
                    {paymentMethods.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
                  </select>
                </div>
              </fieldset>

              <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Mentions l\u00e9gales</legend>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={legalMentionsAuto}
                      onChange={(e) => handleToggleAuto(e.target.checked)}
                      className="rounded border-gray-300 text-kerpta focus:ring-kerpta-400"
                    />
                    Mode automatique
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Masquer' : 'Aper\u00e7u'}
                  </button>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                  <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>
                    R\u00e9gime TVA : <strong>{
                      orgVatRegime === 'none'
                        ? 'Franchise en base (art. 293 B du CGI)'
                        : orgVatExigibility === 'debits'
                          ? 'TVA sur les d\u00e9bits'
                          : 'TVA sur les encaissements'
                    }</strong>
                    <span className="text-gray-400"> - modifiable dans </span>
                    <a href="/app/config/structure" className="text-kerpta hover:underline">Ma structure</a>
                  </span>
                </div>

                {legalMentionsAuto ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Indemnit\u00e9 de recouvrement</label>
                        <div className="relative">
                          <input type="number" step="0.01" {...register('recoveryFee')} className={INPUT} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{'\u20ac'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">P\u00e9nalit\u00e9s de retard (% annuel)</label>
                        <input type="number" step="0.01" {...register('latePenaltyRate')} placeholder="Vide = 3x taux l\u00e9gal" className={INPUT} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Taux d'escompte (%)</label>
                        <input type="number" step="0.01" {...register('discountRate')} placeholder="Ex: 1.50" className={INPUT} disabled={!earlyPaymentDiscount} />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            {...register('earlyPaymentDiscount')}
                            className="rounded border-gray-300 text-kerpta focus:ring-kerpta-400"
                          />
                          Escompte pour paiement anticip\u00e9
                        </label>
                      </div>
                    </div>
                    {showPreview && (
                      <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Aper\u00e7u des mentions g\u00e9n\u00e9r\u00e9es</p>
                        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{autoText}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Mode manuel : vous pouvez modifier librement le texte ci-dessous. Repassez en automatique pour r\u00e9g\u00e9n\u00e9rer.
                    </p>
                    <textarea
                      {...register('legalMentions')}
                      rows={6}
                      className={TEXTAREA}
                      placeholder="Saisissez vos mentions l\u00e9gales personnalis\u00e9es..."
                    />
                  </>
                )}
              </fieldset>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Note de r\u00e8glement (ex: affacturage, coordonn\u00e9es factor...)</label>
                <textarea {...register('paymentNote')} rows={5} className={TEXTAREA} placeholder="Pour \u00eatre lib\u00e9ratoire, votre r\u00e8glement doit \u00eatre effectu\u00e9 \u00e0 l'ordre de..." />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" {...register('isDefault')} className="rounded border-gray-300 text-kerpta focus:ring-kerpta-400" />
                Profil par d\u00e9faut
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">Annuler</button>
                <button type="submit" disabled={isSubmitting} className={BTN}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </div>
    </ModalOverlay>
  )
}

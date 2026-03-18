// Kerpta — Paramètres des documents (style, pied de page, types)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import { Plus, Loader2, Pencil, Trash2, FileText, Sparkles, Minus, Info } from 'lucide-react'
import { orgGet, orgPatch } from '@/lib/orgApi'
import { INPUT, BTN_SM } from '@/lib/formStyles'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  { key: 'total_ttc', label: 'Total TTC' },
]

// ── Section Style d'impression ──────────────────────────────────────────

interface PrintStyleOption {
  key: string
  label: string
  description: string
  icon: typeof FileText
}

const PRINT_STYLES: PrintStyleOption[] = [
  {
    key: 'classique',
    label: 'Classique',
    description: 'Professionnel et formel — bordures, en-têtes gris, mise en page traditionnelle',
    icon: FileText,
  },
  {
    key: 'moderne',
    label: 'Moderne',
    description: 'Design actuel — lignes épurées, typographie soignée',
    icon: Sparkles,
  },
  {
    key: 'minimaliste',
    label: 'Minimaliste',
    description: 'Ultra-épuré — maximum de blanc, typographie fine, séparateurs subtils',
    icon: Minus,
  },
]

function PrintStyleSection({ style, onStyleChange }: { style: string; onStyleChange: (key: string) => void }) {
  const [saving, setSaving] = useState(false)

  async function handleSelect(key: string) {
    if (key === style) return
    onStyleChange(key)
    setSaving(true)
    try {
      await orgPatch('/billing/print-style', { style: key })
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Style d'impression</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Apparence des PDF générés (devis, factures, avoirs)</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PRINT_STYLES.map((s) => {
          const selected = style === s.key
          const Icon = s.icon
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => handleSelect(s.key)}
              className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                selected
                  ? 'border-kerpta bg-kerpta-50 dark:bg-kerpta-900/30 dark:border-kerpta-600'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  selected ? 'bg-kerpta text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-sm font-semibold ${selected ? 'text-kerpta-700 dark:text-kerpta-400' : 'text-gray-700 dark:text-gray-200'}`}>
                  {s.label}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${selected ? 'text-kerpta-600 dark:text-kerpta-400/80' : 'text-gray-400 dark:text-gray-500'}`}>
                {s.description}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── Section En-tête du document ──────────────────────────────────────────

function DocumentHeaderSection() {
  const [showLogo, setShowLogo] = useState(true)
  const [showCompanyName, setShowCompanyName] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orgGet<{ show_logo: boolean; show_company_name: boolean }>('/billing/document-header')
      .then((data) => { setShowLogo(data.show_logo !== false); setShowCompanyName(data.show_company_name !== false) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggle(key: 'show_logo' | 'show_company_name', value: boolean) {
    if (key === 'show_logo') setShowLogo(value)
    else setShowCompanyName(value)
    setSaving(true)
    try {
      await orgPatch('/billing/document-header', { [key]: value })
    } catch { /* */ }
    setSaving(false)
  }

  const toggleStyle = (on: boolean) =>
    `px-3 py-1.5 text-xs rounded-full border transition cursor-pointer ${
      on ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400'
         : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
    }`

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">En-tête du document</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Options affichées en haut de tous les documents PDF</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toggle('show_logo', !showLogo)} className={toggleStyle(showLogo)}>
            Afficher le logo
          </button>
          <button type="button" onClick={() => toggle('show_company_name', !showCompanyName)} className={toggleStyle(showCompanyName)}>
            Afficher le nom de la société
          </button>
        </div>
      )}
    </section>
  )
}

// ── Section Pied de page (infos emetteur en bas de chaque page PDF) ──────

interface OrgInfo {
  legal_form: string | null
  capital: string | null
  org_siren: string | null
  rcs_city: string | null
  vat_number: string | null
  phone: string | null
  email: string | null
  website: string | null
}

function PageFooterSection() {
  const [showPhone, setShowPhone] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [showWebsite, setShowWebsite] = useState(false)
  const [logoFirstPage, setLogoFirstPage] = useState(true)
  const [logoOtherPages, setLogoOtherPages] = useState(true)
  const [showPageNumber, setShowPageNumber] = useState(true)
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const orgId = localStorage.getItem('kerpta_active_org')
    const promises: Promise<unknown>[] = [
      orgGet<Record<string, boolean>>('/billing/page-footer-options'),
      orgId ? orgGet<OrgInfo>(`/organizations/${orgId}`) : Promise.resolve(null),
    ]
    if (orgId) {
      promises.push(
        orgGet<{ logo_b64: string }>(`/organizations/${orgId}/logo`)
          .then((data) => data?.logo_b64 || null)
          .catch(() => null)
      )
    }
    Promise.all(promises).then(([opts, org, logo]) => {
      const o = opts as Record<string, boolean>
      setShowPhone(o.show_phone ?? false)
      setShowEmail(o.show_email ?? false)
      setShowWebsite(o.show_website ?? false)
      setLogoFirstPage(o.footer_logo_first_page ?? true)
      setLogoOtherPages(o.footer_logo_other_pages ?? true)
      setShowPageNumber(o.show_page_number ?? true)
      if (org) setOrgInfo(org as OrgInfo)
      if (logo) setLogoSrc(logo as string)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggle(key: string, value: boolean) {
    if (key === 'show_phone') setShowPhone(value)
    else if (key === 'show_email') setShowEmail(value)
    else if (key === 'show_website') setShowWebsite(value)
    else if (key === 'footer_logo_first_page') setLogoFirstPage(value)
    else if (key === 'footer_logo_other_pages') setLogoOtherPages(value)
    else if (key === 'show_page_number') setShowPageNumber(value)
    setSaving(true)
    try {
      await orgPatch('/billing/page-footer-options', { [key]: value })
    } catch { /* */ }
    setSaving(false)
  }

  const toggleStyle = (on: boolean) =>
    `px-3 py-1.5 text-xs rounded-full border transition cursor-pointer ${
      on ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400'
         : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
    }`

  function balanceLines(parts: string[], sep = ' - '): string[] {
    if (parts.length === 0) return []
    const full = parts.join(sep)
    if (full.length <= 60 || parts.length <= 1) return [full]
    let bestSplit = 1
    let bestDiff = Infinity
    for (let i = 1; i < parts.length; i++) {
      const l1 = parts.slice(0, i).join(sep).length
      const l2 = parts.slice(i).join(sep).length
      if (Math.abs(l1 - l2) < bestDiff) {
        bestDiff = Math.abs(l1 - l2)
        bestSplit = i
      }
    }
    return [parts.slice(0, bestSplit).join(sep), parts.slice(bestSplit).join(sep)]
  }

  function buildCenterLines(): string[] {
    if (!orgInfo) return []
    const parts: string[] = []
    if (showPhone && orgInfo.phone) parts.push(`Tel : ${orgInfo.phone}`)
    if (showEmail && orgInfo.email) parts.push(orgInfo.email)
    if (showWebsite && orgInfo.website) parts.push(orgInfo.website)
    if (orgInfo.vat_number) parts.push(`TVA : ${orgInfo.vat_number}`)
    const formCapital: string[] = []
    if (orgInfo.legal_form) formCapital.push(orgInfo.legal_form)
    if (orgInfo.capital) formCapital.push(`au capital de ${orgInfo.capital} \u20ac`)
    if (formCapital.length > 0) parts.push(formCapital.join(' '))
    if (orgInfo.org_siren) parts.push(`SIREN : ${orgInfo.org_siren}`)
    if (orgInfo.rcs_city) parts.push(`R.C.S ${orgInfo.rcs_city}`)
    return balanceLines(parts)
  }

  const centerLines = buildCenterLines()
  const showAnyLogo = logoFirstPage || logoOtherPages

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Pied de page</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Informations affichees en bas de chaque page PDF (forme juridique, SIREN, RCS, TVA sont toujours affiches)</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => toggle('show_phone', !showPhone)} className={toggleStyle(showPhone)}>
              Telephone
            </button>
            <button type="button" onClick={() => toggle('show_email', !showEmail)} className={toggleStyle(showEmail)}>
              Email
            </button>
            <button type="button" onClick={() => toggle('show_website', !showWebsite)} className={toggleStyle(showWebsite)}>
              Site web
            </button>
            <button type="button" onClick={() => toggle('footer_logo_first_page', !logoFirstPage)} className={toggleStyle(logoFirstPage)}>
              Logo 1ere page
            </button>
            <button type="button" onClick={() => toggle('footer_logo_other_pages', !logoOtherPages)} className={toggleStyle(logoOtherPages)}>
              Logo pages suivantes
            </button>
            <button type="button" onClick={() => toggle('show_page_number', !showPageNumber)} className={toggleStyle(showPageNumber)}>
              Page X/X
            </button>
          </div>
          {(centerLines.length > 0 || showAnyLogo || showPageNumber) && (
            <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 text-center">Apercu</p>
              <div className="flex items-end gap-3">
                {/* Colonne gauche : logo */}
                <div className="w-12 flex-shrink-0">
                  {showAnyLogo && logoSrc && (
                    <img src={logoSrc} alt="Logo" className="max-h-8 max-w-[50px] object-contain" />
                  )}
                </div>
                {/* Colonne centre : texte */}
                <div className="flex-1 text-center">
                  {centerLines.map((line, i) => (
                    <p key={i} className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">{line}</p>
                  ))}
                </div>
                {/* Colonne droite : page */}
                <div className="w-14 flex-shrink-0 text-right">
                  {showPageNumber && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">Page 1 / 1</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}



// ── Section Style du document (tailles, gras, couleurs, labels, sections) ──

interface ThemeVisuals {
  font_sizes: Record<string, number>
  font_weights: Record<string, number>
  colors: Record<string, string>
  borders: Record<string, string | number>
}

interface DocumentStyling {
  themes: Record<string, ThemeVisuals>
  column_labels: Record<string, string>
  show_sections_quotes: Record<string, boolean>
  spacing: Record<string, number>
}

const FONT_SIZE_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20]
const FONT_WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 300, label: 'Fin' },
  { value: 400, label: 'Normal' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi-gras' },
  { value: 700, label: 'Gras' },
]

const FONT_SIZE_FIELDS: { key: string; label: string; weightKey?: string }[] = [
  { key: 'seller_name', label: 'Nom emetteur', weightKey: 'seller_name' },
  { key: 'seller_address', label: 'Adresse emetteur', weightKey: 'seller_address' },
  { key: 'client_name', label: 'Nom client', weightKey: 'client_name' },
  { key: 'client_address', label: 'Adresse client', weightKey: 'client_address' },
  { key: 'doc_title', label: 'Titre du document', weightKey: 'doc_title' },
  { key: 'dates_refs', label: 'Labels dates/refs', weightKey: 'dates_label' },
  { key: 'dates_refs', label: 'Valeurs dates/refs', weightKey: 'dates_value' },
  { key: 'table_header', label: 'En-tetes tableau', weightKey: 'table_header' },
  { key: 'table_cell', label: 'Cellules tableau', weightKey: 'table_cell' },
  { key: 'line_detail', label: 'Detail des lignes', weightKey: 'line_detail' },
  { key: 'totals', label: 'Labels totaux', weightKey: 'totals_label' },
  { key: 'totals', label: 'Valeurs totaux', weightKey: 'totals_value' },
  { key: 'bottom_info', label: 'Texte conditions/mentions', weightKey: 'bottom_info' },
  { key: 'bottom_info', label: 'Labels conditions/mentions', weightKey: 'bottom_info_label' },
  { key: 'footer', label: 'Pied de page emetteur', weightKey: 'footer' },
]

const COLOR_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: 'Titre du document' },
  { key: 'labels', label: 'Labels (dates, totaux, en-tetes)' },
  { key: 'values', label: 'Valeurs (texte, montants)' },
  { key: 'footer_text', label: 'Pied de page' },
]

const BORDER_FIELDS: { key: string; label: string; type: 'color' | 'width' | 'toggle'; def_classique: string | number; def_moderne: string | number; def_minimaliste: string | number }[] = [
  { key: 'client_block_color', label: 'Bordure bloc client - couleur', type: 'color', def_classique: '#d0d0d0', def_moderne: '', def_minimaliste: '' },
  { key: 'client_block_width', label: 'Bordure bloc client - epaisseur', type: 'width', def_classique: 1, def_moderne: 0, def_minimaliste: 0 },
  { key: 'th_bg', label: 'Fond en-tetes tableau', type: 'color', def_classique: '#f5f5f5', def_moderne: '', def_minimaliste: '' },
  { key: 'th_border_color', label: 'Trait sous en-tetes - couleur', type: 'color', def_classique: '#cccccc', def_moderne: '#eeeeee', def_minimaliste: '' },
  { key: 'th_border_width', label: 'Trait sous en-tetes - epaisseur', type: 'width', def_classique: 1, def_moderne: 1, def_minimaliste: 0 },
  { key: 'td_border_color', label: 'Trait entre lignes - couleur', type: 'color', def_classique: '#e8e8e8', def_moderne: '#eeeeee', def_minimaliste: '' },
  { key: 'td_border_width', label: 'Trait entre lignes - epaisseur', type: 'width', def_classique: 0.5, def_moderne: 0.5, def_minimaliste: 0 },
  { key: 'td_last_border', label: 'Trait sous derniere ligne', type: 'toggle', def_classique: 1, def_moderne: 0, def_minimaliste: 0 },
  { key: 'zebra_enabled', label: 'Lignes zebrees (alternance fond)', type: 'toggle', def_classique: 1, def_moderne: 0, def_minimaliste: 0 },
  { key: 'zebra_color', label: 'Couleur fond zebree', type: 'color', def_classique: '#fafafa', def_moderne: '', def_minimaliste: '' },
  { key: 'totals_ht_border_color', label: 'Trait au-dessus Total HT - couleur', type: 'color', def_classique: '', def_moderne: '#eeeeee', def_minimaliste: '' },
  { key: 'totals_ht_border_width', label: 'Trait au-dessus Total HT - epaisseur', type: 'width', def_classique: 0, def_moderne: 1, def_minimaliste: 0 },
  { key: 'totals_mid_border_color', label: 'Trait entre HT et TTC - couleur', type: 'color', def_classique: '', def_moderne: '#eeeeee', def_minimaliste: '' },
  { key: 'totals_mid_border_width', label: 'Trait entre HT et TTC - epaisseur', type: 'width', def_classique: 0, def_moderne: 0.5, def_minimaliste: 0 },
  { key: 'totals_ttc_border_color', label: 'Trait au-dessus Total TTC - couleur', type: 'color', def_classique: '', def_moderne: '#eeeeee', def_minimaliste: '' },
  { key: 'totals_ttc_border_width', label: 'Trait au-dessus Total TTC - epaisseur', type: 'width', def_classique: 0, def_moderne: 1, def_minimaliste: 0 },
  { key: 'footer_border_color', label: 'Trait pied de page - couleur', type: 'color', def_classique: '#cccccc', def_moderne: '#e0e0e0', def_minimaliste: '' },
  { key: 'footer_border_width', label: 'Trait pied de page - epaisseur', type: 'width', def_classique: 1, def_moderne: 0.5, def_minimaliste: 0 },
]

const THEME_LABELS: Record<string, string> = {
  classique: 'Classique',
  moderne: 'Moderne',
  minimaliste: 'Minimaliste',
}

const COLUMN_LABEL_FIELDS: { key: string; defaultLabel: string; group: string }[] = [
  { key: 'date_invoice', defaultLabel: 'Date de facture', group: 'Dates et references' },
  { key: 'date_quote', defaultLabel: 'Date du devis', group: 'Dates et references' },
  { key: 'date_credit_note', defaultLabel: "Date de l'avoir", group: 'Dates et references' },
  { key: 'due_date', defaultLabel: "Date d'echeance", group: 'Dates et references' },
  { key: 'customer_reference', defaultLabel: 'Reference', group: 'Dates et references' },
  { key: 'purchase_order_number', defaultLabel: 'N. commande', group: 'Dates et references' },
  { key: 'reference', defaultLabel: 'Ref.', group: 'Colonnes du tableau' },
  { key: 'description', defaultLabel: 'Designation', group: 'Colonnes du tableau' },
  { key: 'quantity', defaultLabel: 'Qte.', group: 'Colonnes du tableau' },
  { key: 'unit_price', defaultLabel: 'P.U.', group: 'Colonnes du tableau' },
  { key: 'vat_rate', defaultLabel: 'TVA', group: 'Colonnes du tableau' },
  { key: 'discount_percent', defaultLabel: 'Rem.', group: 'Colonnes du tableau' },
  { key: 'total_ht', defaultLabel: 'Montant HT', group: 'Colonnes du tableau' },
  { key: 'total_ttc', defaultLabel: 'Montant TTC', group: 'Colonnes du tableau' },
  { key: 'payment_terms', defaultLabel: 'Conditions de reglement', group: 'Sections du bas' },
  { key: 'payment_method', defaultLabel: 'Mode de reglement', group: 'Sections du bas' },
  { key: 'iban', defaultLabel: 'IBAN', group: 'Sections du bas' },
  { key: 'bic', defaultLabel: 'BIC', group: 'Sections du bas' },
  { key: 'legal_footer', defaultLabel: 'Mentions legales', group: 'Sections du bas' },
  { key: 'notes', defaultLabel: 'Notes', group: 'Sections du bas' },
]

const SECTION_FIELDS: { key: string; label: string }[] = [
  { key: 'payment_terms', label: 'Conditions de reglement' },
  { key: 'payment_method', label: 'Mode de reglement' },
  { key: 'bank_details', label: 'Coordonnees bancaires (IBAN/BIC)' },
  { key: 'legal_footer', label: 'Mentions legales' },
  { key: 'notes', label: 'Notes' },
]

const SPACING_GROUPS: { group: string; hint?: string; fields: { key: string; label: string; unit: string; def: number; hint: string }[] }[] = [
  {
    group: 'Marges de la page',
    hint: 'Marges entre le bord de la feuille A4 et la zone de contenu. Le bloc client reste a 40mm du haut (norme AFNOR) quelle que soit la marge haute.',
    fields: [
      { key: 'page_margin_top', label: 'Haut', unit: 'mm', def: 12, hint: 'Espace entre le haut de la feuille et le debut du contenu. Le bloc client reste a 40mm du haut (AFNOR)' },
      { key: 'page_margin_right', label: 'Droite', unit: 'mm', def: 15, hint: 'Espace entre le bord droit de la feuille et le contenu' },
      { key: 'page_margin_bottom', label: 'Bas', unit: 'mm', def: 18, hint: 'Espace entre le bas de la feuille et le pied de page' },
      { key: 'page_margin_left', label: 'Gauche', unit: 'mm', def: 15, hint: 'Espace entre le bord gauche de la feuille et le contenu. Le bloc client reste a 105mm du bord gauche (AFNOR)' },
    ],
  },
  {
    group: 'En-tete',
    hint: 'Zone contenant le logo, l\'emetteur (gauche) et le client (droite). AFNOR NF Z 10-011 : client a 40mm du haut et 105mm min. du bord gauche (fenetre d\'enveloppe).',
    fields: [
      { key: 'header_margin_bottom', label: 'Marge basse en-tete', unit: 'px', def: 28, hint: 'Espace entre le bas du bloc en-tete (emetteur/client) et le titre du document' },
      { key: 'header_min_height', label: 'Hauteur min. en-tete', unit: 'mm', def: 52, hint: 'Hauteur minimale du bloc en-tete. Augmenter si le titre chevauche le bloc client' },
      { key: 'header_left_width', label: 'Largeur bloc emetteur', unit: 'mm', def: 80, hint: 'Largeur du bloc emetteur (logo + nom + adresse) a gauche' },
      { key: 'client_block_left', label: 'Position bloc client', unit: 'mm', def: 110, hint: 'Distance entre le bord gauche de la feuille et le bloc client. Norme AFNOR NF Z 10-011 : minimum 105mm (zone fenetre d\'enveloppe). S\'ajuste auto avec les marges.' },
      { key: 'header_right_width', label: 'Largeur bloc client', unit: 'mm', def: 67, hint: 'Largeur du bloc client (nom + adresse + TVA) a droite' },
    ],
  },
  {
    group: 'Logo en-tete',
    hint: 'Dimensions du logo de l\'emetteur en haut a gauche du document.',
    fields: [
      { key: 'logo_max_height', label: 'Hauteur max', unit: 'px', def: 45, hint: 'Hauteur maximale du logo en-tete (redimensionne proportionnellement)' },
      { key: 'logo_max_width', label: 'Largeur max', unit: 'px', def: 160, hint: 'Largeur maximale du logo en-tete (redimensionne proportionnellement)' },
      { key: 'logo_margin_bottom', label: 'Marge basse', unit: 'px', def: 4, hint: 'Espace entre le logo et le nom de l\'emetteur en dessous' },
    ],
  },
  {
    group: 'Titre et dates',
    hint: 'Zone du titre (ex: "FACTURE FA-2026-0001") et de la ligne de dates/references juste en dessous.',
    fields: [
      { key: 'doc_title_margin_top', label: 'Marge haute titre', unit: 'px', def: 24, hint: 'Espace au-dessus du titre (entre le bas de l\'en-tete et "FACTURE FA-...")' },
      { key: 'doc_title_margin_bottom', label: 'Marge basse titre', unit: 'px', def: 24, hint: 'Espace entre le titre et la ligne de dates/echeance/reference' },
      { key: 'doc_dates_margin_bottom', label: 'Marge basse dates', unit: 'px', def: 28, hint: 'Espace entre la ligne de dates et le tableau des lignes' },
      { key: 'date_item_margin_right', label: 'Espacement entre dates', unit: 'px', def: 40, hint: 'Espace horizontal entre chaque bloc de date (emission, echeance, ref, n. commande)' },
    ],
  },
  {
    group: 'Tableau et totaux',
    hint: 'Tableau des lignes de produits/services et bloc des totaux (HT, TVA, TTC) a droite.',
    fields: [
      { key: 'table_margin_bottom', label: 'Marge basse tableau', unit: 'px', def: 12, hint: 'Espace entre le bas du tableau de lignes et le bloc des totaux' },
      { key: 'table_cell_padding_v', label: 'Padding vertical cellules', unit: 'px', def: 4, hint: 'Espace interieur haut/bas dans chaque cellule du tableau' },
      { key: 'table_cell_padding_h', label: 'Padding horizontal cellules', unit: 'px', def: 10, hint: 'Espace interieur gauche/droite dans chaque cellule du tableau' },
      { key: 'totals_margin_bottom', label: 'Marge basse totaux', unit: 'px', def: 24, hint: 'Espace entre le bloc des totaux et les informations de paiement' },
      { key: 'totals_spacer_width', label: 'Espace label/valeur totaux', unit: 'px', def: 30, hint: 'Espace entre les labels (TOTAL HT, TVA...) et les montants dans le bloc totaux' },
    ],
  },
  {
    group: 'Bas de page et pied',
    hint: 'Zone des conditions de reglement, mentions legales, notes (bas de page) et pied de page repete (contact, pagination).',
    fields: [
      { key: 'bottom_info_margin_top', label: 'Marge haute infos', unit: 'px', def: 28, hint: 'Espace entre le bloc totaux et les conditions de reglement' },
      { key: 'info_line_margin_bottom', label: 'Espacement lignes infos', unit: 'px', def: 6, hint: 'Espace entre chaque bloc d\'info (conditions, mode, IBAN, mentions, notes)' },
      { key: 'footer_padding_top', label: 'Padding haut pied de page', unit: 'px', def: 3, hint: 'Espace au-dessus du pied de page (ligne contact/SIREN/pagination)' },
      { key: 'footer_logo_max_height', label: 'Logo pied - hauteur max', unit: 'px', def: 60, hint: 'Hauteur max du logo dans le pied de page (si active)' },
      { key: 'footer_logo_max_width', label: 'Logo pied - largeur max', unit: 'px', def: 100, hint: 'Largeur max du logo dans le pied de page (si active)' },
      { key: 'footer_col_left_width', label: 'Colonne logo pied', unit: 'px', def: 100, hint: 'Largeur de la colonne gauche du pied (logo)' },
      { key: 'footer_col_right_width', label: 'Colonne pagination pied', unit: 'px', def: 70, hint: 'Largeur de la colonne droite du pied (Page 1/1)' },
    ],
  },
]

function DocumentStylingSection({ activeTheme }: { activeTheme: string }) {
  const [styling, setStyling] = useState<DocumentStyling | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openSub, setOpenSub] = useState<string | null>(null)

  useEffect(() => {
    orgGet<DocumentStyling>('/billing/document-styling')
      .then((data) => setStyling(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function patch(partial: any) {
    setSaving(true)
    try {
      const result = await orgPatch('/billing/document-styling', partial)
      setStyling(result as unknown as DocumentStyling)
    } catch { /* */ }
    setSaving(false)
  }

  function updateFontSize(key: string, value: number) {
    if (!styling) return
    const theme = styling.themes[activeTheme] || {} as ThemeVisuals
    const updated = { ...theme.font_sizes, [key]: value }
    setStyling({ ...styling, themes: { ...styling.themes, [activeTheme]: { ...theme, font_sizes: updated } } })
    patch({ themes: { [activeTheme]: { font_sizes: { [key]: value } } } })
  }

  function updateFontWeight(key: string, value: number) {
    if (!styling) return
    const theme = styling.themes[activeTheme] || {} as ThemeVisuals
    const updated = { ...theme.font_weights, [key]: value }
    setStyling({ ...styling, themes: { ...styling.themes, [activeTheme]: { ...theme, font_weights: updated } } })
    patch({ themes: { [activeTheme]: { font_weights: { [key]: value } } } })
  }

  function updateColor(key: string, value: string) {
    if (!styling) return
    const theme = styling.themes[activeTheme] || {} as ThemeVisuals
    const updated = { ...theme.colors, [key]: value }
    setStyling({ ...styling, themes: { ...styling.themes, [activeTheme]: { ...theme, colors: updated } } })
    patch({ themes: { [activeTheme]: { colors: { [key]: value } } } })
  }

  function updateBorder(key: string, value: string | number) {
    if (!styling) return
    const theme = styling.themes[activeTheme] || {} as ThemeVisuals
    const updated = { ...theme.borders, [key]: value }
    setStyling({ ...styling, themes: { ...styling.themes, [activeTheme]: { ...theme, borders: updated } } })
    patch({ themes: { [activeTheme]: { borders: { [key]: value } } } })
  }

  function updateLabel(key: string, value: string) {
    if (!styling) return
    const updated = { ...styling.column_labels, [key]: value }
    setStyling({ ...styling, column_labels: updated })
    patch({ column_labels: { [key]: value } })
  }

  function toggleSectionQuotes(key: string) {
    if (!styling) return
    const updated = { ...styling.show_sections_quotes, [key]: !styling.show_sections_quotes[key] }
    setStyling({ ...styling, show_sections_quotes: updated })
    patch({ show_sections_quotes: { [key]: !styling.show_sections_quotes[key] } })
  }

  function updateSpacing(key: string, value: number) {
    if (!styling) return
    const updated = { ...styling.spacing, [key]: value }
    setStyling({ ...styling, spacing: updated })
    patch({ spacing: { [key]: value } })
  }

  const toggleStyle = (on: boolean) =>
    `px-3 py-1.5 text-xs rounded-full border transition cursor-pointer ${
      on ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400'
         : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
    }`

  const subHeader = (key: string, label: string) => (
    <button
      type="button"
      onClick={() => setOpenSub(openSub === key ? null : key)}
      className="flex items-center justify-between w-full py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide hover:text-gray-800 dark:hover:text-gray-200 transition"
    >
      {label}
      <span className="text-gray-400 dark:text-gray-500">{openSub === key ? '-' : '+'}</span>
    </button>
  )

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Style du document : {THEME_LABELS[activeTheme] || activeTheme}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tailles de texte, gras, couleurs, bordures, libelles et sections visibles sur les PDF</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
      </div>
      {loading || !styling ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {/* Tailles et gras */}
          <div>
            {subHeader('fonts', 'Tailles de texte et gras')}
            {openSub === 'fonts' && (
              <div className="pb-4 space-y-2">
                {FONT_SIZE_FIELDS.map((f) => {
                  const themeData = styling.themes[activeTheme] || {} as ThemeVisuals
                  return (
                    <div key={f.weightKey} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-44 flex-shrink-0">{f.label}</span>
                      <select
                        value={themeData.font_sizes?.[f.key] ?? 9}
                        onChange={(e) => updateFontSize(f.key, parseInt(e.target.value))}
                        className="h-[30px] px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 w-16"
                      >
                        {FONT_SIZE_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}pt</option>
                        ))}
                      </select>
                      {f.weightKey && (
                        <select
                          value={themeData.font_weights?.[f.weightKey] ?? 400}
                          onChange={(e) => updateFontWeight(f.weightKey!, parseInt(e.target.value))}
                          className="h-[30px] px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 w-28"
                        >
                          {FONT_WEIGHT_OPTIONS.map((w) => (
                            <option key={w.value} value={w.value}>{w.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Couleurs */}
          <div>
            {subHeader('colors', 'Couleurs')}
            {openSub === 'colors' && (
              <div className="pb-4 space-y-2">
                {COLOR_FIELDS.map((c) => {
                  const themeData = styling.themes[activeTheme] || {} as ThemeVisuals
                  return (
                    <div key={c.key} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-44 flex-shrink-0">{c.label}</span>
                      <input
                        type="color"
                        value={themeData.colors?.[c.key] || '#555555'}
                        onChange={(e) => updateColor(c.key, e.target.value)}
                        className="w-8 h-8 rounded border border-gray-200 dark:border-gray-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={themeData.colors?.[c.key] || ''}
                        onChange={(e) => updateColor(c.key, e.target.value)}
                        placeholder="#555555"
                        className="h-[30px] w-24 px-2 py-0.5 text-xs font-mono border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400"
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bordures et traits */}
          <div>
            {subHeader('borders', 'Bordures et traits')}
            {openSub === 'borders' && (
              <div className="pb-4 space-y-2">
                {BORDER_FIELDS.map((f) => {
                  const themeData = styling.themes[activeTheme] || {} as ThemeVisuals
                  const borders = themeData.borders || {}
                  const defKey = `def_${activeTheme}` as keyof typeof f
                  const defVal = f[defKey]
                  const currentVal = borders[f.key] ?? defVal

                  if (f.type === 'color') {
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 dark:text-gray-400 w-52 flex-shrink-0">{f.label}</span>
                        <input className="w-8 h-8 rounded border border-gray-200 dark:border-gray-600 cursor-pointer" type="color" value={(currentVal as string) || '#ffffff'} onChange={(e) => updateBorder(f.key, e.target.value)} />
                        <input placeholder="Aucun" className="h-[30px] w-24 px-2 py-0.5 text-xs font-mono border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400" type="text" value={currentVal as string} onChange={(e) => updateBorder(f.key, e.target.value)} />
                      </div>
                    )
                  } else if (f.type === 'width') {
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 dark:text-gray-400 w-52 flex-shrink-0">{f.label}</span>
                        <select value={currentVal as number} onChange={(e) => updateBorder(f.key, parseFloat(e.target.value))} className="h-[30px] px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 w-20">
                          {[0, 0.5, 1, 1.5, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w === 0 ? 'Aucun' : `${w}px`}</option>)}
                        </select>
                      </div>
                    )
                  } else {
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 dark:text-gray-400 w-52 flex-shrink-0">{f.label}</span>
                        <button onClick={() => updateBorder(f.key, currentVal ? 0 : 1)} className={`px-3 py-1.5 text-xs rounded-full border transition cursor-pointer ${currentVal ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'}`}>
                          {currentVal ? 'Oui' : 'Non'}
                        </button>
                      </div>
                    )
                  }
                })}
              </div>
            )}
          </div>

          {/* Libelles */}
          <div>
            {subHeader('labels', 'Libelles')}
            {openSub === 'labels' && (
              <div className="pb-4 space-y-4">
                {['Dates et references', 'Colonnes du tableau', 'Sections du bas'].map((groupName) => (
                  <div key={groupName}>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{groupName}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {COLUMN_LABEL_FIELDS.filter((f) => f.group === groupName).map((f) => (
                        <div key={f.key}>
                          <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">{f.defaultLabel}</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={styling.column_labels[f.key] ?? f.defaultLabel}
                              onChange={(e) => updateLabel(f.key, e.target.value)}
                              placeholder={f.defaultLabel}
                              maxLength={30}
                              className="h-[30px] w-full px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400"
                            />
                            {(styling.column_labels[f.key] ?? '') !== '' && styling.column_labels[f.key] !== f.defaultLabel && (
                              <button
                                onClick={() => updateLabel(f.key, f.defaultLabel)}
                                className="flex-shrink-0 p-1 text-gray-400 hover:text-kerpta-500 dark:text-gray-500 dark:hover:text-kerpta-400"
                                title="Reinitialiser"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sections visibles (devis uniquement - les factures affichent tout par obligation legale) */}
          <div>
            {subHeader('sections', 'Sections visibles (devis)')}
            {openSub === 'sections' && (
              <div className="pb-4 space-y-3">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">Les factures affichent toujours toutes les sections (obligation legale).</p>
                <div className="flex flex-wrap gap-2">
                  {SECTION_FIELDS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggleSectionQuotes(s.key)}
                      className={toggleStyle(styling.show_sections_quotes[s.key] !== false)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Espacement et marges */}
          <div>
            {subHeader('spacing', 'Espacement et marges')}
            {openSub === 'spacing' && (
              <div className="pb-4 space-y-4">
                {SPACING_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{g.group}</p>
                      {g.hint && (
                        <span className="group relative">
                          <Info className="w-3 h-3 text-gray-400 dark:text-gray-500 cursor-help" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-64 text-[10px] text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-lg z-50 normal-case tracking-normal">{g.hint}</span>
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {g.fields.map((f) => (
                        <div key={f.key} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 dark:text-gray-400 w-52 flex-shrink-0 flex items-center gap-1">
                            {f.label}
                            <span className="group relative">
                              <Info className="w-3 h-3 text-gray-400 dark:text-gray-500 cursor-help flex-shrink-0" />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-56 text-[10px] text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-lg z-50">{f.hint}</span>
                            </span>
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={300}
                            value={styling.spacing[f.key] ?? f.def}
                            onChange={(e) => updateSpacing(f.key, parseInt(e.target.value) || f.def)}
                            className="h-[30px] w-20 px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 text-right"
                          />
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 w-6">{f.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  Norme AFNOR NF Z 10-011 : le bloc client est ancre a 40mm du haut et 105mm du bord gauche de la page (zone fenetre d'enveloppe). Ces positions s'ajustent automatiquement lorsque vous modifiez les marges de la page.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Section Mise en page et colonnes ────────────────────────────────────

function DocumentTypesSection({ endpoint, title, description }: { endpoint: string; title: string; description: string }) {
  const [types, setTypes] = useState<DocType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editColumns, setEditColumns] = useState<Record<string, boolean>>({})
  const [addMode, setAddMode] = useState(false)

  useEffect(() => {
    orgGet<DocType[]>(endpoint)
      .then(setTypes)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [endpoint])

  async function save(updated: DocType[]) {
    setSaving(true)
    try {
      const result = await orgPatch(endpoint, updated)
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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{title}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
          <button onClick={startAdd} className="flex items-center gap-1 text-xs text-kerpta-600 dark:text-kerpta-400 hover:text-kerpta-700 font-medium transition">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
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
                        return (
                          <button
                            key={col.key}
                            type="button"
                            onClick={() => setEditColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                            className={`px-2.5 py-1 text-xs rounded-full border transition cursor-pointer ${
                              on ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {col.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={confirmEdit} disabled={!editKey.trim() || !editTitle.trim()} className={BTN_SM}>
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
                    <div className="flex gap-1 flex-wrap">
                      {ALL_COLUMNS.filter((c) => t.columns[c.key] !== false).map((c) => (
                        <span key={c.key} className="text-[10px] bg-kerpta-50 dark:bg-kerpta-900/30 text-kerpta-600 dark:text-kerpta-400 px-1.5 py-0.5 rounded">{c.label}</span>
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
            <div className="border border-kerpta-200 dark:border-kerpta-700 rounded-lg p-4 space-y-3 bg-kerpta-50/30 dark:bg-kerpta-900/20">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Clé (identifiant)</label>
                  <input value={editKey} onChange={(e) => setEditKey(e.target.value)} className={INPUT} placeholder="ex: pro_forma" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Titre affiché sur le document</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} placeholder="ex: Pro forma" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">Colonnes visibles</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_COLUMNS.map((col) => {
                    const on = editColumns[col.key] !== false
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => setEditColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                        className={`px-2.5 py-1 text-xs rounded-full border transition cursor-pointer ${
                          on ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {col.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={confirmEdit} disabled={!editKey.trim() || !editTitle.trim()} className={BTN_SM}>
                  Ajouter
                </button>
                <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">
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

// ── Section Colonnes des factures ────────────────────────────────────────

function InvoiceColumnsSection() {
  const [columns, setColumns] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orgGet<Record<string, boolean>>('/billing/invoice-columns')
      .then(setColumns)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggle(key: string) {
    const updated = { ...columns, [key]: !columns[key] }
    setColumns(updated)
    setSaving(true)
    try {
      const result = await orgPatch('/billing/invoice-columns', updated)
      setColumns(result as unknown as Record<string, boolean>)
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Colonnes des factures</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Colonnes affichées sur les factures, proformas et avoirs</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {ALL_COLUMNS.map((col) => {
              const on = columns[col.key] !== false
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => toggle(col.key)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition cursor-pointer ${
                    on ? 'bg-kerpta-50 dark:bg-kerpta-900/30 border-kerpta-200 dark:border-kerpta-700 text-kerpta-700 dark:text-kerpta-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {col.label}
                </button>
              )
            })}
          </div>
          {(columns.description === false || columns.unit_price === false || columns.total_ht === false) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Attention : les colonnes Designation, Prix unitaire et Total HT sont obligatoires sur les factures (art. 242 nonies A du CGI). Les masquer peut rendre vos factures non conformes.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ── Page principale ──────────────────────────────────────────────────────

export default function DocumentSettingsPage() {
  const [activeTheme, setActiveTheme] = useState('classique')
  const [themeLoading, setThemeLoading] = useState(true)

  useEffect(() => {
    orgGet<{ style: string }>('/billing/print-style')
      .then((data) => setActiveTheme(data.style || 'classique'))
      .catch(() => {})
      .finally(() => setThemeLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Documents</h1>
        {themeLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
        ) : (
          <>
            <PrintStyleSection style={activeTheme} onStyleChange={setActiveTheme} />
            <DocumentHeaderSection />
            <PageFooterSection />
            <DocumentTypesSection
              endpoint="/billing/quote-document-types"
              title="Colonnes des devis"
              description="Modèles de mise en page disponibles lors de la création d'un devis, avec les colonnes affichées"
            />
            <InvoiceColumnsSection />
            <DocumentStylingSection activeTheme={activeTheme} />
          </>
        )}
      </div>
    </div>
  )
}

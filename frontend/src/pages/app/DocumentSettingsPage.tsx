// Kerpta — Paramètres des documents (style, pied de page, types)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import { Plus, Loader2, Pencil, Trash2, FileText, Sparkles, Minus } from 'lucide-react'
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

function PrintStyleSection() {
  const [style, setStyle] = useState('classique')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orgGet<{ style: string }>('/billing/print-style')
      .then((data) => setStyle(data.style || 'classique'))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSelect(key: string) {
    if (key === style) return
    setStyle(key)
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
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : (
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
      )}
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

interface DocumentStyling {
  font_sizes: Record<string, number>
  font_weights: Record<string, number>
  colors: Record<string, string>
  column_labels: Record<string, string>
  show_sections: Record<string, boolean>
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
  { key: 'dates_refs', label: 'Dates et references' },
  { key: 'table_header', label: 'En-tetes tableau', weightKey: 'table_header' },
  { key: 'table_cell', label: 'Cellules tableau', weightKey: 'table_cell' },
  { key: 'line_detail', label: 'Detail des lignes' },
  { key: 'totals', label: 'Totaux' },
  { key: 'bottom_info', label: 'Conditions / Mentions' },
  { key: 'footer', label: 'Pied de page emetteur' },
]

const COLOR_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: 'Titre du document' },
  { key: 'labels', label: 'Labels (dates, totaux, en-tetes)' },
  { key: 'values', label: 'Valeurs (texte, montants)' },
  { key: 'separator', label: 'Traits / separateurs' },
  { key: 'footer_text', label: 'Pied de page' },
]

const COLUMN_LABEL_FIELDS: { key: string; defaultLabel: string }[] = [
  { key: 'reference', defaultLabel: 'Ref.' },
  { key: 'description', defaultLabel: 'Designation' },
  { key: 'quantity', defaultLabel: 'Qte.' },
  { key: 'unit_price', defaultLabel: 'P.U.' },
  { key: 'vat_rate', defaultLabel: 'TVA' },
  { key: 'discount_percent', defaultLabel: 'Rem.' },
  { key: 'total_ht', defaultLabel: 'Montant HT' },
  { key: 'total_ttc', defaultLabel: 'Montant TTC' },
]

const SECTION_FIELDS: { key: string; label: string }[] = [
  { key: 'payment_terms', label: 'Conditions de reglement' },
  { key: 'payment_method', label: 'Mode de reglement' },
  { key: 'bank_details', label: 'Coordonnees bancaires (IBAN/BIC)' },
  { key: 'legal_footer', label: 'Mentions legales' },
  { key: 'notes', label: 'Notes' },
]

function DocumentStylingSection() {
  const [styling, setStyling] = useState<DocumentStyling | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openSub, setOpenSub] = useState<string | null>(null)

  useEffect(() => {
    orgGet<DocumentStyling>('/billing/document-styling')
      .then(setStyling)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function patch(partial: Partial<DocumentStyling>) {
    setSaving(true)
    try {
      const result = await orgPatch('/billing/document-styling', partial)
      setStyling(result as unknown as DocumentStyling)
    } catch { /* */ }
    setSaving(false)
  }

  function updateFontSize(key: string, value: number) {
    if (!styling) return
    const updated = { ...styling.font_sizes, [key]: value }
    setStyling({ ...styling, font_sizes: updated })
    patch({ font_sizes: { [key]: value } })
  }

  function updateFontWeight(key: string, value: number) {
    if (!styling) return
    const updated = { ...styling.font_weights, [key]: value }
    setStyling({ ...styling, font_weights: updated })
    patch({ font_weights: { [key]: value } })
  }

  function updateColor(key: string, value: string) {
    if (!styling) return
    const updated = { ...styling.colors, [key]: value }
    setStyling({ ...styling, colors: updated })
    patch({ colors: { [key]: value } })
  }

  function updateLabel(key: string, value: string) {
    if (!styling) return
    const updated = { ...styling.column_labels, [key]: value }
    setStyling({ ...styling, column_labels: updated })
    patch({ column_labels: { [key]: value } })
  }

  function toggleSection(key: string) {
    if (!styling) return
    const updated = { ...styling.show_sections, [key]: !styling.show_sections[key] }
    setStyling({ ...styling, show_sections: updated })
    patch({ show_sections: { [key]: !styling.show_sections[key] } })
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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Style du document</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tailles de texte, gras, couleurs, libelles et sections visibles sur les PDF</p>
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
                {FONT_SIZE_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 dark:text-gray-400 w-44 flex-shrink-0">{f.label}</span>
                    <select
                      value={styling.font_sizes[f.key] ?? 9}
                      onChange={(e) => updateFontSize(f.key, parseInt(e.target.value))}
                      className="h-[30px] px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 w-16"
                    >
                      {FONT_SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}pt</option>
                      ))}
                    </select>
                    {f.weightKey && (
                      <select
                        value={styling.font_weights[f.weightKey] ?? 400}
                        onChange={(e) => updateFontWeight(f.weightKey!, parseInt(e.target.value))}
                        className="h-[30px] px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400 w-28"
                      >
                        {FONT_WEIGHT_OPTIONS.map((w) => (
                          <option key={w.value} value={w.value}>{w.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Couleurs */}
          <div>
            {subHeader('colors', 'Couleurs')}
            {openSub === 'colors' && (
              <div className="pb-4 space-y-2">
                {COLOR_FIELDS.map((c) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 dark:text-gray-400 w-44 flex-shrink-0">{c.label}</span>
                    <input
                      type="color"
                      value={styling.colors[c.key] || '#555555'}
                      onChange={(e) => updateColor(c.key, e.target.value)}
                      className="w-8 h-8 rounded border border-gray-200 dark:border-gray-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={styling.colors[c.key] || ''}
                      onChange={(e) => updateColor(c.key, e.target.value)}
                      placeholder={c.key === 'separator' ? 'Defaut du theme' : '#555555'}
                      className="h-[30px] w-24 px-2 py-0.5 text-xs font-mono border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400"
                    />
                    {c.key === 'separator' && styling.colors[c.key] && (
                      <button
                        type="button"
                        onClick={() => updateColor('separator', '')}
                        className="text-[10px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        Reinitialiser
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Libelles des colonnes */}
          <div>
            {subHeader('labels', 'Libelles des colonnes')}
            {openSub === 'labels' && (
              <div className="pb-4 grid grid-cols-2 gap-2">
                {COLUMN_LABEL_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block">{f.defaultLabel}</label>
                    <input
                      type="text"
                      value={styling.column_labels[f.key] ?? f.defaultLabel}
                      onChange={(e) => updateLabel(f.key, e.target.value)}
                      placeholder={f.defaultLabel}
                      maxLength={30}
                      className="h-[30px] w-full px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sections visibles */}
          <div>
            {subHeader('sections', 'Sections visibles')}
            {openSub === 'sections' && (
              <div className="pb-4 flex flex-wrap gap-2">
                {SECTION_FIELDS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSection(s.key)}
                    className={toggleStyle(styling.show_sections[s.key] !== false)}
                  >
                    {s.label}
                  </button>
                ))}
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
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Documents</h1>
        <PrintStyleSection />
        <DocumentHeaderSection />
        <PageFooterSection />
        <DocumentStylingSection />
        <DocumentTypesSection
          endpoint="/billing/quote-document-types"
          title="Colonnes des devis"
          description="Modèles de mise en page disponibles lors de la création d'un devis, avec les colonnes affichées"
        />
        <InvoiceColumnsSection />
      </div>
    </div>
  )
}

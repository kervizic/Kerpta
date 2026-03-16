// Kerpta — Paramètres des documents (style, pied de page, types)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import { Plus, Loader2, Pencil, Trash2, FileText, Sparkles, Minus, RefreshCw } from 'lucide-react'
import { orgGet, orgPatch } from '@/lib/orgApi'
import { INPUT, BTN_SM, TEXTAREA } from '@/lib/formStyles'

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

// ── Section Pied de page ────────────────────────────────────────────────

function DocumentFooterSection() {
  const [footer, setFooter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    orgGet<{ footer: string }>('/billing/document-footer')
      .then((data) => setFooter(data.footer || ''))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await orgPatch('/billing/document-footer', { footer })
      setDirty(false)
    } catch { /* */ }
    setSaving(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const data = await orgGet<{ footer: string }>('/billing/auto-footer')
      setFooter(data.footer || '')
      setDirty(true)
    } catch { /* */ }
    setRefreshing(false)
  }

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Mentions légales par défaut</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            title="Régénérer depuis le profil de facturation par défaut"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-kerpta" />}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-kerpta" /></div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={footer}
            onChange={(e) => { setFooter(e.target.value); setDirty(true) }}
            rows={4}
            className={TEXTAREA}
          />
          {dirty && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className={BTN_SM}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Enregistrer'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Section Mise en page et colonnes ────────────────────────────────────

function DocumentTypesSection() {
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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Mise en page et colonnes</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Modèles de mise en page disponibles lors de la création d'un devis, avec les colonnes affichées</p>
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
                        const locked = col.key === 'description' || col.key === 'unit_price'
                        return (
                          <button
                            key={col.key}
                            type="button"
                            disabled={locked}
                            onClick={() => setEditColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                            className={`px-2.5 py-1 text-xs rounded-full border transition ${
                              locked ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-default' :
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
                    const locked = col.key === 'description' || col.key === 'unit_price'
                    return (
                      <button
                        key={col.key}
                        type="button"
                        disabled={locked}
                        onClick={() => setEditColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                        className={`px-2.5 py-1 text-xs rounded-full border transition ${
                          locked ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-default' :
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

// ── Page principale ──────────────────────────────────────────────────────

export default function DocumentSettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Documents</h1>
        <PrintStyleSection />
        <DocumentHeaderSection />
        <DocumentFooterSection />
        <DocumentTypesSection />
      </div>
    </div>
  )
}

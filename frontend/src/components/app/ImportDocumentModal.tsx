// Kerpta - Modale d'import de document via extraction IA
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload, FileText, Loader2, Trash2, X, Plus, CheckCircle2, AlertCircle, ExternalLink,
} from 'lucide-react'
import { orgClient } from '@/lib/api'
import {
  INPUT, LINE_INPUT, BTN, BTN_SECONDARY,
  OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER, LABEL,
} from '@/lib/formStyles'

// -- Types --------------------------------------------------------------------

interface ImportDocumentModalProps {
  documentType: 'quote' | 'invoice' | 'order'
  onClose: () => void
  onImported: (id: string) => void
}

interface ExtractedLine {
  description: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  vat_rate: number | null
  total_ht: number | null
}

interface ExtractedData {
  supplier_name: string | null
  supplier_address: string | null
  supplier_siret: string | null
  document_number: string | null
  issue_date: string | null
  due_date: string | null
  lines: ExtractedLine[]
  total_ht: number | null
  total_tva: number | null
  total_ttc: number | null
  payment_method: string | null
  iban: string | null
  confidence: number | null
  [key: string]: unknown
}

type Step = 'upload' | 'verify' | 'done'

const DOC_LABELS: Record<string, string> = {
  quote: 'devis',
  invoice: 'facture',
  order: 'commande',
}

// -- Component ----------------------------------------------------------------

export default function ImportDocumentModal({ documentType, onClose, onImported }: ImportDocumentModalProps) {
  const [step, setStep] = useState<Step>('upload')

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [chrono, setChrono] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Extracted data (editable)
  const [data, setData] = useState<ExtractedData | null>(null)

  // Import state
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)

  // Live chrono during extraction
  useEffect(() => {
    if (!extracting) { setChrono(0); return }
    const start = performance.now()
    const id = setInterval(() => setChrono(Math.round(performance.now() - start)), 100)
    return () => clearInterval(id)
  }, [extracting])

  // -- File handling ----------------------------------------------------------

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setExtractError('')
    setData(null)

    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreview(ev.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    setFile(f)
    setExtractError('')
    setData(null)

    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreview(ev.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    setData(null)
    setExtractError('')
  }

  // -- Extraction -------------------------------------------------------------

  async function runExtract() {
    if (!file) return
    setExtracting(true)
    setExtractError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await orgClient.post<ExtractedData>('/ai/extract-document', formData)
      setData(resp)
      setStep('verify')
    } catch (err: unknown) {
      const msg = (err as { data?: { detail?: string } })?.data?.detail || 'Erreur lors de l\'extraction'
      setExtractError(String(msg))
    } finally {
      setExtracting(false)
    }
  }

  // -- Data editing helpers ---------------------------------------------------

  const updateField = useCallback((field: keyof ExtractedData, value: string | number | null) => {
    setData(prev => prev ? { ...prev, [field]: value } : prev)
  }, [])

  const updateLine = useCallback((idx: number, field: keyof ExtractedLine, value: string | number | null) => {
    setData(prev => {
      if (!prev) return prev
      const lines = [...prev.lines]
      lines[idx] = { ...lines[idx], [field]: value }
      return { ...prev, lines }
    })
  }, [])

  const removeLine = useCallback((idx: number) => {
    setData(prev => {
      if (!prev) return prev
      return { ...prev, lines: prev.lines.filter((_, i) => i !== idx) }
    })
  }, [])

  const addLine = useCallback(() => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        lines: [...prev.lines, { description: '', quantity: 1, unit: null, unit_price: 0, vat_rate: 20, total_ht: 0 }],
      }
    })
  }, [])

  // -- Import -----------------------------------------------------------------

  async function runImport() {
    if (!data) return
    setImporting(true)
    setImportError('')

    const endpoint = documentType === 'quote' ? '/quotes/import'
      : documentType === 'invoice' ? '/invoices/import'
      : '/orders/import'

    try {
      const resp = await orgClient.post<{ id: string }>(endpoint, data)
      setCreatedId(resp.id)
      setStep('done')
      onImported(resp.id)
    } catch (err: unknown) {
      const msg = (err as { data?: { detail?: string } })?.data?.detail || 'Erreur lors de l\'import'
      setImportError(String(msg))
    } finally {
      setImporting(false)
    }
  }

  // -- Confidence badge -------------------------------------------------------

  function confidenceBadge(score: number | null) {
    if (score == null) return null
    const pct = Math.round(score * 100)
    const cls = score > 0.8
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : score > 0.5
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        Confiance : {pct}%
      </span>
    )
  }

  // -- Render -----------------------------------------------------------------

  const docLabel = DOC_LABELS[documentType]

  return (
    <div className={OVERLAY_BACKDROP} onClick={onClose}>
      <div className={OVERLAY_PANEL + ' max-w-4xl'} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={OVERLAY_HEADER}>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Importer un {docLabel}
            </h3>
            {step === 'verify' && data && confidenceBadge(data.confidence)}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 dark:border-gray-700">
          {[
            { key: 'upload', label: '1. Upload' },
            { key: 'verify', label: '2. Verification' },
            { key: 'done', label: '3. Import' },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-300 dark:bg-gray-600" />}
              <span className={`text-xs font-medium ${
                step === s.key ? 'text-kerpta' : 'text-gray-400'
              }`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <div className="p-6">
          {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-kerpta hover:bg-kerpta-50/30 dark:hover:bg-kerpta-900/10 transition"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {preview ? (
                  <img src={preview} alt="Apercu" className="max-h-64 mx-auto rounded-lg" />
                ) : file ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
                    <FileText className="w-12 h-12" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} Ko</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <Upload className="w-10 h-10" />
                    <span className="text-sm">Cliquez ou glissez un PDF / image</span>
                    <span className="text-xs">JPG, PNG, PDF - max 10 Mo</span>
                  </div>
                )}
              </div>

              {file && (
                <div className="flex gap-2">
                  <button onClick={runExtract} disabled={extracting} className={BTN + ' flex-1'}>
                    {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {extracting ? `Extraction... ${(chrono / 1000).toFixed(1)}s` : 'Extraire les donnees'}
                  </button>
                  <button onClick={clearFile} className={BTN_SECONDARY}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {extractError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {extractError}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Verification ──────────────────────────────────────── */}
          {step === 'verify' && data && (
            <div className="space-y-6">
              {/* Emetteur */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Emetteur</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Nom</label>
                    <input
                      className={INPUT}
                      value={data.supplier_name || ''}
                      onChange={e => updateField('supplier_name', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Adresse</label>
                    <input
                      className={INPUT}
                      value={data.supplier_address || ''}
                      onChange={e => updateField('supplier_address', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>SIRET</label>
                    <input
                      className={INPUT}
                      value={data.supplier_siret || ''}
                      onChange={e => updateField('supplier_siret', e.target.value || null)}
                    />
                  </div>
                </div>
              </div>

              {/* Document */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Document</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Numero</label>
                    <input
                      className={INPUT}
                      value={data.document_number || ''}
                      onChange={e => updateField('document_number', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Date d'emission</label>
                    <input
                      type="date"
                      className={INPUT}
                      value={data.issue_date || ''}
                      onChange={e => updateField('issue_date', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Date d'echeance</label>
                    <input
                      type="date"
                      className={INPUT}
                      value={data.due_date || ''}
                      onChange={e => updateField('due_date', e.target.value || null)}
                    />
                  </div>
                </div>
              </div>

              {/* Lines table */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Lignes ({data.lines.length})
                </h4>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_70px_70px_90px_70px_90px_32px] gap-px bg-gray-50 dark:bg-gray-900 px-2 py-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    <span>Designation</span>
                    <span className="text-right">Qte</span>
                    <span>Unite</span>
                    <span className="text-right">PU HT</span>
                    <span className="text-right">TVA %</span>
                    <span className="text-right">Total HT</span>
                    <span />
                  </div>
                  {/* Rows */}
                  {data.lines.map((line, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_70px_70px_90px_70px_90px_32px] gap-px px-2 py-1 border-t border-gray-100 dark:border-gray-700 items-center"
                    >
                      <input
                        className={LINE_INPUT}
                        value={line.description}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                      />
                      <input
                        type="number"
                        className={LINE_INPUT + ' text-right'}
                        value={line.quantity ?? ''}
                        onChange={e => updateLine(i, 'quantity', e.target.value ? Number(e.target.value) : null)}
                      />
                      <input
                        className={LINE_INPUT}
                        value={line.unit || ''}
                        onChange={e => updateLine(i, 'unit', e.target.value || null)}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className={LINE_INPUT + ' text-right'}
                        value={line.unit_price ?? ''}
                        onChange={e => updateLine(i, 'unit_price', e.target.value ? Number(e.target.value) : null)}
                      />
                      <input
                        type="number"
                        step="0.1"
                        className={LINE_INPUT + ' text-right'}
                        value={line.vat_rate ?? ''}
                        onChange={e => updateLine(i, 'vat_rate', e.target.value ? Number(e.target.value) : null)}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className={LINE_INPUT + ' text-right'}
                        value={line.total_ht ?? ''}
                        onChange={e => updateLine(i, 'total_ht', e.target.value ? Number(e.target.value) : null)}
                      />
                      <button
                        onClick={() => removeLine(i)}
                        className="p-1 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addLine}
                  className="mt-2 flex items-center gap-1.5 text-xs text-kerpta-600 dark:text-kerpta-400 hover:text-kerpta-700 dark:hover:text-kerpta-300 font-medium transition px-2 py-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
                </button>
              </div>

              {/* Totals */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Totaux</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Total HT</label>
                    <input
                      type="number"
                      step="0.01"
                      className={INPUT}
                      value={data.total_ht ?? ''}
                      onChange={e => updateField('total_ht', e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Total TVA</label>
                    <input
                      type="number"
                      step="0.01"
                      className={INPUT}
                      value={data.total_tva ?? ''}
                      onChange={e => updateField('total_tva', e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Total TTC</label>
                    <input
                      type="number"
                      step="0.01"
                      className={INPUT}
                      value={data.total_ttc ?? ''}
                      onChange={e => updateField('total_ttc', e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Paiement</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Mode de paiement</label>
                    <input
                      className={INPUT}
                      value={data.payment_method || ''}
                      onChange={e => updateField('payment_method', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>IBAN</label>
                    <input
                      className={INPUT}
                      value={data.iban || ''}
                      onChange={e => updateField('iban', e.target.value || null)}
                    />
                  </div>
                </div>
              </div>

              {/* Import error */}
              {importError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {importError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setStep('upload')}
                  className={BTN_SECONDARY}
                >
                  Retour
                </button>
                <button
                  onClick={runImport}
                  disabled={importing}
                  className={BTN}
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {importing ? 'Import...' : `Importer comme ${docLabel}`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ──────────────────────────────────────────────── */}
          {step === 'done' && createdId && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Le {docLabel} a ete importe avec succes.
              </p>
              <div className="flex gap-2">
                <button onClick={onClose} className={BTN_SECONDARY}>
                  Fermer
                </button>
                <button
                  onClick={() => {
                    const base = documentType === 'quote' ? '/app/quotes'
                      : documentType === 'invoice' ? '/app/invoices'
                      : '/app/orders'
                    window.location.href = `${base}?id=${createdId}`
                  }}
                  className={BTN}
                >
                  <ExternalLink className="w-4 h-4" />
                  Voir le {docLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

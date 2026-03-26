// Kerpta - Import IA simplifie : upload -> extraction -> creation brouillon
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { orgClient } from '@/lib/api'
import {
  BTN, BTN_SECONDARY,
  OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER,
} from '@/lib/formStyles'

// -- Types --------------------------------------------------------------------

interface ImportDocumentModalProps {
  documentType: 'quote' | 'invoice' | 'order'
  onClose: () => void
  onImported: (id: string) => void
}

interface ExtractResponse {
  import_id: string
  extracted_json: Record<string, unknown>
  suggested_client: { id: string; name: string } | null
}

const DOC_LABELS: Record<string, string> = {
  quote: 'devis',
  invoice: 'facture',
  order: 'commande',
}

type Step = 'upload' | 'processing' | 'done' | 'error'

// -- Component ----------------------------------------------------------------

export default function ImportDocumentModal({ documentType, onClose, onImported }: ImportDocumentModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [chrono, setChrono] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Live chrono during processing
  useEffect(() => {
    if (step !== 'processing') { setChrono(0); return }
    const start = performance.now()
    const id = setInterval(() => setChrono(Math.round(performance.now() - start)), 100)
    return () => clearInterval(id)
  }, [step])

  // -- File handling ----------------------------------------------------------

  function setFileFromInput(f: File) {
    setFile(f)
    setError('')

    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreview(ev.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFileFromInput(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) setFileFromInput(f)
  }

  // -- Processing: extract + validate ----------------------------------------

  async function runImport() {
    if (!file) return
    setStep('processing')
    setError('')

    try {
      // Upload + extraction IA -> reste en staging (pending)
      const formData = new FormData()
      formData.append('file', file)
      await orgClient.post<ExtractResponse>('/ai/extract-document', formData)

      // Pas de validation automatique - l'utilisateur valide depuis Import IA
      setStep('done')
      onImported('')
    } catch (err: unknown) {
      const msg = (err as { data?: { detail?: string } })?.data?.detail || "Erreur lors de l'import"
      setError(String(msg))
      setStep('error')
    }
  }

  // -- Render -----------------------------------------------------------------

  const docLabel = DOC_LABELS[documentType]

  return (
    <div className={OVERLAY_BACKDROP} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${OVERLAY_PANEL} max-w-lg`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={OVERLAY_HEADER}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Import IA - {docLabel}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          {/* -- Upload ---------------------------------------------------- */}
          {step === 'upload' && (
            <div className="space-y-4">
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
                  <img src={preview} alt="Apercu" className="max-h-48 mx-auto rounded-lg" />
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
                <button onClick={runImport} className={BTN + ' w-full'}>
                  <Upload className="w-4 h-4" />
                  Importer en {docLabel} brouillon
                </button>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                L'IA extrait les donnees et cree un {docLabel} brouillon.
                Vous pourrez le modifier ensuite.
              </p>
            </div>
          )}

          {/* -- Processing ------------------------------------------------ */}
          {step === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 animate-spin text-kerpta" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Import en cours... {(chrono / 1000).toFixed(1)}s
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Extraction IA et creation du {docLabel} brouillon
              </p>
            </div>
          )}

          {/* -- Done ------------------------------------------------------ */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {docLabel.charAt(0).toUpperCase() + docLabel.slice(1)} brouillon cree avec succes.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Cliquez dessus dans la liste pour le modifier.
              </p>
              <button onClick={onClose} className={BTN_SECONDARY}>
                Fermer
              </button>
            </div>
          )}

          {/* -- Error ----------------------------------------------------- */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('upload')} className={BTN_SECONDARY + ' flex-1'}>
                  Reessayer
                </button>
                <button onClick={onClose} className={BTN_SECONDARY + ' flex-1'}>
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

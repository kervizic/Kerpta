// Kerpta — Page de test IA (temporaire - a supprimer apres validation)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import {
  BrainCircuit,
  Upload,
  Loader2,
  FileImage,
  FileText,
  Trash2,
  Copy,
  Check,
  MessageSquare,
  Send,
  BookOpen,
} from 'lucide-react'
import { BTN, BTN_SM, BTN_SECONDARY, CARD, INPUT } from '@/lib/formStyles'
import PageLayout from '@/components/app/PageLayout'

type Tab = 'ocr' | 'categorize' | 'chat'

interface OcrResult {
  supplier_name?: string | null
  supplier_siret?: string | null
  supplier_address?: string | null
  invoice_number?: string | null
  issue_date?: string | null
  due_date?: string | null
  total_ht?: number | null
  total_tva?: number | null
  total_ttc?: number | null
  iban?: string | null
  lines?: Array<{
    description?: string
    quantity?: number
    unit_price?: number
    vat_rate?: number
    total_ht?: number
  }>
  raw_text?: string
  [key: string]: unknown
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function TestAiPage() {
  const { activeOrgId } = useAuthStore()
  const [tab, setTab] = useState<Tab>('ocr')

  // OCR state
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrRaw, setOcrRaw] = useState<string>('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrDuration, setOcrDuration] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Categorize state
  const [catLabel, setCatLabel] = useState('')
  const [catAmount, setCatAmount] = useState('')
  const [catSupplier, setCatSupplier] = useState('')
  const [catResult, setCatResult] = useState<Record<string, unknown> | null>(null)
  const [catLoading, setCatLoading] = useState(false)
  const [catError, setCatError] = useState('')

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const [useThinking, setUseThinking] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [copied, setCopied] = useState(false)

  // ── OCR ──────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setOcrResult(null)
    setOcrRaw('')
    setOcrError('')
    setOcrDuration(null)

    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreview(ev.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  async function runOcr() {
    if (!file || !activeOrgId) return
    setOcrLoading(true)
    setOcrError('')
    setOcrResult(null)
    setOcrRaw('')
    const start = performance.now()

    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await apiClient.post('/ai/ocr', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Organization-Id': activeOrgId,
        },
      })
      const duration = Math.round(performance.now() - start)
      setOcrDuration(duration)
      setOcrResult(resp.data)
      setOcrRaw(JSON.stringify(resp.data, null, 2))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erreur OCR'
      setOcrError(String(msg))
    } finally {
      setOcrLoading(false)
    }
  }

  // ── Categorize ──────────────────────────────────────────────────────────

  async function runCategorize() {
    if (!catLabel || !catAmount || !activeOrgId) return
    setCatLoading(true)
    setCatError('')
    setCatResult(null)

    try {
      const resp = await apiClient.post('/ai/categorize', {
        label: catLabel,
        amount: parseFloat(catAmount),
        supplier_name: catSupplier || undefined,
      }, {
        headers: { 'X-Organization-Id': activeOrgId },
      })
      setCatResult(resp.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erreur categorisation'
      setCatError(String(msg))
    } finally {
      setCatLoading(false)
    }
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  async function sendChat() {
    if (!chatInput.trim() || !activeOrgId) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)
    setChatError('')

    try {
      const resp = await apiClient.post('/ai/chat', {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        use_thinking: useThinking,
      }, {
        headers: { 'X-Organization-Id': activeOrgId },
      })
      setChatMessages([...newMessages, { role: 'assistant', content: resp.data.content }])
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erreur chat'
      setChatError(String(msg))
    } finally {
      setChatLoading(false)
    }
  }

  // ── Copy ────────────────────────────────────────────────────────────────

  function copyJson(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Tabs ────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'ocr', label: 'OCR (Vision)', icon: <FileImage className="w-4 h-4" /> },
    { key: 'categorize', label: 'Categorisation PCG', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'chat', label: 'Chat IA', icon: <MessageSquare className="w-4 h-4" /> },
  ]

  return (
    <PageLayout
      icon={<BrainCircuit className="w-5 h-5 text-kerpta" />}
      title="Test IA"
      subtitle="Module de test temporaire - a supprimer apres validation"
      size="lg"
    >
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? 'border-kerpta text-kerpta'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab OCR ────────────────────────────────────────────────────────── */}
      {tab === 'ocr' && (
        <div className="space-y-6">
          {/* Upload */}
          <div className={CARD + ' p-6 space-y-4'}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Document source</h2>

            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-kerpta hover:bg-kerpta-50/30 transition"
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
                <div className="flex flex-col items-center gap-2 text-gray-500">
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
                <button onClick={runOcr} disabled={ocrLoading} className={BTN + ' flex-1'}>
                  {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                  {ocrLoading ? 'Analyse en cours...' : 'Lancer l\'OCR'}
                </button>
                <button
                  onClick={() => { setFile(null); setPreview(null); setOcrResult(null); setOcrRaw(''); setOcrError(''); setOcrDuration(null) }}
                  className={BTN_SECONDARY}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {ocrError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                {ocrError}
              </div>
            )}
          </div>

          {/* Resultat OCR (sous le fichier) */}
          {ocrResult && (
            <div className={CARD + ' p-6 space-y-4'}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Resultat OCR</h2>
                {ocrDuration !== null && (
                  <span className="text-xs text-gray-400">{ocrDuration} ms</span>
                )}
              </div>

              {/* Structured fields */}
              {!ocrResult.raw_text && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  {[
                    ['Fournisseur', ocrResult.supplier_name],
                    ['SIRET', ocrResult.supplier_siret],
                    ['Adresse', ocrResult.supplier_address],
                    ['N Facture', ocrResult.invoice_number],
                    ['Date emission', ocrResult.issue_date],
                    ['Date echeance', ocrResult.due_date],
                    ['Total HT', ocrResult.total_ht != null ? `${ocrResult.total_ht} EUR` : null],
                    ['Total TVA', ocrResult.total_tva != null ? `${ocrResult.total_tva} EUR` : null],
                    ['Total TTC', ocrResult.total_ttc != null ? `${ocrResult.total_ttc} EUR` : null],
                    ['IBAN', ocrResult.iban],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between text-sm py-1">
                      <span className="text-gray-500">{label as string}</span>
                      <span className={`font-medium ${value ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                        {(value as string) ?? '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Lines */}
              {ocrResult.lines && ocrResult.lines.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Lignes ({ocrResult.lines.length})</h3>
                  <div className="space-y-1">
                    {ocrResult.lines.map((line, i) => (
                      <div key={i} className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 flex justify-between gap-2">
                        <span className="flex-1 truncate">{line.description}</span>
                        <span className="text-gray-500 whitespace-nowrap">
                          {line.quantity ?? '?'} x {line.unit_price ?? '?'} EUR
                        </span>
                        <span className="font-medium whitespace-nowrap">{line.total_ht ?? '?'} EUR</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 uppercase">JSON brut</span>
                  <button onClick={() => copyJson(ocrRaw)} className={BTN_SM}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copie' : 'Copier'}
                  </button>
                </div>
                <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-4 overflow-auto max-h-80 font-mono">
                  {ocrRaw}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab Categorize ─────────────────────────────────────────────────── */}
      {tab === 'categorize' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={CARD + ' p-6 space-y-4'}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ecriture a categoriser</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Libelle *</label>
              <input
                className={INPUT}
                placeholder="Ex: Fournitures de bureau - Amazon"
                value={catLabel}
                onChange={e => setCatLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Montant (EUR) *</label>
              <input
                className={INPUT}
                type="number"
                step="0.01"
                placeholder="Ex: 125.50"
                value={catAmount}
                onChange={e => setCatAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fournisseur (optionnel)</label>
              <input
                className={INPUT}
                placeholder="Ex: Amazon"
                value={catSupplier}
                onChange={e => setCatSupplier(e.target.value)}
              />
            </div>
            <button
              onClick={runCategorize}
              disabled={catLoading || !catLabel || !catAmount}
              className={BTN + ' w-full'}
            >
              {catLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              {catLoading ? 'Analyse...' : 'Suggerer un compte PCG'}
            </button>
            {catError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                {catError}
              </div>
            )}
          </div>

          <div className={CARD + ' p-6 space-y-4'}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Suggestion PCG</h2>
            {catResult ? (
              <div className="space-y-3">
                <div className="bg-kerpta-50 dark:bg-kerpta-900/20 border border-kerpta-200 dark:border-kerpta-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-kerpta">{(catResult.suggested_account as string) || '?'}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{(catResult.account_label as string) || ''}</div>
                  {catResult.confidence != null && (
                    <div className="mt-2 text-xs text-gray-400">
                      Confiance : {Math.round((catResult.confidence as number) * 100)}%
                    </div>
                  )}
                </div>
                {Array.isArray(catResult.alternatives) && (catResult.alternatives as Array<{ account: string; label: string }>).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Alternatives</h3>
                    {(catResult.alternatives as Array<{ account: string; label: string }>).map((alt, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="font-mono text-gray-700 dark:text-gray-300">{alt.account}</span>
                        <span className="text-gray-500">{alt.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-auto max-h-40 font-mono">
                  {JSON.stringify(catResult, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-300 dark:text-gray-600">
                <BookOpen className="w-12 h-12 mb-2" />
                <span className="text-sm">Remplissez le formulaire et lancez la categorisation</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Chat ───────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div className={CARD + ' p-6 flex flex-col h-[600px]'}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Chat comptable IA</h2>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={useThinking}
                onChange={e => setUseThinking(e.target.checked)}
                className="rounded border-gray-300"
              />
              Mode Thinking
            </label>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
                <MessageSquare className="w-12 h-12 mb-2" />
                <span className="text-sm">Posez une question comptable</span>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-kerpta text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {chatError && (
            <div className="p-2 mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
              {chatError}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              className={INPUT + ' flex-1'}
              placeholder="Ex: Quelle est la difference entre le compte 601 et 602 ?"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
            />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className={BTN}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

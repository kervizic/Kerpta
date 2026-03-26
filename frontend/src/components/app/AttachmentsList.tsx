// Kerpta - Liste des pieces jointes d'un document
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, useCallback } from 'react'
import { FileText, Trash2, Download, Loader2, Sparkles } from 'lucide-react'
import { orgGet, orgDelete, orgDownload } from '@/lib/orgApi'
import { LABEL } from '@/lib/formStyles'

interface Attachment {
  id: string
  filename: string
  file_size: number
  file_url: string
  content_type: string
  import_id: string | null
  created_at: string
}

interface AttachmentsListProps {
  parentType: 'quote' | 'invoice' | 'order'
  parentId: string
  refreshKey?: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AttachmentsList({ parentType, parentId, refreshKey }: AttachmentsListProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadAttachments = useCallback(() => {
    setLoading(true)
    orgGet<Attachment[]>('/attachments', { parent_type: parentType, parent_id: parentId })
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setLoading(false))
  }, [parentType, parentId])

  useEffect(() => {
    loadAttachments()
  }, [loadAttachments, refreshKey])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await orgDelete(`/attachments/${id}`)
      setAttachments(prev => prev.filter(a => a.id !== id))
    } catch {
      // silent
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-gray-400 dark:text-gray-500 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des pieces jointes...
      </div>
    )
  }

  if (attachments.length === 0) {
    return null
  }

  return (
    <div>
      <h4 className={LABEL}>Pieces jointes ({attachments.length})</h4>
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
        {attachments.map(att => (
          <div key={att.id} className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
            <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{att.filename}</span>
                {att.import_id && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 shrink-0">
                    <Sparkles className="w-2.5 h-2.5" /> Import IA
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {formatFileSize(att.file_size)} - {formatDate(att.created_at)}
              </div>
            </div>
            <button
              onClick={() => orgDownload(`/attachments/${att.id}/file`, att.filename || 'piece-jointe')}
              className="p-1.5 text-gray-400 hover:text-kerpta transition rounded cursor-pointer"
              title="Telecharger"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(att.id)}
              disabled={deletingId === att.id}
              className="p-1.5 text-gray-400 hover:text-red-500 transition rounded disabled:opacity-50"
              title="Supprimer"
            >
              {deletingId === att.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

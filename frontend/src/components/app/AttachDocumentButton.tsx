// Kerpta - Bouton pour joindre un document (upload simple sans IA)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useRef } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { orgClient } from '@/lib/api'
import { BTN_SECONDARY } from '@/lib/formStyles'

interface AttachDocumentButtonProps {
  parentType: 'quote' | 'invoice' | 'order'
  parentId: string
  onAttached: () => void
}

export default function AttachDocumentButton({ parentType, parentId, onAttached }: AttachDocumentButtonProps) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('parent_type', parentType)
      formData.append('parent_id', parentId)
      await orgClient.post('/attachments', formData)
      onAttached()
    } catch {
      // silent
    } finally {
      setUploading(false)
      // Reset file input
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFile}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={BTN_SECONDARY}
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        {uploading ? 'Upload...' : 'Joindre'}
      </button>
    </>
  )
}

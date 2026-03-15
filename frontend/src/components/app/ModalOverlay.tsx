// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { X } from 'lucide-react'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const SIZE_MAP: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-5xl',
}

interface ModalOverlayProps {
  onClose: () => void
  size?: ModalSize
  /** Titre affiché dans le header. Si absent, pas de header (le children gère tout). */
  title?: string
  children: React.ReactNode
  /** z-index supérieur pour les modales imbriquées */
  nested?: boolean
}

export default function ModalOverlay({ onClose, size = 'full', title, children, nested }: ModalOverlayProps) {
  return (
    <div
      className={`fixed inset-0 ${nested ? 'z-[60]' : 'z-50'} flex items-start justify-center bg-black/30 overflow-y-auto`}
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-black/50 w-full mx-6 ${SIZE_MAP[size]} mt-8 mb-8`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10 rounded-t-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        )}
        {title ? <div className="px-6 py-5">{children}</div> : children}
      </div>
    </div>
  )
}

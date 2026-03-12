// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Hook de routing léger basé sur window.location.pathname + popstate.
// Remplace TanStack Router pour les besoins simples de navigation SPA.

import { useEffect, useState } from 'react'

/** Retourne le pathname courant, réactif aux navigations. */
export function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handler = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  return path
}

/** Navigation programmatique — met à jour l'historique et déclenche popstate. */
export function navigate(to: string): void {
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

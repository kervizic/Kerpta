// Kerpta — Page de callback OAuth
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// GoTrue redirige ici avec le token dans le hash :
//   /callback#access_token=xxx&token_type=bearer&...
// On extrait le token, décode le JWT payload pour récupérer email/nom,
// stocke dans authStore, puis redirige vers /app.

import { useEffect, useState } from 'react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore } from '@/stores/authStore'
import type { AuthUser } from '@/stores/authStore'

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return {}
    // Base64url → Base64 standard → decode
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

export default function CallbackPage() {
  const login = useAuthStore((s) => s.login)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const hash = window.location.hash.slice(1) // retire le #
    const params = new URLSearchParams(hash)

    // Gestion d'erreur OAuth (ex: access_denied)
    const oauthError = params.get('error')
    if (oauthError) {
      const desc = params.get('error_description') ?? oauthError
      setError(decodeURIComponent(desc))
      return
    }

    const accessToken = params.get('access_token')
    if (!accessToken) {
      setError('Token manquant dans le callback')
      return
    }

    // Décode le payload JWT pour extraire les infos utilisateur
    const payload = decodeJwtPayload(accessToken)
    const meta = (payload.user_metadata as Record<string, string> | undefined) ?? {}

    const user: AuthUser = {
      id: (payload.sub as string) ?? '',
      email: (payload.email as string) ?? (meta.email ?? ''),
      name: (meta.full_name as string) ?? (meta.name as string) ?? (payload.email as string) ?? '',
      avatar: (meta.avatar_url as string) ?? (meta.picture as string) ?? undefined,
    }

    login(accessToken, user)

    // Nettoie le hash avant la navigation
    window.history.replaceState(null, '', '/callback')
    navigate('/app')
  }, [login])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl">✕</span>
          </div>
          <h2 className="text-gray-900 font-semibold mb-2">Erreur de connexion</h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 rounded-xl bg-kerpta-600 hover:bg-kerpta text-white text-sm font-semibold transition"
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-kerpta border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Connexion en cours…</p>
      </div>
    </div>
  )
}

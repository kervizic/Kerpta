// Kerpta — Page de connexion OAuth
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import { navigate } from '@/hooks/useRoute'
import { ArrowLeft, LogIn } from 'lucide-react'

interface ProvidersResponse {
  providers: string[]
  auth_url: string
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X (Twitter)',
  discord: 'Discord',
  salesforce: 'Salesforce',
}

function ProviderIcon({ provider }: { provider: string }) {
  // Icônes simplifiées en SVG inline pour les principaux providers
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    )
  }
  if (provider === 'github') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800 dark:text-white" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    )
  }
  if (provider === 'microsoft') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z" fill="#F25022"/>
        <path d="M24 11.4H12.6V0H24v11.4z" fill="#7FBA00"/>
        <path d="M11.4 24H0V12.6h11.4V24z" fill="#00A4EF"/>
        <path d="M24 24H12.6V12.6H24V24z" fill="#FFB900"/>
      </svg>
    )
  }
  // Fallback icon générique
  return <LogIn className="w-5 h-5 text-gray-500" />
}

export default function LoginPage() {
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<string[]>([])
  const [authUrl, setAuthUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Si déjà connecté → rediriger directement vers /app
    const token = localStorage.getItem('supabase_access_token')
    if (token) {
      navigate('/app')
      return
    }

    fetch('/api/v1/config/providers')
      .then((r) => r.json())
      .then((data: ProvidersResponse) => {
        setProviders(data.providers)
        setAuthUrl(data.auth_url)
        setLoading(false)
      })
      .catch(() => {
        setError('Impossible de charger la configuration')
        setLoading(false)
      })
  }, [])

  function handleProviderClick(provider: string) {
    if (!authUrl) return
    const redirectTo = `${window.location.origin}/callback`
    const url = `${authUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`
    window.location.href = url
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Gradient de fond */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-orange-500/10 dark:bg-orange-600/20 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Kerpta</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Connectez-vous à votre espace</p>
        </div>

        <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-4">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && providers.length === 0 && (
            <div className="text-center py-4">
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                Aucun provider OAuth configuré.
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-xs mt-1">
                Configurez les providers dans le panneau d'administration.
              </p>
            </div>
          )}

          {!loading && !error && providers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center mb-4 uppercase tracking-wider">
                Choisissez votre méthode de connexion
              </p>
              {providers.map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderClick(provider)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10 border border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20 text-gray-700 dark:text-white text-sm font-medium transition-all"
                >
                  <ProviderIcon provider={provider} />
                  <span>Continuer avec {PROVIDER_LABELS[provider] ?? provider}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Retour */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-slate-300 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour au site
          </button>
        </div>
      </div>
    </div>
  )
}

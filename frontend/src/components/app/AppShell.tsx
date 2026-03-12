// Kerpta — Shell de l'application (layout avec sidebar)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, lazy, Suspense } from 'react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore } from '@/stores/authStore'
import { AppSidebar } from './AppSidebar'

const ConfigApiKeysPage = lazy(() => import('@/pages/app/ConfigApiKeysPage'))
const OnboardingPage = lazy(() => import('@/pages/app/OnboardingPage'))

interface AppShellProps {
  path: string
}

function PageSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function DashboardPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📊</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Tableau de bord</h2>
        <p className="text-gray-500 text-sm">Les modules comptables arrivent bientôt.</p>
      </div>
    </div>
  )
}

export default function AppShell({ path }: AppShellProps) {
  const { token, fetchMe, fetchOrgs, orgs } = useAuthStore()

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    void fetchMe()
    void fetchOrgs()
  }, [token, fetchMe, fetchOrgs])

  if (!token) return null

  // Attente du chargement des orgas
  if (orgs === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AppSidebar currentPath={path} />

      <main className="flex-1 flex overflow-hidden">
        <Suspense fallback={<PageSpinner />}>
          {path === '/app/config/api-keys' ? (
            <ConfigApiKeysPage />
          ) : orgs.length === 0 || path === '/app/onboarding' ? (
            // Pas d'orga (ou demande explicite) → wizard intégré dans le shell
            <OnboardingPage embedded />
          ) : (
            <DashboardPlaceholder />
          )}
        </Suspense>
      </main>
    </div>
  )
}

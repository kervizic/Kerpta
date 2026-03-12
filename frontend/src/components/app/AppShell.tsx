// Kerpta — Shell de l'application (layout avec sidebar)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, lazy, Suspense } from 'react'
import { Menu } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore } from '@/stores/authStore'
import { AppSidebar } from './AppSidebar'

const ConfigApiKeysPage = lazy(() => import('@/pages/app/ConfigApiKeysPage'))
const OnboardingPage = lazy(() => import('@/pages/app/OnboardingPage'))
const OrgSettingsPage = lazy(() => import('@/pages/app/OrgSettingsPage'))

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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    void fetchMe()
    void fetchOrgs()
  }, [token, fetchMe, fetchOrgs])

  // Ferme la sidebar mobile lors d'un changement de page
  useEffect(() => {
    setSidebarOpen(false)
  }, [path])

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
      {/* Overlay mobile — ferme la sidebar au clic */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixe en overlay sur mobile, sticky sur desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AppSidebar currentPath={path} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Zone principale */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Barre mobile : bouton burger uniquement */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-600"
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-gray-900">
            KER<span className="text-orange-500">PTA</span>
          </span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <Suspense fallback={<PageSpinner />}>
            {path === '/app/config/api-keys' ? (
              <ConfigApiKeysPage />
            ) : path === '/app/org/settings' ? (
              <OrgSettingsPage />
            ) : orgs.length === 0 || path === '/app/onboarding' ? (
              // Pas d'orga (ou demande explicite) → wizard intégré dans le shell
              <OnboardingPage
                embedded
                initialStep={
                  (new URLSearchParams(window.location.search).get('action') as 'create' | 'join') || 'choice'
                }
              />
            ) : (
              <DashboardPlaceholder />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  )
}

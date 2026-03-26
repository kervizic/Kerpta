// Kerpta — Shell de l'application (layout avec sidebar)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState, lazy, Suspense } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore } from '@/stores/authStore'
import { AppSidebar } from './AppSidebar'

const ConfigApiKeysPage = lazy(() => import('@/pages/app/ConfigApiKeysPage'))
const OnboardingPage = lazy(() => import('@/pages/app/OnboardingPage'))
const OrgSettingsPage = lazy(() => import('@/pages/app/OrgSettingsPage'))
const ClientsPage = lazy(() => import('@/pages/app/ClientsPage'))
const CatalogPage = lazy(() => import('@/pages/app/CatalogPage'))
const QuotesPage = lazy(() => import('@/pages/app/QuotesPage'))
const OrdersPage = lazy(() => import('@/pages/app/OrdersPage'))
const ContractsPage = lazy(() => import('@/pages/app/ContractsPage'))
const InvoicesPage = lazy(() => import('@/pages/app/InvoicesPage'))
const ModulesPage = lazy(() => import('@/pages/app/ModulesPage'))
const InvoiceSettingsPage = lazy(() => import('@/pages/app/InvoiceSettingsPage'))
const DocumentSettingsPage = lazy(() => import('@/pages/app/DocumentSettingsPage'))
const StorageSettingsPage = lazy(() => import('@/pages/app/StorageSettingsPage'))
const ConfigAiPage = lazy(() => import('@/pages/app/ConfigAiPage'))
const TestAiPage = lazy(() => import('@/pages/app/TestAiPage'))
const ImportsPage = lazy(() => import('@/pages/app/ImportsPage'))

function PageSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-kerpta border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function DashboardPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-kerpta/10 border border-kerpta/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📊</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Tableau de bord</h2>
        <p className="text-gray-500 text-sm">Les modules comptables arrivent bientôt.</p>
      </div>
    </div>
  )
}

const PLACEHOLDER_PREFIXES: [string, string][] = [
  ['/app/fournisseurs', 'Fournisseurs'],
  ['/app/devis-fournisseur', 'Devis fournisseur'],
  ['/app/bons-commande', 'Bons de commande'],
  ['/app/achats', "Factures d'achat"],
  ['/app/frais', 'Notes de frais'],
  ['/app/salaries', 'Salariés'],
  ['/app/paie', 'Bulletins de paie'],
  ['/app/journal', 'Journal'],
  ['/app/grand-livre', 'Grand livre'],
  ['/app/balance', 'Balance'],
  ['/app/tva', 'TVA'],
]

function getPlaceholderTitle(path: string): string | null {
  for (const [prefix, title] of PLACEHOLDER_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + '/')) return title
  }
  return null
}

function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-400 text-sm">Ce module est en cours de développement.</p>
      </div>
    </div>
  )
}

export default function AppShell() {
  const { pathname: path } = useLocation()
  const { token, fetchMe, fetchOrgs, orgs, activeOrgId } = useAuthStore()
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

  const placeholderTitle = getPlaceholderTitle(path)

  // Attente du chargement des orgas
  if (orgs === null) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-kerpta border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
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
          <span className="font-sarpanch text-2xl leading-none">
            <span className="text-[#888888]">KER</span><span className="text-kerpta">PTA</span>
          </span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <Suspense fallback={<PageSpinner />}>
            {path === '/app/config/api-keys' ? (
              <ConfigApiKeysPage key={activeOrgId} />
            ) : path === '/app/config/stockage' ? (
              <StorageSettingsPage key={activeOrgId} />
            ) : path === '/app/config/documents' ? (
              <DocumentSettingsPage key={activeOrgId} />
            ) : path === '/app/config/facturation' ? (
              <InvoiceSettingsPage key={activeOrgId} />
            ) : path === '/app/config/ai' ? (
              <ConfigAiPage key={activeOrgId} />
            ) : path === '/app/org/settings' ? (
              <OrgSettingsPage key={activeOrgId} />
            ) : path === '/app/org/modules' ? (
              <ModulesPage key={activeOrgId} />
            ) : path === '/app/clients' ? (
              <ClientsPage key={activeOrgId} />
            ) : path.startsWith('/app/catalogue') ? (
              <CatalogPage key={activeOrgId} />
            ) : path === '/app/devis' ? (
              <QuotesPage key={activeOrgId} />
            ) : path === '/app/commandes' ? (
              <OrdersPage key={activeOrgId} />
            ) : path.startsWith('/app/contrats') ? (
              <ContractsPage key={activeOrgId} />
            ) : path === '/app/imports' ? (
              <ImportsPage key={activeOrgId} />
            ) : path === '/app/test-ai' ? (
              <TestAiPage key={activeOrgId} />
            ) : path === '/app/factures' ? (
              <InvoicesPage key={activeOrgId} />
            ) : placeholderTitle ? (
              <ModulePlaceholder title={placeholderTitle} />
            ) : orgs.length === 0 || path === '/app/onboarding' ? (
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

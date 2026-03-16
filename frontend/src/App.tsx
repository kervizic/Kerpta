// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Dispatcher de routes principal.
// Routing basé sur window.location.pathname via useRoute().

import { lazy, Suspense } from 'react'
import { useRoute } from '@/hooks/useRoute'
import LandingPage from '@/pages/LandingPage'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const CallbackPage = lazy(() => import('@/pages/CallbackPage'))
const AppShell = lazy(() => import('@/components/app/AppShell'))
const InvitePage = lazy(() => import('@/pages/InvitePage'))

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-kerpta border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const path = useRoute()

  // /invite/{token} — acceptation d'invitation
  if (path.startsWith('/invite/')) {
    const token = path.slice('/invite/'.length)
    return (
      <Suspense fallback={<LoadingScreen />}>
        <InvitePage token={token} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      {path.startsWith('/app') ? (
        <AppShell path={path} />
      ) : path === '/login' ? (
        <LoginPage />
      ) : path === '/callback' ? (
        <CallbackPage />
      ) : (
        <LandingPage />
      )}
    </Suspense>
  )
}

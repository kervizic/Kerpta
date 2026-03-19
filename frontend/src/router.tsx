// Kerpta - Configuration TanStack Router
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

// ── Lazy imports ──────────────────────────────────────────────────────────────

const LandingPage = lazy(() => import('@/pages/LandingPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const CallbackPage = lazy(() => import('@/pages/CallbackPage'))
const InvitePage = lazy(() => import('@/pages/InvitePage'))
const AppShell = lazy(() => import('@/components/app/AppShell'))

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-kerpta border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── Root route ────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => (
    <Suspense fallback={<LoadingScreen />}>
      <Outlet />
    </Suspense>
  ),
})

// ── Routes publiques ──────────────────────────────────────────────────────────

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <LandingPage />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <LoginPage />,
})

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: () => <CallbackPage />,
})

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: function InviteRouteComponent() {
    const { token } = inviteRoute.useParams()
    return <InvitePage token={token} />
  },
})

// ── Route app (layout avec sidebar) ───────────────────────────────────────────

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/$',
  component: () => <AppShell />,
})

// ── Route tree ────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  callbackRoute,
  inviteRoute,
  appRoute,
])

// ── Router ────────────────────────────────────────────────────────────────────

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

// Type registration
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

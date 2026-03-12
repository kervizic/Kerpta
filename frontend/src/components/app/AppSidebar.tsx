// Kerpta — Sidebar de l'application
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, type ReactNode } from 'react'
import {
  KeyRound,
  LogOut,
  ChevronDown,
  ChevronUp,
  Building2,
  Users,
  Check,
  Building,
  Settings2,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore, type OrgMembership } from '@/stores/authStore'

interface AppSidebarProps {
  currentPath: string
  onClose?: () => void
}

interface NavItem {
  label: string
  href: string
  icon: ReactNode
}

// Items de la section "Mon organisation" (owner/admin uniquement)
const ORG_NAV_ITEMS: NavItem[] = [
  {
    label: 'Ma structure',
    href: '/app/org/settings',
    icon: <Building className="w-4 h-4" />,
  },
]

// Items de la section "Config Kerpta" (platform admin uniquement)
const KERPTA_NAV_ITEMS: NavItem[] = [
  {
    label: 'Clés API',
    href: '/app/config/api-keys',
    icon: <KeyRound className="w-4 h-4" />,
  },
]

// ── Sélecteur d'organisation ──────────────────────────────────────────────────

function OrgSelector({
  orgs,
  activeOrgId,
  onSelect,
}: {
  orgs: OrgMembership[]
  activeOrgId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = orgs.find((o) => o.org_id === activeOrgId) ?? orgs[0]

  function initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-100 transition"
      >
        {active?.org_logo_url ? (
          <img
            src={active.org_logo_url}
            alt={active.org_name}
            className="w-8 h-8 rounded-lg object-cover bg-gray-100 shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 text-xs font-bold shrink-0">
            {active ? initials(active.org_name) : '?'}
          </div>
        )}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-gray-900 truncate">
            {active?.org_name ?? '—'}
          </div>
          <div className="text-xs text-gray-400 capitalize">{active?.role ?? ''}</div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="mt-1 border-t border-gray-100 pt-1">
          {orgs.map((o) => (
            <button
              key={o.org_id}
              onClick={() => { onSelect(o.org_id); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition ${
                o.org_id === activeOrgId ? 'bg-orange-50' : 'hover:bg-gray-50'
              }`}
            >
              {o.org_logo_url ? (
                <img
                  src={o.org_logo_url}
                  alt={o.org_name}
                  className="w-6 h-6 rounded-md object-cover bg-gray-100 shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-md bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 text-xs font-bold shrink-0">
                  {initials(o.org_name)}
                </div>
              )}
              <span className={`text-sm truncate flex-1 ${o.org_id === activeOrgId ? 'font-medium text-orange-700' : 'text-gray-700'}`}>
                {o.org_name}
              </span>
              {o.org_id === activeOrgId && (
                <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              )}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1 space-y-0.5">
            <button
              onClick={() => { setOpen(false); navigate('/app/onboarding?action=create') }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition"
            >
              <Building2 className="w-4 h-4" />
              Créer une structure
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/app/onboarding?action=join') }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition"
            >
              <Users className="w-4 h-4" />
              Rejoindre une structure
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bouton de navigation ──────────────────────────────────────────────────────

function NavBtn({
  item,
  currentPath,
  onClose,
}: {
  item: NavItem
  currentPath: string
  onClose?: () => void
}) {
  const isActive = currentPath === item.href
  return (
    <button
      onClick={() => { navigate(item.href); onClose?.() }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        isActive
          ? 'bg-orange-50 text-orange-700 border border-orange-200'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {item.icon}
      {item.label}
    </button>
  )
}

// ── Section libellée (label + items) ─────────────────────────────────────────

function NavSection({
  label,
  items,
  currentPath,
  onClose,
}: {
  label: string
  items: NavItem[]
  currentPath: string
  onClose?: () => void
}) {
  return (
    <div className="space-y-0.5">
      <div className="px-3 py-1 mt-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      {items.map((item) => (
        <NavBtn key={item.href} item={item} currentPath={currentPath} onClose={onClose} />
      ))}
    </div>
  )
}

// ── Accordéon Config Kerpta (platform admin) — fermé par défaut ───────────────

function KertpaConfigAccordion({
  currentPath,
  onClose,
}: {
  currentPath: string
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-gray-100 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 hover:bg-gray-50 transition"
      >
        <Settings2 className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">Config Kerpta</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {KERPTA_NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavBtn item={item} currentPath={currentPath} onClose={onClose} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Sidebar principale ────────────────────────────────────────────────────────

export function AppSidebar({ currentPath, onClose }: AppSidebarProps) {
  const { user, logout, isAdmin, orgs, activeOrgId, setActiveOrg } = useAuthStore()

  const activeOrg = orgs?.find((o) => o.org_id === activeOrgId) ?? orgs?.[0] ?? null
  const isOrgOwnerOrAdmin = activeOrg?.role === 'owner' || activeOrg?.role === 'admin'

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-gray-200 flex flex-col">

      {/* Logo Kerpta */}
      <div className="px-4 py-3 border-b border-gray-100">
        <a href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none">K</span>
          </div>
          <span className="font-sarpanch text-2xl text-gray-900 group-hover:text-gray-700 transition leading-none">
            KER<span className="text-orange-500">PTA</span>
          </span>
        </a>
      </div>

      {/* Sélecteur d'organisation */}
      <div className="px-3 py-2 border-b border-gray-200">
        {orgs && orgs.length > 0 ? (
          <OrgSelector orgs={orgs} activeOrgId={activeOrgId} onSelect={setActiveOrg} />
        ) : (
          <p className="text-xs text-gray-400 px-2 py-1.5">Aucune organisation</p>
        )}
      </div>

      {/* Navigation principale — scrollable */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">

        {/* Section Mon organisation (owner/admin seulement) */}
        {activeOrg && isOrgOwnerOrAdmin && (
          <NavSection
            label="Mon organisation"
            items={ORG_NAV_ITEMS}
            currentPath={currentPath}
            onClose={onClose}
          />
        )}

        {/* Chargement */}
        {isAdmin === null && (
          <p className="text-xs text-gray-400 px-2 py-2 mt-2">Chargement…</p>
        )}
      </nav>

      {/* Section Config Kerpta — platform admin uniquement */}
      {isAdmin && (
        <div className="px-3 pb-2">
          <KertpaConfigAccordion currentPath={currentPath} onClose={onClose} />
        </div>
      )}

      {/* Profil + déconnexion */}
      <div className="px-3 py-4 border-t border-gray-200">
        {user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover bg-gray-100"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 text-sm font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{user.name}</div>
              <div className="text-xs text-gray-400 truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>

    </aside>
  )
}

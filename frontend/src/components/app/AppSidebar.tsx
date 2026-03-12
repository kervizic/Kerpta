// Kerpta — Sidebar de l'application
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, useEffect, type ReactNode } from 'react'
import {
  KeyRound,
  LogOut,
  ChevronDown,
  ChevronUp,
  Building2,
  Users,
  Check,
  Building,
  Settings,
  Settings2,
  LayoutDashboard,
  LayoutGrid,
  UserRound,
  Package,
  FileText,
  FolderKanban,
  Receipt,
  Briefcase,
  ShoppingCart,
  BarChart3,
  Truck,
  ClipboardList,
  FileDown,
  Wallet,
  UserCheck,
  Banknote,
  BookOpen,
  Library,
  Scale,
  Percent,
  CreditCard,
} from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore, type OrgMembership } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'

interface AppSidebarProps {
  currentPath: string
  onClose?: () => void
}

interface NavItem {
  label: string
  href: string
  icon: ReactNode
  moduleKey?: string
}

// Tableau de bord
const DASHBOARD_ITEM: NavItem = {
  label: 'Tableau de bord', href: '/app', icon: <LayoutDashboard className="w-4 h-4" />,
}

// Items de la section "Ventes"
const VENTE_ITEMS: NavItem[] = [
  { label: 'Clients', href: '/app/clients', icon: <UserRound className="w-4 h-4" />, moduleKey: 'ventes.clients' },
  { label: 'Catalogue', href: '/app/catalogue', icon: <Package className="w-4 h-4" />, moduleKey: 'ventes.catalogue' },
  { label: 'Devis', href: '/app/devis', icon: <FileText className="w-4 h-4" />, moduleKey: 'ventes.devis' },
  { label: 'Commandes', href: '/app/contrats', icon: <FolderKanban className="w-4 h-4" />, moduleKey: 'ventes.commandes' },
  { label: 'Factures', href: '/app/factures', icon: <Receipt className="w-4 h-4" />, moduleKey: 'ventes.factures' },
]

// Items de la section "Achats"
const ACHAT_ITEMS: NavItem[] = [
  { label: 'Fournisseurs', href: '/app/fournisseurs', icon: <Truck className="w-4 h-4" />, moduleKey: 'achats.fournisseurs' },
  { label: 'Devis fournisseur', href: '/app/devis-fournisseur', icon: <FileText className="w-4 h-4" />, moduleKey: 'achats.devis' },
  { label: 'Bons de commande', href: '/app/bons-commande', icon: <ClipboardList className="w-4 h-4" />, moduleKey: 'achats.bons_commande' },
  { label: 'Factures fournisseur', href: '/app/achats', icon: <FileDown className="w-4 h-4" />, moduleKey: 'achats.factures' },
]

// Items de la section "RH"
const RH_ITEMS: NavItem[] = [
  { label: 'Salariés', href: '/app/salaries', icon: <UserCheck className="w-4 h-4" />, moduleKey: 'rh.salaries' },
  { label: 'Bulletins de paie', href: '/app/paie', icon: <Banknote className="w-4 h-4" />, moduleKey: 'rh.paie' },
  { label: 'Notes de frais', href: '/app/frais', icon: <Wallet className="w-4 h-4" />, moduleKey: 'rh.frais' },
]

// Items de la section "Comptabilité"
const COMPTA_ITEMS: NavItem[] = [
  { label: 'Journal', href: '/app/journal', icon: <BookOpen className="w-4 h-4" />, moduleKey: 'compta.journal' },
  { label: 'Grand livre', href: '/app/grand-livre', icon: <Library className="w-4 h-4" />, moduleKey: 'compta.grand_livre' },
  { label: 'Balance', href: '/app/balance', icon: <Scale className="w-4 h-4" />, moduleKey: 'compta.balance' },
  { label: 'TVA', href: '/app/tva', icon: <Percent className="w-4 h-4" />, moduleKey: 'compta.tva' },
]

// Items de la section "Configuration" organisation (owner/admin)
const ORG_CONFIG_ITEMS: NavItem[] = [
  {
    label: 'Ma structure',
    href: '/app/org/settings',
    icon: <Building className="w-4 h-4" />,
  },
  {
    label: 'Facturation',
    href: '/app/config/facturation',
    icon: <CreditCard className="w-4 h-4" />,
  },
  {
    label: 'Modules',
    href: '/app/org/modules',
    icon: <LayoutGrid className="w-4 h-4" />,
  },
]

// Items de la section "Config Kerpta" (platform admin uniquement)
const KERPTA_CONFIG_ITEMS: NavItem[] = [
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
        {active?.org_logo_thumb ? (
          <img
            src={active.org_logo_thumb}
            alt={active.org_name}
            className="w-8 h-8 rounded-lg object-contain bg-white shrink-0"
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
              {o.org_logo_thumb ? (
                <img
                  src={o.org_logo_thumb}
                  alt={o.org_name}
                  className="w-6 h-6 rounded-md object-contain bg-white shrink-0"
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

// ── Bouton de navigation générique ───────────────────────────────────────────

function NavBtn({
  item,
  currentPath,
  onClose,
  sub = false,
}: {
  item: NavItem
  currentPath: string
  onClose?: () => void
  sub?: boolean
}) {
  const isActive = item.href === '/app'
    ? currentPath === '/app'
    : currentPath === item.href || currentPath.startsWith(item.href + '/')
  return (
    <button
      onClick={() => { navigate(item.href); onClose?.() }}
      className={`w-full flex items-center gap-2 rounded-lg font-medium transition-all ${
        sub ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm'
      } ${
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

// ── Accordéon de section (Vente, Achat, RH, Comptabilité) ─────────────────────

function SectionAccordion({
  label,
  icon,
  sectionKey,
  items,
  currentPath,
  onClose,
  storageKey,
}: {
  label: string
  icon: ReactNode
  sectionKey: string
  items: NavItem[]
  currentPath: string
  onClose?: () => void
  storageKey: string
}) {
  const { isEnabled } = useModuleStore()

  // Section désactivée → masquée
  if (!isEnabled(sectionKey)) return null

  // Filtrer les sous-items par module
  const visibleItems = items.filter((i) => !i.moduleKey || isEnabled(i.moduleKey))
  if (visibleItems.length === 0) return null

  const hasActive = visibleItems.some(
    (i) => currentPath === i.href || currentPath.startsWith(i.href + '/')
  )

  return <SectionAccordionInner
    label={label} icon={icon} items={visibleItems}
    hasActive={hasActive} currentPath={currentPath}
    onClose={onClose} storageKey={storageKey}
  />
}

/** Inner component to avoid conditional hooks */
function SectionAccordionInner({
  label, icon, items, hasActive, currentPath, onClose, storageKey,
}: {
  label: string; icon: ReactNode; items: NavItem[]
  hasActive: boolean; currentPath: string; onClose?: () => void; storageKey: string
}) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) return saved === 'true'
    return false
  })

  function toggle() {
    setOpen((v) => {
      const next = !v
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  return (
    <div>
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold transition ${
          hasActive && !open
            ? 'text-orange-700 bg-orange-50/50'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        }`}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5 pl-4">
          {items.map((item) => (
            <li key={item.href}>
              <NavBtn item={item} currentPath={currentPath} onClose={onClose} sub />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Accordéon générique ───────────────────────────────────────────────────────

function ConfigAccordion({
  label,
  icon,
  items,
  currentPath,
  onClose,
  defaultOpen = false,
  topBorder = true,
  storageKey,
}: {
  label: string
  icon?: ReactNode
  items: NavItem[]
  currentPath: string
  onClose?: () => void
  defaultOpen?: boolean
  topBorder?: boolean
  storageKey?: string
}) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) return saved === 'true'
    }
    return defaultOpen
  })

  function toggle() {
    setOpen((v) => {
      const next = !v
      if (storageKey) localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  return (
    <div className={topBorder ? 'border-t border-gray-100 pt-2' : 'pt-1'}>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 hover:bg-gray-50 transition"
      >
        {icon ?? <Settings2 className="w-3.5 h-3.5 shrink-0" />}
        <span className="flex-1 text-left">{label}</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {items.map((item) => (
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
  const loadModules = useModuleStore((s) => s.loadModules)

  const activeOrg = orgs?.find((o) => o.org_id === activeOrgId) ?? orgs?.[0] ?? null
  const isOrgOwnerOrAdmin = activeOrg?.role === 'owner' || activeOrg?.role === 'admin'
  const isOrgOwner = activeOrg?.role === 'owner'

  // Charger la config modules quand l'org change
  useEffect(() => {
    if (activeOrgId) void loadModules(activeOrgId)
  }, [activeOrgId, loadModules])

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-gray-200 flex flex-col">

      {/* Logo Kerpta */}
      <div className="px-4 py-3 border-b border-gray-100">
        <a href="/" className="flex items-center gap-2 group">
          <span className="font-sarpanch text-2xl leading-none">
            <span className="text-[#888888]">KER</span><span className="text-orange-500">PTA</span>
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

      {/* Navigation principale */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        {isAdmin === null && (
          <p className="text-xs text-gray-400 px-2 py-2">Chargement…</p>
        )}
        {activeOrg && (
          <>
            <NavBtn item={DASHBOARD_ITEM} currentPath={currentPath} onClose={onClose} />
            <div className="pt-1 space-y-0.5">
              <SectionAccordion label="Ventes" sectionKey="ventes" icon={<Briefcase className="w-4 h-4" />} items={VENTE_ITEMS} currentPath={currentPath} onClose={onClose} storageKey="sidebar-ventes" />
              <SectionAccordion label="Achats" sectionKey="achats" icon={<ShoppingCart className="w-4 h-4" />} items={ACHAT_ITEMS} currentPath={currentPath} onClose={onClose} storageKey="sidebar-achats" />
              <SectionAccordion label="RH" sectionKey="rh" icon={<Users className="w-4 h-4" />} items={RH_ITEMS} currentPath={currentPath} onClose={onClose} storageKey="sidebar-rh" />
              <SectionAccordion label="Comptabilité" sectionKey="compta" icon={<BarChart3 className="w-4 h-4" />} items={COMPTA_ITEMS} currentPath={currentPath} onClose={onClose} storageKey="sidebar-compta" />
            </div>
          </>
        )}
      </nav>

      {/* Accordéons de configuration — en bas de la sidebar */}
      <div className="px-3 pb-2">

        {/* Configuration organisation — owner/admin */}
        {activeOrg && isOrgOwnerOrAdmin && (
          <ConfigAccordion
            label="Configuration"
            icon={<Settings className="w-3.5 h-3.5 shrink-0" />}
            items={isOrgOwner ? ORG_CONFIG_ITEMS : ORG_CONFIG_ITEMS.filter(i => i.href !== '/app/org/modules')}
            currentPath={currentPath}
            onClose={onClose}
            defaultOpen={false}
            storageKey="sidebar-config-org"
            topBorder
          />
        )}

        {/* Config Kerpta — platform admin uniquement */}
        {isAdmin && (
          <ConfigAccordion
            label="Config Kerpta"
            items={KERPTA_CONFIG_ITEMS}
            currentPath={currentPath}
            onClose={onClose}
            defaultOpen={false}
            storageKey="sidebar-config-kerpta"
            topBorder
          />
        )}
      </div>

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

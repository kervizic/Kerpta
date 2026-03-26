// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Store Zustand pour l'authentification et les organisations.
// Persiste dans localStorage pour survivre aux rechargements.

import { create } from 'zustand'
import { navigate } from '@/hooks/useRoute'
import { apiClient } from '@/lib/api'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar?: string
}

export interface OrgMembership {
  org_id: string
  org_name: string
  org_siret: string | null
  org_siren: string | null
  org_logo_url: string | null
  /** Miniature 64×64 px en data URI base64 — chargée avec la liste des orgs */
  org_logo_thumb: string | null
  role: string
  joined_at: string | null
  /** Permissions calculees pour cet utilisateur dans cette org */
  permissions?: string[]
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  /** null = inconnu (fetchMe pas encore appelé), true/false = résolu */
  isAdmin: boolean | null
  /** Liste des organisations (null = pas encore chargé) */
  orgs: OrgMembership[] | null
  /** ID de l'organisation active */
  activeOrgId: string | null
  /** Permissions de l'utilisateur pour l'org active (null = pas encore chargé) */
  permissions: string[] | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
  fetchMe: () => Promise<void>
  fetchOrgs: () => Promise<void>
  setActiveOrg: (orgId: string) => void
  /** Vérifie si l'utilisateur a une permission donnée pour l'org active */
  hasPermission: (perm: string) => boolean
}

const TOKEN_KEY = 'supabase_access_token'
const USER_KEY = 'kerpta_user'
const ACTIVE_ORG_KEY = 'kerpta_active_org'

function loadFromStorage(): { token: string | null; user: AuthUser | null; activeOrgId: string | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const raw = localStorage.getItem(USER_KEY)
    const user: AuthUser | null = raw ? (JSON.parse(raw) as AuthUser) : null
    const activeOrgId = localStorage.getItem(ACTIVE_ORG_KEY)
    return { token, user, activeOrgId }
  } catch {
    return { token: null, user: null, activeOrgId: null }
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  ...loadFromStorage(),
  isAdmin: null,
  orgs: null,
  permissions: null,

  login(token, user) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token, user, isAdmin: null, orgs: null, permissions: null })
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ACTIVE_ORG_KEY)
    set({ token: null, user: null, isAdmin: null, orgs: null, activeOrgId: null, permissions: null })
    navigate('/login')
  },

  async fetchMe() {
    try {
      const data = await apiClient.get<{
        id: string
        is_platform_admin: boolean
        email: string | null
        name: string | null
      }>('/config/me')
      set({ isAdmin: data.is_platform_admin })
    } catch {
      set({ isAdmin: false })
    }
  },

  async fetchOrgs() {
    try {
      const data = await apiClient.get<OrgMembership[]>('/organizations/me')
      const { activeOrgId } = get()
      const validActive = data.find((o) => o.org_id === activeOrgId)
      const newActiveId = validActive ? activeOrgId : (data[0]?.org_id ?? null)
      if (newActiveId) localStorage.setItem(ACTIVE_ORG_KEY, newActiveId)
      const activeOrg = data.find((o) => o.org_id === newActiveId)
      set({ orgs: data, activeOrgId: newActiveId, permissions: activeOrg?.permissions ?? null })
    } catch {
      set({ orgs: [], permissions: null })
    }
  },

  setActiveOrg(orgId: string) {
    localStorage.setItem(ACTIVE_ORG_KEY, orgId)
    const { orgs } = get()
    const org = orgs?.find((o) => o.org_id === orgId)
    set({ activeOrgId: orgId, permissions: org?.permissions ?? null })
  },

  hasPermission(perm: string): boolean {
    const { permissions } = get()
    if (!permissions) return true // pas encore charge -> on autorise par defaut
    return permissions.includes(perm)
  },
}))

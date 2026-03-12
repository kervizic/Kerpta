// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Store Zustand pour l'authentification.
// Persiste dans localStorage pour survivre aux rechargements.

import { create } from 'zustand'
import { navigate } from '@/hooks/useRoute'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar?: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const TOKEN_KEY = 'supabase_access_token'
const USER_KEY = 'kerpta_user'

function loadFromStorage(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const raw = localStorage.getItem(USER_KEY)
    const user: AuthUser | null = raw ? (JSON.parse(raw) as AuthUser) : null
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...loadFromStorage(),

  login(token, user) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token, user })
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null })
    navigate('/login')
  },
}))

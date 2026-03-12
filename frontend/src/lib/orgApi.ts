// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Helper pour les appels API avec le header X-Organization-Id automatique.

import { apiClient } from './api'

function orgHeaders(): Record<string, string> {
  const orgId = localStorage.getItem('kerpta_active_org')
  return orgId ? { 'X-Organization-Id': orgId } : {}
}

export async function orgGet<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await apiClient.get<T>(url, { headers: orgHeaders(), params })
  return data
}

export async function orgPost<T = unknown>(url: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, { headers: orgHeaders() })
  return data
}

export async function orgPatch<T = unknown>(url: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.patch<T>(url, body, { headers: orgHeaders() })
  return data
}

export async function orgDelete<T = unknown>(url: string): Promise<T> {
  const { data } = await apiClient.delete<T>(url, { headers: orgHeaders() })
  return data
}

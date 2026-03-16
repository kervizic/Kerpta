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

/** Télécharge un fichier binaire (PDF, ZIP…) avec authentification. */
export async function orgDownload(url: string, defaultFilename: string): Promise<void> {
  const res = await apiClient.get(url, {
    headers: orgHeaders(),
    responseType: 'blob',
  })
  const blob = new Blob([res.data])
  const disposition = res.headers['content-disposition'] as string | undefined
  let filename = defaultFilename
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/)
    if (match) filename = match[1]
  }
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

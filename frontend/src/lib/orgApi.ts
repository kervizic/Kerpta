// Kerpta - Helpers API organisation (re-exporte orgClient + download)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { orgClient } from './api';

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

// Re-exports directs depuis orgClient pour compatibilite existante
export const orgGet = orgClient.get;
export const orgPost = orgClient.post;
export const orgPatch = orgClient.patch;
export const orgDelete = orgClient.delete;

/** Telecharge un fichier binaire (PDF, ZIP...) avec authentification + org header. */
export async function orgDownload(url: string, defaultFilename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("supabase_access_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = localStorage.getItem("kerpta_active_org");
  if (orgId) headers["X-Organization-Id"] = orgId;

  const response = await fetch(`${API_BASE}${url}`, { headers });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("supabase_access_token");
      localStorage.removeItem("kerpta_user");
      window.location.href = "/login";
    }
    throw new Error(`Download error ${response.status}`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  let filename = defaultFilename;
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

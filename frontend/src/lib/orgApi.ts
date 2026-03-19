// Kerpta - Helper API avec header X-Organization-Id automatique
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("supabase_access_token");
  if (token) h.Authorization = `Bearer ${token}`;
  const orgId = localStorage.getItem("kerpta_active_org");
  if (orgId) h["X-Organization-Id"] = orgId;
  return h;
}

function handle401(response: Response): void {
  if (response.status === 401) {
    localStorage.removeItem("supabase_access_token");
    localStorage.removeItem("kerpta_user");
    window.location.href = "/login";
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { ...headers(), ...(options.headers as Record<string, string> ?? {}) },
  });

  if (!response.ok) {
    handle401(response);
    const data = await response.json().catch(() => null);
    throw Object.assign(new Error(`API error ${response.status}`), { status: response.status, data });
  }

  if (response.status === 204) return null as T;
  return response.json();
}

export async function orgGet<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
  const query = params
    ? "?" + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  return request<T>(url + query);
}

export async function orgPost<T = unknown>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, { method: "POST", body: body != null ? JSON.stringify(body) : undefined });
}

export async function orgPatch<T = unknown>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined });
}

export async function orgDelete<T = unknown>(url: string): Promise<T> {
  return request<T>(url, { method: "DELETE" });
}

/** Telecharge un fichier binaire (PDF, ZIP...) avec authentification. */
export async function orgDownload(url: string, defaultFilename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${url}`, { headers: headers() });

  if (!response.ok) {
    handle401(response);
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

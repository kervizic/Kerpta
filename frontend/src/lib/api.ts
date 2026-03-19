// Kerpta - Client API base sur fetch natif
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const ADMIN_BASE = "/api/admin";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("supabase_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handle401(response: Response): void {
  if (response.status === 401) {
    localStorage.removeItem("supabase_access_token");
    localStorage.removeItem("kerpta_user");
    window.location.href = "/login";
  }
}

/** Erreur API avec status et donnees de reponse */
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(base: string, url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const response = await fetch(`${base}${url}`, { ...options, headers });

  if (!response.ok) {
    handle401(response);
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data);
  }

  if (response.status === 204) return null as T;
  return response.json();
}

export const apiClient = {
  get: <T = unknown>(url: string, params?: Record<string, unknown>) => {
    const query = params ? "?" + new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString() : "";
    return request<T>(API_BASE, url + query);
  },
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(API_BASE, url, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(url: string, body?: unknown) =>
    request<T>(API_BASE, url, { method: "PUT", body: body != null ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(API_BASE, url, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(url: string) =>
    request<T>(API_BASE, url, { method: "DELETE" }),
};

/** Extrait le message d'erreur d'une ApiError ou retourne le fallback */
export function httpError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const d = err.data as { detail?: unknown } | null;
    const detail = d?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((e: { msg?: string }) => e.msg).join(', ');
  }
  return fallback;
}

export const adminClient = {
  get: <T = unknown>(url: string, params?: Record<string, unknown>) => {
    const query = params ? "?" + new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString() : "";
    return request<T>(ADMIN_BASE, url + query);
  },
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(ADMIN_BASE, url, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(url: string, body?: unknown) =>
    request<T>(ADMIN_BASE, url, { method: "PUT", body: body != null ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(ADMIN_BASE, url, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(url: string) =>
    request<T>(ADMIN_BASE, url, { method: "DELETE" }),
};

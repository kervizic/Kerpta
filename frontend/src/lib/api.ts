// Kerpta - Client API base sur fetch natif
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const ADMIN_BASE = "/api/admin";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("supabase_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function orgHeader(): Record<string, string> {
  const orgId = localStorage.getItem("kerpta_active_org");
  return orgId ? { "X-Organization-Id": orgId } : {};
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

async function request<T>(
  base: string,
  url: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...authHeaders(),
    ...extraHeaders,
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

function toBody(body: unknown): BodyInit | undefined {
  if (body == null) return undefined;
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  return "?" + new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  ).toString();
}

function makeClient(base: string, extra: () => Record<string, string> = () => ({})) {
  return {
    get: <T = unknown>(url: string, params?: Record<string, unknown>) =>
      request<T>(base, url + buildQuery(params), {}, extra()),
    post: <T = unknown>(url: string, body?: unknown) =>
      request<T>(base, url, { method: "POST", body: toBody(body) }, extra()),
    put: <T = unknown>(url: string, body?: unknown) =>
      request<T>(base, url, { method: "PUT", body: toBody(body) }, extra()),
    patch: <T = unknown>(url: string, body?: unknown) =>
      request<T>(base, url, { method: "PATCH", body: toBody(body) }, extra()),
    delete: <T = unknown>(url: string) =>
      request<T>(base, url, { method: "DELETE" }, extra()),
  };
}

/** Client API standard (auth uniquement) */
export const apiClient = makeClient(API_BASE);

/** Client API avec header X-Organization-Id automatique */
export const orgClient = makeClient(API_BASE, orgHeader);

/** Client admin (prefix /api/admin) */
export const adminClient = makeClient(ADMIN_BASE);

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

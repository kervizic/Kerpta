// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Intercepteur — injecte le token JWT Supabase Auth sur chaque requête
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("supabase_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur — redirige vers /login sur 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

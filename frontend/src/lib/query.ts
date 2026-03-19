// Kerpta - Configuration TanStack Query + hooks centralises
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s avant refetch en arriere-plan
      gcTime: 5 * 60_000,       // 5min de cache apres demontage
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

// Kerpta - Navigation programmatique via TanStack Router
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

import { router } from '@/router'

/** Navigation programmatique via TanStack Router. */
export function navigate(to: string): void {
  void router.navigate({ to })
}

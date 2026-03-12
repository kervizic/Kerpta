// Kerpta — Store des modules activés par organisation
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { create } from 'zustand'
import { apiClient } from '@/lib/api'

export interface ModuleSection {
  key: string
  label: string
  children: { key: string; label: string }[]
}

export const MODULE_DEFINITIONS: ModuleSection[] = [
  {
    key: 'ventes',
    label: 'Ventes',
    children: [
      { key: 'ventes.clients', label: 'Clients' },
      { key: 'ventes.catalogue', label: 'Catalogue' },
      { key: 'ventes.devis', label: 'Devis' },
      { key: 'ventes.commandes', label: 'Commandes' },
      { key: 'ventes.factures', label: 'Factures' },
    ],
  },
  {
    key: 'achats',
    label: 'Achats',
    children: [
      { key: 'achats.fournisseurs', label: 'Fournisseurs' },
      { key: 'achats.devis', label: 'Devis fournisseur' },
      { key: 'achats.bons_commande', label: 'Bons de commande' },
      { key: 'achats.factures', label: 'Factures fournisseur' },
    ],
  },
  {
    key: 'rh',
    label: 'RH',
    children: [
      { key: 'rh.salaries', label: 'Salariés' },
      { key: 'rh.paie', label: 'Bulletins de paie' },
      { key: 'rh.frais', label: 'Notes de frais' },
    ],
  },
  {
    key: 'compta',
    label: 'Comptabilité',
    children: [
      { key: 'compta.journal', label: 'Journal' },
      { key: 'compta.grand_livre', label: 'Grand livre' },
      { key: 'compta.balance', label: 'Balance' },
      { key: 'compta.tva', label: 'TVA' },
    ],
  },
]

interface ModuleState {
  config: Record<string, boolean>
  loading: boolean
  orgId: string | null
  loadModules: (orgId: string) => Promise<void>
  setModule: (key: string, enabled: boolean) => Promise<void>
  isEnabled: (key: string) => boolean
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  config: {},
  loading: false,
  orgId: null,

  loadModules: async (orgId: string) => {
    set({ loading: true, orgId })
    try {
      const { data } = await apiClient.get<Record<string, boolean>>(
        `/organizations/${orgId}/modules`,
      )
      set({ config: data, loading: false })
    } catch {
      set({ config: {}, loading: false })
    }
  },

  setModule: async (key: string, enabled: boolean) => {
    const { orgId, config } = get()
    if (!orgId) return
    const prevConfig = { ...config }
    const newConfig = { ...config, [key]: enabled }
    set({ config: newConfig })
    try {
      await apiClient.patch(`/organizations/${orgId}/modules`, newConfig)
    } catch {
      set({ config: prevConfig })
    }
  },

  // Clé absente = activé par défaut
  isEnabled: (key: string) => get().config[key] ?? true,
}))

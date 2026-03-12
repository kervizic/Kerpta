// Kerpta — Store des modules activés par organisation
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { create } from 'zustand'

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
  loadModules: (orgId: string) => void
  setModule: (orgId: string, key: string, enabled: boolean) => void
  isEnabled: (key: string) => boolean
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  config: {},

  loadModules: (orgId: string) => {
    try {
      const raw = localStorage.getItem(`kerpta_modules_${orgId}`)
      set({ config: raw ? JSON.parse(raw) : {} })
    } catch {
      set({ config: {} })
    }
  },

  setModule: (orgId: string, key: string, enabled: boolean) => {
    const config = { ...get().config, [key]: enabled }
    localStorage.setItem(`kerpta_modules_${orgId}`, JSON.stringify(config))
    set({ config })
  },

  // Missing key = enabled by default
  isEnabled: (key: string) => get().config[key] ?? true,
}))

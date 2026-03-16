// Kerpta — Page de gestion des modules
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { Loader2 } from 'lucide-react'
import { MODULE_DEFINITIONS, useModuleStore } from '@/stores/moduleStore'
import { useAuthStore } from '@/stores/authStore'

export default function ModulesPage() {
  const { orgs, activeOrgId } = useAuthStore()
  const { isEnabled, setModule, loading } = useModuleStore()

  const activeOrg = orgs?.find((o) => o.org_id === activeOrgId)
  if (!activeOrgId || !activeOrg) return null

  // Owner uniquement
  if (activeOrg.role !== 'owner') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Seul le propriétaire peut gérer les modules.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <Loader2 className="w-6 h-6 animate-spin text-kerpta" />
      </div>
    )
  }

  function toggle(key: string) {
    void setModule(key, !isEnabled(key))
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Modules</h1>
        <p className="text-sm text-gray-400 mb-6">
          Activez ou désactivez les modules visibles dans la navigation.
        </p>

        <div className="space-y-4">
          {MODULE_DEFINITIONS.map((section) => {
            const sectionOn = isEnabled(section.key)
            return (
              <div key={section.key} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {/* En-tête de section */}
                <button
                  onClick={() => toggle(section.key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
                >
                  <span className="text-sm font-semibold text-gray-900">{section.label}</span>
                  <ToggleSwitch on={sectionOn} />
                </button>

                {/* Sous-modules */}
                <div className={`border-t border-gray-100 divide-y divide-gray-50 ${!sectionOn ? 'opacity-40 pointer-events-none' : ''}`}>
                  {section.children.map((child) => (
                    <button
                      key={child.key}
                      onClick={() => toggle(child.key)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition"
                    >
                      <span className="text-sm text-gray-600 pl-3">{child.label}</span>
                      <ToggleSwitch on={isEnabled(child.key)} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <div
      className={`relative rounded-full transition-colors ${on ? 'bg-kerpta' : 'bg-gray-300'}`}
      style={{ width: 40, height: 22 }}
    >
      <div
        className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[20px]' : 'translate-x-0.5'}`}
      />
    </div>
  )
}

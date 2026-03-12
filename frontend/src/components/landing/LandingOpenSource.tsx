// Kerpta — Section Installation open source
import type { ElementType } from 'react'
import { Terminal, Github, Server, Package, Globe, Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface Step {
  step: number
  title: string
  code: string
}

interface Requirement {
  icon: string
  label: string
}

interface OpenSourceContent {
  title?: string
  subtitle?: string
  github_url?: string
  license?: string
  requirements?: Requirement[]
  steps?: Step[]
}

const ICON_MAP: Record<string, ElementType> = {
  Server,
  Package,
  Globe,
  Terminal,
  Github,
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard non disponible */
    }
  }

  return (
    <div className="relative mt-3 rounded-xl bg-gray-50 border border-gray-200 dark:bg-slate-900 dark:border-slate-700/50 overflow-hidden group">
      {/* Barre de titre terminale */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-100 dark:border-white/5 dark:bg-white/[0.02]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-slate-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-slate-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-slate-700" />
        </div>
        <Terminal className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 ml-1" />
        <span className="text-xs text-gray-400 dark:text-slate-500 font-mono">bash</span>
      </div>

      {/* Code */}
      <pre className="px-5 py-4 text-sm font-mono text-gray-700 dark:text-slate-300 overflow-x-auto leading-relaxed whitespace-pre">
        {code.split('\n').map((line, i) => (
          <div key={i} className="flex">
            {line.startsWith('#') ? (
              <span className="text-gray-400 dark:text-slate-500">{line}</span>
            ) : line === '' ? (
              <span>&nbsp;</span>
            ) : (
              <>
                <span className="text-orange-500 dark:text-orange-400 select-none mr-2">$</span>
                <span>{line}</span>
              </>
            )}
          </div>
        ))}
      </pre>

      {/* Bouton copier */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-200/70 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
        title="Copier"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
        )}
      </button>
    </div>
  )
}

export function LandingOpenSource({ content }: { content: Record<string, unknown> }) {
  const c = content as OpenSourceContent
  const title = c.title ?? 'Open source & auto-hébergeable'
  const subtitle = c.subtitle ?? ''
  const githubUrl = c.github_url ?? 'https://github.com/kervizic/kerpta'
  const license = c.license ?? 'AGPL-3.0'
  const requirements: Requirement[] = (c.requirements as Requirement[]) ?? []
  const steps: Step[] = (c.steps as Step[]) ?? []

  return (
    <section id="open-source" className="py-24 px-6 relative">
      {/* Séparateur supérieur */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-slate-700 to-transparent" />

      <div className="max-w-5xl mx-auto">
        {/* En-tête */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            {license}
          </div>
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
          {subtitle && (
            <p className="text-lg text-gray-500 dark:text-slate-400 max-w-2xl mx-auto">{subtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Colonne gauche — prérequis + badge GitHub */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Prérequis */}
            {requirements.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-200 shadow-sm dark:bg-white/[0.02] dark:border-white/5 p-6">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                  Prérequis
                </h3>
                <ul className="space-y-3">
                  {requirements.map((req, i) => {
                    const Icon = ICON_MAP[req.icon] ?? Server
                    return (
                      <li key={i} className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                        </span>
                        <span className="text-sm text-gray-700 dark:text-slate-300">{req.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Lien GitHub */}
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl bg-white border border-gray-200 shadow-sm dark:bg-white/[0.02] dark:border-white/5 p-6 hover:border-gray-300 hover:shadow dark:hover:border-white/10 dark:hover:bg-white/[0.04] transition-all group"
            >
              <span className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-white/10 transition-colors">
                <Github className="w-5 h-5 text-gray-700 dark:text-white" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">kervizic/kerpta</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">Voir le code source</p>
              </div>
              <svg
                className="w-4 h-4 text-gray-400 dark:text-slate-600 ml-auto group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>

            {/* Licence */}
            <div className="rounded-2xl bg-orange-50 border border-orange-200 dark:bg-orange-600/5 dark:border-orange-500/20 p-5 text-center">
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Licence</p>
              <p className="text-lg font-bold text-orange-600 dark:text-orange-300">{license}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Libre d'utilisation, modification et redistribution
              </p>
            </div>
          </div>

          {/* Colonne droite — étapes */}
          <div className="lg:col-span-3">
            <div className="relative space-y-6">
              {/* Ligne verticale de connexion */}
              <div className="absolute left-4 top-8 bottom-8 w-px bg-gradient-to-b from-orange-500/40 via-orange-500/20 to-transparent pointer-events-none" />

              {steps.map((step) => (
                <div key={step.step} className="relative pl-12">
                  {/* Numéro */}
                  <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-orange-50 border border-orange-200 dark:bg-orange-600/20 dark:border-orange-500/40 flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{step.step}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5 pt-1">{step.title}</h3>
                  <CodeBlock code={step.code} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

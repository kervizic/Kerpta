// Kerpta — Pied de page
import type { ElementType } from 'react'
import { useEffect, useRef } from 'react'
import { Github, BookOpen, Bug } from 'lucide-react'

interface FooterLink {
  label: string
  href: string
  icon: string
}

interface FooterContent {
  tagline?: string
  links?: FooterLink[]
  license_text?: string
}

const ICON_MAP: Record<string, ElementType> = {
  Github,
  BookOpen,
  Bug,
}

export function LandingFooter({ content }: { content: Record<string, unknown> }) {
  const c = content as FooterContent
  const tagline = c.tagline ?? 'La comptabilité française, libre et open source.'
  const links: FooterLink[] = (c.links as FooterLink[]) ?? []
  const licenseText = c.license_text ?? 'Licence AGPL-3.0 — © 2026 Kerpta'

  const tpRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tpRef.current && (window as unknown as Record<string, unknown>).Trustpilot) {
      ;(window as unknown as { Trustpilot: { loadFromElement: (el: HTMLElement) => void } }).Trustpilot.loadFromElement(tpRef.current)
    }
  }, [])

  return (
    <footer className="relative border-t border-gray-200 dark:border-white/5 py-12 px-6">
      {/* Dégradé de fond subtil */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50/80 dark:to-slate-950/80 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo + tagline */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm leading-none">K</span>
              </div>
              <span className="text-gray-900 dark:text-white font-semibold">Kerpta</span>
            </div>
            <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs text-center md:text-left">{tagline}</p>
          </div>

          {/* TrustBox widget - Review Collector */}
          <div className="flex justify-center w-full max-w-xs shrink-0 mx-auto">
            <div
              ref={tpRef}
              className="trustpilot-widget"
              data-locale="fr-FR"
              data-template-id="56278e9abfbbba0bdcd568bc"
              data-businessunit-id="69b274d8022fce23c4520dc8"
              data-style-height="52px"
              data-style-width="100%"
              data-token="489d92a2-f6a6-4f81-97d8-36d40422528b"
            >
              <a href="https://fr.trustpilot.com/review/kerpta.fr" target="_blank" rel="noopener">
                Trustpilot
              </a>
            </div>
          </div>
          {/* End TrustBox widget */}

          {/* Liens */}
          {links.length > 0 && (
            <nav className="flex items-center gap-2">
              {links.map((link, i) => {
                const Icon = ICON_MAP[link.icon] ?? Github
                return (
                  <a
                    key={i}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 transition-all"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{link.label}</span>
                  </a>
                )
              })}
            </nav>
          )}
        </div>

        {/* Séparateur + licence */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/5 text-center">
          <p className="text-xs text-gray-400 dark:text-slate-600">{licenseText}</p>
        </div>
      </div>
    </footer>
  )
}

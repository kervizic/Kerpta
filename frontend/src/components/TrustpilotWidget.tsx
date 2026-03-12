// Kerpta — Widget Trustpilot (chargement dynamique du script)
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    Trustpilot?: { loadFromElement: (el: HTMLElement) => void }
  }
}

export function TrustpilotWidget() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function init() {
      if (ref.current && window.Trustpilot) {
        window.Trustpilot.loadFromElement(ref.current)
      }
    }

    const existing = document.querySelector('script[src*="trustpilot.com/bootstrap"]')
    if (existing) {
      init()
    } else {
      const script = document.createElement('script')
      script.src = '//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js'
      script.async = true
      script.onload = init
      document.head.appendChild(script)
    }
  }, [])

  return (
    <div
      ref={ref}
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
  )
}

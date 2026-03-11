import { useEffect } from 'react'

export default function App() {
  useEffect(() => {
    // Vérifie si le setup est terminé au chargement de l'app
    fetch('/setup/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (!data.setup_completed || !data.has_admin) {
          const stepPaths: Record<number, string> = { 1: 'dbb', 2: 'oauth', 3: 'admin' }
          const step = data.setup_step ?? 1
          window.location.href = `/setup/${stepPaths[step] ?? 'dbb'}`
        }
      })
      .catch(() => {
        // DB inaccessible → wizard étape BDD
        window.location.href = '/setup/dbb'
      })
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b' }}>Kerpta</h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Chargement…</p>
      </div>
    </div>
  )
}

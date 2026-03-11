// App principale Kerpta — le routing setup est géré par FastAPI + nginx,
// pas par React. Si le setup n'est pas terminé, FastAPI redirige vers
// /setup/dbb avant que cette app ne soit servie.
export default function App() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b' }}>Kerpta</h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Chargement…</p>
      </div>
    </div>
  )
}

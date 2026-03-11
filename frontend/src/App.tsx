// Kerpta — App principale
// Le routing setup est géré par FastAPI + nginx.
// Si setup non terminé, FastAPI redirige vers /setup/ avant que React soit servi.
import LandingPage from '@/pages/LandingPage'

export default function App() {
  return <LandingPage />
}

import { useEffect, useState } from 'react'
import { ApiError, getHealth, type HealthResponse } from './lib/api'
import './App.css'

type ApiStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'error'; message: string }

function ApiStatusScreen() {
  const [status, setStatus] = useState<ApiStatus>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    void getHealth(controller.signal)
      .then((health) => setStatus({ kind: 'ready', health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return

        const message = error instanceof ApiError ? error.message : 'Unable to check API status.'
        setStatus({ kind: 'error', message })
      })

    return () => controller.abort()
  }, [])

  async function refreshStatus() {
    setStatus({ kind: 'loading' })
    try {
      const health = await getHealth()
      setStatus({ kind: 'ready', health })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to check API status.'
      setStatus({ kind: 'error', message })
    }
  }

  return (
    <main className="content">
      <p className="eyebrow">Phase 1 · Foundation</p>
      <h1>Splitter AI</h1>
      <p className="intro">
        The React client is connected to the Django API. Authentication and expense features
        arrive in the next phases.
      </p>

      <section className="status-card" aria-live="polite">
        <h2>API status</h2>
        {status.kind === 'loading' && <p className="status loading">Checking Django API…</p>}
        {status.kind === 'ready' && (
          <p className="status success">
            <span aria-hidden="true">●</span> {status.health.service} is online
          </p>
        )}
        {status.kind === 'error' && <p className="status error">{status.message}</p>}
        <button type="button" onClick={() => void refreshStatus()} disabled={status.kind === 'loading'}>
          Check again
        </button>
      </section>
    </main>
  )
}

function NotFound() {
  return (
    <main className="content">
      <h1>Page not found</h1>
      <a href="/">Return to API status</a>
    </main>
  )
}

function App() {
  const isHomePage = window.location.pathname === '/'

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/">
          Splitter AI
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Status</a>
        </nav>
      </header>
      {isHomePage ? <ApiStatusScreen /> : <NotFound />}
    </div>
  )
}

export default App

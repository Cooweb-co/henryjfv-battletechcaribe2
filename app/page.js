'use client'

import { useEffect, useState } from 'react'
import Chat from '../components/Chat'
import Dashboard from '../components/Dashboard'
import Footer from '../components/Footer'

/**
 * Cada navegador tiene su propio id: sin esto, todas las visitas comparten los
 * mismos gastos. Es identidad, no autenticación — para eso haría falta login.
 */
function useUserId() {
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    let stored = localStorage.getItem('finbot:userId')
    if (!stored) {
      stored = `web-${crypto.randomUUID().slice(0, 8)}`
      localStorage.setItem('finbot:userId', stored)
    }
    setUserId(stored)
  }, [])

  return userId
}

export default function Home() {
  const [version, setVersion] = useState(0)
  const userId = useUserId()

  return (
    <main className="shell">
      <header>
        <h1>FinBot</h1>
        <p>Registra tus gastos conversando y mira cómo se comporta tu plata.</p>
      </header>

      {userId ? (
        <div className="grid">
          <Chat userId={userId} onUpdate={() => setVersion((n) => n + 1)} />
          <Dashboard userId={userId} version={version} />
        </div>
      ) : (
        <p className="empty">Preparando tu sesión…</p>
      )}

      <Footer />
    </main>
  )
}

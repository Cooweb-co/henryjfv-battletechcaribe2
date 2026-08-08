'use client'

import { useState } from 'react'
import Chat from '../components/Chat'
import Dashboard from '../components/Dashboard'

const USER_ID = 'web-demo'

export default function Home() {
  const [version, setVersion] = useState(0)

  return (
    <main className="shell">
      <header>
        <h1>FinBot</h1>
        <p>Registra tus gastos conversando y mira cómo se comporta tu plata.</p>
      </header>

      <div className="grid">
        <Chat userId={USER_ID} onUpdate={() => setVersion((n) => n + 1)} />
        <Dashboard userId={USER_ID} version={version} />
      </div>
    </main>
  )
}

'use client'

import { useState } from 'react'
import Chat from '../components/Chat'

const USER_ID = 'web-demo'

export default function Home() {
  const [, setRefresh] = useState(0)

  return (
    <main className="shell">
      <header>
        <h1>FinBot</h1>
        <p>Registra tus gastos conversando. Sin abrir la app del banco.</p>
      </header>

      <div className="grid">
        <Chat userId={USER_ID} onUpdate={() => setRefresh((n) => n + 1)} />
      </div>
    </main>
  )
}

import { connect } from '@owox/plugin-sdk'
import type { OWOXDataMart, OWOXDestination, OWOXStorage } from '@owox/api-client'
import { AlertCircle, Database, HardDrive, Send } from 'lucide-react'
import { useEffect, useState } from 'react'

type Model = {
  dataMarts: OWOXDataMart[]
  storages: OWOXStorage[]
  destinations: OWOXDestination[]
}

export default function App() {
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    connect()
      .then(async ctx => {
        document.documentElement.classList.toggle('dark', ctx.theme === 'dark')
        // ponytail: read-only — list() only, no writes, no collections declared.
        const [dataMarts, storages, destinations] = await Promise.all([
          ctx.owox.dataMarts.list(),
          ctx.owox.storages.list(),
          ctx.owox.destinations.list(),
        ])
        if (live) setModel({ dataMarts, storages, destinations })
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="dm-page">
      <header className="dm-page-header">
        <h1 className="dm-page-header-title">Model Canvas</h1>
      </header>
      <main className="dm-page-content">
        {error ? (
          <section className="dm-card">
            <h2>
              <AlertCircle size={16} /> Could not load
            </h2>
            <p className="dm-muted">{error}</p>
          </section>
        ) : !model ? (
          <section className="dm-card dm-muted">Loading…</section>
        ) : (
          <div className="dm-grid">
            <Card icon={<Database size={16} />} title="Data Marts" items={model.dataMarts} />
            <Card icon={<HardDrive size={16} />} title="Storages" items={model.storages} />
            <Card icon={<Send size={16} />} title="Destinations" items={model.destinations} />
          </div>
        )}
      </main>
    </div>
  )
}

function Card({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode
  title: string
  items: Array<{ id: string; title: string; storage?: { type: string }; type?: string }>
}) {
  return (
    <section className="dm-card">
      <h2>
        {icon} {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="dm-muted">None visible to you.</p>
      ) : (
        <ul className="dm-list">
          {items.map(item => (
            <li key={item.id}>
              <span>{item.title}</span>
              <span className="dm-muted">{item.type ?? item.storage?.type}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

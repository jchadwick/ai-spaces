import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-surface font-ui text-on-surface">
      <div className="flex h-screen">
        <aside className="w-64 bg-surface-container-low p-lg flex flex-col">
          <h2 className="text-title-sm text-on-surface mb-lg">Space Editor</h2>
          <nav className="flex-1">
            <ul className="space-y-xs">
              <li>
                <button
                  type="button"
                  className="w-full text-left px-md py-sm bg-surface-container-lowest rounded-md text-body-md hover:bg-primary-container/10 transition-colors"
                >
                  Files
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="w-full text-left px-md py-sm rounded-md text-body-md hover:bg-surface-container transition-colors"
                >
                  Chat
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <main className="flex-1 bg-surface-container-lowest p-xl">
          <div className="max-w-4xl mx-auto space-y-xl">
            <section className="text-center py-3xl">
              <h1 className="font-display text-display-lg text-on-surface mb-md">
                AI Spaces
              </h1>
              <p className="text-body-lg text-on-surface-variant max-w-md mx-auto">
                Your digital atelier for code and AI collaboration
              </p>
            </section>

            <section className="bg-surface-container-lowest rounded-2xl p-lg shadow-ambient">
              <h2 className="font-display text-title-md mb-lg">Quick Start</h2>
              <p className="text-body-md text-on-surface-variant mb-lg">
                Edit <code className="font-mono text-body-sm bg-surface-container-low px-sm py-xxs rounded-sm">src/App.tsx</code> and save to test HMR
              </p>
              <button
                type="button"
                onClick={() => setCount((c) => c + 1)}
                className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-lg py-sm rounded-md font-ui text-body-md hover:shadow-elevated transition-shadow"
              >
                Count is {count}
              </button>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
import { useState } from 'react'
import { askQuestion, type AskResponse } from '../lib/live'

/**
 * Ask the corpus — /api/ask (SQL-RAG) answered with exact PSI rows and
 * NTRS/PSI citations. The explicit "SI-powered" surface: a question in,
 * an auditable answer out.
 */

const SUGGESTIONS = [
  'which fuels sustain cool flames?',
  'how many flex-2 runs ended in radiative extinction?',
  'what happens to heptane below 15% o2?',
  'which investigation measured elevated o2 hazards?',
]

export default function AskPanel() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AskResponse | null>(null)
  const [offline, setOffline] = useState(false)

  async function ask(text: string) {
    const query = text.trim()
    if (!query) return
    setBusy(true)
    setOffline(false)
    const r = await askQuestion(query)
    setRes(r)
    setOffline(!r)
    setBusy(false)
  }

  return (
    <section id="ask" className="relative px-5 pb-28 pt-6 sm:px-10 lg:px-16">
      <div className="flex items-baseline justify-between gap-6 font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
        <span>05 · ask the corpus</span>
        <span>sql-rag · psi + ntrs</span>
      </div>
      <h2 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.2vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink)]">
        Ask, then audit.
      </h2>
      <p className="m-0 mt-1 max-w-3xl text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-75">
        every answer is composed from parsed psi runs and ntrs papers —
        the citations are the point, not decoration.
      </p>

      <form
        className="mt-8 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ask about flames in freefall…"
          className="w-full max-w-2xl rounded border border-[color-mix(in_srgb,var(--ink)_25%,transparent)] bg-transparent px-3 py-2 font-mono text-[12px] lowercase text-[var(--ink)] placeholder:opacity-50"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-[color-mix(in_srgb,var(--ink)_30%,transparent)] px-4 py-2 font-mono text-[11px] lowercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] disabled:opacity-40"
        >
          {busy ? '…' : 'ask'}
        </button>
      </form>

      {!res && !offline && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s)
                void ask(s)
              }}
              className="rounded-full border border-[color-mix(in_srgb,var(--ink)_20%,transparent)] px-3 py-1 font-mono text-[10px] lowercase tracking-[0.1em] text-[var(--ink)] opacity-70 transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:opacity-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {offline && (
        <p className="mt-6 font-mono text-[11px] lowercase text-[var(--ink)] opacity-60">
          engine offline — /api/ask needs the fastapi backend on :8000.
        </p>
      )}

      {res && (
        <div className="mt-8 max-w-3xl">
          <div className="flex items-baseline justify-between font-mono text-[10px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-50">
            <span>mode · {res.mode}</span>
            {res.grounding?.investigationId && (
              <span>grounded → {res.grounding.investigationId}</span>
            )}
          </div>
          <p className="m-0 mt-3 whitespace-pre-line font-mono text-[13px] lowercase leading-relaxed text-[var(--ink)]">
            {res.answer}
          </p>
          {res.rows && res.rows.length > 0 && (
            <ul className="m-0 mt-4 list-none divide-y divide-[color-mix(in_srgb,var(--ink)_10%,transparent)] p-0">
              {res.rows.slice(0, 4).map((row, i) => (
                <li
                  key={i}
                  className="truncate px-2 py-2 font-mono text-[10.5px] lowercase text-[var(--ink)] opacity-70"
                >
                  {Object.entries(row)
                    .slice(0, 6)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(' · ')}
                </li>
              ))}
            </ul>
          )}
          {res.citations.length > 0 && (
            <div className="mt-5">
              <div className="font-mono text-[10px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-50">
                citations
              </div>
              <ul className="m-0 mt-2 list-none p-0">
                {res.citations.map((c) => (
                  <li
                    key={c.id}
                    className="mt-1.5 font-mono text-[11px] lowercase text-[var(--ink)] opacity-80"
                  >
                    <span className="mr-2 opacity-50">[{c.type}]</span>
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]"
                      >
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

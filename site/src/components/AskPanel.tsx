import { useState } from 'react'
import { touchAsk } from '../lib/brain'
import { askQuestion, type AskResponse } from '../lib/live'
import { IconSearch } from './Icons'
import Button from './ui/Button'

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

export default function AskPanel({ slim = false }: { slim?: boolean }) {
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
    // the corpus rows + citations the answer leaned on are learned
    // tissue too — the brain wires them in as neurons
    if (r) touchAsk(r)
    setBusy(false)
  }

  return (
    <section
      id="ask"
      className={`relative scroll-mt-24 ${
        slim ? '' : 'px-5 pb-28 pt-6 sm:px-10 lg:px-16'
      }`}
    >
      <div className={`flex items-baseline justify-between gap-6 font-mono lowercase tracking-[0.22em] text-[var(--ink)] opacity-70 ${slim ? 'text-[13px]' : 'text-[11px]'}`}>
        <span>{slim ? 'or search the record directly' : 'ask the corpus'}</span>
        {!slim && <span>sql-rag · psi + ntrs</span>}
      </div>
      {!slim && (
        <>
          <h2 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.2vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink)]">
            Ask, then audit.
          </h2>
          <p className="m-0 mt-1 max-w-3xl text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-75">
            every answer is composed from parsed psi runs and ntrs papers —
            the citations are the point, not decoration.
          </p>
        </>
      )}

      <form
        className={`${slim ? 'mt-4' : 'mt-8'} flex gap-3`}
        onSubmit={(e) => {
          e.preventDefault()
          void ask(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            slim
              ? 'e.g. which fuels sustain cool flames?'
              : 'ask about flames in freefall…'
          }
          className={
            slim
              ? 'w-full max-w-2xl rounded-full border border-[var(--edge)] bg-[color-mix(in_srgb,#ffffff_72%,var(--bg))] px-5 py-2.5 font-mono text-[14.5px] lowercase text-[var(--ink)] shadow-[0_10px_30px_rgb(23_33_43/0.08),inset_0_1px_0_rgb(255_255_255/0.55)] outline-none transition-all duration-200 placeholder:opacity-40 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent),0_10px_30px_rgb(23_33_43/0.1)]'
              : 'w-full max-w-2xl rounded border border-[color-mix(in_srgb,var(--ink)_25%,transparent)] bg-transparent px-3 py-2 font-mono text-[12px] lowercase text-[var(--ink)] placeholder:opacity-50'
          }
        />
        <Button
          type="submit"
          disabled={busy}
          variant={slim ? 'primary' : 'glass'}
          size={slim ? 'xl' : 'sm'}
          className="font-mono lowercase tracking-[0.14em]"
        >
          {busy ? '…' : slim ? (
            <>
              <IconSearch size={14} />
              search
            </>
          ) : (
            'ask'
          )}
        </Button>
      </form>

      {!slim && !res && !offline && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              onClick={() => {
                setQ(s)
                void ask(s)
              }}
              variant="chip"
            >
              {s}
            </Button>
          ))}
        </div>
      )}

      {offline && (
        <p className="mt-6 font-mono text-[11px] lowercase text-[var(--ink)] opacity-60">
          engine offline — /api/ask needs the fastapi backend on :8000.
        </p>
      )}

      {res && (
        <div className={`mt-8 max-w-3xl ${slim ? 'card-soft p-6 sm:p-7' : ''}`}>
          <div className={`flex items-baseline justify-between font-mono lowercase tracking-[0.16em] text-[var(--ink)] opacity-50 ${slim ? 'text-[11.5px]' : 'text-[10px]'}`}>
            <span>mode · {res.mode}</span>
            {res.grounding?.investigationId && (
              <span>grounded → {res.grounding.investigationId}</span>
            )}
          </div>
          <p className={`m-0 mt-3 whitespace-pre-line lowercase text-[var(--ink)] ${slim ? 'text-[15px] leading-[1.75]' : 'font-mono text-[13px] leading-relaxed'}`}>
            {res.answer}
          </p>
          {res.rows && res.rows.length > 0 && (
            <ul className="m-0 mt-4 list-none divide-y divide-[color-mix(in_srgb,var(--ink)_10%,transparent)] p-0">
              {res.rows.slice(0, 4).map((row, i) => (
                <li
                  key={i}
                  className={`truncate px-2 py-2 font-mono lowercase text-[var(--ink)] opacity-70 ${slim ? 'text-[12px]' : 'text-[10.5px]'}`}
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
              <div className={`font-mono lowercase tracking-[0.16em] text-[var(--ink)] opacity-50 ${slim ? 'text-[11.5px]' : 'text-[10px]'}`}>
                citations
              </div>
              <ul className="m-0 mt-2 list-none p-0">
                {res.citations.map((c) => (
                  <li
                    key={c.id}
                    className={`mt-1.5 font-mono lowercase text-[var(--ink)] opacity-80 ${slim ? 'text-[12.5px]' : 'text-[11px]'}`}
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

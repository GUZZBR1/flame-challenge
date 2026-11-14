interface Member {
  name: string
  role: string
  href?: string
}

const CREW: Member[] = [
  {
    name: 'lucas coimbra',
    role: 'physics core · data pipeline · site',
  },
  {
    name: 'gustavo moreira',
    role: 'engine · design · research',
  },
]

/** The crew — small ledger of who built it. Same visual register as the
 *  solver regimes above: name · role · optional profile link. */
export default function Crew() {
  return (
    <section
      id="crew"
      aria-labelledby="crew-title"
      className="relative px-5 pb-24 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
          <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
            the crew — freefall foundry
          </span>
        </div>

        <h2
          id="crew-title"
          className="m-0 mt-10 cursor-default font-[family-name:var(--font-display)] text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1.06] tracking-[-0.03em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
        >
          built by two people, calibrated by real missions
        </h2>

        <ul className="m-0 mt-8 list-none p-0">
          {CREW.map((m) => (
            <li
              key={m.name}
              className="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-4 rounded-md px-2 py-3 transition-colors duration-300 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] sm:grid-cols-[11rem_1fr_auto] sm:gap-x-8"
            >
              <span className="font-mono text-[13px] font-medium lowercase tracking-[0.14em] text-[var(--ink)]">
                {m.name}
              </span>
              <span className="text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-80">
                {m.role}
              </span>
              {m.href && (
                <a
                  href={m.href}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden font-mono text-[11px] lowercase tracking-[0.16em] text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline sm:inline"
                >
                  profile ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

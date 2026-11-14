import { Flame } from 'lucide-react'

export default function Header() {
  return (
    <header className="border-b border-edge bg-panel/70 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-6 py-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-flame/15 text-flame">
          <Flame size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Flame in Freefall
          </h1>
          <p className="text-sm text-mist">
            SI-powered fire safety insights from microgravity combustion data
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="rounded-full border border-edge bg-panel2 px-3 py-1 text-mist">
            NASA Space Apps Challenge 2026
          </span>
          <span className="rounded-full border border-flame/40 bg-flame/10 px-3 py-1 text-ember">
            Space Exploration · Intermediate/Advanced
          </span>
        </div>
      </div>
    </header>
  )
}

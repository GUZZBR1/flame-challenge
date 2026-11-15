import { useEffect, useState } from 'react'

/** types text out character-by-character like the model is writing it
 *  live — ~3 chars per tick so a typical briefing lands in ~a second.
 *  reduced-motion and already-seen text render instantly. */
export default function TypedText({
  text,
  instant = false,
}: {
  text: string
  /** render full text immediately — restored/old entries */
  instant?: boolean
}) {
  const [n, setN] = useState(() =>
    instant || matchMedia('(prefers-reduced-motion: reduce)').matches
      ? text.length
      : 0,
  )

  useEffect(() => {
    if (n >= text.length) return
    const t = window.setInterval(() => {
      setN((v) => Math.min(text.length, v + 3))
    }, 18)
    return () => window.clearInterval(t)
  }, [n, text])

  return (
    <>
      {text.slice(0, n)}
      {n < text.length && (
        <span className="caret-blink text-[var(--accent)]">▍</span>
      )}
    </>
  )
}

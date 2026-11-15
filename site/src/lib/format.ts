/** presentation helpers for copilot output — judges should never read
 *  transport jargon. bracketed engineering asides like
 *  "[local model — api offline, psi evidence unavailable]" are stripped
 *  from the sentence and surfaced as a calm chip instead. */

/** pull trailing […] asides out of a briefing; returns the clean
 *  sentence plus a short note if the aside mentioned offline state */
export function cleanBriefing(text: string): { text: string; offline: boolean } {
  let offline = false
  const t = text.replace(/\s*\[[^\]]*\]\s*/g, (m) => {
    if (/offline|local model|fallback|unavailable/i.test(m)) offline = true
    return ' '
  })
  return { text: t.replace(/\s{2,}/g, ' ').trim(), offline }
}

/** machine mode -> human label */
export function modeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'llm':
      return 'copilot'
    case 'offline-fallback':
    case 'local-fallback':
      return 'offline estimate'
    default:
      return (mode ?? '').replace(/-/g, ' ')
  }
}

export const ACTION_LABEL: Record<string, string> = {
  CUT_VENTILATION: 'cut ventilation',
  REDUCE_O2: 'reduce o₂',
  COOL_AND_ISOLATE: 'cool & isolate',
  SUPPRESS_LOCAL: 'suppress local',
}

/** risk index 0..1 + level → short display bits; tries the structured
 *  chamber block first, falls back to parsing the briefing text */
export function riskBits(
  chamber: Record<string, unknown> | undefined,
  briefing: string,
): { pct: number; level: string } | null {
  const ri = chamber?.riskIndex
  if (typeof ri === 'number' && ri >= 0 && ri <= 1) {
    const level = typeof chamber?.level === 'string' ? chamber.level : ''
    return { pct: Math.round(ri * 100), level }
  }
  const m = briefing.match(/risk index\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%?\s*(?:\((\w+)\))?/i)
  if (!m) return null
  const raw = parseFloat(m[1])
  return { pct: Math.round(raw <= 1 ? raw * 100 : raw), level: m[2] ?? '' }
}

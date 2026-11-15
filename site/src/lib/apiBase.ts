/**
 * Backend origin for deployed builds. Empty string → same-origin: the
 * local dev path (vite proxies /api, /health and /ws to :8000) or a
 * single-container deploy. Set VITE_API_URL to the backend origin when
 * the site is served from a different host (e.g. Vercel → a Hugging
 * Face Space) — REST calls get it verbatim and the /ws/chamber socket
 * maps http(s) → ws(s).
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${BASE}${path}`
}

export function wsUrl(path: string): string {
  if (BASE) return `${BASE.replace(/^http/, 'ws')}${path}`
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}

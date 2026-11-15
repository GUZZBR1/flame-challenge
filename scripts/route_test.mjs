// CDP smoke test for the psi-dataset overlay route — drives the
// chromium headless shell directly over the DevTools protocol.
// usage: node route_test.mjs  (needs `ws` — installed under /tmp/cdpx)
import { createRequire } from 'module'
const require = createRequire('/tmp/cdpx/package.json')
const WebSocket = require('ws')
const PORT = 9333
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text }
  return r.result?.result?.value
}
const state = () =>
  evalJs(`JSON.stringify({
    hash: location.hash,
    overlay: !!document.getElementById('psi-dataset-title'),
    scrollY: Math.round(window.scrollY),
  }).then ? '' : JSON.stringify({
    hash: location.hash,
    overlay: !!document.getElementById('psi-dataset-title'),
    scrollY: Math.round(window.scrollY),
  })`).then((v) => JSON.parse(v || '{}'))

let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  cond ? pass++ : fail++
}

await send('Page.enable')
await send('Page.navigate', { url: BASE })
await sleep(2500)

// 1) deep link: jump straight to #psi-dataset
await send('Page.navigate', { url: `${BASE}/#psi-dataset` })
await sleep(1500)
let s = await state()
check('deep link opens overlay', s.hash === '#psi-dataset' && s.overlay, JSON.stringify(s))

// 2) back link (navigateBack) closes overlay, hash cleared
await evalJs(`document.querySelector('#psi-dataset a[href="#top"]').click(); 1`)
await sleep(600)
s = await state()
check('← back closes overlay', !s.overlay && s.hash === '', JSON.stringify(s))

// 3) scroll down, open overlay via header link, come back — position kept
await send('Page.navigate', { url: BASE })
await sleep(1500)
await evalJs(`document.getElementById('dashboard').scrollIntoView(); window.scrollBy(0,-96); 1`)
await sleep(1200)
s = await state()
const y1 = s.scrollY
check('scrolled to dashboard', y1 > 400, `y=${y1}`)
await evalJs(`[...document.querySelectorAll('header a')].find(a=>a.getAttribute('href')==='#psi-dataset').click(); 1`)
await sleep(900)
s = await state()
check('header link opens overlay', s.overlay && s.hash === '#psi-dataset', JSON.stringify(s))
await evalJs(`history.back(); 1`)
await sleep(900)
s = await state()
check('browser back closes overlay + restores scroll', !s.overlay && Math.abs(s.scrollY - y1) < 60, JSON.stringify(s))

// 4) forward re-opens
await evalJs(`history.forward(); 1`)
await sleep(900)
s = await state()
check('browser forward reopens overlay', s.overlay && s.hash === '#psi-dataset', JSON.stringify(s))

// 5) voice nav equivalent: scrollToSection→navigate does pushState +
// 'ignis:route' (an eval import() would get a *second* module instance,
// so simulate at the DOM level — same code path the voice hook drives)
await evalJs(`history.back(); 1`)
await sleep(700)
await evalJs(`history.pushState(null,'','#psi-dataset'); window.dispatchEvent(new CustomEvent('ignis:route')); 1`)
await sleep(900)
s = await state()
check('route event opens overlay', s.overlay && s.hash === '#psi-dataset', JSON.stringify(s))

// 6) theme filter via the mounted 'ignis:filter' listener (voice path)
await evalJs(`window.dispatchEvent(new CustomEvent('ignis:filter',{detail:{tag:'spread'}})); 1`)
await sleep(400)
let chip = await evalJs(`document.querySelector('#psi-dataset button[aria-pressed="true"]')?.textContent?.trim() || ''`)
let counter = await evalJs(`[...document.querySelectorAll('#psi-dataset .font-mono')].map(e=>e.textContent).find(t=>/of 14 investigations/.test(t)) || ''`)
check('ignis:filter sets theme chip', chip === 'spread', `chip="${chip}"`)
check('matrix filters rows', /^(?!14 of 14)\d+ of 14/.test(counter), `counter="${counter.trim()}"`)

// 7) filter survives close/reopen (module-state seed on mount)
await evalJs(`history.back(); 1`)
await sleep(700)
await evalJs(`history.pushState(null,'','#psi-dataset'); window.dispatchEvent(new CustomEvent('ignis:route')); 1`)
await sleep(900)
chip = await evalJs(`document.querySelector('#psi-dataset button[aria-pressed="true"]')?.textContent?.trim() || ''`)
check('filter persists across reopen', chip === 'spread', `chip="${chip}"`)

// ---------- simulations deck ----------

// 8) deep link '#simulations' opens the deck
await send('Page.navigate', { url: `${BASE}/#simulations` })
await sleep(1600)
s = await state()
const deckBits = await evalJs(`JSON.stringify({
  chamber: !!document.getElementById('chamber'),
  console: !!document.getElementById('mission-control'),
  ask: !!document.getElementById('ask'),
  controls: document.querySelectorAll('#chamber select, #chamber input').length,
  stageCanvas: document.querySelectorAll('#chamber canvas').length,
})`)
check('simulations deep link opens deck', s.hash === '#simulations', JSON.stringify(s))
const db = JSON.parse(deckBits || '{}')
check('deck mounts chamber + console', db.chamber && db.console, deckBits)
check('ask lives on the si-console screen', !db.ask, `ask=${db.ask}`)
check('chamber has no manual controls', db.controls === 0, `controls=${db.controls}`)
check('stage collapsed while idle', db.stageCanvas === 0, `stageCanvas=${db.stageCanvas}`)

// 9) bare '#chamber' hash normalizes onto the deck + lands inside
await send('Page.navigate', { url: BASE })
await sleep(1400)
await evalJs(`location.hash = 'chamber'; 1`)
await sleep(1000)
s = await state()
const chamberUp = await evalJs(`!!document.getElementById('chamber')`)
check('bare #chamber opens deck (hash normalized)', s.hash === '#simulations' && chamberUp === true, JSON.stringify(s))

// 10) header 'si console' link → the copilot's own screen
await evalJs(`history.back(); 1`)
await sleep(800)
await evalJs(`[...document.querySelectorAll('header a')].find(a=>a.getAttribute('href')==='#si-console')?.click(); 1`)
await sleep(1200)
s = await state()
const siBits = await evalJs(`JSON.stringify({
  console: !!document.getElementById('mission-control'),
  brain: !!document.querySelector('[data-lenis-prevent] canvas[aria-label^="ascii brain"]'),
  ask: !!document.getElementById('ask'),
  slimPanel: !!document.querySelector('#mission-control select'),
})`)
const iv = JSON.parse(siBits || '{}')
check('si-console link opens copilot screen', s.hash === '#si-console' && iv.ask === true && iv.brain === true, `hash=${s.hash} ${siBits}`)
check('si screen is ask + brain (no comms)', !iv.console && iv.ask && iv.brain, siBits)

// 10b) a copilot answer wires records into the brain — the listener
// rides the si-entry channel wherever it's dispatched
await evalJs(`window.dispatchEvent(new CustomEvent('ignis:si-entry',{detail:{
  id: 9001, ts: Date.now(), prompt: '⌨ run saffire',
  resp: { briefing: 'saffire running at 19% o₂ — spread regime',
    recommended_action: 'REDUCE_O2', mode: 'llm',
    evidence: [{ runId:'r1', accession:'PSI-0042', investigationId:'saffire',
      fuel:'cotton', outcome:'burn', similarity:92, verified:true, sourceUrl:'' }],
    navigation: { scroll_to_section: 'dashboard' } },
  origin: 'test' }})); 1`)
await sleep(500)
const brainStats = await evalJs(`[...document.querySelectorAll('[data-lenis-prevent] span')].map(s=>s.textContent).find(t=>/records wired|no tissue yet/.test(t)) || ''`)
check('brain wires consumed records', /[1-9]\d* records wired/.test(brainStats), brainStats)

// 10c) the same entry generated a dashboard artifact card — the
// simile-style gallery on #dashboard reacts to 'ignis:si-entry'
const art = await evalJs(`JSON.stringify({
  cards: document.querySelectorAll('#dashboard article.card-soft').length,
  text: [...document.querySelectorAll('#dashboard article.card-soft')].map(a=>a.textContent).join(' '),
})`)
const av = JSON.parse(art || '{}')
check('si-entry generates a dashboard artifact', av.cards >= 1 && av.text.toLowerCase().includes('psi-0042'), art)

// 10d) back to the deck for feed + engine checks — fresh doc keeps the
// bus/pending wiring identical to a voice-driven session
await send('Page.navigate', { url: `${BASE}/#simulations` })
await sleep(1600)

// 10e) a copilot answer files onto the deck's feed — text + tool
// pills + evidence refs, not just the console log
await evalJs(`window.dispatchEvent(new CustomEvent('ignis:si-entry',{detail:{
  id: 9002, ts: Date.now(), prompt: '⌨ run saffire',
  resp: { briefing: 'saffire running at 19% o₂ — spread regime',
    recommended_action: 'REDUCE_O2', mode: 'llm',
    evidence: [{ runId:'r1', accession:'PSI-0042', investigationId:'saffire',
      fuel:'cotton', outcome:'burn', similarity:92, verified:true, sourceUrl:'' }],
    navigation: { scroll_to_section: 'dashboard' } },
  origin: 'test' }})); 1`)
await sleep(500)
const feedCheck = await evalJs(`JSON.stringify({
  text: [...document.querySelectorAll('#copilot-answers p')].map(p=>p.textContent).join(' '),
  links: [...document.querySelectorAll('#copilot-answers a, #copilot-answers button')].map(a=>a.textContent).join(' '),
})`)
const fv = JSON.parse(feedCheck || '{}')
check('copilot answer lands on the deck feed', fv.text.includes('saffire running') && fv.text.includes('run saffire'), feedCheck)
check('feed refs evidence + dashboard link', fv.links.includes('PSI-0042') && fv.links.includes('dashboard'), feedCheck)

// 11) a copilot preset command over the bus retunes the stage — same
// path voice/typed chat emit through emitSimulationCommands
const before = await evalJs(`[...document.querySelectorAll('#chamber .font-mono')].map(e=>e.textContent).find(t=>/flex-2|saffire|bass-ii|confined/.test(t)) || ''`)
await evalJs(`window.dispatchEvent(new CustomEvent('ignis:ui-command',{detail:{load_preset:'bass-ii',__investigation:'bass-ii',__origin:'test'}})); 1`)
await sleep(900)
const after = await evalJs(`JSON.stringify({
  inv: [...document.querySelectorAll('#chamber .font-mono')].map(e=>e.textContent).find(t=>/flex-2|saffire|bass-ii|confined/.test(t)) || '',
  status: [...document.querySelectorAll('#chamber span')].find(s=>/30 hz|offline/.test(s.textContent))?.textContent?.trim(),
  stageCanvas: document.querySelectorAll('#chamber canvas').length,
})`)
const sv = JSON.parse(after || '{}')
check('bus preset retunes + relights chamber', sv.inv.includes('bass-ii') && sv.stageCanvas === 1, `before="${before.trim()}" after=${after}`)

// 11c) the deck's backdrop is the saffire-v uv clip — not the psi
// screen's saffire-vi nor the challenge page's sofie-gel
const vid = await evalJs(`[...document.querySelectorAll('[data-lenis-prevent] video source')].map(s=>s.getAttribute('src')).join('|')`)
check('deck backdrop is saffire-v footage', vid.includes('saffire5_uv') && !vid.includes('sofie_flame') && !vid.includes('saffire_pmma'), vid)

// 12) back closes deck
await evalJs(`history.back(); 1`)
await sleep(900)
const chamberGone = await evalJs(`!document.getElementById('chamber')`)
check('back closes deck', chamberGone === true, `chamberGone=${chamberGone}`)

// 13) launch-to-dashboard retune: ui-command o2/flow → 'chamber echo' chip
await evalJs(`window.dispatchEvent(new CustomEvent('ignis:ui-command',{detail:{set_o2_percent:19,set_airflow_cm_s:7,__origin:'test'}})); 1`)
await sleep(500)
const chip2 = await evalJs(`[...document.querySelectorAll('#dashboard button[aria-pressed]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.textContent.trim()).join('|')`)
check('dashboard retunes to chamber echo', chip2.includes('chamber echo'), `pressed="${chip2}"`)

console.log(`\n${pass} pass, ${fail} fail`)
ws.close()
process.exit(fail ? 1 : 0)

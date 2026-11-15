// CDP smoke test for the generated-dashboard and conversational simulation routes.
// usage: node scripts/route_test.mjs (needs `ws` under /tmp/cdpx, Vite :5173,
// and Chromium DevTools on :9333)
import { createRequire } from 'module'
const require = createRequire('/tmp/cdpx/package.json')
const WebSocket = require('ws')
const PORT = 9333
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((response) => response.json())
const page = targets.find((target) => target.type === 'page')
if (!page) throw new Error('no page target')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })

let id = 0
const pending = new Map()
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
}
const send = (method, params = {}) => new Promise((resolve) => {
  const requestId = ++id
  pending.set(requestId, resolve)
  ws.send(JSON.stringify({ id: requestId, method, params }))
})
const evalJs = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.result?.exceptionDetails) return { error: result.result.exceptionDetails.text }
  return result.result?.result?.value
}
const state = async () => JSON.parse(await evalJs(`JSON.stringify({
  hash: location.hash,
  dashboard: [...document.querySelectorAll('h1')].some((heading) => heading.textContent?.trim() === 'Dashboard'),
  deck: !!document.querySelector('#scenario-prompt'),
})`))

let pass = 0
let fail = 0
const check = (name, condition, extra = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  condition ? pass++ : fail++
}

await send('Page.enable')
await send('Page.navigate', { url: BASE })
await sleep(1800)
await evalJs('localStorage.removeItem("ignis-generated-dashboards-v1"); 1')

// Dashboard is an empty generated-artifact library until a report exists.
await send('Page.navigate', { url: `${BASE}/#dashboard` })
await sleep(900)
let current = await state()
let dashboardText = await evalJs(`document.body.innerText || ''`)
check('dashboard route opens its dedicated screen', current.hash === '#dashboard' && current.dashboard, JSON.stringify(current))
check('empty dashboard asks for a simulation first', /No generated dashboards yet/.test(dashboardText) && /Simulations/.test(dashboardText), dashboardText.slice(0, 100))

// Simulations owns the chat, voice input, and chamber; legacy SI-console
// selectors and the former Investigation/Run Experiment controls are gone.
await send('Page.navigate', { url: `${BASE}/#simulations` })
await sleep(1200)
current = await state()
const deck = JSON.parse(await evalJs(`JSON.stringify({
  prompt: !!document.querySelector('#scenario-prompt'),
  mic: !!document.querySelector('button[aria-label="Record a voice prompt"]'),
  chamber: !!document.querySelector('#chamber canvas'),
  legacyConsole: !!document.getElementById('mission-control') || !!document.getElementById('si-console'),
  investigationControls: [...document.querySelectorAll('button')].some((button) => /Run Experiment|Investigation/.test(button.textContent || '')),
})`))
check('simulations route opens conversational workbench', current.hash === '#simulations' && deck.prompt && deck.mic, JSON.stringify(deck))
check('deck has chamber and no legacy console controls', deck.chamber && !deck.legacyConsole && !deck.investigationControls, JSON.stringify(deck))

// Keep this test independent from the local API services and verify the
// end-to-end assistant → generated report → dashboard link flow.
await evalJs(`window.fetch = async (input) => {
  const url = String(input)
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
  if (url.includes('/api/materials')) return json({ investigations: {
    'flex-2': { model: 'droplet', materialId: 'heptane', o2Range: [12, 34], flowRangeCms: [0, 2.55] },
    saffire: { model: 'spread', materialId: 'cotton', o2Range: [21.5, 22.1], flowRangeCms: [20, 30] },
  } })
  if (url.includes('/api/si/chat')) return json({
    briefing: 'The scenario is ready for review.\n\nSources: NASA PSI records.',
    recommended_action: 'REVIEW', ui_command: null, simulation_commands: null,
    navigation: null, mode: 'local-fallback', model: 'route-test', chamber: {}, evidence: [],
  })
  return json({})
}; 1`)
await evalJs(`(() => { const field = document.querySelector('#scenario-prompt'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(field, 'Analyze a low oxygen case'); field.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
await evalJs(`document.querySelector('button[aria-label="Send message"]').click(); 1`)
await sleep(700)
let chatText = await evalJs(`document.querySelector('[aria-live="polite"]')?.textContent || ''`)
if (!chatText.includes('Scenario is ready')) chatText = await evalJs(`document.body.textContent || ''`)
check('copilot response is formatted in the conversation', /Scenario is ready for review/.test(chatText) && /Sources: NASA PSI records/.test(chatText))
await evalJs(`[...document.querySelectorAll('a,button')].find((element) => element.textContent.includes('Generate dashboard'))?.click(); 1`)
await sleep(900)
current = await state()
dashboardText = await evalJs(`document.body.innerText || ''`)
check('analysis generates a report and routes to it', current.hash.startsWith('#dashboard-') && /Analyze a low oxygen case/.test(dashboardText), JSON.stringify(current))

console.log(`\n${pass} pass, ${fail} fail`)
ws.close()
process.exit(fail ? 1 : 0)

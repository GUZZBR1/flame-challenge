import { useEffect, useRef, useState, type FormEvent } from 'react'
import { gravityRegime, siChat, siVoice, type SiChamberState, type SiResponse } from '../lib/api'
import { generateDashboard } from '../lib/generatedDashboards'
import { emitSimulationCommands } from '../lib/simBus'
import { clearInnerTarget, gsap, navigate, navigateBack, peekInnerTarget } from '../lib/scroll'
import type { ChamberState } from '../lib/live'
import KeyedFlame from './KeyedFlame'
import LiveChamber from './LiveChamber'
import { IconArrowLeft, IconArrowUpRight, IconMic, IconSend } from './Icons'
import Button from './ui/Button'

type Message = { id: number; role: 'user' | 'assistant'; text: string; response?: SiResponse; prompt?: string; saved?: boolean; dashboardId?: string }

function FormattedCopy({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
    : part)
  return <div className="space-y-3">{blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 1 && lines.every((line) => /^[-•*]\s+/.test(line))) {
      return <ul key={index} className="list-disc space-y-1.5 pl-6">{lines.map((line, itemIndex) => <li key={itemIndex}>{inline(line.replace(/^[-•*]\s+/, ''))}</li>)}</ul>
    }
    if (lines.length === 1 && lines[0].length < 90 && lines[0].endsWith(':')) {
      return <h3 key={index} className="pt-1 text-base font-semibold">{inline(lines[0].slice(0, -1))}</h3>
    }
    return <p key={index} className="m-0">{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</span>)}</p>
  })}</div>
}

function ResultDetails({ response }: { response: SiResponse }) {
  const risk = response.chamber?.riskIndex
  const riskText = typeof risk === 'number' ? `${Math.round(risk <= 1 ? risk * 100 : risk)}%` : null
  const evidence = response.evidence ?? []
  return (
    <div className="mt-5 space-y-4 border-t border-[var(--edge)] pt-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full border border-[var(--edge)] px-3 py-1.5 capitalize">{response.mode === 'llm' ? '9Router + evidence' : 'deterministic fallback'}</span>
        {riskText && <span className="rounded-full border border-[var(--edge)] px-3 py-1.5">Risk index · {riskText}</span>}
        {response.engine && <span className="rounded-full border border-[var(--edge)] px-3 py-1.5">Engine · {response.engine}</span>}
      </div>
      {evidence.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Closest NASA PSI records</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {evidence.slice(0, 3).map((item) => (
              <li key={item.runId}>
                <a className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-[var(--edge)] px-4 text-sm transition hover:bg-white/50 dark:hover:bg-white/10" href={item.sourceUrl || '#psi-dataset'} target={item.sourceUrl ? '_blank' : undefined} rel="noreferrer">
                  <span className="truncate">{item.accession} · {item.fuel} · {item.outcome}</span>
                  <span className="shrink-0 tabular-nums opacity-65">{Math.round(item.similarity)}%</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function responseRunsChamber(response: SiResponse): boolean {
  const sim = response.simulation_commands
  const ui = response.ui_command
  return [sim?.load_preset, sim?.set_o2_percent, sim?.set_airflow_cm_s, ui?.load_preset, ui?.set_o2_percent, ui?.set_airflow_cm_s].some((value) => value != null)
}

/** Conversational simulation surface. The copilot response can tune the
 *  chamber; completed websocket runs become generated dashboard reports. */
export default function SimDeck() {
  const rootRef = useRef<HTMLDivElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const nextId = useRef(1)
  const chamberRef = useRef<SiChamberState>({ investigationId: 'flex-2', materialId: 'heptane', o2Pct: 21, flowCms: 0, gravity: 'microgravity' })
  const latestResponse = useRef<{ prompt: string; response: SiResponse; messageId: number } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const go = (id: string) => {
      rootRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      clearInnerTarget()
    }
    const onInner = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (id) go(id)
    }
    const onComplete = (event: Event) => {
      const current = latestResponse.current
      if (!current) return
      const frame = (event as CustomEvent<ChamberState>).detail
      const report = generateDashboard(current.prompt, current.response, frame, chamberRef.current)
      setMessages((all) => all.map((message) => message.id === current.messageId ? { ...message, saved: true, dashboardId: report.id } : message))
      setNotice('Simulation complete. Its report is ready in Dashboard.')
      latestResponse.current = null
    }
    window.addEventListener('ignis:scroll-inner', onInner)
    window.addEventListener('ignis:chamber-complete', onComplete)
    const pending = peekInnerTarget()
    const timer = pending ? window.setTimeout(() => go(pending), 90) : 0
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('ignis:scroll-inner', onInner)
      window.removeEventListener('ignis:chamber-complete', onComplete)
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => gsap.from('[data-hero]', { opacity: 0, y: 14, duration: 0.6, ease: 'power2.out', stagger: 0.07 }), root)
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const respond = async (prompt: string, response: SiResponse | null) => {
    setBusy(false)
    if (!response) {
      setMessages((all) => [...all, { id: nextId.current++, role: 'assistant', text: 'I could not reach the copilot service. Check the backend connection and try again.' }])
      return
    }
    const sim = response.simulation_commands
    const preset = sim?.load_preset ?? response.ui_command?.load_preset ?? null
    const o2 = sim?.set_o2_percent ?? response.ui_command?.set_o2_percent
    const flow = sim?.set_airflow_cm_s ?? response.ui_command?.set_airflow_cm_s
    if (preset) chamberRef.current.investigationId = preset
    if (typeof o2 === 'number') chamberRef.current.o2Pct = o2
    if (typeof flow === 'number') chamberRef.current.flowCms = flow
    if (typeof sim?.set_gravity_g === 'number') chamberRef.current.gravity = gravityRegime(sim.set_gravity_g)
    const commandSet = sim ?? (response.ui_command ? {
      load_preset: preset,
      set_o2_percent: o2,
      set_airflow_cm_s: flow,
    } : null)
    const hasRunConditions = !!commandSet && [commandSet.load_preset, commandSet.set_o2_percent, commandSet.set_airflow_cm_s].some((value) => value != null)
    const assistantMessageId = nextId.current++
    if (hasRunConditions) latestResponse.current = { prompt, response, messageId: assistantMessageId }
    emitSimulationCommands(commandSet, 'sim-chat', chamberRef.current.investigationId ?? null)
    setMessages((all) => [...all, {
      id: assistantMessageId, role: 'assistant', text: response.briefing, response, prompt,
    }])
    if (response.transcript) setNotice(`Heard: “${response.transcript}”`)
    else if (response.stt === 'offline') setNotice('Voice transcription is offline. You can still type to the copilot.')
    else setNotice('')
  }

  const send = async (text = draft) => {
    const prompt = text.trim()
    if (!prompt || busy) return
    setDraft('')
    setNotice('')
    setMessages((all) => [...all, { id: nextId.current++, role: 'user', text: prompt }])
    setBusy(true)
    const response = await siChat(prompt, chamberRef.current)
    await respond(prompt, response)
  }

  const toggleVoice = async () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      setVoiceState('transcribing')
      recorderRef.current.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNotice('Voice input is not available in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        setBusy(true)
        const response = await siVoice(blob, chamberRef.current)
        const prompt = response?.transcript?.trim() || 'Voice scenario'
        if (response?.transcript) setMessages((all) => [...all, { id: nextId.current++, role: 'user', text: response.transcript! }])
        await respond(prompt, response)
        setVoiceState('idle')
      }
      recorder.start()
      setVoiceState('recording')
      setNotice('Recording… select the microphone again to send.')
    } catch {
      setVoiceState('idle')
      setNotice('Microphone permission was unavailable.')
    }
  }

  const save = (message: Message): string | undefined => {
    if (!message.response || !message.prompt) return
    const report = generateDashboard(message.prompt, message.response, undefined, chamberRef.current)
    setMessages((all) => all.map((item) => item.id === message.id ? { ...item, saved: true, dashboardId: report.id } : item))
    setNotice('Analysis saved to Dashboard.')
    return report.id
  }

  const submit = (event: FormEvent) => { event.preventDefault(); void send() }

  return (
    <div ref={rootRef} data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-[var(--bg)]">
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-24 sm:px-10 sm:pt-28 lg:px-16">
        <KeyedFlame className="inset-x-0 -top-8 h-[min(54vh,460px)]" strength={0.3} src={{ hd: '/assets/saffire5_uv.mp4', sd: '/assets/saffire5_uv_sd.mp4' }} />
        <header className="relative">
          <div data-hero className="flex items-center justify-between gap-5">
            <Button variant="glass" onClick={navigateBack}><IconArrowLeft size={16} /> Back</Button>
            <span className="hidden text-sm opacity-65 sm:inline">C++ physics · NASA PSI evidence · scenario copilot</span>
          </div>
          <h1 data-hero className="mt-9 font-[family-name:var(--font-display)] text-5xl font-bold tracking-[-0.05em] sm:text-7xl">Simulations</h1>
          <p data-hero className="mt-5 max-w-3xl text-lg leading-8 opacity-80 sm:text-xl">Describe what you want to test. The copilot can inspect the record, set chamber conditions, and stream a physics run when the scenario calls for one.</p>
        </header>

        <section className="relative mt-10 overflow-hidden rounded-[32px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] shadow-[0_30px_80px_-44px_rgba(16,35,60,.5)] backdrop-blur-2xl sm:mt-14">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--edge)] px-5 py-5 sm:px-8">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">Scenario conversation</h2>
              <p className="mt-1 text-sm opacity-65 sm:text-base">Ask a question, compare conditions, or describe a run in plain language.</p>
            </div>
            <Button asChild variant="glass"><a href="#dashboard" onClick={(event) => { event.preventDefault(); navigate('#dashboard') }}>Generated dashboards <IconArrowUpRight size={16} /></a></Button>
          </div>

          <div ref={transcriptRef} aria-live="polite" className="max-h-[min(58vh,620px)] min-h-[250px] space-y-5 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            {messages.length === 0 && <div className="mx-auto max-w-2xl py-6 text-center">
              <p className="text-lg leading-8 opacity-80">Start with a question like:</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {['What changes if oxygen drops to 18%?', 'Compare cotton spread in microgravity and Earth gravity', 'Search PSI records for hidden flame incidents'].map((example) => <button key={example} type="button" onClick={() => void send(example)} className="min-h-14 rounded-full border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,.92),rgba(222,238,248,.7))] px-6 py-4 text-left text-base font-medium shadow-[0_12px_28px_-18px_rgba(23,33,43,.38),inset_0_1px_0_white,inset_0_-1px_0_rgba(23,33,43,.12)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-17px_rgba(23,33,43,.4),0_0_0_4px_rgba(73,184,214,.14)] dark:border-white/25 dark:bg-[linear-gradient(180deg,rgba(221,239,255,.2),rgba(26,43,62,.72))] dark:hover:bg-white/15">{example}</button>)}
              </div>
            </div>}
            {messages.map((message) => <article key={message.id} className={`max-w-[94%] rounded-[26px] px-5 py-4 sm:max-w-[82%] sm:px-7 sm:py-6 ${message.role === 'user' ? 'ml-auto rounded-br-lg bg-[var(--ink)] text-[var(--bg)]' : 'mr-auto rounded-bl-lg border border-[var(--edge)] bg-white/45 shadow-sm backdrop-blur-xl dark:bg-white/[0.045]'}`}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-60">{message.role === 'user' ? 'You' : 'IGNIS copilot'}</div>
              <div className="text-base leading-8 sm:text-lg">{message.role === 'assistant' ? <FormattedCopy text={message.text} /> : <p className="m-0 whitespace-pre-wrap">{message.text}</p>}</div>
              {message.role === 'assistant' && message.response && <>
                <ResultDetails response={message.response} />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {responseRunsChamber(message.response) && !message.saved
                    ? <span className="inline-flex min-h-12 items-center rounded-full border border-[var(--edge)] px-5 text-sm opacity-70">Dashboard report will appear when the chamber run finishes.</span>
                    : <Button asChild variant="glass" size="lg"><a href={message.dashboardId ? `#dashboard-${message.dashboardId}` : '#dashboard'} onClick={(event) => { event.preventDefault(); const id = message.dashboardId ?? save(message); navigate(id ? `#dashboard-${id}` : '#dashboard') }}>{message.saved ? 'Open generated dashboard' : 'Generate dashboard'} <IconArrowUpRight size={16} /></a></Button>}
                </div>
              </>}
            </article>)}
            {busy && <div role="status" className="mr-auto rounded-full border border-[var(--edge)] px-5 py-3 text-base opacity-70">Working through the scenario…</div>}
          </div>

          <form onSubmit={submit} className="border-t border-[var(--edge)] bg-white/25 p-4 dark:bg-black/10 sm:p-6">
            <label htmlFor="scenario-prompt" className="sr-only">Describe a combustion scenario</label>
            <div className="flex items-end gap-3 rounded-[28px] border border-[var(--edge)] bg-white/70 p-2 shadow-[0_10px_35px_-25px_rgba(16,35,60,.5)] backdrop-blur-xl dark:bg-white/[0.06] sm:p-3">
              <textarea id="scenario-prompt" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="Describe the conditions or ask a question…" className="max-h-40 min-h-[60px] flex-1 resize-y bg-transparent px-4 py-3 text-base leading-7 outline-none placeholder:text-[var(--ink)]/45 sm:text-lg" />
              <Button type="button" variant={voiceState === 'recording' ? 'accent' : 'glass'} size="lg" aria-label={voiceState === 'recording' ? 'Stop recording and send' : 'Record a voice prompt'} disabled={busy || voiceState === 'transcribing'} onClick={() => void toggleVoice()} className="shrink-0 !rounded-full !px-4">
                <IconMic size={19} /><span className="hidden sm:inline">{voiceState === 'recording' ? 'Send voice' : voiceState === 'transcribing' ? 'Transcribing…' : 'Speak'}</span>
              </Button>
              <Button type="submit" variant="primary" size="lg" disabled={busy || !draft.trim()} aria-label="Send message" className="shrink-0 !rounded-full !px-4"><IconSend size={19} /><span className="hidden sm:inline">Send</span></Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-2 text-sm opacity-60">
              <span>Enter to send · Shift + Enter for a new line</span>
              <span aria-live="polite">{notice || (voiceState === 'recording' ? 'Microphone on' : 'Text and voice supported')}</span>
            </div>
          </form>
        </section>

        <section id="chamber" className="relative scroll-mt-8 mt-12 rounded-[32px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] p-5 shadow-[0_24px_70px_-42px_rgba(16,35,60,.4)] backdrop-blur-2xl sm:mt-16 sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.17em] opacity-55">Live instrument</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Combustion chamber</h2>
            </div>
            <span className="text-sm opacity-60">Scenario changes stream here in real time</span>
          </div>
          <LiveChamber stage />
        </section>

        <div className="relative mt-8 flex justify-end">
          <Button variant="glass" onClick={navigateBack}>Back to overview <IconArrowLeft size={16} /></Button>
        </div>
      </div>
    </div>
  )
}

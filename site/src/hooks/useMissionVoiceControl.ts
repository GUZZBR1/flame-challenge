/**
 * useMissionVoiceControl — push-to-talk voice uplink for the whole app.
 *
 * Hold the HUD button (or hold Space outside text fields) -> MediaRecorder
 * captures -> the clip is decoded + resampled in-browser to WAV PCM16 mono
 * 16 kHz (lib/voice) -> POSTed to /api/si/voice-command. The returned
 * navigation / simulation_commands are the caller's to apply.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  siVoiceCommand,
  type SiChamberState,
  type SiVoiceCommandResult,
} from '../lib/api'
import { blobToWavPcm16 } from '../lib/voice'

export type VoiceStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'executing'
  | 'offline'

export const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: '[mic: hold space]',
  recording: '[mic: recording…]',
  transcribing: '[whisper.cpp: transcribing…]',
  executing: '[si: executing…]',
  offline: '[uplink offline]',
}

// buttons included — holding space on a focused PTT/mic button must not
// start a second recorder racing the pointer-driven one
const EDITABLE =
  'input, textarea, select, button, [contenteditable="true"]'

interface Options {
  /** freshest chamber state, sampled at upload time */
  chamberState: () => SiChamberState
  /** full voice-command envelope (transcript may be null on STT outage) */
  onResult?: (r: SiVoiceCommandResult) => void
  onError?: (msg: string) => void
  /** bind hold-Space push-to-talk globally — mount once per app */
  bindSpace?: boolean
}

export function useMissionVoiceControl({
  chamberState,
  onResult,
  onError,
  bindSpace = false,
}: Options) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [transcript, setTranscript] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // keyup can land while getUserMedia is still awaiting — without the
  // flag the recorder would start with nobody left to stop it
  const stopRequested = useRef(false)
  // latest-callback refs — the spacebar listener and MediaRecorder
  // callbacks close over state once; refs keep them current
  const optsRef = useRef({ chamberState, onResult, onError })
  optsRef.current = { chamberState, onResult, onError }
  const statusRef = useRef(status)
  statusRef.current = status

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const ship = useCallback(async (blob: Blob) => {
    setStatus('transcribing')
    try {
      const wav = await blobToWavPcm16(blob)
      const r = await siVoiceCommand(wav, optsRef.current.chamberState())
      if (!r) {
        setStatus('offline')
        optsRef.current.onError?.('voice uplink unreachable')
        return
      }
      setStatus('executing')
      setTranscript(r.transcript)
      optsRef.current.onResult?.(r)
      setStatus(r.transcript == null && r.stt === 'offline' ? 'offline' : 'idle')
    } catch {
      setStatus('offline')
      optsRef.current.onError?.('voice pipeline failed')
    }
  }, [])

  const stop = useCallback(() => {
    stopRequested.current = true
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    recorderRef.current = null
    releaseMic()
  }, [releaseMic])

  const start = useCallback(async () => {
    if (recorderRef.current || statusRef.current === 'transcribing') return
    stopRequested.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      if (stopRequested.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType })
        chunksRef.current = []
        if (blob.size > 400) void ship(blob)
        else setStatus('idle')
      }
      recorderRef.current = rec
      rec.start()
      setStatus('recording')
    } catch {
      releaseMic()
      optsRef.current.onError?.('microphone unavailable')
      setStatus('idle')
    }
  }, [releaseMic, ship])

  // hold-Space push-to-talk — never while the operator is typing
  useEffect(() => {
    if (!bindSpace) return
    const editable = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && e.target.closest(EDITABLE) != null
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || editable(e)) return
      e.preventDefault()
      void start()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (recorderRef.current) e.preventDefault()
      stop()
    }
    const cancel = () => stop()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', cancel)
    }
  }, [bindSpace, start, stop])

  // release the mic + any in-flight recorder on unmount
  useEffect(
    () => () => {
      recorderRef.current?.stop()
      releaseMic()
    },
    [releaseMic],
  )

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    transcript,
    recording: status === 'recording',
    busy: status === 'transcribing' || status === 'executing',
    start,
    stop,
  }
}

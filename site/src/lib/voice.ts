/**
 * Browser-side WAV encoder for the whisper.cpp uplink.
 *
 * MediaRecorder emits webm/opus (mp4/aac on Safari); whisper.cpp's
 * OpenAI-compatible /v1/audio/transcriptions wants PCM WAV. Decoding
 * and resampling here — AudioContext -> OfflineAudioContext -> 16-bit
 * mono 16 kHz WAV — removes the server-side transcode entirely.
 */

export const WHISPER_RATE = 16000

/** decode any MediaRecorder blob -> mono PCM16 WAV at 16 kHz */
export async function blobToWavPcm16(blob: Blob): Promise<Blob> {
  const raw = await blob.arrayBuffer()
  const decodeCtx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodeCtx.decodeAudioData(raw)
  } finally {
    void decodeCtx.close()
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * WHISPER_RATE))
  const off = new OfflineAudioContext(1, frames, WHISPER_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return encodeWavPcm16(rendered)
}

/** minimal RIFF/WAVE writer — PCM16 mono, whatever rate the buffer has */
function encodeWavPcm16(buf: AudioBuffer): Blob {
  const data = buf.getChannelData(0)
  const n = data.length
  const bytes = new ArrayBuffer(44 + n * 2)
  const v = new DataView(bytes)
  const tag = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  tag(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  v.setUint32(16, 16, true) // fmt chunk size
  v.setUint16(20, 1, true) // pcm
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, buf.sampleRate, true)
  v.setUint32(28, buf.sampleRate * 2, true) // byte rate
  v.setUint16(32, 2, true) // block align
  v.setUint16(34, 16, true) // bit depth
  tag(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

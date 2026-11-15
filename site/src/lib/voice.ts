/** Convert browser MediaRecorder output into the PCM WAV format expected
 *  by whisper.cpp's transcription endpoint. */

export const WHISPER_RATE = 16000

export async function blobToWavPcm16(blob: Blob): Promise<Blob> {
  const decodeContext = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void decodeContext.close()
  }

  const frameCount = Math.max(1, Math.ceil(decoded.duration * WHISPER_RATE))
  const offline = new OfflineAudioContext(1, frameCount, WHISPER_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return encodePcm16Wav(await offline.startRendering())
}

function encodePcm16Wav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0)
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const writeTag = (offset: number, tag: string) => {
    for (let index = 0; index < tag.length; index++) view.setUint8(offset + index, tag.charCodeAt(index))
  }
  writeTag(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeTag(8, 'WAVE')
  writeTag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeTag(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

/// <reference lib="webworker" />

/** Luminance-key worker — receives raw video frames as ImageBitmaps and
 *  returns the keyed frame the same way. The expensive part (getImageData
 *  readback + the per-pixel alpha loop) lives here, off the main thread;
 *  the page thread only does a GPU-side drawImage of the result. */

const canvas = new OffscreenCanvas(2, 2)
const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
  | OffscreenCanvasRenderingContext2D
  | null

self.onmessage = (e: MessageEvent) => {
  const bmp = (e.data as { bitmap?: ImageBitmap }).bitmap
  if (!bmp) return
  if (!ctx) {
    // replying keeps the main thread's inFlight flag from sticking —
    // the throw then surfaces as worker.onerror → main-thread fallback
    bmp.close()
    ;(self as unknown as Worker).postMessage({})
    throw new Error('keyedVideo: no 2d context on OffscreenCanvas')
  }
  const w = bmp.width >> 1
  const h = bmp.height >> 1
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
    d[i + 3] = Math.min(255, Math.max(0, (l - 26) * 3.4))
  }
  ctx.putImageData(img, 0, 0)
  const out = canvas.transferToImageBitmap()
  ;(self as unknown as Worker).postMessage({ bitmap: out }, [out])
}

export {}

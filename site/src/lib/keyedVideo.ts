/**
 * Luminance-keyed video → canvas, off the main thread.
 *
 * The flame footage is black-background; the key loop turns luminance
 * into alpha so the flame floats over the page. That per-pixel work used
 * to run on the main thread every rAF (getImageData readback + JS loop +
 * putImageData, ~1 MB/frame). Now a worker does it:
 *
 *   video ──createImageBitmap──▶ worker: draw → getImageData → key →
 *   putImageData → transferToImageBitmap ──▶ canvas.drawImage
 *
 * Frames are pumped by requestVideoFrameCallback (or a 30 Hz time-poll
 * where rVFC doesn't exist), so work happens once per *new video frame*,
 * not per display refresh. The video is paused while the canvas is
 * off-screen or its app view is covered by an overlay, so an invisible
 * flame costs nothing. Browsers without Worker/OffscreenCanvas fall
 * back to the original main-thread loop, still gated by visibility.
 */

type View = 'main' | 'psi' | 'sim' | 'dashboard'

export interface KeyedVideoOptions {
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  /** which app view this instance lives on — pauses when another view
   *  covers the page ('ignis:view' events from App) */
  view?: View
  /** seek here when metadata lands and on every loop wrap */
  loopStart?: number
  /** absolute loop end in seconds (overrides tailMargin) */
  loopEnd?: number
  /** trim this many seconds off the end to compute the loop end */
  tailMargin?: number
}

let currentView: string = 'main'
let viewListenerInstalled = false

function installViewListener() {
  if (viewListenerInstalled) return
  viewListenerInstalled = true
  window.addEventListener('ignis:view', (e) => {
    currentView =
      (e as CustomEvent<{ view?: string }>).detail?.view ?? 'main'
  })
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number
}

export function startKeyedVideo(opts: KeyedVideoOptions): () => void {
  installViewListener()
  const { video: v, canvas: c, view = 'main', loopStart = 0 } = opts
  let cancelled = false
  let intersecting = true
  let loopEnd = opts.loopEnd ?? Infinity
  const cleanup: (() => void)[] = []

  const active = () => intersecting && currentView === view

  // ---- loop window — same seeking the inline versions did ----
  {
    const onMeta = () => {
      v.currentTime = loopStart
      if (
        opts.loopEnd == null &&
        Number.isFinite(v.duration) &&
        v.duration > 1.5
      )
        loopEnd = v.duration - (opts.tailMargin ?? 0.4)
    }
    const onTime = () => {
      if (v.currentTime >= loopEnd) v.currentTime = loopStart
    }
    const onEnded = () => {
      v.currentTime = loopStart
      void v.play().catch(() => {})
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('ended', onEnded)
    if (v.readyState >= 1) onMeta()
    cleanup.push(() => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('ended', onEnded)
    })
  }

  // ---- visibility: pause decode + processing when nobody can see it ----
  const syncPlayback = () => {
    if (cancelled) return
    if (active()) {
      if (v.paused) void v.play().catch(() => {})
    } else if (!v.paused) {
      v.pause()
    }
  }
  const obs = new IntersectionObserver(
    ([entry]) => {
      intersecting = entry.isIntersecting
      syncPlayback()
    },
    { threshold: 0 },
  )
  obs.observe(c)
  const onView = () => syncPlayback()
  window.addEventListener('ignis:view', onView)
  cleanup.push(() => {
    obs.disconnect()
    window.removeEventListener('ignis:view', onView)
  })

  // ---- frame pipeline ----
  let worker: Worker | null = null
  let inFlight = false
  // the hint has to be set at first creation — a later getContext call
  // with different attributes just returns this same context
  const out = c.getContext('2d', { willReadFrequently: true })
  if (out && typeof Worker === 'function') {
    try {
      worker = new Worker(new URL('./keyedVideo.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = (e) => {
        inFlight = false
        const bmp = (e.data as { bitmap?: ImageBitmap }).bitmap
        if (!bmp || cancelled) {
          bmp?.close()
          return
        }
        if (c.width !== bmp.width || c.height !== bmp.height) {
          c.width = bmp.width
          c.height = bmp.height
        }
        // 'copy' replaces destination pixels outright — same semantics
        // as the old putImageData path, so transparent areas erase the
        // previous frame instead of accumulating trails. Re-set every
        // frame: assigning canvas.width/height resets the context state.
        out.globalCompositeOperation = 'copy'
        out.drawImage(bmp, 0, 0)
        bmp.close()
      }
      worker.onerror = () => {
        worker?.terminate()
        worker = null
        inFlight = false
        startMainThreadFallback()
      }
    } catch {
      worker = null
    }
  }
  cleanup.push(() => worker?.terminate())

  const pumpFrame = () => {
    if (cancelled || !active() || inFlight || v.readyState < 2 || !v.videoWidth)
      return
    inFlight = true
    createImageBitmap(v)
      .then((bmp) => {
        if (cancelled || !worker) {
          bmp.close()
          inFlight = false
          return
        }
        worker.postMessage({ bitmap: bmp }, [bmp])
      })
      .catch(() => {
        inFlight = false
      })
  }

  // rVFC: exactly one pump per presented video frame. Poll fallback
  // (Firefox): check the clock at ~30 Hz and pump when it advanced.
  const rvfc = (v as RVFCVideo).requestVideoFrameCallback?.bind(v)
  let stopPump = () => {}
  if (worker) {
    if (rvfc) {
      const onFrame = () => {
        if (cancelled || !worker) return
        pumpFrame()
        rvfc(onFrame)
      }
      rvfc(onFrame)
    } else {
      let lastTime = -1
      const id = window.setInterval(() => {
        if (v.currentTime !== lastTime) {
          lastTime = v.currentTime
          pumpFrame()
        }
      }, 33)
      stopPump = () => window.clearInterval(id)
    }
    cleanup.push(stopPump)
  }

  // ---- fallback: original main-thread loop (no Worker/OffscreenCanvas,
  //      or the worker died) — same pixels, still visibility-gated ----
  let fallbackStarted = false
  function startMainThreadFallback() {
    if (fallbackStarted || cancelled) return
    fallbackStarted = true
    stopPump()
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let raf = 0
    const tick = () => {
      if (cancelled) return
      if (active() && v.readyState >= 2 && v.videoWidth) {
        const w = v.videoWidth >> 1
        const h = v.videoHeight >> 1
        if (c.width !== w || c.height !== h) {
          c.width = w
          c.height = h
        }
        ctx.drawImage(v, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const d = img.data
        for (let i = 0; i < d.length; i += 4) {
          const l = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
          d[i + 3] = Math.min(255, Math.max(0, (l - 26) * 3.4))
        }
        ctx.putImageData(img, 0, 0)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    cleanup.push(() => cancelAnimationFrame(raf))
  }
  if (!worker) startMainThreadFallback()

  syncPlayback()

  return () => {
    cancelled = true
    for (const fn of cleanup) fn()
  }
}

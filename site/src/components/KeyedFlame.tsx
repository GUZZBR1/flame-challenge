import { useEffect, useRef } from 'react'

/** NASA combustion footage luminance-keyed to alpha — black pixels
 *  fall away and the flame floats behind the layout, the same
 *  treatment the hero and psi-dataset screens use. The clip is a prop:
 *  each screen burns different station footage (sofie-gel on the
 *  challenge page, saffire-vi on the psi screen, saffire-v's uv
 *  channel on the simulations deck). Renders absolutely positioned;
 *  the parent provides the mask/vignette via className on the
 *  wrapper. The loop window is discovered at runtime (the clip's
 *  container reports an odd duration, so we adapt instead of
 *  hardcoding). */
export default function KeyedFlame({
  className = '',
  strength = 0.75,
  src = { hd: '/assets/sofie_flame_hd.mp4', sd: '/assets/sofie_flame.mp4' },
}: {
  className?: string
  /** canvas alpha — dial it down when dense copy rides over the flame */
  strength?: number
  src?: { hd: string; sd: string }
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let raf = 0
    let cancelled = false
    let visible = true
    const loopStart = 0.5
    let loopEnd = Infinity

    const onMeta = () => {
      v.currentTime = loopStart
      if (Number.isFinite(v.duration) && v.duration > 1.5)
        loopEnd = v.duration - 0.4
    }
    const onTime = () => {
      if (v.currentTime >= loopEnd) v.currentTime = loopStart
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    if (v.readyState >= 1) onMeta()

    const obs = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting },
      { threshold: 0 },
    )
    obs.observe(c)

    const tick = () => {
      if (cancelled) return
      if (visible && v.readyState >= 2 && v.videoWidth) {
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
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      obs.disconnect()
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTime)
    }
  }, [])

  return (
    <>
      <video
        ref={videoRef}
        className="absolute h-px w-px opacity-0"
        autoPlay
        muted
        playsInline
        loop
        preload="metadata"
        aria-hidden="true"
      >
        <source src={src.hd} media="(min-width: 768px)" />
        <source src={src.sd} />
      </video>
      <div aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
        <canvas
          ref={canvasRef}
          className="block h-full w-full object-cover [mask-image:radial-gradient(ellipse_at_center,black_38%,transparent_74%)]"
          style={{ opacity: strength }}
        />
        {/* readability veil — the flame stays ambient, never a wall of
            noise under the copy that rides over it */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[var(--bg)] to-transparent" />
      </div>
    </>
  )
}

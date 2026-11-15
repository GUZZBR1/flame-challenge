import { useEffect, useRef } from 'react'
import { startKeyedVideo } from '../lib/keyedVideo'

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
    // lives on the simulations deck — the keyed pipeline pauses it
    // whenever another view covers the page
    return startKeyedVideo({
      video: v,
      canvas: c,
      view: 'sim',
      loopStart: 0.5,
      tailMargin: 0.4,
    })
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

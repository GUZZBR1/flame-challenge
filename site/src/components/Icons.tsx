/** Stroke icon set — lucide-style 24×24 paths so buttons carry real
 *  glyphs instead of unicode characters. Every icon inherits
 *  currentColor and sizes via the `size` prop. */

function I({
  size = 16,
  children,
  filled = false,
}: {
  size?: number
  children: React.ReactNode
  filled?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconMic = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </I>
)

export const IconSend = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </I>
)

export const IconKeyboard = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
  </I>
)

export const IconArrowLeft = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </I>
)

export const IconArrowUpRight = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M7 17 17 7" />
    <path d="M7 7h10v10" />
  </I>
)

export const IconSearch = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </I>
)

export const IconPlay = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="m6 4 14 8-14 8V4z" />
  </I>
)

export const IconSun = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </I>
)

export const IconMoon = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </I>
)

export const IconX = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </I>
)

export const IconCheck = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M20 6 9 17l-5-5" />
  </I>
)

export const IconRotateCcw = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </I>
)

export const IconDownload = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </I>
)

export const IconFileText = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </I>
)

export const IconVideo = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="m22 8-6 4 6 4V8Z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </I>
)

export const IconFlame = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </I>
)

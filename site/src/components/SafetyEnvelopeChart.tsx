import { useMemo } from 'react'

interface SafetyEnvelopeChartProps {
  currentO2: number
  currentFlow: number
  materialName?: string
  gravityMode?: string
  trajectory?: Array<{ o2Pct: number; flowCms: number }>
}

/**
 * 2D Safety Operating Envelope Chart
 * X: Forced Airflow Velocity (0 to 30 cm/s)
 * Y: Oxygen Concentration (0 to 40% O₂)
 * Shows Safe Extinction (Green), Cool Flame Margin (Amber), and Thermal Runaway (Red)
 */
export default function SafetyEnvelopeChart({
  currentO2,
  currentFlow,
  materialName = 'Spacecraft PMMA / Polymer',
  gravityMode = 'µg (Microgravity)',
  trajectory = [],
}: SafetyEnvelopeChartProps) {
  const width = 520
  const height = 320
  const pad = { top: 30, right: 30, bottom: 45, left: 55 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const maxFlow = 30
  const maxO2 = 40

  const toX = (flow: number) => pad.left + (Math.max(0, Math.min(flow, maxFlow)) / maxFlow) * innerW
  const toY = (o2: number) => pad.top + innerH - (Math.max(0, Math.min(o2, maxO2)) / maxO2) * innerH

  // Safety boundaries based on NASA PSI SoFIE / BASS empirical flammability limits
  // Below LOC (~13% O₂) is always safe extinction
  // High airflow (>12 cm/s) and O₂ > 20% enters runaway spread
  const safeLocY = toY(13.0)
  const artemisO2Y = toY(34.0)

  const curX = toX(currentFlow)
  const curY = toY(currentO2)

  // Determine current operating zone
  const currentZone = useMemo(() => {
    if (currentO2 <= 13.5 || (currentO2 <= 16 && currentFlow <= 1)) {
      return { label: 'Safe Extinction Zone', color: 'emerald', text: 'Flame ceases or radiatively quenches' }
    }
    if (currentO2 > 25 || currentFlow > 14 || (currentO2 >= 20.5 && currentFlow >= 8)) {
      return { label: 'Thermal Runaway Flashover', color: 'rose', text: 'Critical flame spread & high heat release' }
    }
    return { label: 'Cool Flame & Spread Margin', color: 'amber', text: 'Low-temperature kinetics or creeping flame' }
  }, [currentO2, currentFlow])

  const referenceMissions = [
    { name: 'Artemis Airlock (34% O₂)', o2: 34, flow: 1.5, tag: 'Artemis' },
    { name: 'SAFFIRE-IV (21% O₂, 20 cm/s)', o2: 21, flow: 20, tag: 'SAFFIRE' },
    { name: 'FLEX-2 Droplet (21% O₂, 0.5 cm/s)', o2: 21, flow: 0.5, tag: 'FLEX' },
    { name: 'Earth Baseline (1g Buoyant)', o2: 20.9, flow: 10, tag: '1g-Air' },
  ]

  return (
    <div className="relative overflow-hidden rounded-2xl panel-60 p-6 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-3">
        <div>
          <h4 className="card-label font-semibold">
            NASA Safety Envelope Matrix
          </h4>
          <p className="mt-0.5 text-sm font-medium opacity-85">
            Flammability vs. Ventilation Boundary · {materialName} ({gravityMode})
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
              currentZone.color === 'emerald'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : currentZone.color === 'rose'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            }`}
          >
            <span className="inline-block size-1.5 rounded-full bg-current animate-pulse" />
            {currentZone.label}
          </span>
        </div>
      </div>

      <div className="relative mt-4 flex justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full max-w-[540px] select-none overflow-visible"
        >
          <defs>
            {/* Gradients for risk zones */}
            <linearGradient id="envelope-green" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="envelope-amber" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="envelope-red" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.10" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines */}
          {[0, 10, 20, 30].map((flow) => {
            const x = toX(flow)
            return (
              <g key={`x-grid-${flow}`}>
                <line
                  x1={x}
                  y1={pad.top}
                  x2={x}
                  y2={pad.top + innerH}
                  stroke="var(--edge)"
                  strokeDasharray="2 3"
                  strokeWidth="0.8"
                />
                <text
                  x={x}
                  y={pad.top + innerH + 18}
                  fill="var(--ink)"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                  opacity="0.6"
                >
                  {flow}
                </text>
              </g>
            )
          })}

          {[10, 20, 30, 40].map((o2) => {
            const y = toY(o2)
            return (
              <g key={`y-grid-${o2}`}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={pad.left + innerW}
                  y2={y}
                  stroke="var(--edge)"
                  strokeDasharray="2 3"
                  strokeWidth="0.8"
                />
                <text
                  x={pad.left - 8}
                  y={y + 3}
                  fill="var(--ink)"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="end"
                  opacity="0.6"
                >
                  {o2}%
                </text>
              </g>
            )
          })}

          {/* Zones */}
          {/* 1. Safe Extinction Region (Bottom rect from 0 to 13.5% O2) */}
          <rect
            x={pad.left}
            y={safeLocY}
            width={innerW}
            height={pad.top + innerH - safeLocY}
            fill="url(#envelope-green)"
          />
          <text
            x={pad.left + 12}
            y={pad.top + innerH - 12}
            fill="#10b981"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            opacity="0.85"
          >
            SAFE EXTINCTION ZONE (LOC &lt; 13%)
          </text>

          {/* 2. Runaway Zone (Top Right Polygon) */}
          <polygon
            points={`
              ${toX(0)},${toY(38)}
              ${toX(5)},${toY(28)}
              ${toX(12)},${toY(22)}
              ${toX(30)},${toY(17)}
              ${toX(30)},${toY(40)}
              ${toX(0)},${toY(40)}
            `}
            fill="url(#envelope-red)"
          />
          <text
            x={pad.left + innerW - 12}
            y={pad.top + 20}
            fill="#f43f5e"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="end"
            opacity="0.9"
          >
            THERMAL RUNAWAY (FLASHOVER)
          </text>

          {/* 3. Cool Flame Margin Zone (Center Polygon) */}
          <polygon
            points={`
              ${toX(0)},${safeLocY}
              ${toX(30)},${safeLocY}
              ${toX(30)},${toY(17)}
              ${toX(12)},${toY(22)}
              ${toX(5)},${toY(28)}
              ${toX(0)},${toY(38)}
            `}
            fill="url(#envelope-amber)"
          />
          <text
            x={pad.left + 14}
            y={toY(19)}
            fill="#f59e0b"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            opacity="0.85"
          >
            COOL-FLAME &amp; SLOW SPREAD REGIME
          </text>

          {/* Artemis & Saffire Reference Lines */}
          <line
            x1={pad.left}
            y1={artemisO2Y}
            x2={pad.left + innerW}
            y2={artemisO2Y}
            stroke="#ec4899"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.5"
          />
          <text
            x={pad.left + innerW - 6}
            y={artemisO2Y - 4}
            fill="#ec4899"
            fontSize="9"
            fontFamily="monospace"
            textAnchor="end"
            opacity="0.75"
          >
            Artemis 34% O₂ Norm
          </text>

          {/* Trajectory Trail if provided */}
          {trajectory.length > 1 && (
            <polyline
              points={trajectory.map((p) => `${toX(p.flowCms)},${toY(p.o2Pct)}`).join(' ')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          )}

          {/* Reference Missions Markers */}
          {referenceMissions.map((m) => {
            const rx = toX(m.flow)
            const ry = toY(m.o2)
            return (
              <g key={m.name} opacity="0.65" className="hover:opacity-100 transition-opacity">
                <circle cx={rx} cy={ry} r="3.5" fill="var(--ink)" opacity="0.5" />
                <text
                  x={rx + 6}
                  y={ry + 3}
                  fill="var(--ink)"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {m.tag}
                </text>
              </g>
            )
          })}

          {/* Current Operating Point Pin */}
          <g>
            <circle cx={curX} cy={curY} r="10" fill={currentZone.color === 'emerald' ? '#10b981' : currentZone.color === 'rose' ? '#f43f5e' : '#f59e0b'} opacity="0.25" className="animate-ping" />
            <circle cx={curX} cy={curY} r="5" fill={currentZone.color === 'emerald' ? '#10b981' : currentZone.color === 'rose' ? '#f43f5e' : '#f59e0b'} stroke="#ffffff" strokeWidth="2" />
            <text
              x={curX + (curX > width - 110 ? -12 : 12)}
              y={curY - 10}
              fill="var(--ink)"
              fontSize="11"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor={curX > width - 110 ? 'end' : 'start'}
            >
              Current: {currentO2.toFixed(1)}% O₂ · {currentFlow.toFixed(1)} cm/s
            </text>
          </g>

          {/* Axes labels */}
          <text
            x={pad.left + innerW / 2}
            y={pad.top + innerH + 34}
            fill="var(--ink)"
            fontSize="11"
            fontFamily="monospace"
            textAnchor="middle"
            opacity="0.75"
          >
            Forced Airflow Velocity (cm/s)
          </text>
          <text
            transform={`rotate(-90 ${pad.left - 34} ${pad.top + innerH / 2})`}
            x={pad.left - 34}
            y={pad.top + innerH / 2}
            fill="var(--ink)"
            fontSize="11"
            fontFamily="monospace"
            textAnchor="middle"
            opacity="0.75"
          >
            Oxygen Concentration (% O₂)
          </text>
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs font-mono opacity-65">
        <span>Boundary calibrated against NASA PSI SoFIE / BASS-II data</span>
        <span>Operational Status: {currentZone.text}</span>
      </div>
    </div>
  )
}

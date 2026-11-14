import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RankedInvestigation } from '../types'

const tooltipStyle = {
  background: '#111626',
  border: '1px solid #1f2739',
  borderRadius: 8,
  fontSize: 12,
  color: '#e2e8f0',
}

const CABIN_O2 = 21

export default function ChartsPanel({ ranked }: { ranked: RankedInvestigation[] }) {
  const locData = ranked
    .map((r) => ({
      name: r.inv.name,
      loc: r.inv.metrics.limitingOxygenPct,
    }))
    .filter((d) => d.loc !== null) as { name: string; loc: number }[]

  const scoreData = ranked.map((r) => ({
    name: r.inv.name,
    flammability: Math.round(r.score.flammability),
    hiddenHazard: Math.round(r.score.hiddenHazard),
    relevance: Math.round(r.score.relevance),
    dataRichness: Math.round(r.score.dataRichness),
  }))

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-edge bg-panel p-5">
        <h3 className="text-sm font-semibold text-white">
          Limiting oxygen concentration (LOC)
        </h3>
        <p className="mt-1 text-xs text-mist">
          Lowest O₂ at which each fuel keeps burning — below cabin air (~{CABIN_O2}%) is a red flag.
        </p>
        <div className="mt-4 h-64">
          {locData.length === 0 ? (
            <p className="text-sm text-mist">No LOC data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={locData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid stroke="#1f2739" horizontal={false} />
                <XAxis type="number" domain={[0, 45]} stroke="#8b94a7" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  stroke="#8b94a7"
                  fontSize={11}
                  tick={{ fill: '#8b94a7' }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <ReferenceLine
                  x={CABIN_O2}
                  stroke="#67e8f9"
                  strokeDasharray="4 4"
                  label={{ value: 'cabin 21% O₂', position: 'top', fill: '#67e8f9', fontSize: 10 }}
                />
                <Bar dataKey="loc" fill="#ff6b35" radius={[0, 4, 4, 0]} name="LOC % O₂" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-panel p-5">
        <h3 className="text-sm font-semibold text-white">
          What drives the risk ranking?
        </h3>
        <p className="mt-1 text-xs text-mist">
          Score composition per investigation (max: flammability 40 · hidden hazard 25 · relevance 20 · data 15).
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scoreData} layout="vertical" margin={{ left: 8, right: 24 }} stackOffset="none">
              <CartesianGrid stroke="#1f2739" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="#8b94a7" fontSize={11} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                stroke="#8b94a7"
                fontSize={11}
                tick={{ fill: '#8b94a7' }}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="flammability" stackId="a" fill="#ff6b35" name="Flammability" />
              <Bar dataKey="hiddenHazard" stackId="a" fill="#ffb347" name="Hidden hazard" />
              <Bar dataKey="relevance" stackId="a" fill="#67e8f9" name="Exploration relevance" />
              <Bar dataKey="dataRichness" stackId="a" fill="#8b94a7" name="Data richness" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}

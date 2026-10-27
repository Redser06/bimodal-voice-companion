import React from 'react';
import {
  BarChart3,
  EyeOff,
  Filter,
  Layers,
  LineChart,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { calculateDataMetrics } from '../engine/voiceController';
import type { CanvasState, ChartType, MetricFocus, PeriodFilter } from '../types/bimodal';

interface DataAnalyticsCanvasProps {
  canvas: CanvasState;
  onVoiceCommand: (utterance: string) => void;
}

export const DataAnalyticsCanvas: React.FC<DataAnalyticsCanvasProps> = ({
  canvas,
  onVoiceCommand,
}) => {
  const spec = canvas.dataSpec;
  if (!spec) return null;

  const metrics = calculateDataMetrics(spec.series, spec.excludedSeries, spec.activePeriod);
  const excludedSet = new Set(spec.excludedSeries.map((s) => s.toLowerCase()));

  const getSeriesPeriodValue = (item: (typeof spec.series)[number]) => {
    const rev =
      spec.activePeriod === 'Q1'
        ? item.q1
        : spec.activePeriod === 'Q2'
          ? item.q2
          : spec.activePeriod === 'Q3'
            ? item.q3
            : spec.activePeriod === 'Q4'
              ? item.q4
              : item.revenue;
    const margin =
      spec.activePeriod === 'Q1'
        ? item.q1MarginPct
        : spec.activePeriod === 'Q2'
          ? item.q2MarginPct
          : spec.activePeriod === 'Q3'
            ? item.q3MarginPct
            : spec.activePeriod === 'Q4'
              ? item.q4MarginPct
              : item.marginPct;

    if (spec.metricFocus === 'revenue') return { val: rev, unit: '€k', max: 180 };
    if (spec.metricFocus === 'units') {
      const scaledUnits = spec.activePeriod === 'ALL' ? item.units : Math.round(item.units * 0.27);
      return { val: scaledUnits, unit: 'u', max: 3600 };
    }
    return { val: margin, unit: '%', max: 70 };
  };

  const chartTypes: Array<{ id: ChartType; label: string; command: string }> = [
    { id: 'bar', label: 'Bar Matrix', command: 'Show me this as a bar chart' },
    { id: 'waterfall', label: 'Profit Bridge', command: 'Show me this as a waterfall chart' },
    { id: 'line', label: 'Q1–Q4 Trajectory', command: 'Show me this as a line chart' },
    { id: 'stacked_bar', label: 'Cost vs Profit Stack', command: 'Show me this as a stacked bar chart' },
  ];

  const periods: PeriodFilter[] = ['ALL', 'Q1', 'Q2', 'Q3', 'Q4'];
  const metricButtons: Array<{ id: MetricFocus; label: string; cmd: string }> = [
    { id: 'net_margin_pct', label: 'Net Margin %', cmd: 'Focus on net margin' },
    { id: 'revenue', label: 'Revenue (€k)', cmd: 'Focus on revenue' },
    { id: 'units', label: 'Unit Volume', cmd: 'Focus on unit volume' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Top Executive KPI Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
            Blended Net Margin ({spec.activePeriod === 'ALL' ? 'FY 2026' : spec.activePeriod})
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-3xl font-bold tracking-tight text-[#1C1917] font-mono">
              {metrics.blendedMarginPct}%
            </span>
            {metrics.marginDeltaPct !== 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  metrics.marginDeltaPct > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                {metrics.marginDeltaPct > 0 ? `+${metrics.marginDeltaPct}%` : `${metrics.marginDeltaPct}%`} vs
                baseline ({metrics.baselineMarginPct}%)
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-[#78716C]">
            {spec.excludedSeries.length > 0
              ? `Excluding: ${spec.excludedSeries.join(', ')}`
              : 'All 5 product categories included'}
          </div>
        </div>

        <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
            Active Revenue & Profit
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#1C1917] font-mono">
              €{metrics.totalRevenueK}k
            </span>
            <span className="text-sm font-medium text-[#0F766E] font-mono">
              (€{metrics.totalProfitK}k net)
            </span>
          </div>
          <div className="mt-1 text-xs text-[#78716C]">
            {metrics.activeSeries.length} of {spec.series.length} series active in view
          </div>
        </div>

        <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
              Voice Filter Controls
            </span>
            {spec.excludedSeries.length > 0 && (
              <button
                type="button"
                onClick={() => onVoiceCommand('Restore all series')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#C2410C] hover:underline cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                Restore all
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {spec.series.map((item) => {
              const isExcluded = excludedSet.has(item.name.toLowerCase());
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() =>
                    onVoiceCommand(
                      isExcluded
                        ? `Restore ${item.name} to the analysis`
                        : `Remove sales of ${item.name} from the analysis`
                    )
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                    isExcluded
                      ? 'border-dashed border-[#C8C2B7] bg-[#F5F3EF] text-[#A8A29E] line-through'
                      : 'border-[#E2DDD5] bg-white text-[#1C1917] hover:border-[#C2410C]'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: isExcluded ? '#A8A29E' : item.color }}
                  />
                  {item.name}
                  {isExcluded && <EyeOff className="h-3 w-3 text-[#A8A29E]" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Chart Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2DDD5] bg-[#F5F3EF] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-[#78716C] flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" /> Graph Type:
          </span>
          {chartTypes.map((ct) => (
            <button
              key={ct.id}
              type="button"
              onClick={() => onVoiceCommand(ct.command)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                spec.chartType === ct.id
                  ? 'bg-[#1C1917] text-white'
                  : 'bg-white text-[#1C1917] border border-[#E2DDD5] hover:border-[#1C1917]'
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-[#E2DDD5]">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  onVoiceCommand(p === 'ALL' ? 'Show full year all quarters' : `Zoom in on ${p}`)
                }
                className={`rounded-md px-2 py-0.5 text-xs font-mono font-semibold transition cursor-pointer ${
                  spec.activePeriod === p
                    ? 'bg-[#C2410C] text-white'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-[#E2DDD5]">
            {metricButtons.map((mb) => (
              <button
                key={mb.id}
                type="button"
                onClick={() => onVoiceCommand(mb.cmd)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition cursor-pointer ${
                  spec.metricFocus === mb.id
                    ? 'bg-[#1C1917] text-white'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                {mb.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Dynamic SVG Visualization Stage */}
      <div className="rounded-xl border border-[#E2DDD5] bg-white p-5">
        {spec.chartType === 'bar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#78716C]">
              <span>
                Showing <strong>{spec.metricFocus.replace(/_/g, ' ')}</strong> across product lines (
                {spec.activePeriod})
              </span>
              <span className="font-mono">
                Voice tip: &ldquo;Remove sales of golf balls from the analysis&rdquo;
              </span>
            </div>
            <div className="grid grid-cols-5 gap-4 items-end h-64 pt-8 pb-2 px-2 border-b-2 border-[#1C1917]">
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                const { val, unit, max } = getSeriesPeriodValue(item);
                const heightPct = Math.max(12, Math.min(100, Math.round((val / max) * 100)));
                return (
                  <div
                    key={item.name}
                    onClick={() =>
                      onVoiceCommand(
                        isExcluded
                          ? `Restore ${item.name}`
                          : `Remove sales of ${item.name} from the analysis`
                      )
                    }
                    className="flex flex-col items-center justify-end h-full group cursor-pointer"
                  >
                    <div
                      className={`mb-1.5 font-mono text-xs font-bold ${
                        isExcluded ? 'text-[#A8A29E] line-through' : 'text-[#1C1917]'
                      }`}
                    >
                      {val}
                      {unit}
                    </div>
                    <div
                      className="w-full max-w-[92px] rounded-t-lg transition-all duration-300 relative"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: isExcluded ? '#F5F3EF' : item.color,
                        border: isExcluded ? '2px dashed #C8C2B7' : 'none',
                      }}
                    >
                      {isExcluded && (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono uppercase text-[#78716C] rotate-[-12deg]">
                          Excluded
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-5 gap-4 text-center">
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                const rev =
                  spec.activePeriod === 'Q1'
                    ? item.q1
                    : spec.activePeriod === 'Q2'
                      ? item.q2
                      : spec.activePeriod === 'Q3'
                        ? item.q3
                        : spec.activePeriod === 'Q4'
                          ? item.q4
                          : item.revenue;
                return (
                  <div key={item.name} className={isExcluded ? 'opacity-45' : ''}>
                    <div className="text-xs font-bold text-[#1C1917]">{item.name}</div>
                    <div className="text-[11px] text-[#78716C] font-mono">
                      €{rev}k rev • {item.marginPct}% margin
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {spec.chartType === 'stacked_bar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#78716C]">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#C2410C]" />
                <strong>Stacked Revenue Split: Net Profit vs COGS Cost (€k)</strong>
              </span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#0F766E]" /> Net Profit (€k)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#E2DDD5]" /> Direct Cost / COGS (€k)
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                const rev =
                  spec.activePeriod === 'Q1'
                    ? item.q1
                    : spec.activePeriod === 'Q2'
                      ? item.q2
                      : spec.activePeriod === 'Q3'
                        ? item.q3
                        : spec.activePeriod === 'Q4'
                          ? item.q4
                          : item.revenue;
                const margin =
                  spec.activePeriod === 'Q3' ? item.q3MarginPct : item.marginPct;
                const profitK = Number(((rev * margin) / 100).toFixed(1));
                const costK = Number((rev - profitK).toFixed(1));
                const maxRev = spec.activePeriod === 'ALL' ? 170 : 55;
                const totalWidthPct = Math.min(100, Math.round((rev / maxRev) * 100));
                const profitSharePct = Math.round((profitK / rev) * 100);

                return (
                  <div
                    key={item.name}
                    className={`rounded-lg border p-3 transition ${
                      isExcluded ? 'border-dashed border-[#E2DDD5] opacity-40' : 'border-[#E2DDD5]'
                    }`}
                  >
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span>
                        {item.name}{' '}
                        <span className="font-normal text-[#78716C]">({item.category})</span>
                      </span>
                      <span className="font-mono">
                        €{profitK}k Profit / €{costK}k Cost ({margin}% Margin)
                      </span>
                    </div>
                    <div
                      className="h-6 rounded-md overflow-hidden flex bg-[#F5F3EF]"
                      style={{ width: `${totalWidthPct}%` }}
                    >
                      <div
                        className="h-full bg-[#0F766E] transition-all duration-300"
                        style={{ width: `${profitSharePct}%` }}
                        title={`Net Profit: €${profitK}k`}
                      />
                      <div
                        className="h-full bg-[#D6D1C7] transition-all duration-300"
                        style={{ width: `${100 - profitSharePct}%` }}
                        title={`COGS: €${costK}k`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {spec.chartType === 'line' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#78716C]">
              <span className="flex items-center gap-1.5">
                <LineChart className="h-3.5 w-3.5 text-[#1D4ED8]" />
                <strong>Quarterly Margin % & Revenue Trajectory (Q1 → Q4)</strong>
              </span>
              <span className="font-mono">Active series: {metrics.activeSeries.length}</span>
            </div>
            <svg viewBox="0 0 680 230" className="w-full h-60 overflow-visible">
              {/* Grid lines */}
              {[15, 30, 45, 60].map((pct) => {
                const y = 200 - (pct / 70) * 170;
                return (
                  <g key={pct}>
                    <line
                      x1={50}
                      y1={y}
                      x2={640}
                      y2={y}
                      stroke="#E2DDD5"
                      strokeDasharray="4 4"
                    />
                    <text x={12} y={y + 4} fontSize={11} fill="#78716C" fontFamily="monospace">
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {/* Quarter X Axis */}
              {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q, idx) => {
                const x = 110 + idx * 165;
                const isSelected = spec.activePeriod === q;
                return (
                  <g key={q}>
                    {isSelected && (
                      <rect
                        x={x - 36}
                        y={16}
                        width={72}
                        height={190}
                        rx={8}
                        fill="#FFEDD5"
                        opacity={0.55}
                      />
                    )}
                    <text
                      x={x}
                      y={222}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      fill={isSelected ? '#C2410C' : '#1C1917'}
                      fontFamily="monospace"
                    >
                      {q}
                    </text>
                  </g>
                );
              })}

              {/* Lines for each series */}
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                if (isExcluded) return null;
                const pts = [
                  item.q1MarginPct,
                  item.q2MarginPct,
                  item.q3MarginPct,
                  item.q4MarginPct,
                ].map((val, idx) => {
                  const x = 110 + idx * 165;
                  const y = 200 - (val / 70) * 170;
                  return { x, y, val };
                });
                const polylinePoints = pts.map((p) => `${p.x},${p.y}`).join(' ');
                return (
                  <g key={item.name}>
                    <polyline
                      fill="none"
                      stroke={item.color}
                      strokeWidth={3}
                      points={polylinePoints}
                    />
                    {pts.map((p, idx) => (
                      <g key={idx}>
                        <circle cx={p.x} cy={p.y} r={4.5} fill={item.color} />
                        {idx === 2 && (
                          <text
                            x={p.x + 8}
                            y={p.y - 6}
                            fontSize={10}
                            fontWeight="bold"
                            fill={item.color}
                          >
                            {item.name} ({p.val}%)
                          </text>
                        )}
                      </g>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {spec.chartType === 'waterfall' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#78716C]">
              <span>
                <strong>Net Profit Contribution Waterfall ({spec.activePeriod})</strong> — Cumulative
                €{metrics.totalProfitK}k Net Profit
              </span>
              <span className="font-mono text-[#0F766E] font-semibold">
                Blended Margin: {metrics.blendedMarginPct}%
              </span>
            </div>
            <div className="space-y-2.5 pt-2">
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                const rev =
                  spec.activePeriod === 'Q3' ? item.q3 : item.revenue;
                const margin =
                  spec.activePeriod === 'Q3' ? item.q3MarginPct : item.marginPct;
                const profitK = Number(((rev * margin) / 100).toFixed(1));
                const barWidth = Math.min(100, Math.max(8, Math.round((profitK / 75) * 100)));

                return (
                  <div
                    key={item.name}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      isExcluded ? 'border-dashed border-[#E2DDD5] opacity-40' : 'border-[#E2DDD5]'
                    }`}
                  >
                    <div className="w-44 text-xs font-semibold text-[#1C1917] truncate">
                      {item.name}
                    </div>
                    <div className="flex-1 bg-[#F5F3EF] h-5 rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all duration-300"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: isExcluded ? '#A8A29E' : item.color,
                        }}
                      />
                    </div>
                    <div className="w-32 text-right font-mono text-xs font-bold text-[#1C1917]">
                      +€{profitK}k ({margin}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Cited Reference Files & Fast Voice Prompt Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ECE8E1] bg-[#FAF9F6] px-4 py-2.5 text-xs text-[#78716C]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#1C1917] flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-[#C2410C]" /> Cited References:
          </span>
          {spec.citations.map((cite) => (
            <code
              key={cite}
              className="rounded bg-white px-2 py-0.5 font-mono text-[11px] border border-[#E2DDD5] text-[#1C1917]"
            >
              {cite}
            </code>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-[#C2410C]" />
          <span>Active Schema Injected into Gemini 3.8 Flash</span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
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
  const [showSvgCharts, setShowSvgCharts] = useState(false);
  const spec = canvas.dataSpec;
  if (!spec) return null;

  const metrics = calculateDataMetrics(spec.series, spec.excludedSeries, spec.activePeriod);
  const excludedSet = new Set(spec.excludedSeries.map((s) => s.toLowerCase()));
  const golfBallsExcluded = excludedSet.has('golf balls');

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
      {/* Top 3-KPI Bento Strip (Matches Argon Redesign) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Card 1: Blended Net Margin */}
        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/25 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-sm font-label-sm text-outline uppercase tracking-wider">
              Blended Net Margin ({spec.activePeriod === 'ALL' ? 'FY26' : spec.activePeriod})
            </span>
            <span className="material-symbols-outlined text-tertiary text-[18px]">trending_up</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl text-on-surface">
                {metrics.blendedMarginPct}%
              </span>
              {metrics.marginDeltaPct !== 0 ? (
                <span className="text-label-sm font-label-sm text-tertiary bg-tertiary-container/20 px-1.5 py-0.5 rounded">
                  {metrics.marginDeltaPct > 0
                    ? `+${metrics.marginDeltaPct}%`
                    : `${metrics.marginDeltaPct}%`}{' '}
                  vs {metrics.baselineMarginPct}%
                </span>
              ) : (
                <span className="text-label-sm font-label-sm text-tertiary bg-tertiary-container/20 px-1.5 py-0.5 rounded">
                  +2.4% YoY
                </span>
              )}
            </div>
            <p className="text-body-sm text-on-surface-variant mt-1">
              {golfBallsExcluded
                ? 'Consumables stripped (+13.2% lift)'
                : 'Excl. Consumables: 51.6% (+13.2%)'}
            </p>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full mt-3 overflow-hidden flex">
            <div
              className="bg-secondary h-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round(metrics.blendedMarginPct))}%` }}
            />
            {!golfBallsExcluded && (
              <div
                className="bg-tertiary/50 h-full border-l border-surface-container"
                style={{ width: '13.2%' }}
                title="Projected Excl. Golf Balls"
              />
            )}
          </div>
        </div>

        {/* Card 2: Total Revenue */}
        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/25 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-sm font-label-sm text-outline uppercase tracking-wider">
              Total Revenue
            </span>
            <span className="material-symbols-outlined text-secondary text-[18px]">payments</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl text-on-surface">
                €{metrics.totalRevenueK}k
              </span>
              <span className="text-label-sm font-label-sm text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded">
                {spec.activePeriod === 'ALL' ? 'FY26 YTD' : `${spec.activePeriod} Active`}
              </span>
            </div>
            <p className="text-body-sm text-on-surface-variant mt-1">
              across {metrics.activeSeries.length} of {spec.series.length} active product lines
            </p>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full mt-3 overflow-hidden">
            <div
              className="bg-primary-container h-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round((metrics.totalRevenueK / 635) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Card 3: Net Profit */}
        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/25 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-sm font-label-sm text-outline uppercase tracking-wider">
              Net Profit
            </span>
            <span className="material-symbols-outlined text-primary text-[18px]">
              account_balance_wallet
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl text-tertiary">
                €{metrics.totalProfitK}k
              </span>
              <span className="text-label-sm font-label-sm text-on-surface-variant">EBITDA</span>
            </div>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Top Contributor: Custom Putters (62%)
            </p>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full mt-3 overflow-hidden">
            <div
              className="bg-tertiary h-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round((metrics.totalProfitK / 260) * 100))}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Voice-Controllable Category Filter Pills & View Switcher */}
      <div className="bg-surface-container-lowest/60 rounded-xl p-3 border border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-label-sm font-label-sm text-outline uppercase tracking-wider mr-1">
            Voice Slicers:
          </span>
          <button
            type="button"
            onClick={() => onVoiceCommand('Restore all series')}
            className={`px-2.5 py-1 rounded text-label-sm font-label-sm transition cursor-pointer ${
              spec.excludedSeries.length === 0
                ? 'bg-secondary/15 text-secondary border border-secondary/30'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
            }`}
          >
            All Categories ({spec.series.length})
          </button>
          {spec.series.map((item) => {
            const isExcluded = excludedSet.has(item.name.toLowerCase());
            const isGolfBalls = item.name.toLowerCase() === 'golf balls';
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
                className={`px-2.5 py-1 rounded text-label-sm font-label-sm flex items-center gap-1 transition cursor-pointer ${
                  isExcluded
                    ? 'bg-surface-container-lowest text-outline line-through border border-dashed border-outline-variant/40'
                    : isGolfBalls
                      ? 'bg-error-container/25 text-error border border-error/30 hover:bg-error-container/40'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">
                  {isExcluded ? 'visibility_off' : isGolfBalls ? 'filter_alt_off' : 'check_circle'}
                </span>
                {isGolfBalls && !isExcluded ? 'Excl. Golf Balls' : item.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                onVoiceCommand(p === 'ALL' ? 'Show full year all quarters' : `Zoom in on ${p}`)
              }
              className={`px-2 py-0.5 rounded text-telemetry-code font-telemetry-code transition cursor-pointer ${
                spec.activePeriod === p
                  ? 'bg-primary-container text-surface-container-lowest font-semibold'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowSvgCharts((v) => !v)}
            className="ml-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-label-sm font-label-sm text-secondary border border-secondary/30 flex items-center gap-1 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-[13px]">
              {showSvgCharts ? 'view_list' : 'bar_chart'}
            </span>
            {showSvgCharts ? 'Margin Matrix' : 'SVG Charts'}
          </button>
        </div>
      </div>

      {/* Category Performance Breakdown Progress Matrix (Default Argon View) */}
      {!showSvgCharts ? (
        <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/25 flex-1 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-body-md font-semibold text-on-surface">
                Category Performance Breakdown ({spec.activePeriod === 'ALL' ? 'FY 2026' : spec.activePeriod})
              </h3>
              <p className="text-body-sm text-on-surface-variant">
                Voice-annotated margin distribution by hardware vs. consumable line
              </p>
            </div>
            <div className="flex items-center gap-3 text-label-sm font-label-sm">
              <span className="flex items-center gap-1.5 text-tertiary">
                <span className="w-2.5 h-2.5 rounded-sm bg-tertiary"></span> High Margin (&gt;45%)
              </span>
              <span className="flex items-center gap-1.5 text-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-secondary"></span> Core (30-45%)
              </span>
              <span className="flex items-center gap-1.5 text-error">
                <span className="w-2.5 h-2.5 rounded-sm bg-error"></span> Drag (&lt;20%)
              </span>
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
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
                spec.activePeriod === 'Q1'
                  ? item.q1MarginPct
                  : spec.activePeriod === 'Q2'
                    ? item.q2MarginPct
                    : spec.activePeriod === 'Q3'
                      ? item.q3MarginPct
                      : spec.activePeriod === 'Q4'
                        ? item.q4MarginPct
                        : item.marginPct;
              const profitK = Number(((rev * margin) / 100).toFixed(1));
              const isDrag = margin < 20;
              const isHigh = margin >= 45;

              if (isDrag) {
                return (
                  <div
                    key={item.name}
                    onClick={() =>
                      onVoiceCommand(
                        isExcluded
                          ? `Restore ${item.name} to the analysis`
                          : `Remove sales of ${item.name} from the analysis`
                      )
                    }
                    className={`p-3 rounded-lg transition cursor-pointer ${
                      isExcluded
                        ? 'bg-surface-container-lowest/50 border border-dashed border-outline-variant/40 opacity-50'
                        : 'bg-error-container/15 border border-error/40'
                    }`}
                  >
                    <div className="flex justify-between items-center text-body-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-error text-[16px]">
                          {isExcluded ? 'visibility_off' : 'warning'}
                        </span>
                        <span
                          className={`font-semibold text-on-surface ${
                            isExcluded ? 'line-through' : ''
                          }`}
                        >
                          {item.name} (High Drag Consumable)
                        </span>
                        <span className="text-label-sm font-label-sm px-1.5 py-0.5 rounded bg-error-container/50 text-on-error-container">
                          {isExcluded ? 'STRIPPED VIA VOICE' : 'VOICE FLAGGED'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 font-telemetry-code text-telemetry-code">
                        <span className="text-on-surface-variant">
                          Rev: €{rev}k · Profit: €{profitK}k
                        </span>
                        <span className="text-error font-bold w-14 text-right">
                          {margin}% Margin
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        className="bg-error h-full rounded-full transition-all duration-500"
                        style={{ width: isExcluded ? '0%' : `${margin}%` }}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.name}
                  onClick={() =>
                    onVoiceCommand(
                      isExcluded
                        ? `Restore ${item.name} to the analysis`
                        : `Remove sales of ${item.name} from the analysis`
                    )
                  }
                  className={`space-y-1.5 cursor-pointer transition ${
                    isExcluded ? 'opacity-40 line-through' : ''
                  }`}
                >
                  <div className="flex justify-between items-center text-body-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-on-surface">{item.name}</span>
                      <span className="text-label-sm font-label-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                        {item.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-telemetry-code text-telemetry-code">
                      <span className="text-on-surface-variant">
                        Rev: €{rev}k · Profit: €{profitK}k
                      </span>
                      <span
                        className={`font-semibold w-14 text-right ${
                          isHigh ? 'text-tertiary' : 'text-secondary'
                        }`}
                      >
                        {margin}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isHigh ? 'bg-tertiary' : 'bg-secondary'
                      }`}
                      style={{ width: isExcluded ? '0%' : `${margin}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Interactive SVG Chart Stage (Bar, Waterfall, Line, Cost vs Profit Stack) */
        <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/25 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
            <div className="flex flex-wrap items-center gap-1.5">
              {chartTypes.map((ct) => (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => onVoiceCommand(ct.command)}
                  className={`px-2.5 py-1 rounded-lg text-label-sm font-label-sm transition cursor-pointer ${
                    spec.chartType === ct.id
                      ? 'bg-primary-container text-surface-container-lowest font-bold'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-outline-variant/25'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {metricButtons.map((mb) => (
                <button
                  key={mb.id}
                  type="button"
                  onClick={() => onVoiceCommand(mb.cmd)}
                  className={`px-2 py-0.5 rounded text-telemetry-code font-telemetry-code transition cursor-pointer ${
                    spec.metricFocus === mb.id
                      ? 'bg-secondary/20 text-secondary border border-secondary/40'
                      : 'text-outline hover:text-on-surface'
                  }`}
                >
                  {mb.label}
                </button>
              ))}
            </div>
          </div>

          {spec.chartType === 'bar' && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-4 items-end h-56 pt-6 pb-2 px-2 border-b border-outline-variant/40">
                {spec.series.map((item) => {
                  const isExcluded = excludedSet.has(item.name.toLowerCase());
                  const { val, unit, max } = getSeriesPeriodValue(item);
                  const heightPct = Math.max(12, Math.min(100, Math.round((val / max) * 100)));
                  const isDrag = item.marginPct < 20;
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
                        className={`mb-1.5 font-telemetry-code text-telemetry-code font-bold ${
                          isExcluded
                            ? 'text-outline line-through'
                            : isDrag
                              ? 'text-error'
                              : 'text-on-surface'
                        }`}
                      >
                        {val}
                        {unit}
                      </div>
                      <div
                        className={`w-full max-w-[84px] rounded-t-lg transition-all duration-300 relative ${
                          isExcluded
                            ? 'bg-surface-container-lowest border border-dashed border-outline-variant/50'
                            : isDrag
                              ? 'bg-error/80'
                              : item.marginPct >= 45
                                ? 'bg-tertiary'
                                : 'bg-secondary'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-5 gap-4 text-center">
                {spec.series.map((item) => {
                  const isExcluded = excludedSet.has(item.name.toLowerCase());
                  return (
                    <div key={item.name} className={isExcluded ? 'opacity-40' : ''}>
                      <div className="text-body-sm font-semibold text-on-surface truncate">
                        {item.name}
                      </div>
                      <div className="text-telemetry-code font-telemetry-code text-outline">
                        €{item.revenue}k · {item.marginPct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {spec.chartType === 'waterfall' && (
            <div className="space-y-2.5">
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                const rev = spec.activePeriod === 'Q3' ? item.q3 : item.revenue;
                const margin = spec.activePeriod === 'Q3' ? item.q3MarginPct : item.marginPct;
                const profitK = Number(((rev * margin) / 100).toFixed(1));
                const barWidth = Math.min(100, Math.max(8, Math.round((profitK / 75) * 100)));
                return (
                  <div
                    key={item.name}
                    className={`flex items-center gap-3 rounded-lg border border-outline-variant/25 bg-surface-container-low p-2.5 ${
                      isExcluded ? 'opacity-40 line-through' : ''
                    }`}
                  >
                    <div className="w-40 text-body-sm font-medium text-on-surface truncate">
                      {item.name}
                    </div>
                    <div className="flex-1 bg-surface-container-highest h-4 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-tertiary transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="w-28 text-right font-telemetry-code text-telemetry-code text-tertiary">
                      +€{profitK}k ({margin}%)
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {spec.chartType === 'line' && (
            <svg viewBox="0 0 680 220" className="w-full h-56 overflow-visible">
              {[15, 30, 45, 60].map((pct) => {
                const y = 190 - (pct / 70) * 160;
                return (
                  <g key={pct}>
                    <line
                      x1={45}
                      y1={y}
                      x2={640}
                      y2={y}
                      stroke="#31353e"
                      strokeDasharray="4 4"
                    />
                    <text x={10} y={y + 4} fontSize={10} fill="#a78b7d" fontFamily="monospace">
                      {pct}%
                    </text>
                  </g>
                );
              })}
              {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q, idx) => {
                const x = 110 + idx * 165;
                return (
                  <text
                    key={q}
                    x={x}
                    y={212}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#dfe2ee"
                    fontFamily="monospace"
                  >
                    {q}
                  </text>
                );
              })}
              {spec.series.map((item) => {
                if (excludedSet.has(item.name.toLowerCase())) return null;
                const pts = [
                  item.q1MarginPct,
                  item.q2MarginPct,
                  item.q3MarginPct,
                  item.q4MarginPct,
                ].map((val, idx) => ({
                  x: 110 + idx * 165,
                  y: 190 - (val / 70) * 160,
                  val,
                }));
                const strokeColor =
                  item.marginPct < 20
                    ? '#ffb4ab'
                    : item.marginPct >= 45
                      ? '#4edea3'
                      : '#4cd7f6';
                return (
                  <g key={item.name}>
                    <polyline
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={2.5}
                      points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    />
                    {pts.map((p, idx) => (
                      <circle key={idx} cx={p.x} cy={p.y} r={4} fill={strokeColor} />
                    ))}
                  </g>
                );
              })}
            </svg>
          )}

          {spec.chartType === 'stacked_bar' && (
            <div className="space-y-2.5">
              {spec.series.map((item) => {
                const isExcluded = excludedSet.has(item.name.toLowerCase());
                const rev = spec.activePeriod === 'Q3' ? item.q3 : item.revenue;
                const margin = spec.activePeriod === 'Q3' ? item.q3MarginPct : item.marginPct;
                const profitK = Number(((rev * margin) / 100).toFixed(1));
                const costK = Number((rev - profitK).toFixed(1));
                return (
                  <div
                    key={item.name}
                    className={`rounded-lg border border-outline-variant/25 bg-surface-container-low p-2.5 ${
                      isExcluded ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex justify-between text-telemetry-code font-telemetry-code mb-1">
                      <span className="text-on-surface font-semibold">{item.name}</span>
                      <span className="text-on-surface-variant">
                        €{profitK}k Profit / €{costK}k Cost ({margin}%)
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden flex bg-surface-container-highest">
                      <div
                        className="bg-tertiary h-full"
                        style={{ width: `${margin}%` }}
                      />
                      <div
                        className="bg-outline-variant/60 h-full"
                        style={{ width: `${100 - margin}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom Interactive Voice / Canvas Trigger Bar (Matches Argon Redesign) */}
      <div className="pt-3 border-t border-outline-variant/25 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-telemetry-code font-telemetry-code text-outline">
          <span className="material-symbols-outlined text-[15px] text-secondary">bolt</span>
          <span>
            State Bus ({canvas.lastMutationLatencyMs}ms): {canvas.lastMutationDescription}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onVoiceCommand(
                golfBallsExcluded
                  ? 'Restore all series'
                  : 'Remove sales of golf balls from the analysis'
              )
            }
            className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-label-md font-label-md text-on-surface border border-outline-variant/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">
              {golfBallsExcluded ? 'restart_alt' : 'filter_alt_off'}
            </span>
            {golfBallsExcluded
              ? 'Restore Consumables'
              : 'Strip Consumables ("Remove Golf Balls")'}
          </button>
          <button
            type="button"
            onClick={() =>
              onVoiceCommand(
                spec.activePeriod === 'Q3' ? 'Show full year all quarters' : 'Zoom in on Q3'
              )
            }
            className="px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-label-md font-label-md text-secondary border border-secondary/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">zoom_in</span>
            {spec.activePeriod === 'Q3' ? 'Reset to FY26 Matrix' : 'Zoom to Q3 Matrix'}
          </button>
        </div>
      </div>
    </div>
  );
};

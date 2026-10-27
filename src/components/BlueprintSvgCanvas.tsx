import React from 'react';
import {
  CheckCircle2,
  Circle,
  Hammer,
  Maximize2,
  Ruler,
  ZoomIn,
} from 'lucide-react';
import type { BlueprintZoomTarget, CanvasState } from '../types/bimodal';

interface BlueprintSvgCanvasProps {
  canvas: CanvasState;
  onVoiceCommand: (utterance: string) => void;
}

export const BlueprintSvgCanvas: React.FC<BlueprintSvgCanvasProps> = ({
  canvas,
  onVoiceCommand,
}) => {
  const spec = canvas.blueprintSpec;
  if (!spec) return null;

  const formatDim = (mm: number) => {
    if (spec.unit === 'mm') return `${mm}mm`;
    return `${(mm / 25.4).toFixed(2)}"`;
  };

  const zoomOptions: Array<{ id: BlueprintZoomTarget; label: string; cmd: string }> = [
    { id: 'overview', label: 'Full Bench Elevation', cmd: 'Show full bench overview' },
    { id: 'mortise_joint', label: 'Drawbored Mortise Callout', cmd: 'Zoom in on the mortise joint' },
    { id: 'leg_apron', label: 'Leg & Stretcher Assembly', cmd: 'Zoom in on the leg apron' },
    { id: 'cut_list', label: 'Timber Cut-Sheet Schedule', cmd: 'Zoom in on the cut list' },
  ];

  // Dynamic SVG viewBox for smooth CAD zoom
  const svgViewBox =
    spec.zoomTarget === 'mortise_joint'
      ? '85 30 220 140'
      : spec.zoomTarget === 'leg_apron'
        ? '70 85 500 165'
        : '0 0 680 260';

  return (
    <div className="flex flex-col gap-5">
      {/* Top Carpenter Control Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2DDD5] bg-[#F5F3EF] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-[#78716C] flex items-center gap-1">
            <ZoomIn className="h-3.5 w-3.5 text-[#C2410C]" /> Voice CAD Callout:
          </span>
          {zoomOptions.map((zo) => (
            <button
              key={zo.id}
              type="button"
              onClick={() => onVoiceCommand(zo.cmd)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                spec.zoomTarget === zo.id
                  ? 'bg-[#1C1917] text-white'
                  : 'bg-white text-[#1C1917] border border-[#E2DDD5] hover:border-[#1C1917]'
              }`}
            >
              {zo.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#78716C] flex items-center gap-1">
            <Ruler className="h-3.5 w-3.5" /> Units:
          </span>
          <div className="flex rounded-lg bg-white p-1 border border-[#E2DDD5]">
            <button
              type="button"
              onClick={() => onVoiceCommand('Switch units to millimeters')}
              className={`rounded-md px-2.5 py-0.5 text-xs font-mono font-bold transition cursor-pointer ${
                spec.unit === 'mm' ? 'bg-[#C2410C] text-white' : 'text-[#78716C]'
              }`}
            >
              mm (Metric)
            </button>
            <button
              type="button"
              onClick={() => onVoiceCommand('Switch units to inches')}
              className={`rounded-md px-2.5 py-0.5 text-xs font-mono font-bold transition cursor-pointer ${
                spec.unit === 'in' ? 'bg-[#C2410C] text-white' : 'text-[#78716C]'
              }`}
            >
              in (Imperial)
            </button>
          </div>
        </div>
      </div>

      {/* Interactive CAD Blueprint / Cut-List Stage */}
      {spec.zoomTarget !== 'cut_list' ? (
        <div className="rounded-xl border-2 border-[#1C1917] bg-[#FAF9F6] p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2 text-xs font-mono text-[#78716C]">
            <span>
              SCALE: {spec.zoomTarget === 'mortise_joint' ? '2.5:1 DETAIL CALLOUT' : '1:10 ELEVATION'} •
              MATERIAL: 8/4 EUROPEAN WHITE OAK
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-[#C2410C]">
              <Maximize2 className="h-3.5 w-3.5" />
              Active View: {spec.zoomTarget.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          <svg
            viewBox={svgViewBox}
            className="w-full h-72 rounded-lg border border-[#E2DDD5] bg-white transition-all duration-500"
          >
            {/* Subtle CAD Grid */}
            <defs>
              <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#F5F3EF"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="680" height="260" fill="url(#cad-grid)" />

            {/* Top Split-Slab */}
            <rect
              x="70"
              y="55"
              width="540"
              height="38"
              fill="#F5EBE1"
              stroke="#1C1917"
              strokeWidth="2.5"
            />
            {/* Split-Top Gap */}
            <rect x="330" y="55" width="20" height="38" fill="#1C1917" opacity="0.15" />

            {/* Left Leg & Through-Mortise Detail (Highlighted on mortise_joint zoom) */}
            <rect
              x="120"
              y="93"
              width="44"
              height="135"
              fill="#EAD8C3"
              stroke="#1C1917"
              strokeWidth="2.5"
            />
            {/* Through-Tenon Dashed Projection Inside Slab */}
            <rect
              x="130"
              y="55"
              width="24"
              height="38"
              fill={spec.zoomTarget === 'mortise_joint' ? '#FED7AA' : 'none'}
              stroke="#C2410C"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            {/* Drawbore Oak Pegs */}
            <circle cx="136" cy="76" r="3" fill="#C2410C" />
            <circle cx="148" cy="76" r="3" fill="#C2410C" />

            {/* Right Leg & Through-Tenon */}
            <rect
              x="516"
              y="93"
              width="44"
              height="135"
              fill="#EAD8C3"
              stroke="#1C1917"
              strokeWidth="2.5"
            />
            <rect
              x="526"
              y="55"
              width="24"
              height="38"
              fill="none"
              stroke="#C2410C"
              strokeWidth="2"
              strokeDasharray="4 2"
            />

            {/* Lower Long Stretcher */}
            <rect
              x="164"
              y="175"
              width="352"
              height="22"
              fill="#EFE4D6"
              stroke="#1C1917"
              strokeWidth="2"
            />
            {/* Drawbore pins on stretcher */}
            <circle cx="154" cy="186" r="3.2" fill="#C2410C" />
            <circle cx="526" cy="186" r="3.2" fill="#C2410C" />

            {/* Dimension Lines & Callouts */}
            {/* Overall Length */}
            <line x1="70" y1="32" x2="610" y2="32" stroke="#1C1917" strokeWidth="1.2" />
            <line x1="70" y1="26" x2="70" y2="38" stroke="#1C1917" strokeWidth="1.2" />
            <line x1="610" y1="26" x2="610" y2="38" stroke="#1C1917" strokeWidth="1.2" />
            <text
              x="340"
              y="26"
              textAnchor="middle"
              fontSize="11"
              fontFamily="monospace"
              fontWeight="bold"
              fill="#1C1917"
            >
              SLAB LENGTH: {formatDim(1830)}
            </text>

            {/* Slab Thickness & Mortise Callout */}
            <text
              x="170"
              y="72"
              fontSize="9.5"
              fontFamily="monospace"
              fontWeight="bold"
              fill="#C2410C"
            >
              TENON: {formatDim(51)} × {formatDim(102)}
            </text>
            <text
              x="170"
              y="84"
              fontSize="8.5"
              fontFamily="monospace"
              fill="#1C1917"
            >
              DRAWBORE OFFSET: {spec.unit === 'mm' ? '1.5mm' : '1/16"'}
            </text>

            {/* Stretcher Span */}
            <text
              x="340"
              y="169"
              textAnchor="middle"
              fontSize="10"
              fontFamily="monospace"
              fill="#1C1917"
            >
              LONG STRETCHER: {formatDim(1475)} × {formatDim(115)}
            </text>

            {/* Leg Height */}
            <text
              x="82"
              y="165"
              fontSize="10"
              fontFamily="monospace"
              fill="#1C1917"
            >
              {formatDim(865)}
            </text>
          </svg>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E2DDD5] bg-white overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E2DDD5] bg-[#F5F3EF] text-[#78716C] font-mono uppercase">
                <th className="py-2.5 px-3">Part Name</th>
                <th className="py-2.5 px-3">Material</th>
                <th className="py-2.5 px-3">Qty</th>
                <th className="py-2.5 px-3">Dimensions ({spec.unit})</th>
                <th className="py-2.5 px-3">Joinery Specification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE8E1]">
              {spec.cutList.map((part) => (
                <tr key={part.id} className="hover:bg-[#FAF9F6]">
                  <td className="py-2.5 px-3 font-bold text-[#1C1917]">{part.partName}</td>
                  <td className="py-2.5 px-3 text-[#78716C]">{part.material}</td>
                  <td className="py-2.5 px-3 font-mono font-bold">{part.qty}</td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-[#C2410C]">
                    {formatDim(part.lengthMm)} × {formatDim(part.widthMm)} ×{' '}
                    {formatDim(part.thicknessMm)}
                  </td>
                  <td className="py-2.5 px-3 text-[#78716C]">{part.joineryNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hands-Free Workshop Assembly Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {spec.steps.map((step) => {
          const isDone = spec.completedSteps.includes(step.stepNumber);
          return (
            <div
              key={step.stepNumber}
              onClick={() => onVoiceCommand(`Mark step ${step.stepNumber} done`)}
              className={`rounded-xl border p-3.5 transition cursor-pointer flex items-start gap-3 ${
                isDone
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-[#E2DDD5] bg-white hover:border-[#C2410C]'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-[#A8A29E] shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1C1917]">
                    Step {step.stepNumber}: {step.title}
                  </span>
                  <span className="rounded bg-[#FAF9F6] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#C2410C] border border-[#E2DDD5]">
                    {spec.unit === 'mm' ? step.criticalDimensionMm : step.criticalDimensionIn}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#78716C]">{step.instruction}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ECE8E1] bg-[#FAF9F6] px-4 py-2.5 text-xs text-[#78716C]">
        <span className="flex items-center gap-1.5 font-medium text-[#1C1917]">
          <Hammer className="h-3.5 w-3.5 text-[#C2410C]" />
          Hands-Busy Carpenter Mode: Keep working with your hands and say &ldquo;Zoom in on the mortise joint&rdquo; or &ldquo;Switch to inches&rdquo;.
        </span>
        <span className="font-mono">Source: {spec.citations.join(' • ')}</span>
      </div>
    </div>
  );
};

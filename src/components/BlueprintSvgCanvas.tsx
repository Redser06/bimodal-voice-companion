import React from 'react';
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

  const svgViewBox =
    spec.zoomTarget === 'mortise_joint'
      ? '85 30 220 140'
      : spec.zoomTarget === 'leg_apron'
        ? '70 85 500 165'
        : '0 0 680 260';

  return (
    <div className="flex flex-col gap-5">
      {/* Top Carpenter Control Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/25 bg-surface-container px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label-sm font-label-sm uppercase tracking-wider text-outline flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-primary">zoom_in</span>
            Voice CAD Callout:
          </span>
          {zoomOptions.map((zo) => (
            <button
              key={zo.id}
              type="button"
              onClick={() => onVoiceCommand(zo.cmd)}
              className={`rounded-lg px-2.5 py-1 text-label-sm font-label-sm transition cursor-pointer ${
                spec.zoomTarget === zo.id
                  ? 'bg-primary-container text-surface-container-lowest font-bold'
                  : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/25 hover:text-on-surface'
              }`}
            >
              {zo.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-label-sm font-label-sm text-outline flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-secondary">straighten</span>
            Units:
          </span>
          <div className="flex rounded-lg bg-surface-container-lowest p-1 border border-outline-variant/30">
            <button
              type="button"
              onClick={() => onVoiceCommand('Switch units to millimeters')}
              className={`rounded-md px-2.5 py-0.5 text-telemetry-code font-telemetry-code font-bold transition cursor-pointer ${
                spec.unit === 'mm'
                  ? 'bg-secondary/20 text-secondary border border-secondary/40'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              mm (Metric)
            </button>
            <button
              type="button"
              onClick={() => onVoiceCommand('Switch units to inches')}
              className={`rounded-md px-2.5 py-0.5 text-telemetry-code font-telemetry-code font-bold transition cursor-pointer ${
                spec.unit === 'in'
                  ? 'bg-secondary/20 text-secondary border border-secondary/40'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              in (Imperial)
            </button>
          </div>
        </div>
      </div>

      {/* Interactive CAD Blueprint / Cut-List Stage */}
      {spec.zoomTarget !== 'cut_list' ? (
        <div className="rounded-xl border border-secondary/30 bg-surface-container-lowest p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2 text-telemetry-code font-telemetry-code text-outline">
            <span>
              SCALE: {spec.zoomTarget === 'mortise_joint' ? '2.5:1 DETAIL CALLOUT' : '1:10 ELEVATION'} •
              MATERIAL: 8/4 EUROPEAN WHITE OAK
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-secondary">
              <span className="material-symbols-outlined text-[14px]">architecture</span>
              Active View: {spec.zoomTarget.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          <svg
            viewBox={svgViewBox}
            className="w-full h-72 rounded-lg border border-outline-variant/25 bg-[#0d121c] transition-all duration-500"
          >
            <defs>
              <pattern id="cad-grid-dark" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#1c2331"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="680" height="260" fill="url(#cad-grid-dark)" />

            {/* Top Split-Slab */}
            <rect
              x="70"
              y="55"
              width="540"
              height="38"
              fill="#1c2028"
              stroke="#4cd7f6"
              strokeWidth="2"
            />
            <rect x="330" y="55" width="20" height="38" fill="#4cd7f6" opacity="0.2" />

            {/* Left Leg & Through-Mortise Detail */}
            <rect
              x="120"
              y="93"
              width="44"
              height="135"
              fill="#181c24"
              stroke="#4cd7f6"
              strokeWidth="2"
            />
            <rect
              x="130"
              y="55"
              width="24"
              height="38"
              fill={spec.zoomTarget === 'mortise_joint' ? 'rgba(249, 115, 22, 0.28)' : 'none'}
              stroke="#f97316"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            <circle cx="136" cy="76" r="3" fill="#f97316" />
            <circle cx="148" cy="76" r="3" fill="#f97316" />

            {/* Right Leg & Through-Tenon */}
            <rect
              x="516"
              y="93"
              width="44"
              height="135"
              fill="#181c24"
              stroke="#4cd7f6"
              strokeWidth="2"
            />
            <rect
              x="526"
              y="55"
              width="24"
              height="38"
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              strokeDasharray="4 2"
            />

            {/* Lower Long Stretcher */}
            <rect
              x="164"
              y="175"
              width="352"
              height="22"
              fill="#1c2028"
              stroke="#4cd7f6"
              strokeWidth="1.8"
            />
            <circle cx="154" cy="186" r="3.2" fill="#f97316" />
            <circle cx="526" cy="186" r="3.2" fill="#f97316" />

            {/* Dimension Lines & Callouts */}
            <line x1="70" y1="32" x2="610" y2="32" stroke="#4edea3" strokeWidth="1.2" />
            <line x1="70" y1="26" x2="70" y2="38" stroke="#4edea3" strokeWidth="1.2" />
            <line x1="610" y1="26" x2="610" y2="38" stroke="#4edea3" strokeWidth="1.2" />
            <text
              x="340"
              y="25"
              textAnchor="middle"
              fontSize="11"
              fontFamily="monospace"
              fontWeight="bold"
              fill="#4edea3"
            >
              SLAB LENGTH: {formatDim(1830)}
            </text>

            <text
              x="170"
              y="72"
              fontSize="9.5"
              fontFamily="monospace"
              fontWeight="bold"
              fill="#ffb690"
            >
              TENON: {formatDim(51)} × {formatDim(102)}
            </text>
            <text
              x="170"
              y="84"
              fontSize="8.5"
              fontFamily="monospace"
              fill="#dfe2ee"
            >
              DRAWBORE OFFSET: {spec.unit === 'mm' ? '1.5mm' : '1/16"'}
            </text>

            <text
              x="340"
              y="169"
              textAnchor="middle"
              fontSize="10"
              fontFamily="monospace"
              fill="#4cd7f6"
            >
              LONG STRETCHER: {formatDim(1475)} × {formatDim(115)}
            </text>

            <text
              x="80"
              y="165"
              fontSize="10"
              fontFamily="monospace"
              fill="#4edea3"
            >
              {formatDim(865)}
            </text>
          </svg>
        </div>
      ) : (
        <div className="rounded-xl border border-outline-variant/25 bg-surface-container overflow-hidden">
          <table className="w-full text-left border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-outline-variant/25 bg-surface-container-lowest text-outline font-telemetry-code uppercase">
                <th className="py-2.5 px-3">Part Name</th>
                <th className="py-2.5 px-3">Material</th>
                <th className="py-2.5 px-3">Qty</th>
                <th className="py-2.5 px-3">Dimensions ({spec.unit})</th>
                <th className="py-2.5 px-3">Joinery Specification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {spec.cutList.map((part) => (
                <tr key={part.id} className="hover:bg-surface-container-high/50">
                  <td className="py-2.5 px-3 font-semibold text-on-surface">{part.partName}</td>
                  <td className="py-2.5 px-3 text-on-surface-variant">{part.material}</td>
                  <td className="py-2.5 px-3 font-telemetry-code font-bold text-secondary">
                    {part.qty}
                  </td>
                  <td className="py-2.5 px-3 font-telemetry-code font-semibold text-primary">
                    {formatDim(part.lengthMm)} × {formatDim(part.widthMm)} ×{' '}
                    {formatDim(part.thicknessMm)}
                  </td>
                  <td className="py-2.5 px-3 text-on-surface-variant">{part.joineryNote}</td>
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
                  ? 'border-tertiary/40 bg-tertiary-container/10'
                  : 'border-outline-variant/25 bg-surface-container hover:border-primary/40'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[20px] mt-0.5 ${
                  isDone ? 'text-tertiary' : 'text-outline'
                }`}
              >
                {isDone ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-semibold text-on-surface">
                    Step {step.stepNumber}: {step.title}
                  </span>
                  <span className="rounded bg-surface-container-lowest px-2 py-0.5 font-telemetry-code text-telemetry-code text-primary border border-outline-variant/25">
                    {spec.unit === 'mm' ? step.criticalDimensionMm : step.criticalDimensionIn}
                  </span>
                </div>
                <p className="mt-1 text-body-sm text-on-surface-variant">{step.instruction}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

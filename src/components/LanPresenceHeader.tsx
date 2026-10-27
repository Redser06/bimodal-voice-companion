import React from 'react';
import {
  LayoutGrid,
  Radio,
  Smartphone,
  Tablet,
  Tv,
  Wifi,
} from 'lucide-react';
import type { SurfacePresence } from '../types/bimodal';

export type ViewportSurfaceMode = 'unified' | 'phone' | 'pad' | 'tv';

interface LanPresenceHeaderProps {
  surfaces: SurfacePresence[];
  activeSurfaceMode: ViewportSurfaceMode;
  onSelectSurfaceMode: (mode: ViewportSurfaceMode) => void;
  lanEndpoint: string;
  wsConnected: boolean;
}

export const LanPresenceHeader: React.FC<LanPresenceHeaderProps> = ({
  surfaces,
  activeSurfaceMode,
  onSelectSurfaceMode,
  lanEndpoint,
  wsConnected,
}) => {
  const modeOptions: Array<{
    id: ViewportSurfaceMode;
    label: string;
    icon: React.ReactNode;
    desc: string;
  }> = [
    {
      id: 'unified',
      label: 'Unified Split (Voice + Canvas)',
      icon: <LayoutGrid className="h-3.5 w-3.5" />,
      desc: 'Primary Voice + Secondary Canvas side-by-side',
    },
    {
      id: 'phone',
      label: 'Phone / Car Primary (/phone)',
      icon: <Smartphone className="h-3.5 w-3.5" />,
      desc: 'Voice Jewel + Parked Digest Queue',
    },
    {
      id: 'pad',
      label: 'Workbench iPad (/pad)',
      icon: <Tablet className="h-3.5 w-3.5" />,
      desc: 'Touch + Voice Interactive Companion Surface',
    },
    {
      id: 'tv',
      label: 'Office TV Wall Display (/tv)',
      icon: <Tv className="h-3.5 w-3.5" />,
      desc: '10-Foot High-Contrast Wall Receiver',
    },
  ];

  return (
    <header className="border-b border-[#E2DDD5] bg-white px-5 py-3.5">
      <div className="mx-auto max-w-[1440px] flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Modality Contract */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1C1917] text-white font-mono font-bold text-sm">
            BV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-[#1C1917]">
                Bimodal Voice + Visual Companion
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFEDD5] px-2.5 py-0.5 text-[11px] font-mono font-semibold text-[#C2410C]">
                <Radio className="h-3 w-3" />
                &ldquo;Show Me&rdquo; Architecture
              </span>
            </div>
            <p className="text-xs text-[#78716C]">
              Primary: 2-Sentence BLUF Voice (`gemini-3.8-flash`) • Secondary: Pre-Staged Multi-Device Canvas (`gemini-4-argon`)
            </p>
          </div>
        </div>

        {/* Zero-Code LAN Presence Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] px-3 py-1.5 text-xs">
            <Wifi
              className={`h-3.5 w-3.5 ${wsConnected ? 'text-emerald-600' : 'text-[#C2410C]'}`}
            />
            <span className="font-semibold text-[#1C1917]">Zero-Code LAN Bus:</span>
            <code className="font-mono text-[11px] text-[#C2410C] font-semibold">
              {lanEndpoint}
            </code>
            <span className="text-[#A8A29E]">•</span>
            <span className="text-[11px] text-[#78716C]">
              {surfaces.length} surfaces auto-discovered
            </span>
          </div>

          {/* Surface Role Simulator / View Switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-[#E2DDD5] bg-[#F5F3EF] p-1">
            {modeOptions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectSurfaceMode(m.id)}
                title={m.desc}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  activeSurfaceMode === m.id
                    ? 'bg-[#1C1917] text-white shadow-2xs'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                {m.icon}
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};

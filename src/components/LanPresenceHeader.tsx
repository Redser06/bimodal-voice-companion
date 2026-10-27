import React, { useState } from 'react';
import {
  KeyRound,
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
  geminiApiKey: string;
  onSaveGeminiApiKey: (key: string) => void;
  activeVoiceEngineLabel: string;
}

export const LanPresenceHeader: React.FC<LanPresenceHeaderProps> = ({
  surfaces,
  activeSurfaceMode,
  onSelectSurfaceMode,
  lanEndpoint,
  wsConnected,
  geminiApiKey,
  onSaveGeminiApiKey,
  activeVoiceEngineLabel,
}) => {
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [draftKey, setDraftKey] = useState(geminiApiKey);

  const modeOptions: Array<{
    id: ViewportSurfaceMode;
    label: string;
    icon: React.ReactNode;
    desc: string;
  }> = [
    {
      id: 'unified',
      label: 'Unified Split',
      icon: <LayoutGrid className="h-3.5 w-3.5" />,
      desc: 'Primary Voice + Secondary Canvas side-by-side',
    },
    {
      id: 'phone',
      label: 'Phone / Car (/phone)',
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
      label: 'Office TV (/tv)',
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
                Deterministic Modality Router
              </span>
            </div>
            <p className="text-xs text-[#78716C]">
              Voice: <strong>{activeVoiceEngineLabel}</strong> • Fast Loop:{' '}
              <code>gemini-3.8-flash</code> • Heavy Synthesis: <code>gemini-4-argon</code>
            </p>
          </div>
        </div>

        {/* Zero-Code LAN Presence Pills & Gemini 3.8 TTS Key Toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] px-3 py-1.5 text-xs">
            <Wifi
              className={`h-3.5 w-3.5 ${wsConnected ? 'text-emerald-600' : 'text-[#C2410C]'}`}
            />
            <span className="font-semibold text-[#1C1917]">LAN Bus:</span>
            <code className="font-mono text-[11px] text-[#C2410C] font-semibold">
              {lanEndpoint}
            </code>
            <span className="text-[#A8A29E]">•</span>
            <span className="text-[11px] text-[#78716C]">{surfaces.length} surfaces</span>
          </div>

          <button
            type="button"
            onClick={() => setShowKeyInput((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              geminiApiKey
                ? 'border-emerald-600/40 bg-emerald-50 text-emerald-900'
                : 'border-[#E2DDD5] bg-[#FAF9F6] text-[#1C1917] hover:border-[#C2410C]'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5 text-[#C2410C]" />
            {geminiApiKey ? 'Gemini 3.8 TTS Key Active' : 'Connect Gemini 3.8 TTS Key'}
          </button>

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

      {showKeyInput && (
        <div className="mx-auto max-w-[1440px] mt-3 rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#78716C]">
            Paste a <code>GEMINI_API_KEY</code> to stream studio-grade 24kHz WAV audio from{' '}
            <strong>gemini-3.8-flash-tts</strong> (Kore / Puck / Aoede personas with{' '}
            <code>speech_metadata</code> style steering). Stored only in browser{' '}
            <code>localStorage</code>. Without a key, the app uses Ranked Neural OS Voices +
            Phonetic Speech Normalization.
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="AIzaSy..."
              className="rounded-lg border border-[#E2DDD5] bg-white px-3 py-1 text-xs font-mono text-[#1C1917] w-64"
            />
            <button
              type="button"
              onClick={() => {
                onSaveGeminiApiKey(draftKey.trim());
                setShowKeyInput(false);
              }}
              className="rounded-lg bg-[#1C1917] px-3 py-1 text-xs font-semibold text-white hover:bg-[#C2410C] cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

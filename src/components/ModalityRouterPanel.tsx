import React from 'react';
import {
  Car,
  Ear,
  Eye,
  GitBranch,
  Hammer,
  Monitor,
  ShieldAlert,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type {
  ModalityRoutingReceipt,
  PhysicalContextMode,
  VoicePersona,
} from '../types/bimodal';

interface ModalityRouterPanelProps {
  receipt: ModalityRoutingReceipt;
  physicalContext: PhysicalContextMode;
  voicePersona: VoicePersona;
  activeVoiceEngineLabel: string;
  onChangePhysicalContext: (ctx: PhysicalContextMode) => void;
  onChangeVoicePersona: (persona: VoicePersona) => void;
}

export const ModalityRouterPanel: React.FC<ModalityRouterPanelProps> = ({
  receipt,
  physicalContext,
  voicePersona,
  activeVoiceEngineLabel,
  onChangePhysicalContext,
  onChangeVoicePersona,
}) => {
  const contexts: Array<{
    id: PhysicalContextMode;
    label: string;
    icon: React.ReactNode;
    rule: string;
  }> = [
    {
      id: 'multi_screen_room',
      label: 'Multi-Screen Room (Desk + TV + iPad)',
      icon: <Monitor className="h-3.5 w-3.5" />,
      rule: 'Routes interactive charts to iPad & executive decks to Wall TV',
    },
    {
      id: 'hands_busy_workshop',
      label: 'Hands-Busy Workshop (Carpenter)',
      icon: <Hammer className="h-3.5 w-3.5" />,
      rule: 'Auto-locks visual callouts onto Workbench iPad; keeps voice on single measurement',
    },
    {
      id: 'in_car_driving',
      label: 'In-Car / Android Auto (Safety Gate)',
      icon: <Car className="h-3.5 w-3.5" />,
      rule: 'Suppresses screen popups; auto-routes dense visuals to Phone Parked Queue',
    },
  ];

  const personas: Array<{ id: VoicePersona; desc: string }> = [
    { id: 'Kore', desc: 'Kore (Crisp Executive)' },
    { id: 'Puck', desc: 'Puck (Warm Conversational)' },
    { id: 'Aoede', desc: 'Aoede (Studio Narrative)' },
    { id: 'Charon', desc: 'Charon (Calm Deep Cadence)' },
  ];

  return (
    <div className="rounded-2xl border-2 border-[#1C1917] bg-white p-5 space-y-4">
      {/* Header & Physical Context Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECE8E1] pb-3.5">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C2410C]">
            <GitBranch className="h-3.5 w-3.5" />
            Deterministic Modality Router & Phonetic Speech Engine
          </div>
          <h3 className="text-base font-bold text-[#1C1917]">
            Real-Time Channel Split Receipt (Cardinality Score: {receipt.cardinalityScore} →{' '}
            {receipt.scalarsPermittedInVoice} Spoken / {receipt.itemsStrippedToVisual} Visual)
          </h3>
        </div>

        {/* Voice Persona Selector (`gemini-3.8-flash-tts` + Neural Ranker) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF9F6] border border-[#E2DDD5] px-2.5 py-1 text-[11px] font-mono text-[#1C1917]">
            <Volume2 className="h-3.5 w-3.5 text-[#C2410C]" />
            {activeVoiceEngineLabel}
          </span>
          <div className="flex items-center gap-1 rounded-xl border border-[#E2DDD5] bg-[#F5F3EF] p-1">
            {personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChangeVoicePersona(p.id)}
                title={p.desc}
                className={`rounded-lg px-2 py-0.5 text-xs font-semibold transition cursor-pointer ${
                  voicePersona === p.id
                    ? 'bg-[#C2410C] text-white'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                {p.id}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Physical Context Selector Pills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {contexts.map((ctx) => {
          const isActive = physicalContext === ctx.id;
          return (
            <button
              key={ctx.id}
              type="button"
              onClick={() => onChangePhysicalContext(ctx.id)}
              className={`rounded-xl border p-3 text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                isActive
                  ? 'border-2 border-[#1C1917] bg-[#FAF9F6]'
                  : 'border-[#E2DDD5] bg-white hover:border-[#C2410C]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1C1917]">
                  <span className="text-[#C2410C]">{ctx.icon}</span>
                  {ctx.label}
                </span>
                {isActive && (
                  <span className="rounded-full bg-[#1C1917] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#78716C]">{ctx.rule}</p>
            </button>
          );
        })}
      </div>

      {/* 4-Channel Deterministic Routing Split Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* 1. Ear Channel */}
        <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#1C1917]">
            <span className="flex items-center gap-1.5">
              <Ear className="h-3.5 w-3.5 text-[#C2410C]" />
              1. Ears (Primary Voice)
            </span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-900">
              {receipt.scalarsPermittedInVoice} scalars
            </span>
          </div>
          <p className="text-[11px] text-[#78716C]">{receipt.earChannel.routingReason}</p>
          <div className="rounded-lg bg-white p-2 border border-[#ECE8E1] text-[11px] font-mono text-[#1C1917]">
            <div className="text-[10px] uppercase text-[#78716C] font-bold">
              Phonetic TTS Stream ({receipt.earChannel.voicePersona}):
            </div>
            &ldquo;{receipt.earChannel.phoneticNormalizedText}&rdquo;
          </div>
        </div>

        {/* 2. Eye Channel */}
        <div
          className={`rounded-xl border p-3.5 space-y-1.5 ${
            receipt.eyeChannel.suppressedBySafetyGate
              ? 'border-amber-400 bg-amber-50/50'
              : 'border-[#E2DDD5] bg-[#FAF9F6]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-[#1C1917]">
            <span className="flex items-center gap-1.5">
              {receipt.eyeChannel.suppressedBySafetyGate ? (
                <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-[#C2410C]" />
              )}
              2. Eyes (Visual Surface)
            </span>
            <span className="rounded bg-white border border-[#E2DDD5] px-1.5 py-0.5 font-mono text-[10px] text-[#1C1917]">
              {receipt.itemsStrippedToVisual} items routed
            </span>
          </div>
          <p className="text-[11px] text-[#78716C]">{receipt.eyeChannel.routingReason}</p>
          <div className="text-[11px] font-mono font-semibold text-[#C2410C]">
            Target: {receipt.eyeChannel.targetSurfaces.join(' + ').toUpperCase()}
          </div>
        </div>

        {/* 3. Async / Parked Queue Channel */}
        <div
          className={`rounded-xl border p-3.5 space-y-1.5 ${
            receipt.asyncQueueChannel.autoQueued
              ? 'border-[#C2410C] bg-[#FFEDD5]/40'
              : 'border-[#E2DDD5] bg-[#FAF9F6]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-[#1C1917]">
            <span className="flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 text-[#C2410C]" />
              3. In-Transit Queue
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                receipt.asyncQueueChannel.autoQueued
                  ? 'bg-[#C2410C] text-white font-bold'
                  : 'bg-white border border-[#E2DDD5] text-[#78716C]'
              }`}
            >
              {receipt.asyncQueueChannel.autoQueued ? 'AUTO-QUEUED' : 'STANDBY'}
            </span>
          </div>
          <p className="text-[11px] text-[#78716C]">{receipt.asyncQueueChannel.routingReason}</p>
        </div>

        {/* 4. Second Brain MCP Channel */}
        <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#1C1917]">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#C2410C]" />
              4. Second Brain MCP
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                receipt.secondBrainChannel.committedNow
                  ? 'bg-emerald-700 text-white font-bold'
                  : receipt.secondBrainChannel.stagedForCommit
                    ? 'bg-amber-100 text-amber-900 font-semibold'
                    : 'bg-white border border-[#E2DDD5] text-[#78716C]'
              }`}
            >
              {receipt.secondBrainChannel.committedNow
                ? 'COMMITTED'
                : receipt.secondBrainChannel.stagedForCommit
                  ? 'STAGED'
                  : 'IDLE'}
            </span>
          </div>
          <p className="text-[11px] text-[#78716C]">{receipt.secondBrainChannel.routingReason}</p>
        </div>
      </div>
    </div>
  );
};

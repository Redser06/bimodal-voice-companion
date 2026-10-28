import React, { useState } from 'react';
import {
  AudioLines,
  Eye,
  GitBranch,
  Mic,
  MicOff,
  Send,
  Smartphone,
  Sparkles,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { BimodalSessionState, CanvasState } from '../types/bimodal';

interface VoiceJewelPanelProps {
  session: BimodalSessionState;
  activeCanvas: CanvasState;
  isListening: boolean;
  isSpeaking: boolean;
  ttsEnabled: boolean;
  onToggleListening: () => void;
  onToggleTts: () => void;
  onStopSpeaking: () => void;
  onVoiceCommand: (utterance: string) => void;
  onSelectThread: (threadId: string) => void;
}

export const VoiceJewelPanel: React.FC<VoiceJewelPanelProps> = ({
  session,
  activeCanvas,
  isListening,
  isSpeaking,
  ttsEnabled,
  onToggleListening,
  onToggleTts,
  onStopSpeaking,
  onVoiceCommand,
  onSelectThread,
}) => {
  const [customInput, setCustomInput] = useState('');
  const latestTurn = session.voiceHistory[0];

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    onVoiceCommand(customInput.trim());
    setCustomInput('');
  };

  // Context-sensitive quick voice utterance chips for 1-tap testing on any device
  const quickVoicePrompts = session.pendingDisambiguation
    ? [
        "Conor's Laptop",
        'The Samsung TV',
        'Workbench iPad Pro',
        'Both screens',
      ]
    : activeCanvas.engine === 'data_analytics'
      ? [
          'Show me on the screen',
          "Show me on Conor's Laptop",
          'Show me on Samsung TV',
          'Remove sales of golf balls from the analysis',
          'Zoom in on Q3',
          'Show me this as a waterfall chart',
          'Show me this as a line chart',
          'Restore all series',
          'Text me the information for when I park',
        ]
      : activeCanvas.engine === 'blueprint_svg'
        ? [
            'Show me on the screen',
            'Zoom in on the mortise joint',
            'Switch units to inches',
            'Switch units to millimeters',
            'Zoom in on the cut list',
            'Mark step 2 done',
            'Show full bench overview',
            'Text me the information for when I park',
          ]
        : [
            'Show me on the screen',
            'Filter to failed runs',
            'Filter to action required',
            'Show all cards',
            'Write to Second Brain',
            'Show me on Samsung TV',
          ];

  return (
    <div className="flex flex-col justify-between rounded-2xl border-2 border-[#1C1917] bg-white p-5 shadow-xs">
      <div className="space-y-4">
        {/* Top Channel Header */}
        <div className="flex items-center justify-between border-b border-[#ECE8E1] pb-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C2410C]">
              <AudioLines className="h-3.5 w-3.5" />
              Primary Channel — Voice Jewel
            </div>
            <h2 className="text-base font-bold text-[#1C1917]">
              Conversational BLUF Controller
            </h2>
          </div>

          <button
            type="button"
            onClick={isSpeaking ? onStopSpeaking : onToggleTts}
            title={ttsEnabled ? 'Voice Audio Enabled (Click to Mute/Barge-In)' : 'Voice Audio Muted'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              ttsEnabled
                ? 'border-[#1C1917] bg-[#FAF9F6] text-[#1C1917]'
                : 'border-[#E2DDD5] bg-[#F5F3EF] text-[#78716C]'
            }`}
          >
            {ttsEnabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5 text-[#C2410C]" />
                {isSpeaking ? 'Speaking (Tap Barge-In)' : 'BLUF Audio On'}
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5" />
                Muted
              </>
            )}
          </button>
        </div>

        {/* Acoustic Voice Orb Stage */}
        <div className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-5 text-center relative overflow-hidden">
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={onToggleListening}
              aria-label={isListening ? 'Stop Microphone' : 'Start Voice Conversation'}
              className={`relative flex h-24 w-24 items-center justify-center rounded-full border-3 transition-all duration-300 cursor-pointer ${
                isListening
                  ? 'border-[#C2410C] bg-[#C2410C] text-white scale-105 shadow-lg'
                  : isSpeaking
                    ? 'border-[#0F766E] bg-[#0F766E] text-white scale-102'
                    : 'border-[#1C1917] bg-white text-[#1C1917] hover:border-[#C2410C]'
              }`}
            >
              {isListening ? (
                <Mic className="h-9 w-9 animate-pulse" />
              ) : (
                <MicOff className="h-8 w-8" />
              )}
            </button>

            <div className="mt-3 text-xs font-bold uppercase tracking-wider text-[#1C1917]">
              {isListening
                ? 'Listening (Barge-In Active — Speak Now)'
                : isSpeaking
                  ? 'Speaking 2-Sentence BLUF Summary...'
                  : 'Tap Orb or Say "Show Me"'}
            </div>
            <p className="mt-1 text-xs text-[#78716C] max-w-xs">
              &ldquo;{latestTurn?.userTranscript || 'Start speaking or tap a voice command below'}&rdquo;
            </p>
          </div>
        </div>

        {/* Strict 2-Sentence BLUF Response Card */}
        {latestTurn && (
          <div className="rounded-xl border-l-4 border-[#C2410C] bg-[#FAF9F6] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#78716C]">
              <span className="font-bold uppercase text-[#1C1917]">
                BLUF Voice Output ({latestTurn.sentenceCount}/2 sentences • {latestTurn.wordCount}/35 words)
              </span>
              <span className="rounded bg-white px-1.5 py-0.5 border border-[#E2DDD5] text-[#C2410C]">
                {latestTurn.latencyMs}ms
              </span>
            </div>
            <p className="text-sm font-medium text-[#1C1917] leading-relaxed">
              &ldquo;{latestTurn.blufSpokenResponse}&rdquo;
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#78716C] pt-1 border-t border-[#ECE8E1]">
              <span className="truncate">Tool: {latestTurn.toolExecuted}</span>
              <span>{latestTurn.modelTier}</span>
            </div>
          </div>
        )}

        {/* Parallel Secondary Channel Staging Status Badge */}
        <div
          className={`rounded-xl border p-3 flex items-center justify-between gap-2 transition ${
            activeCanvas.visibility === 'live_visible'
              ? 'border-emerald-600/40 bg-emerald-50/60'
              : activeCanvas.visibility === 'staging_in_progress'
                ? 'border-amber-500/50 bg-amber-50/60 animate-pulse'
                : 'border-[#C2410C]/40 bg-[#FFEDD5]/50'
          }`}
        >
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#78716C]">
              Secondary Channel Payload ({activeCanvas.engine.replace(/_/g, ' ')})
            </div>
            <div className="text-xs font-bold text-[#1C1917]">
              {activeCanvas.visibility === 'live_visible'
                ? `LIVE ON ${activeCanvas.targetSurfaces.join(' + ').toUpperCase()}`
                : activeCanvas.visibility === 'staging_in_progress'
                  ? 'STAGING IN PROGRESS (Loop 2 Gemini 4 Argon)...'
                  : 'PRE-STAGED IN BACKGROUND (0ms wait — say "Show me")'}
            </div>
          </div>

          {activeCanvas.visibility !== 'live_visible' ? (
            <button
              type="button"
              onClick={() => onVoiceCommand('Show me')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#C2410C] transition cursor-pointer shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
              &ldquo;Show Me&rdquo;
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onVoiceCommand('Throw that on the TV')}
                title="Cast to Office TV"
                className="inline-flex items-center gap-1 rounded-md border border-[#E2DDD5] bg-white px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#C2410C] cursor-pointer"
              >
                <Tv className="h-3 w-3 text-[#C2410C]" /> TV
              </button>
              <button
                type="button"
                onClick={() => onVoiceCommand('Text me the information')}
                title="Queue for Android Auto / Phone"
                className="inline-flex items-center gap-1 rounded-md border border-[#E2DDD5] bg-white px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#C2410C] cursor-pointer"
              >
                <Smartphone className="h-3 w-3 text-[#C2410C]" /> Text Me
              </button>
            </div>
          )}
        </div>

        {/* Voice Command Simulator / Natural Utterance Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#78716C]">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-[#C2410C]" /> Voice Utterance / Simulation Chips
            </span>
            <span className="font-mono text-[10px]">Tap or speak</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickVoicePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onVoiceCommand(prompt)}
                className="rounded-lg border border-[#E2DDD5] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-[#1C1917] hover:border-[#C2410C] hover:bg-[#FFEDD5]/40 transition cursor-pointer text-left"
              >
                &ldquo;{prompt}&rdquo;
              </button>
            ))}
          </div>

          <form onSubmit={handleFormSubmit} className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder='Say e.g. "remove sales of golf balls and zoom Q3"...'
              className="flex-1 rounded-lg border border-[#E2DDD5] bg-[#FAF9F6] px-3 py-1.5 text-xs text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#C2410C] focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#C2410C] transition cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" /> Speak
            </button>
          </form>
        </div>
      </div>

      {/* Multi-Thread Context Stack */}
      <div className="mt-5 pt-4 border-t border-[#ECE8E1] space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
          <span className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-[#C2410C]" />
            Multi-Thread Context Stack (Voice Switchable)
          </span>
          <span className="font-mono text-[10px]">3 Active Threads</span>
        </div>

        <div className="space-y-1.5">
          {Object.values(session.threads).map((t) => {
            const isActive = t.threadId === session.activeThreadId;
            return (
              <button
                key={t.threadId}
                type="button"
                onClick={() => onSelectThread(t.threadId)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                  isActive
                    ? 'border-2 border-[#1C1917] bg-[#FAF9F6]'
                    : 'border-[#E2DDD5] bg-white hover:border-[#C8C2B7]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#1C1917] truncate">{t.threadTitle}</div>
                  <div className="text-[11px] text-[#78716C] truncate">{t.threadDomain}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold shrink-0 ${
                    isActive
                      ? 'bg-[#1C1917] text-white'
                      : t.visibility === 'live_visible'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-[#F5F3EF] text-[#78716C]'
                  }`}
                >
                  {isActive ? 'ACTIVE' : t.visibility === 'live_visible' ? 'VISIBLE' : 'STAGED'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

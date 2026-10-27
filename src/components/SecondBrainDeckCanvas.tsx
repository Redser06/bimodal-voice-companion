import React from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  FileCode2,
  GitCommit,
  Sparkles,
} from 'lucide-react';
import type { BrainFilterStatus, CanvasState } from '../types/bimodal';

interface SecondBrainDeckCanvasProps {
  canvas: CanvasState;
  onVoiceCommand: (utterance: string) => void;
}

export const SecondBrainDeckCanvas: React.FC<SecondBrainDeckCanvasProps> = ({
  canvas,
  onVoiceCommand,
}) => {
  const spec = canvas.brainDeckSpec;
  if (!spec) return null;

  const filterButtons: Array<{ id: BrainFilterStatus; label: string; cmd: string }> = [
    { id: 'all', label: 'All Entries (5)', cmd: 'Show all cards' },
    { id: 'failed_runs', label: 'Failed Runs / Alerts', cmd: 'Filter to failed runs' },
    { id: 'action_required', label: 'Action Required / Open Loops', cmd: 'Filter to action required' },
  ];

  const visibleCards = spec.cards.filter((c) =>
    spec.filterStatus === 'all' ? true : c.status === spec.filterStatus
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Top Filter & MCP Commit Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2DDD5] bg-[#F5F3EF] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-[#78716C] flex items-center gap-1">
            <Brain className="h-3.5 w-3.5 text-[#C2410C]" /> Second Brain Filter:
          </span>
          {filterButtons.map((fb) => (
            <button
              key={fb.id}
              type="button"
              onClick={() => onVoiceCommand(fb.cmd)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                spec.filterStatus === fb.id
                  ? 'bg-[#1C1917] text-white'
                  : 'bg-white text-[#1C1917] border border-[#E2DDD5] hover:border-[#1C1917]'
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onVoiceCommand('Write to Second Brain')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412] transition cursor-pointer"
        >
          <GitCommit className="h-3.5 w-3.5" />
          MCP Commit Outcome to redser-second-brain
        </button>
      </div>

      {/* Live MCP Commit Banner (when triggered by voice) */}
      {spec.pendingCommit && (
        <div className="rounded-xl border-2 border-emerald-600 bg-emerald-50/70 p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Written to Second Brain (MCP Direct Commit on main)
            </div>
            <div className="text-sm font-bold text-[#1C1917]">{spec.pendingCommit.title}</div>
            <p className="text-xs text-[#78716C]">{spec.pendingCommit.summary}</p>
          </div>
          <code className="rounded-md bg-white px-2.5 py-1 font-mono text-xs font-semibold text-emerald-900 border border-emerald-300 shrink-0">
            {spec.pendingCommit.committedPath}
          </code>
        </div>
      )}

      {/* Executive Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {visibleCards.map((card) => {
          const isFailed = card.status === 'failed_runs';
          const isAction = card.status === 'action_required';
          return (
            <div
              key={card.id}
              className={`rounded-xl border p-4 transition flex flex-col justify-between gap-3 ${
                isFailed
                  ? 'border-amber-300 bg-amber-50/30'
                  : isAction
                    ? 'border-[#C2410C]/40 bg-white'
                    : 'border-[#E2DDD5] bg-white'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      isFailed
                        ? 'bg-amber-100 text-amber-900'
                        : isAction
                          ? 'bg-[#FFEDD5] text-[#C2410C]'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isFailed ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : isAction ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {card.metricBadge}
                  </span>
                  <span className="font-mono text-[11px] text-[#78716C]">{card.timestamp}</span>
                </div>

                <h3 className="text-sm font-bold text-[#1C1917] leading-snug">{card.title}</h3>
                <p className="text-xs text-[#78716C] leading-relaxed">{card.summary}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#ECE8E1] text-[11px] font-mono text-[#78716C]">
                <span className="flex items-center gap-1 truncate">
                  <FileCode2 className="h-3.5 w-3.5 text-[#C2410C] shrink-0" />
                  {card.sourcePath}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ECE8E1] bg-[#FAF9F6] px-4 py-2.5 text-xs text-[#78716C]">
        <span className="flex items-center gap-1.5 font-medium text-[#1C1917]">
          <Sparkles className="h-3.5 w-3.5 text-[#C2410C]" />
          Canonical Vault: <code>/Users/conorredmond/projects/redser-second-brain</code>
        </span>
        <span className="font-mono">Synthesized by Gemini 4 Argon (gemini-4-argon)</span>
      </div>
    </div>
  );
};

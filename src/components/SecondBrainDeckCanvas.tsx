import React from 'react';
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/25 bg-surface-container px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label-sm font-label-sm uppercase tracking-wider text-outline flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-primary">neurology</span>
            Second Brain Filter:
          </span>
          {filterButtons.map((fb) => (
            <button
              key={fb.id}
              type="button"
              onClick={() => onVoiceCommand(fb.cmd)}
              className={`rounded-lg px-2.5 py-1 text-label-sm font-label-sm transition cursor-pointer ${
                spec.filterStatus === fb.id
                  ? 'bg-primary-container text-surface-container-lowest font-bold'
                  : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/25 hover:text-on-surface'
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onVoiceCommand('Write to Second Brain')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-3 py-1.5 text-label-sm font-label-sm font-bold text-surface-container-lowest hover:bg-primary transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-[15px]">commit</span>
          MCP Commit Outcome to redser-second-brain
        </button>
      </div>

      {/* Live MCP Commit Banner */}
      {spec.pendingCommit && (
        <div className="rounded-xl border border-tertiary/40 bg-tertiary-container/15 p-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-label-sm font-label-sm uppercase tracking-wider text-tertiary">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Written to Second Brain (MCP Direct Commit on main)
            </div>
            <div className="text-body-md font-semibold text-on-surface">
              {spec.pendingCommit.title}
            </div>
            <p className="text-body-sm text-on-surface-variant">{spec.pendingCommit.summary}</p>
          </div>
          <code className="rounded-md bg-surface-container-lowest px-2.5 py-1 font-telemetry-code text-telemetry-code text-tertiary border border-tertiary/30 shrink-0">
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
                  ? 'border-error/40 bg-error-container/15'
                  : isAction
                    ? 'border-primary/40 bg-surface-container'
                    : 'border-outline-variant/25 bg-surface-container'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-label-sm font-label-sm ${
                      isFailed
                        ? 'bg-error-container/50 text-on-error-container'
                        : isAction
                          ? 'bg-primary-container/20 text-primary'
                          : 'bg-tertiary-container/20 text-tertiary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {isFailed ? 'warning' : isAction ? 'schedule' : 'check_circle'}
                    </span>
                    {card.metricBadge}
                  </span>
                  <span className="font-telemetry-code text-telemetry-code text-outline">
                    {card.timestamp}
                  </span>
                </div>

                <h3 className="text-body-md font-semibold text-on-surface leading-snug">
                  {card.title}
                </h3>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  {card.summary}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-telemetry-code font-telemetry-code text-outline">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="material-symbols-outlined text-[14px] text-secondary">
                    description
                  </span>
                  {card.sourcePath}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

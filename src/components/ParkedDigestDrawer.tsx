import React from 'react';
import type { ParkedDigestItem } from '../types/bimodal';

interface ParkedDigestDrawerProps {
  digests: ParkedDigestItem[];
  onPlayDigestAudio: (text: string) => void;
  onSelectThread: (threadId: string) => void;
  onTriggerNewDigest: () => void;
}

export const ParkedDigestDrawer: React.FC<ParkedDigestDrawerProps> = ({
  digests,
  onPlayDigestAudio,
  onSelectThread,
  onTriggerNewDigest,
}) => {
  return (
    <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-tertiary/15 border border-tertiary/30 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined text-[18px]">directions_car</span>
          </div>
          <div>
            <div className="text-label-sm font-label-sm uppercase tracking-wider text-tertiary">
              In-Car / Android Auto Gate (&ldquo;I&apos;ll Text You the Information&rdquo;)
            </div>
            <h3 className="text-body-md font-semibold text-on-surface">
              Parked Digest & Async Playback Queue ({digests.length})
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={onTriggerNewDigest}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container px-3 py-1.5 text-label-md font-label-md text-on-surface hover:border-primary/50 hover:text-primary transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-[15px] text-primary">sms</span>
          Say &ldquo;Text me the information&rdquo;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {digests.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-outline-variant/25 bg-surface-container p-4 flex flex-col justify-between gap-3"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-telemetry-code font-telemetry-code text-outline">
                <span className="font-semibold text-on-surface">{item.threadTitle}</span>
                <span>{item.timestamp}</span>
              </div>
              <p className="text-body-sm font-medium text-on-surface bg-surface-container-lowest/80 rounded-lg p-3 border border-outline-variant/20">
                {item.blufSummary}
              </p>
              <ul className="space-y-1 pl-4 list-disc text-body-sm text-on-surface-variant">
                {item.keyTakeaways.map((kt, idx) => (
                  <li key={idx}>{kt}</li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPlayDigestAudio(item.blufSummary)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-2.5 py-1 text-label-sm font-label-sm font-bold text-surface-container-lowest hover:bg-primary cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                  Play BLUF
                </button>
                <button
                  type="button"
                  onClick={() => onSelectThread(item.threadId)}
                  className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/30 bg-surface-container-low px-2.5 py-1 text-label-sm font-label-sm text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Open Canvas
                </button>
              </div>

              {item.syncedToSecondBrain && (
                <span className="inline-flex items-center gap-1 text-telemetry-code font-telemetry-code text-tertiary">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Synced to Brain
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

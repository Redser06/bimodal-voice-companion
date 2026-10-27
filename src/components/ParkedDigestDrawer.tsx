import React from 'react';
import {
  Car,
  CheckCircle2,
  ExternalLink,
  MessageSquareText,
  Play,
  Sparkles,
} from 'lucide-react';
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
    <div className="rounded-2xl border border-[#E2DDD5] bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECE8E1] pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C2410C]">
            <Car className="h-3.5 w-3.5" />
            In-Transit / Android Auto Mode (&ldquo;I&apos;ll Text You the Information&rdquo;)
          </div>
          <h3 className="text-sm font-bold text-[#1C1917]">
            Parked Digest & Async Playback Queue ({digests.length})
          </h3>
        </div>

        <button
          type="button"
          onClick={onTriggerNewDigest}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#1C1917] bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#1C1917] hover:text-white transition cursor-pointer"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Say &ldquo;Text me the information&rdquo;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {digests.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-[#E2DDD5] bg-[#FAF9F6] p-4 flex flex-col justify-between gap-3"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#78716C]">
                <span className="font-bold text-[#1C1917]">{item.threadTitle}</span>
                <span>{item.timestamp}</span>
              </div>
              <p className="text-xs font-semibold text-[#1C1917] bg-white rounded-lg p-2.5 border border-[#ECE8E1]">
                {item.blufSummary}
              </p>
              <ul className="space-y-1 pl-4 list-disc text-xs text-[#78716C]">
                {item.keyTakeaways.map((kt, idx) => (
                  <li key={idx}>{kt}</li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#ECE8E1]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPlayDigestAudio(item.blufSummary)}
                  className="inline-flex items-center gap-1 rounded-md bg-[#1C1917] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#C2410C] cursor-pointer"
                >
                  <Play className="h-3 w-3" /> Play Audio
                </button>
                <button
                  type="button"
                  onClick={() => onSelectThread(item.threadId)}
                  className="inline-flex items-center gap-1 rounded-md border border-[#E2DDD5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#C2410C] cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" /> Open Canvas
                </button>
              </div>

              {item.syncedToSecondBrain && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                  Synced to Brain
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-[#78716C] pt-1">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#C2410C]" />
          Hands-free while driving: Voice gives the 8-second answer; dense takeaways wait in your phone queue for when you park.
        </span>
      </div>
    </div>
  );
};

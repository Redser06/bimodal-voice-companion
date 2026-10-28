import React from 'react';
import type {
  DiscoveredScreenDevice,
  IncomingTakeoverPrompt,
  PendingScreenDisambiguation,
} from '../types/bimodal';

interface ScreenTakeoverModalProps {
  discoveredScreens: DiscoveredScreenDevice[];
  pendingDisambiguation: PendingScreenDisambiguation | null;
  incomingTakeoverPrompt: IncomingTakeoverPrompt | null;
  requireDisambiguation: boolean;
  autoAcceptTakeover: boolean;
  onToggleRequireDisambiguation: () => void;
  onToggleAutoAcceptTakeover: () => void;
  onVoiceCommand: (utterance: string) => void;
  onDismissTakeoverPrompt: () => void;
  onAcceptAndFullscreenTakeover: (device: DiscoveredScreenDevice) => void;
  onTriggerBrowserCastApi: (device: DiscoveredScreenDevice) => void;
  onTriggerMacWindowSpawn: (device: DiscoveredScreenDevice) => void;
  onRescanLanDevices: () => void;
}

export const ScreenTakeoverModal: React.FC<ScreenTakeoverModalProps> = ({
  pendingDisambiguation,
  incomingTakeoverPrompt,
  onVoiceCommand,
  onDismissTakeoverPrompt,
  onAcceptAndFullscreenTakeover,
  onTriggerBrowserCastApi,
  onTriggerMacWindowSpawn,
}) => {
  if (!pendingDisambiguation?.active && !incomingTakeoverPrompt) {
    return null;
  }

  const getDeviceSymbol = (dev: DiscoveredScreenDevice) => {
    if (dev.surfaceRole === 'tv') return 'tv';
    if (dev.name.toLowerCase().includes('laptop') || dev.name.toLowerCase().includes('mac'))
      return 'laptop_mac';
    return 'tablet_mac';
  };

  return (
    <div className="space-y-4">
      {/* 1. 2-SECOND VOICE SCREEN DISAMBIGUATION BANNER ("Which screen do you want?") */}
      {pendingDisambiguation?.active && (
        <div className="rounded-xl border border-primary/50 bg-surface-container-low p-5 shadow-xl relative overflow-hidden space-y-4">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-primary-container" />
          <div className="flex flex-wrap items-center justify-between gap-2 pl-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-container/20 border border-primary-container/50 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px] animate-pulse">
                  graphic_eq
                </span>
              </div>
              <div>
                <div className="text-label-sm font-label-sm uppercase tracking-wider text-primary">
                  2-Second Voice Screen Disambiguation Active
                </div>
                <h3 className="text-body-md font-semibold text-on-surface">
                  AI Pushback: &ldquo;I see {pendingDisambiguation.candidateScreens.length} screens
                  on your network. Which screen do you want, or should I project to both?&rdquo;
                </h3>
              </div>
            </div>
            <span className="rounded-full bg-primary-container/15 border border-primary/30 px-2.5 py-1 text-telemetry-code font-telemetry-code text-primary">
              Say screen name or tap below
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pl-2">
            {pendingDisambiguation.candidateScreens.map((screen) => (
              <button
                key={screen.id}
                type="button"
                onClick={() => onVoiceCommand(screen.name)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container hover:border-secondary/50 hover:bg-surface-container-high p-3 text-left transition cursor-pointer flex flex-col justify-between gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-body-sm text-on-surface flex items-center gap-1.5 truncate">
                    <span className="material-symbols-outlined text-[16px] text-secondary">
                      {getDeviceSymbol(screen)}
                    </span>
                    <span className="truncate">{screen.name}</span>
                  </span>
                  {screen.rssiDbm && (
                    <span className="font-telemetry-code text-telemetry-code text-tertiary">
                      {screen.rssiDbm} dBm
                    </span>
                  )}
                </div>
                <div className="text-telemetry-code font-telemetry-code text-outline">
                  Say: &ldquo;
                  {screen.name.toLowerCase().includes('lg')
                    ? 'The LG TV'
                    : screen.name.toLowerCase().includes('tv')
                      ? 'The Samsung TV'
                      : screen.name.toLowerCase().includes('laptop')
                        ? 'My laptop'
                        : 'The iPad'}
                  &rdquo;
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => onVoiceCommand('Both screens')}
              className="rounded-xl border border-dashed border-primary/50 bg-primary-container/10 hover:bg-primary-container/20 p-3 text-left transition cursor-pointer flex flex-col justify-between gap-1.5"
            >
              <div className="font-semibold text-body-sm text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">cast_connected</span>
                All / Both Screens
              </div>
              <div className="text-telemetry-code font-telemetry-code text-on-surface-variant">
                Say: &ldquo;Project to both&rdquo;
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 2. INCOMING PROJECTION TAKEOVER PROMPT */}
      {incomingTakeoverPrompt && (
        <div className="rounded-xl border border-secondary/50 bg-surface-container-low p-5 shadow-xl relative overflow-hidden space-y-4">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-secondary" />
          <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-label-sm font-label-sm uppercase tracking-wider text-secondary">
                <span className="material-symbols-outlined text-[16px]">cast_connected</span>
                {incomingTakeoverPrompt.mode === 'auto_accepted'
                  ? 'Trusted LAN Auto-Takeover Executed'
                  : `Incoming Screen Takeover Prompt on ${incomingTakeoverPrompt.targetDevice.name}`}
              </div>
              <h3 className="text-headline-md font-headline-md text-on-surface">
                {incomingTakeoverPrompt.sourceDeviceName} wants to project &ldquo;
                {incomingTakeoverPrompt.threadTitle}&rdquo; onto{' '}
                <span className="text-secondary underline">
                  {incomingTakeoverPrompt.targetDevice.name}
                </span>
              </h3>
              <p className="text-telemetry-code font-telemetry-code text-outline">
                Protocol: {incomingTakeoverPrompt.targetDevice.protocol} •{' '}
                {incomingTakeoverPrompt.targetDevice.lastSeen}
              </p>
            </div>

            <button
              type="button"
              onClick={onDismissTakeoverPrompt}
              className="rounded-lg border border-outline-variant/40 bg-surface-container p-1.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
              title="Dismiss prompt"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pl-2">
            <button
              type="button"
              onClick={() =>
                onAcceptAndFullscreenTakeover(incomingTakeoverPrompt.targetDevice)
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-3.5 py-2 text-label-md font-label-md font-bold text-surface-container-lowest hover:bg-primary transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_full</span>
              Accept & Switch to Surface Theater Mode
            </button>

            {incomingTakeoverPrompt.targetDevice.surfaceRole === 'tv' && (
              <button
                type="button"
                onClick={() =>
                  onTriggerBrowserCastApi(incomingTakeoverPrompt.targetDevice)
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/40 bg-secondary/15 px-3.5 py-2 text-label-md font-label-md text-secondary hover:bg-secondary/25 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">tv</span>
                Send Pure JSON SSAP URL Handoff to {incomingTakeoverPrompt.targetDevice.name}
              </button>
            )}

            {incomingTakeoverPrompt.targetDevice.name.toLowerCase().includes('laptop') && (
              <button
                type="button"
                onClick={() =>
                  onTriggerMacWindowSpawn(incomingTakeoverPrompt.targetDevice)
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container px-3.5 py-2 text-label-md font-label-md text-on-surface hover:border-primary/40 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Pop Projection Window on Conor&apos;s Laptop
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

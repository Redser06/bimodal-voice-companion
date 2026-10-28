import React from 'react';
import {
  Bluetooth,
  Cast,
  CheckCircle2,
  ExternalLink,
  Laptop,
  Maximize2,
  Mic,
  Radio,
  ShieldCheck,
  Tablet,
  Tv,
  Wifi,
  X,
} from 'lucide-react';
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
  discoveredScreens,
  pendingDisambiguation,
  incomingTakeoverPrompt,
  requireDisambiguation,
  autoAcceptTakeover,
  onToggleRequireDisambiguation,
  onToggleAutoAcceptTakeover,
  onVoiceCommand,
  onDismissTakeoverPrompt,
  onAcceptAndFullscreenTakeover,
  onTriggerBrowserCastApi,
  onTriggerMacWindowSpawn,
  onRescanLanDevices,
}) => {
  const getDeviceIcon = (dev: DiscoveredScreenDevice) => {
    if (dev.surfaceRole === 'tv') return <Tv className="h-4 w-4 text-[#C2410C]" />;
    if (dev.name.toLowerCase().includes('laptop'))
      return <Laptop className="h-4 w-4 text-[#C2410C]" />;
    return <Tablet className="h-4 w-4 text-[#C2410C]" />;
  };

  const getProtocolBadge = (protocol: DiscoveredScreenDevice['protocol']) => {
    if (protocol === 'macos_host_spawner') return 'Mac OS Window Spawner + BLE';
    if (protocol === 'airplay_mdns') return 'mDNS _airplay._tcp / Cast';
    if (protocol === 'chromecast_mdns') return 'Chromecast CASTV2';
    if (protocol === 'ble_continuity') return 'Bluetooth LE Continuity';
    return 'Warm WebSocket Tab';
  };

  return (
    <div className="space-y-4">
      {/* 1. 2-SECOND VOICE SCREEN DISAMBIGUATION BANNER ("Which screen do you want?") */}
      {pendingDisambiguation?.active && (
        <div className="rounded-2xl border-2 border-[#C2410C] bg-[#FFEDD5]/70 p-5 shadow-md space-y-3.5 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C2410C] text-white">
                <Mic className="h-4 w-4 animate-pulse" />
              </span>
              <div>
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#C2410C]">
                  2-Second Voice Screen Disambiguation Active
                </div>
                <h3 className="text-sm font-bold text-[#1C1917]">
                  AI Pushback: &ldquo;I see {pendingDisambiguation.candidateScreens.length} screens on your network. Which screen do you want, or should I project to both?&rdquo;
                </h3>
              </div>
            </div>
            <span className="rounded-full bg-white border border-[#C2410C]/40 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#C2410C]">
              Say screen name or tap below
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            {pendingDisambiguation.candidateScreens.map((screen) => (
              <button
                key={screen.id}
                type="button"
                onClick={() => onVoiceCommand(screen.name)}
                className="rounded-xl border-2 border-[#1C1917] bg-white p-3 text-left hover:bg-[#1C1917] hover:text-white transition cursor-pointer group flex flex-col justify-between gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    {getDeviceIcon(screen)}
                    {screen.name}
                  </span>
                  {screen.rssiDbm && (
                    <span className="font-mono text-[10px] opacity-75">
                      {screen.rssiDbm} dBm
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-75 font-mono">
                  Say: &ldquo;{screen.name.includes('TV') ? 'The Samsung TV' : screen.name.includes('Laptop') ? 'My laptop' : 'The iPad'}&rdquo;
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => onVoiceCommand('Both screens')}
              className="rounded-xl border-2 border-dashed border-[#C2410C] bg-white p-3 text-left hover:bg-[#C2410C] hover:text-white transition cursor-pointer flex flex-col justify-between gap-1.5"
            >
              <div className="font-bold text-xs flex items-center gap-1.5">
                <Cast className="h-4 w-4 text-[#C2410C]" />
                All / Both Screens
              </div>
              <div className="text-[11px] opacity-75 font-mono">
                Say: &ldquo;Project to both&rdquo;
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 2. INCOMING PROJECTION TAKEOVER PROMPT (What the target TV / Laptop / Tab displays when targeted) */}
      {incomingTakeoverPrompt && (
        <div className="rounded-2xl border-2 border-[#1C1917] bg-[#1C1917] text-white p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#F97316]">
                <Cast className="h-4 w-4" />
                {incomingTakeoverPrompt.mode === 'auto_accepted'
                  ? 'Trusted LAN Auto-Takeover Executed'
                  : `Incoming Screen Takeover Prompt on ${incomingTakeoverPrompt.targetDevice.name}`}
              </div>
              <h3 className="text-base font-bold">
                {incomingTakeoverPrompt.sourceDeviceName} wants to project &ldquo;
                {incomingTakeoverPrompt.threadTitle}&rdquo; onto{' '}
                <span className="underline decoration-[#F97316]">
                  {incomingTakeoverPrompt.targetDevice.name}
                </span>
              </h3>
              <p className="text-xs text-[#A8A29E]">
                Discovery Protocol:{' '}
                <code className="text-white">
                  {getProtocolBadge(incomingTakeoverPrompt.targetDevice.protocol)}
                </code>{' '}
                • Proximity: <code className="text-white">{incomingTakeoverPrompt.targetDevice.lastSeen}</code>
              </p>
            </div>

            <button
              type="button"
              onClick={onDismissTakeoverPrompt}
              className="rounded-lg border border-white/20 p-1.5 text-white/70 hover:text-white cursor-pointer"
              title="Dismiss prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() =>
                onAcceptAndFullscreenTakeover(incomingTakeoverPrompt.targetDevice)
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#C2410C] px-4 py-2 text-xs font-bold text-white hover:bg-[#9A3412] transition cursor-pointer"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Accept & Expand Fullscreen View
            </button>

            {incomingTakeoverPrompt.targetDevice.surfaceRole === 'tv' && (
              <button
                type="button"
                onClick={() =>
                  onTriggerBrowserCastApi(incomingTakeoverPrompt.targetDevice)
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
              >
                <Tv className="h-3.5 w-3.5 text-[#F97316]" />
                Launch Chrome Presentation Cast / AirPlay to {incomingTakeoverPrompt.targetDevice.name}
              </button>
            )}

            {incomingTakeoverPrompt.targetDevice.name.toLowerCase().includes('laptop') && (
              <button
                type="button"
                onClick={() =>
                  onTriggerMacWindowSpawn(incomingTakeoverPrompt.targetDevice)
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 text-[#F97316]" />
                Pop Foreground Projection Window on Conor&apos;s Laptop
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. LIVE DISCOVERED LAN & BLUETOOTH SCREENS BAR */}
      <div className="rounded-2xl border border-[#E2DDD5] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-[#C2410C]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#1C1917]">
              Live Network & Bluetooth Screen Discovery (`dns-sd` AirPlay / Cast + BLE Proximity)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={onToggleRequireDisambiguation}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                requireDisambiguation
                  ? 'border-[#1C1917] bg-[#1C1917] text-white'
                  : 'border-[#E2DDD5] bg-[#FAF9F6] text-[#78716C]'
              }`}
            >
              <Mic className="h-3 w-3" />
              {requireDisambiguation
                ? 'Voice Pushback ("Which Screen?"): ON'
                : 'Voice Pushback: OFF (Auto-Route)'}
            </button>

            <button
              type="button"
              onClick={onToggleAutoAcceptTakeover}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                autoAcceptTakeover
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-[#E2DDD5] bg-[#FAF9F6] text-[#1C1917]'
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              {autoAcceptTakeover
                ? 'Target Screen: Trusted Auto-Takeover'
                : 'Target Screen: Show Permission Prompt'}
            </button>

            <button
              type="button"
              onClick={onRescanLanDevices}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2DDD5] bg-[#FAF9F6] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#C2410C] cursor-pointer"
            >
              <Wifi className="h-3 w-3 text-[#C2410C]" />
              Re-Scan LAN (`dns-sd`)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {discoveredScreens.map((dev) => {
            const isProjecting = dev.status === 'projecting_active';
            return (
              <div
                key={dev.id}
                className={`rounded-xl border p-3 flex items-center justify-between gap-3 transition ${
                  isProjecting
                    ? 'border-2 border-emerald-700 bg-emerald-50/40'
                    : 'border-[#E2DDD5] bg-[#FAF9F6]'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1C1917]">
                    {getDeviceIcon(dev)}
                    <span className="truncate">{dev.name}</span>
                    {dev.proximity === 'near_ble_desk' && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-900">
                        <Bluetooth className="h-2.5 w-2.5" /> BLE {dev.rssiDbm}dBm
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-[#78716C] truncate">
                    {getProtocolBadge(dev.protocol)} • {dev.lastSeen}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onVoiceCommand(`Show me on ${dev.name}`)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold shrink-0 transition cursor-pointer ${
                    isProjecting
                      ? 'bg-emerald-700 text-white inline-flex items-center gap-1'
                      : 'bg-white border border-[#E2DDD5] text-[#1C1917] hover:border-[#C2410C]'
                  }`}
                >
                  {isProjecting ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Projecting
                    </>
                  ) : (
                    'Project Here'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

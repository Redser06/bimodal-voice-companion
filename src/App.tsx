import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Brain,
  Eye,
  EyeOff,
  Hammer,
  Loader2,
  Sparkles,
  Terminal,
  Tv,
  Zap,
} from 'lucide-react';
import { INITIAL_SESSION_STATE } from './state/seedThreads';
import {
  extractActiveSchemaContext,
  processVoiceUtterance,
} from './engine/voiceController';
import {
  LanPresenceHeader,
  type ViewportSurfaceMode,
} from './components/LanPresenceHeader';
import { VoiceJewelPanel } from './components/VoiceJewelPanel';
import { DataAnalyticsCanvas } from './components/DataAnalyticsCanvas';
import { BlueprintSvgCanvas } from './components/BlueprintSvgCanvas';
import { SecondBrainDeckCanvas } from './components/SecondBrainDeckCanvas';
import { ParkedDigestDrawer } from './components/ParkedDigestDrawer';
import type { BimodalSessionState } from './types/bimodal';

function detectInitialSurfaceMode(): ViewportSurfaceMode {
  if (typeof window === 'undefined') return 'unified';
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const surfaceParam = params.get('surface');

  if (path === '/tv' || surfaceParam === 'tv') return 'tv';
  if (path === '/pad' || surfaceParam === 'pad') return 'pad';
  if (path === '/phone' || surfaceParam === 'phone') return 'phone';
  return 'unified';
}

export const App: React.FC = () => {
  const [session, setSession] = useState<BimodalSessionState>(INITIAL_SESSION_STATE);
  const [surfaceMode, setSurfaceMode] = useState<ViewportSurfaceMode>(detectInitialSurfaceMode);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lanEndpoint, setLanEndpoint] = useState('192.168.1.x:4321');
  const [wsConnected, setWsConnected] = useState(false);

  const clientIdRef = useRef<string>(
    (() => {
      try {
        const saved = localStorage.getItem('bimodal_surface_client_id');
        if (saved) return saved;
        const fresh = `surface-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('bimodal_surface_client_id', fresh);
        return fresh;
      } catch {
        return 'surface-local';
      }
    })()
  );

  const wsRef = useRef<WebSocket | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Stop active speech synthesis (Barge-In support)
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakBlufText = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.06;
        utterance.pitch = 1.0;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [ttsEnabled]
  );

  // Broadcast state patches over both LAN WebSocket and multi-tab BroadcastChannel
  const broadcastSessionState = useCallback((nextState: BimodalSessionState) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'state_patch',
          senderId: clientIdRef.current,
          state: nextState,
        })
      );
    }
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'state_sync',
        senderId: clientIdRef.current,
        state: nextState,
      });
    }
  }, []);

  // Connect to LAN WebSocket Bus + BroadcastChannel on mount
  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => r.json())
      .then((info) => {
        if (info?.lanIp) {
          setLanEndpoint(`${info.lanIp}:${info.port || 4321}`);
        }
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          setLanEndpoint(window.location.host || 'localhost:4321');
        }
      });

    // Multi-tab instant sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('bimodal_voice_companion_bus');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'state_sync' && ev.data?.senderId !== clientIdRef.current) {
          setSession(ev.data.state);
        }
      };
      broadcastChannelRef.current = bc;
    }

    // LAN WebSocket sync
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws-bimodal`;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: 'register_surface',
              clientId: clientIdRef.current,
              role: surfaceMode,
              label: `LAN ${surfaceMode.toUpperCase()} (${window.location.hostname})`,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data));
            if (msg.type === 'state_sync' && msg.state && msg.senderId !== clientIdRef.current) {
              setSession(msg.state);
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => setWsConnected(false);
        ws.onerror = () => setWsConnected(false);
      } catch {
        setWsConnected(false);
      }
    }

    return () => {
      wsRef.current?.close();
      broadcastChannelRef.current?.close();
    };
  }, [surfaceMode]);

  // Execute voice command against deterministic engine + Gemini Dual-Loop controller
  const handleVoiceCommand = useCallback(
    (utterance: string) => {
      // Barge-In: Immediately halt any active TTS playback when user speaks
      stopSpeaking();

      setSession((prev) => {
        const result = processVoiceUtterance(prev, utterance);

        // Speak the 2-sentence BLUF response
        speakBlufText(result.turn.blufSpokenResponse);

        // Broadcast to all paired LAN surfaces (<50ms)
        broadcastSessionState(result.nextState);

        // Execute side effects (e.g., real Second Brain MCP write or async Loop 2 resolve)
        if (result.sideEffect?.type === 'commit_second_brain') {
          fetch('/api/second-brain/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.sideEffect.payload),
          }).catch(() => {
            // Fallback gracefully when running on static hosting preview
          });
        } else if (result.sideEffect?.type === 'stage_async_resolve') {
          const targetThreadId = String(result.sideEffect.payload.threadId);
          setTimeout(() => {
            setSession((latest) => {
              const copy = structuredClone(latest);
              if (copy.threads[targetThreadId]) {
                copy.threads[targetThreadId].visibility = 'live_visible';
                copy.threads[targetThreadId].lastMutationDescription =
                  'Loop 2 (gemini-4-argon) completed cross-ledger staging';
              }
              broadcastSessionState(copy);
              return copy;
            });
          }, 1200);
        }

        return result.nextState;
      });
    },
    [broadcastSessionState, speakBlufText, stopSpeaking]
  );

  // Web Speech API Microphone Toggle with Barge-In
  const handleToggleListening = useCallback(() => {
    stopSpeaking();

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      // Fallback if browser doesn't expose Web Speech API
      handleVoiceCommand('Show me');
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setIsListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        handleVoiceCommand(transcript);
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    rec.start();
  }, [handleVoiceCommand, isListening, stopSpeaking]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setSession((prev) => {
        const next: BimodalSessionState = {
          ...prev,
          activeThreadId: threadId,
        };
        broadcastSessionState(next);
        return next;
      });
    },
    [broadcastSessionState]
  );

  const activeCanvas = session.threads[session.activeThreadId];
  const activeSchema = extractActiveSchemaContext(activeCanvas);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] flex flex-col">
      {/* Zero-Code LAN Presence & Multi-Surface Switcher Header */}
      <LanPresenceHeader
        surfaces={session.surfaces}
        activeSurfaceMode={surfaceMode}
        onSelectSurfaceMode={setSurfaceMode}
        lanEndpoint={lanEndpoint}
        wsConnected={wsConnected}
      />

      {/* Main Responsive Workspace */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 p-5 space-y-6">
        <div
          className={`grid gap-6 ${
            surfaceMode === 'unified'
              ? 'grid-cols-1 lg:grid-cols-12'
              : 'grid-cols-1'
          }`}
        >
          {/* PRIMARY CHANNEL: VOICE JEWEL (Shown in Unified and Phone modes) */}
          {(surfaceMode === 'unified' || surfaceMode === 'phone') && (
            <div className={surfaceMode === 'unified' ? 'lg:col-span-4' : 'max-w-2xl mx-auto w-full'}>
              <VoiceJewelPanel
                session={session}
                activeCanvas={activeCanvas}
                isListening={isListening}
                isSpeaking={isSpeaking}
                ttsEnabled={ttsEnabled}
                onToggleListening={handleToggleListening}
                onToggleTts={() => {
                  if (ttsEnabled) stopSpeaking();
                  setTtsEnabled((v) => !v);
                }}
                onStopSpeaking={stopSpeaking}
                onVoiceCommand={handleVoiceCommand}
                onSelectThread={handleSelectThread}
              />
            </div>
          )}

          {/* SECONDARY CHANNEL: LIVE VOICE-CONTROLLED VISUAL CANVAS (Shown in Unified, iPad, and TV modes) */}
          {(surfaceMode === 'unified' || surfaceMode === 'pad' || surfaceMode === 'tv') && (
            <div
              className={
                surfaceMode === 'unified'
                  ? 'lg:col-span-8'
                  : 'w-full'
              }
            >
              <div
                className={`rounded-2xl border-2 p-5 transition-all flex flex-col justify-between min-h-[620px] ${
                  surfaceMode === 'tv'
                    ? 'border-[#1C1917] bg-white shadow-md'
                    : 'border-[#1C1917] bg-white shadow-xs'
                }`}
              >
                <div className="space-y-4">
                  {/* Companion Surface Header & Engine Tabs */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECE8E1] pb-3.5">
                    <div>
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
                        <Tv className="h-3.5 w-3.5 text-[#C2410C]" />
                        Secondary Surface —{' '}
                        {surfaceMode === 'tv'
                          ? 'Office 65" Wall Display (/tv)'
                          : surfaceMode === 'pad'
                            ? 'Workbench iPad Pro (/pad)'
                            : `Paired Surface (${activeCanvas.targetSurfaces.join(' + ').toUpperCase()})`}
                      </div>
                      <h2 className="text-lg font-bold text-[#1C1917]">
                        {activeCanvas.dataSpec?.title ||
                          activeCanvas.blueprintSpec?.title ||
                          activeCanvas.brainDeckSpec?.title}
                      </h2>
                    </div>

                    {/* 3 Built-In Artifact Engine Switcher Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectThread('gp-golf-margins')}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          activeCanvas.engine === 'data_analytics'
                            ? 'bg-[#1C1917] text-white'
                            : 'bg-[#FAF9F6] text-[#1C1917] border border-[#E2DDD5] hover:border-[#C2410C]'
                        }`}
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-[#C2410C]" />
                        1. Live Data & Slicing
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectThread('carpenter-workbench')}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          activeCanvas.engine === 'blueprint_svg'
                            ? 'bg-[#1C1917] text-white'
                            : 'bg-[#FAF9F6] text-[#1C1917] border border-[#E2DDD5] hover:border-[#C2410C]'
                        }`}
                      >
                        <Hammer className="h-3.5 w-3.5 text-[#C2410C]" />
                        2. Carpenter CAD Blueprint
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectThread('second-brain-standup')}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          activeCanvas.engine === 'second_brain_deck'
                            ? 'bg-[#1C1917] text-white'
                            : 'bg-[#FAF9F6] text-[#1C1917] border border-[#E2DDD5] hover:border-[#C2410C]'
                        }`}
                      >
                        <Brain className="h-3.5 w-3.5 text-[#C2410C]" />
                        3. Second Brain Deck
                      </button>
                    </div>
                  </div>

                  {/* Real-Time Deterministic Mutation Trace Bar */}
                  <div className="rounded-xl bg-[#1C1917] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap className="h-3.5 w-3.5 text-[#F97316] shrink-0" />
                      <span className="truncate">
                        STATE BUS ({activeCanvas.lastMutationLatencyMs}ms):{' '}
                        <strong className="text-[#FFEDD5]">
                          {activeCanvas.lastMutationDescription}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[11px]">
                        Visibility: {activeCanvas.visibility.toUpperCase()}
                      </span>
                      {activeCanvas.visibility === 'staged_hidden' ? (
                        <button
                          type="button"
                          onClick={() => handleVoiceCommand('Show me')}
                          className="inline-flex items-center gap-1 rounded bg-[#C2410C] px-2.5 py-0.5 text-[11px] font-sans font-bold text-white hover:bg-[#9A3412] cursor-pointer"
                        >
                          <Eye className="h-3 w-3" /> Say &ldquo;Show Me&rdquo;
                        </button>
                      ) : (
                        <span className="text-emerald-400 text-[11px]">
                          ● Live Voice Control Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Canvas Visibility State Machine:
                      1. staged_hidden -> Pre-staged Standby Card (until user says "Show me")
                      2. staging_in_progress -> Shimmer Skeleton (race-condition guard)
                      3. live_visible -> Full Interactive Voice-Controlled Engine */}
                  {activeCanvas.visibility === 'staging_in_progress' ? (
                    <div className="rounded-xl border-2 border-dashed border-[#C2410C]/50 bg-[#FAF9F6] p-12 text-center space-y-3 animate-pulse">
                      <Loader2 className="h-8 w-8 text-[#C2410C] animate-spin mx-auto" />
                      <div className="text-sm font-bold text-[#1C1917]">
                        Loop 2 (`gemini-4-argon`) Synthesizing Payload...
                      </div>
                      <p className="text-xs text-[#78716C] max-w-md mx-auto">
                        Early &ldquo;Show me&rdquo; race guard active: streaming structured schema keys into Loop 1 as soon as synthesis completes.
                      </p>
                    </div>
                  ) : activeCanvas.visibility === 'staged_hidden' ? (
                    <div className="space-y-4">
                      {/* Pre-Staged Standby Banner (Explains the 2-Stage "Show Me" Modality Contract) */}
                      <div className="rounded-xl border-2 border-dashed border-[#C8C2B7] bg-[#FAF9F6] p-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#C2410C]">
                            <EyeOff className="h-3.5 w-3.5" />
                            Eyes-Free Default State — Payload Pre-Staged in Background (0ms Wait)
                          </div>
                          <p className="text-xs text-[#78716C] max-w-2xl">
                            The voice agent gave you the 2-sentence BLUF without lecturing you. The detailed{' '}
                            <strong>{activeCanvas.threadDomain}</strong> artifact is already staged below—say{' '}
                            <strong>&ldquo;Show me&rdquo;</strong> (or any mutation command like{' '}
                            <strong>&ldquo;Remove sales of golf balls&rdquo;</strong>) to lock live voice control.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleVoiceCommand('Show me')}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#C2410C] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#9A3412] transition shadow-xs cursor-pointer shrink-0"
                        >
                          <Eye className="h-4 w-4" />
                          Say &ldquo;Show Me&rdquo; (0ms Reveal)
                        </button>
                      </div>

                      {/* Preview of the Active Engine */}
                      <div className="opacity-95">
                        {activeCanvas.engine === 'data_analytics' && (
                          <DataAnalyticsCanvas
                            canvas={activeCanvas}
                            onVoiceCommand={handleVoiceCommand}
                          />
                        )}
                        {activeCanvas.engine === 'blueprint_svg' && (
                          <BlueprintSvgCanvas
                            canvas={activeCanvas}
                            onVoiceCommand={handleVoiceCommand}
                          />
                        )}
                        {activeCanvas.engine === 'second_brain_deck' && (
                          <SecondBrainDeckCanvas
                            canvas={activeCanvas}
                            onVoiceCommand={handleVoiceCommand}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {activeCanvas.engine === 'data_analytics' && (
                        <DataAnalyticsCanvas
                          canvas={activeCanvas}
                          onVoiceCommand={handleVoiceCommand}
                        />
                      )}
                      {activeCanvas.engine === 'blueprint_svg' && (
                        <BlueprintSvgCanvas
                          canvas={activeCanvas}
                          onVoiceCommand={handleVoiceCommand}
                        />
                      )}
                      {activeCanvas.engine === 'second_brain_deck' && (
                        <SecondBrainDeckCanvas
                          canvas={activeCanvas}
                          onVoiceCommand={handleVoiceCommand}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Active Schema Context Inspector (Loop 1 <-> Loop 2 Handshake) */}
                <div className="mt-5 pt-3 border-t border-[#ECE8E1] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#78716C]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Terminal className="h-3.5 w-3.5 text-[#C2410C] shrink-0" />
                    <span>
                      Injected Schema Keys (`gemini-3.8-flash`):{' '}
                      {activeSchema.availableSeriesNames.length > 0
                        ? `series=[${activeSchema.availableSeriesNames.join(', ')}]`
                        : activeSchema.engine === 'blueprint_svg'
                          ? `zoomTargets=[${activeSchema.availableZoomTargets.join(', ')}]`
                          : `cards=[${activeSchema.availableCardIds.length} entries]`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[#1C1917] font-sans font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-[#C2410C]" />
                    Bimodal Sync Ready for TARS
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* In-Transit / Android Auto Parked Digest Queue ("I'll text you the information") */}
        <ParkedDigestDrawer
          digests={session.parkedDigests}
          onPlayDigestAudio={speakBlufText}
          onSelectThread={handleSelectThread}
          onTriggerNewDigest={() =>
            handleVoiceCommand('Text me the information for when I park')
          }
        />
      </main>
    </div>
  );
};

export default App;

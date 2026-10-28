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
import { normalizeForNaturalSpeech } from './engine/modalityRouter';
import {
  LanPresenceHeader,
  type ViewportSurfaceMode,
} from './components/LanPresenceHeader';
import { VoiceJewelPanel } from './components/VoiceJewelPanel';
import { DataAnalyticsCanvas } from './components/DataAnalyticsCanvas';
import { BlueprintSvgCanvas } from './components/BlueprintSvgCanvas';
import { SecondBrainDeckCanvas } from './components/SecondBrainDeckCanvas';
import { ParkedDigestDrawer } from './components/ParkedDigestDrawer';
import { ModalityRouterPanel } from './components/ModalityRouterPanel';
import { ScreenTakeoverModal } from './components/ScreenTakeoverModal';
import type {
  BimodalSessionState,
  DiscoveredScreenDevice,
  PhysicalContextMode,
  VoicePersona,
} from './types/bimodal';

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

/**
 * Ranks available browser SpeechSynthesis voices to avoid legacy robotic synthesizers
 * ("Fred", "Albert", "Ralph") and lock onto modern neural/enhanced voices ("Ava", "Samantha", "Daniel", "Karen", "Moira", "Google").
 */
function pickBestNeuralBrowserVoice(
  voices: SpeechSynthesisVoice[],
  persona: VoicePersona
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith('en')
  );
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // Strongly penalize novelty/robotic macOS voices
  const roboticBlacklist = [
    'fred',
    'albert',
    'ralph',
    'bahh',
    'bells',
    'boing',
    'bubbles',
    'cellos',
    'wobble',
    'jester',
    'organ',
    'zarvox',
    'trinoids',
    'whisper',
  ];

  // Persona preference mapping so switching Kore / Puck / Aoede / Charon changes vocal timbre even offline
  const personaPreferredNames: Record<VoicePersona, string[]> = {
    Kore: ['samantha', 'ava', 'allison', 'google us english', 'siri', 'karen', 'moira'],
    Puck: ['daniel', 'oliver', 'google uk english male', 'arthur', 'aaron', 'reed'],
    Aoede: ['moira', 'karen', 'serena', 'tessa', 'google uk english female', 'flo'],
    Charon: ['daniel', 'gordon', 'rishi', 'google uk english male', 'eddy'],
  };

  const preferredList = personaPreferredNames[persona] || personaPreferredNames.Kore;

  const scored = pool.map((v) => {
    const nameLower = v.name.toLowerCase();
    let score = 0;

    if (roboticBlacklist.some((bad) => nameLower.includes(bad))) {
      score -= 1000;
    }
    if (nameLower.includes('premium') || nameLower.includes('natural')) {
      score += 120;
    }
    if (nameLower.includes('enhanced') || nameLower.includes('siri')) {
      score += 90;
    }
    if (nameLower.includes('google')) {
      score += 75;
    }
    const prefIdx = preferredList.findIndex((p) => nameLower.includes(p));
    if (prefIdx !== -1) {
      score += 80 - prefIdx * 8;
    }
    if (v.default) {
      score += 10;
    }
    return { voice: v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.voice || null;
}

export const App: React.FC = () => {
  const [session, setSession] = useState<BimodalSessionState>(INITIAL_SESSION_STATE);
  const [surfaceMode, setSurfaceMode] = useState<ViewportSurfaceMode>(detectInitialSurfaceMode);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lanEndpoint, setLanEndpoint] = useState('192.168.1.198:4321');
  const [wsConnected, setWsConnected] = useState(false);
  const [hasServerGeminiKey, setHasServerGeminiKey] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('bimodal_gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeVoiceEngineLabel, setActiveVoiceEngineLabel] = useState<string>(
    'Neural Phonetic Engine (Kore)'
  );

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

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

  // Load and rank browser SpeechSynthesis voices so we never default to robotic "Fred"
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        setAvailableVoices(list);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Stop active speech synthesis or Gemini 3.8 WAV playback (Barge-In support)
  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakNaturalBluf = useCallback(
    async (rawText: string, persona: VoicePersona, styleDirective: string) => {
      if (!ttsEnabled || typeof window === 'undefined') return;
      stopSpeaking();

      const phoneticText = normalizeForNaturalSpeech(rawText);

      // 1. Call Server Neural TTS (`/api/tts` -> `gemini-3.8-flash-tts` when key present, or 24kHz natural WAV engine)
      try {
        setIsSpeaking(true);
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: phoneticText,
            voice: persona,
            style: styleDirective,
            apiKey: geminiApiKey,
          }),
        });
        const data = await resp.json();
        if (data?.ok && data?.audioBase64) {
          setActiveVoiceEngineLabel(
            `${data.model || 'gemini-3.8-flash-tts'} • ${persona}`
          );
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
          );
          audioPlayerRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          await audio.play();
          return;
        }
      } catch {
        // Fall through to Ranked Neural Browser Voice + Phonetic Normalizer (e.g. on static cloud preview)
      }

      // 2. Ranked Neural OS / Browser Voice + Phonetic Normalizer
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(phoneticText);
          const bestVoice = pickBestNeuralBrowserVoice(availableVoices, persona);
          if (bestVoice) {
            utterance.voice = bestVoice;
            setActiveVoiceEngineLabel(
              `Neural Voice: ${bestVoice.name} (${persona} profile)`
            );
          } else {
            setActiveVoiceEngineLabel(`Phonetic Normalizer (${persona})`);
          }
          // Natural conversational cadence (not sped-up robotic rate)
          utterance.rate = 0.98;
          utterance.pitch = persona === 'Charon' ? 0.94 : 1.0;
          utterance.onstart = () => setIsSpeaking(true);
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } catch {
          setIsSpeaking(false);
        }
      }
    },
    [availableVoices, geminiApiKey, hasServerGeminiKey, stopSpeaking, ttsEnabled]
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
        if (info?.hasServerGeminiKey) {
          setHasServerGeminiKey(true);
        }
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          setLanEndpoint(window.location.host || 'localhost:4321');
        }
      });

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('bimodal_voice_companion_bus');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'state_sync' && ev.data?.senderId !== clientIdRef.current) {
          setSession(ev.data.state);
        }
      };
      broadcastChannelRef.current = bc;
    }

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

  // Execute voice command against deterministic engine + Modality Router
  const handleVoiceCommand = useCallback(
    (utterance: string) => {
      stopSpeaking();

      setSession((prev) => {
        const usingCloudTts = Boolean(geminiApiKey || hasServerGeminiKey);
        const result = processVoiceUtterance(
          prev,
          utterance,
          undefined,
          usingCloudTts
        );

        // Speak the phonetically normalized BLUF response via Gemini 3.8 TTS or Ranked Neural Voice
        void speakNaturalBluf(
          result.turn.blufSpokenResponse,
          result.nextState.voicePersona,
          result.turn.routingReceipt.earChannel.styleDirective
        );

        // Broadcast to all paired LAN surfaces (<50ms)
        broadcastSessionState(result.nextState);

        if (result.sideEffect?.type === 'commit_second_brain') {
          fetch('/api/second-brain/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.sideEffect.payload),
          }).catch(() => {});
        } else if (result.sideEffect?.type === 'trigger_screen_takeover') {
          fetch('/api/takeover-screen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.sideEffect.payload),
          }).catch(() => {});
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
    [broadcastSessionState, geminiApiKey, hasServerGeminiKey, speakNaturalBluf, stopSpeaking]
  );

  // Live LAN mDNS / AirPlay (`dns-sd`) & Bluetooth Discovery Rescan
  const handleRescanLanDevices = useCallback(async () => {
    try {
      const resp = await fetch('/api/lan-devices');
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.devices)) {
        setSession((prev) => {
          const next: BimodalSessionState = {
            ...prev,
            discoveredScreens: data.devices as DiscoveredScreenDevice[],
          };
          broadcastSessionState(next);
          return next;
        });
      }
    } catch {
      // Keep existing discovered screens when running on static preview
    }
  }, [broadcastSessionState]);

  const handleAcceptAndFullscreenTakeover = useCallback(
    (device: DiscoveredScreenDevice) => {
      setSession((prev) => {
        const next = structuredClone(prev);
        const active = next.threads[next.activeThreadId];
        if (active) {
          active.visibility = 'live_visible';
          active.lastMutationDescription = `Screen Takeover Accepted (${device.name} • Fullscreen)`;
        }
        next.incomingTakeoverPrompt = null;
        broadcastSessionState(next);
        return next;
      });

      if (canvasContainerRef.current && canvasContainerRef.current.requestFullscreen) {
        canvasContainerRef.current.requestFullscreen().catch(() => {});
      }
    },
    [broadcastSessionState]
  );

  const handleDismissTakeoverPrompt = useCallback(() => {
    setSession((prev) => {
      const next: BimodalSessionState = {
        ...prev,
        incomingTakeoverPrompt: null,
      };
      broadcastSessionState(next);
      return next;
    });
  }, [broadcastSessionState]);

  const handleTriggerBrowserCastApi = useCallback(
    (screen: DiscoveredScreenDevice) => {
      // 1. Try W3C PresentationRequest API (supported in Chrome for Cast / AirPlay Secondary Screens)
      const targetUrl = `${window.location.origin}/?surface=${screen.surfaceRole}&takeover=1`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PresentationReq = (window as any).PresentationRequest;
      if (PresentationReq) {
        try {
          const req = new PresentationReq([targetUrl]);
          req.start().catch(() => {
            window.open(
              targetUrl,
              `bimodal_cast_${screen.id}`,
              'width=1280,height=800,menubar=no,toolbar=no'
            );
          });
          return;
        } catch {
          // Fall back to companion projection window
        }
      }
      // 2. Fallback: Open dedicated Cast Receiver Window
      window.open(
        targetUrl,
        `bimodal_cast_${screen.id}`,
        'width=1280,height=800,menubar=no,toolbar=no'
      );
    },
    []
  );

  const handleTriggerMacWindowSpawn = useCallback(
    async (screen: DiscoveredScreenDevice) => {
      try {
        const resp = await fetch('/api/takeover-screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetScreenId: screen.id,
            targetScreenName: screen.name,
            threadTitle:
              session.threads[session.activeThreadId]?.threadTitle || 'Bimodal Canvas',
            spawnMacWindow: true,
          }),
        });
        const data = await resp.json();
        if (!data?.spawnedWindow) {
          window.open(
            `${window.location.origin}/?surface=${screen.surfaceRole}&takeover=1`,
            `bimodal_mac_${screen.id}`,
            'width=1200,height=820'
          );
        }
      } catch {
        window.open(
          `${window.location.origin}/?surface=${screen.surfaceRole}&takeover=1`,
          `bimodal_mac_${screen.id}`,
          'width=1200,height=820'
        );
      }
    },
    [session.activeThreadId, session.threads]
  );

  const handleToggleRequireDisambiguation = useCallback(() => {
    setSession((prev) => {
      const next: BimodalSessionState = {
        ...prev,
        requireDisambiguationWhenMultipleScreens:
          !prev.requireDisambiguationWhenMultipleScreens,
      };
      broadcastSessionState(next);
      return next;
    });
  }, [broadcastSessionState]);

  const handleToggleAutoAcceptTakeover = useCallback(() => {
    setSession((prev) => {
      const next: BimodalSessionState = {
        ...prev,
        autoAcceptScreenTakeover: !prev.autoAcceptScreenTakeover,
      };
      broadcastSessionState(next);
      return next;
    });
  }, [broadcastSessionState]);

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

  const handleChangePhysicalContext = useCallback(
    (physicalContext: PhysicalContextMode) => {
      setSession((prev) => {
        const next: BimodalSessionState = {
          ...prev,
          physicalContext,
        };
        broadcastSessionState(next);
        return next;
      });
    },
    [broadcastSessionState]
  );

  const handleChangeVoicePersona = useCallback(
    (voicePersona: VoicePersona) => {
      setSession((prev) => {
        const next: BimodalSessionState = {
          ...prev,
          voicePersona,
        };
        broadcastSessionState(next);
        return next;
      });
    },
    [broadcastSessionState]
  );

  const handleSaveGeminiApiKey = useCallback((key: string) => {
    setGeminiApiKey(key);
    try {
      if (key) {
        localStorage.setItem('bimodal_gemini_api_key', key);
      } else {
        localStorage.removeItem('bimodal_gemini_api_key');
      }
    } catch {
      // ignore
    }
  }, []);

  const activeCanvas = session.threads[session.activeThreadId];
  const activeSchema = extractActiveSchemaContext(activeCanvas);
  const latestReceipt = session.voiceHistory[0]?.routingReceipt;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] flex flex-col">
      {/* Zero-Code LAN Presence, Gemini 3.8 TTS Key Config & Multi-Surface Switcher Header */}
      <LanPresenceHeader
        surfaces={session.surfaces}
        activeSurfaceMode={surfaceMode}
        onSelectSurfaceMode={setSurfaceMode}
        lanEndpoint={lanEndpoint}
        wsConnected={wsConnected}
        geminiApiKey={geminiApiKey}
        onSaveGeminiApiKey={handleSaveGeminiApiKey}
        activeVoiceEngineLabel={activeVoiceEngineLabel}
      />

      {/* Main Responsive Workspace */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 p-5 space-y-6">
        {/* Deterministic Modality Router & Phonetic Normalizer Telemetry Bar */}
        {latestReceipt && (
          <ModalityRouterPanel
            receipt={latestReceipt}
            physicalContext={session.physicalContext}
            voicePersona={session.voicePersona}
            activeVoiceEngineLabel={activeVoiceEngineLabel}
            onChangePhysicalContext={handleChangePhysicalContext}
            onChangeVoicePersona={handleChangeVoicePersona}
          />
        )}

        {/* Live Network / Bluetooth Screen Discovery + 2-Second Voice Screen Disambiguation + Incoming Takeover Prompt */}
        <ScreenTakeoverModal
          discoveredScreens={session.discoveredScreens}
          pendingDisambiguation={session.pendingDisambiguation}
          incomingTakeoverPrompt={session.incomingTakeoverPrompt}
          requireDisambiguation={session.requireDisambiguationWhenMultipleScreens}
          autoAcceptTakeover={session.autoAcceptScreenTakeover}
          onToggleRequireDisambiguation={handleToggleRequireDisambiguation}
          onToggleAutoAcceptTakeover={handleToggleAutoAcceptTakeover}
          onVoiceCommand={handleVoiceCommand}
          onDismissTakeoverPrompt={handleDismissTakeoverPrompt}
          onAcceptAndFullscreenTakeover={handleAcceptAndFullscreenTakeover}
          onTriggerBrowserCastApi={handleTriggerBrowserCastApi}
          onTriggerMacWindowSpawn={handleTriggerMacWindowSpawn}
          onRescanLanDevices={handleRescanLanDevices}
        />

        <div
          className={`grid gap-6 ${
            surfaceMode === 'unified'
              ? 'grid-cols-1 lg:grid-cols-12'
              : 'grid-cols-1'
          }`}
        >
          {/* PRIMARY CHANNEL: VOICE JEWEL (Shown in Unified and Phone modes) */}
          {(surfaceMode === 'unified' || surfaceMode === 'phone') && (
            <div
              className={
                surfaceMode === 'unified'
                  ? 'lg:col-span-4'
                  : 'max-w-2xl mx-auto w-full'
              }
            >
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
          {(surfaceMode === 'unified' ||
            surfaceMode === 'pad' ||
            surfaceMode === 'tv') && (
            <div
              ref={canvasContainerRef}
              className={surfaceMode === 'unified' ? 'lg:col-span-8' : 'w-full'}
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
                      <div className="rounded-xl border-2 border-dashed border-[#C8C2B7] bg-[#FAF9F6] p-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#C2410C]">
                            <EyeOff className="h-3.5 w-3.5" />
                            {session.physicalContext === 'in_car_driving'
                              ? 'Driving Safety Gate Active — Visual Popup Suppressed & Auto-Routed to Phone Queue'
                              : 'Eyes-Free Default State — Payload Pre-Staged in Background (0ms Wait)'}
                          </div>
                          <p className="text-xs text-[#78716C] max-w-2xl">
                            {session.physicalContext === 'in_car_driving'
                              ? 'Because Physical Context is set to In-Car Driving, the Deterministic Modality Router held back the visual chart and auto-queued a digest to your Phone Parked Drawer below.'
                              : `The voice agent gave you the 2-sentence BLUF without lecturing you. The detailed ${activeCanvas.threadDomain} artifact is already staged below—say "Show me" to lock live voice control.`}
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

                {/* Bottom Active Schema Context Inspector */}
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
          onPlayDigestAudio={(summary) =>
            void speakNaturalBluf(
              summary,
              session.voicePersona,
              'clear, eyes-free road briefing, warm conversational tone'
            )
          }
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

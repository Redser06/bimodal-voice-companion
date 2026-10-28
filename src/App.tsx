import React, { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_SESSION_STATE } from './state/seedThreads';
import {
  extractActiveSchemaContext,
  processVoiceUtterance,
} from './engine/voiceController';
import { normalizeForNaturalSpeech } from './engine/modalityRouter';
import { type ViewportSurfaceMode } from './components/LanPresenceHeader';
import { DataAnalyticsCanvas } from './components/DataAnalyticsCanvas';
import { BlueprintSvgCanvas } from './components/BlueprintSvgCanvas';
import { SecondBrainDeckCanvas } from './components/SecondBrainDeckCanvas';
import { ParkedDigestDrawer } from './components/ParkedDigestDrawer';
import { ScreenTakeoverModal } from './components/ScreenTakeoverModal';
import type {
  BimodalSessionState,
  DiscoveredScreenDevice,
  PhysicalContextMode,
  VoicePersona,
} from './types/bimodal';

export type ArgonWorkspaceTab = 'hero_live' | 'surface_mesh';

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

function pickBestNeuralBrowserVoice(
  voices: SpeechSynthesisVoice[],
  persona: VoicePersona
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith('en')
  );
  const pool = englishVoices.length > 0 ? englishVoices : voices;

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
  const [workspaceTab, setWorkspaceTab] = useState<ArgonWorkspaceTab>('hero_live');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [customUtterance, setCustomUtterance] = useState('');
  const [lanEndpoint, setLanEndpoint] = useState('192.168.1.198:4321');
  const [wsConnected, setWsConnected] = useState(false);
  const [hasServerGeminiKey, setHasServerGeminiKey] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('bimodal_gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeVoiceEngineLabel, setActiveVoiceEngineLabel] = useState<string>(
    'gemini-3.8-flash-tts · Kore'
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

  const handleSetPlaybackSpeed = useCallback((speed: 1 | 1.25 | 1.5) => {
    setPlaybackSpeed(speed);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = speed;
    }
  }, []);

  const speakNaturalBluf = useCallback(
    async (rawText: string, persona: VoicePersona, styleDirective: string) => {
      if (!ttsEnabled || typeof window === 'undefined') return;
      stopSpeaking();

      const phoneticText = normalizeForNaturalSpeech(rawText);

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
            `${data.model || 'gemini-3.8-flash-tts'} · ${persona}`
          );
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
          );
          audio.playbackRate = playbackSpeed;
          audioPlayerRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          await audio.play();
          return;
        }
      } catch {
        // Fall through to Ranked Neural Browser Voice + Phonetic Normalizer
      }

      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(phoneticText);
          const bestVoice = pickBestNeuralBrowserVoice(availableVoices, persona);
          if (bestVoice) {
            utterance.voice = bestVoice;
            setActiveVoiceEngineLabel(
              `Neural Voice: ${bestVoice.name} (${persona})`
            );
          } else {
            setActiveVoiceEngineLabel(`Phonetic Normalizer (${persona})`);
          }
          utterance.rate = 0.98 * playbackSpeed;
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
    [availableVoices, geminiApiKey, playbackSpeed, stopSpeaking, ttsEnabled]
  );

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

        void speakNaturalBluf(
          result.turn.blufSpokenResponse,
          result.nextState.voicePersona,
          result.turn.routingReceipt.earChannel.styleDirective
        );

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
          active.lastMutationDescription = `Screen Takeover Accepted (${device.name} • In-Window Theater Mode)`;
        }
        next.incomingTakeoverPrompt = null;
        broadcastSessionState(next);
        return next;
      });
      setSurfaceMode(device.surfaceRole === 'tv' ? 'tv' : 'pad');
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
      fetch('/api/takeover-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetScreenId: screen.id,
          targetScreenName: screen.name,
          threadTitle:
            session.threads[session.activeThreadId]?.threadTitle || 'Bimodal Canvas',
          spawnMacWindow: false,
        }),
      }).catch(() => {});
    },
    [session.activeThreadId, session.threads]
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

  // Global Spacebar Push-To-Talk / Barge-In Listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleListening();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToggleListening]);

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

  const handleCustomUtteranceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUtterance.trim()) return;
    handleVoiceCommand(customUtterance.trim());
    setCustomUtterance('');
  };

  const activeCanvas = session.threads[session.activeThreadId];
  const activeSchema = extractActiveSchemaContext(activeCanvas);
  const latestTurn = session.voiceHistory[0];
  const latestReceipt = latestTurn?.routingReceipt;
  const activeProjectingDevice =
    session.discoveredScreens.find((d) => d.status === 'projecting_active') ||
    session.discoveredScreens[0];

  const heroVoiceChips = [
    { label: '"Why did net margins drop?"', cmd: 'Why did net margins drop?', active: true },
    {
      label: '"Strip out golf balls"',
      cmd: 'Remove sales of golf balls from the analysis',
      active: false,
    },
    {
      label: '"Project to LG OLED TV"',
      cmd: 'Show me on the LG TV',
      active: false,
    },
    { label: '"Zoom to Q3 Matrix"', cmd: 'Zoom in on Q3', active: false },
    {
      label: '"Show me on the screen" (2s Pushback)',
      cmd: 'Show me on the screen',
      active: false,
    },
    {
      label: '"Text me the information"',
      cmd: 'Text me the information for when I park',
      active: false,
    },
  ];

  // ============================================================================
  // MOBILE COMPANION SHELL (`/phone` mode — Matches Templates 3 & 4)
  // ============================================================================
  if (surfaceMode === 'phone') {
    return (
      <div className="bg-surface text-on-surface font-body-md antialiased min-h-screen pb-24 selection:bg-primary-container selection:text-on-primary-container">
        {/* Top App Bar */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/25 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-primary-container/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-container text-lg">
                  graphic_eq
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">
                    Argon DSP
                  </h1>
                  <span className="px-1.5 py-0.5 text-label-sm font-label-sm bg-primary-container/15 text-primary border border-primary-container/30 rounded">
                    v3.8 MOBILE
                  </span>
                </div>
                <p className="font-telemetry-code text-telemetry-code text-on-surface-variant">
                  {activeVoiceEngineLabel} · {lanEndpoint}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSurfaceMode('unified')}
                className="px-2.5 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-label-sm font-label-sm text-secondary cursor-pointer"
              >
                Desktop View
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 pt-20 space-y-5">
          {/* Primary Voice Jewel Centerpiece */}
          <section className="relative rounded-xl bg-surface-container-low border border-outline-variant/30 p-5 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">
                  record_voice_over
                </span>
                <span className="font-label-md text-label-md uppercase text-on-surface-variant">
                  Primary Channel · Voice Jewel
                </span>
              </div>
              <span className="font-telemetry-code text-telemetry-code text-tertiary bg-tertiary/10 px-2 py-0.5 rounded border border-tertiary/20">
                0ms Wait · Natural Prosody
              </span>
            </div>

            <div className="relative py-6 flex flex-col items-center justify-center">
              <div className="absolute w-44 h-44 rounded-full border border-primary-container/15 animate-ping opacity-20" />
              <div className="absolute w-36 h-36 rounded-full border border-primary-container/30" />
              <button
                type="button"
                onClick={handleToggleListening}
                className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-br from-primary-container to-on-primary-fixed-variant voice-orb-active flex flex-col items-center justify-center border border-primary/40 cursor-pointer"
              >
                <div className="flex items-end gap-1 h-7 mb-1">
                  <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-1" />
                  <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-2" />
                  <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-3" />
                  <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-4" />
                  <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-5" />
                </div>
                <span className="font-label-sm text-label-sm text-surface-container-lowest font-bold uppercase tracking-widest">
                  {isListening ? 'Listening' : isSpeaking ? 'Speaking' : 'Tap Mic'}
                </span>
              </button>
            </div>

            {/* Active Spoken BLUF */}
            <div className="bg-surface-container-lowest/90 border border-outline-variant/25 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-primary uppercase">
                  Spoken Executive BLUF ({latestTurn ? Math.max(2, Math.round(latestTurn.wordCount / 3)) : 6}s)
                </span>
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="text-label-sm font-label-sm text-error uppercase cursor-pointer"
                >
                  Interrupt
                </button>
              </div>
              <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                &ldquo;{latestTurn?.blufSpokenResponse}&rdquo;
              </p>
            </div>

            {/* Quick Voice Chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {heroVoiceChips.slice(0, 4).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleVoiceCommand(chip.cmd)}
                  className="px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-label-sm font-label-sm text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </section>

          {/* Modality Router & Environment Toggles */}
          <section className="rounded-xl bg-surface-container-low border border-outline-variant/25 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-label-lg text-label-lg text-on-surface uppercase">
                Environment Context Gate
              </span>
              <span className="font-telemetry-code text-telemetry-code text-secondary">
                {session.physicalContext}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'multi_screen_room', icon: 'devices', label: 'Multi-Screen' },
                  { id: 'hands_busy_workshop', icon: 'precision_manufacturing', label: 'Hands-Busy' },
                  { id: 'in_car_driving', icon: 'directions_car', label: 'In-Car Auto' },
                ] as const
              ).map((ctx) => (
                <button
                  key={ctx.id}
                  type="button"
                  onClick={() => handleChangePhysicalContext(ctx.id)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border transition cursor-pointer ${
                    session.physicalContext === ctx.id
                      ? 'bg-primary-container/15 border-primary-container text-primary'
                      : 'bg-surface-container border-outline-variant/25 text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg mb-1">{ctx.icon}</span>
                  <span className="font-label-sm text-label-sm text-center">{ctx.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Surface Discovery & Cast Tray */}
          <section className="rounded-xl bg-surface-container-low border border-outline-variant/25 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-label-lg text-label-lg text-on-surface uppercase">
                Nearby LAN & BLE Surfaces ({session.discoveredScreens.length})
              </span>
              <button
                type="button"
                onClick={handleRescanLanDevices}
                className="text-label-sm font-label-sm text-secondary cursor-pointer"
              >
                Re-Scan
              </button>
            </div>
            <div className="space-y-2">
              {session.discoveredScreens.map((dev) => (
                <div
                  key={dev.id}
                  className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/25 flex items-center justify-between"
                >
                  <div>
                    <div className="text-body-sm font-semibold text-on-surface">{dev.name}</div>
                    <div className="text-telemetry-code font-telemetry-code text-outline">
                      {dev.lastSeen}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleVoiceCommand(`Show me on ${dev.name}`)}
                    className="px-2.5 py-1 rounded bg-secondary/15 text-secondary border border-secondary/30 text-label-sm font-label-sm cursor-pointer"
                  >
                    Cast Here
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Paired Visual Canvas Preview */}
          <section className="rounded-xl bg-surface-container-low border border-outline-variant/25 p-4">
            <DataAnalyticsCanvas canvas={activeCanvas} onVoiceCommand={handleVoiceCommand} />
          </section>
        </main>

        {/* Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/25 px-4 py-2">
          <div className="max-w-lg mx-auto grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => setSurfaceMode('unified')}
              className="flex flex-col items-center justify-center py-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-xl">alt_route</span>
              <span className="font-label-sm text-label-sm mt-0.5">Router</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSurfaceMode('unified');
                setWorkspaceTab('surface_mesh');
              }}
              className="flex flex-col items-center justify-center py-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-xl">cast</span>
              <span className="font-label-sm text-label-sm mt-0.5">Surfaces</span>
            </button>
            <button
              type="button"
              onClick={handleToggleListening}
              className="flex flex-col items-center justify-center py-1 text-primary cursor-pointer"
            >
              <span className="material-symbols-outlined text-xl">graphic_eq</span>
              <span className="font-label-sm text-label-sm mt-0.5 font-bold">Voice Jewel</span>
            </button>
            <button
              type="button"
              onClick={() => setSurfaceMode('tv')}
              className="flex flex-col items-center justify-center py-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-xl">tv</span>
              <span className="font-label-sm text-label-sm mt-0.5">TV Wall</span>
            </button>
          </div>
        </nav>
      </div>
    );
  }

  // ============================================================================
  // DESKTOP / WALL TV / WORKBENCH PAD WORKSPACE (Templates 1 & 2)
  // ============================================================================
  return (
    <div className="bg-surface-container-lowest text-on-surface min-h-screen flex flex-col font-body-md antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* Streamlined Top Navigation Bar (Matches Template 1 & Template 2) */}
      <header className="w-full px-6 py-3 flex flex-wrap justify-between items-center gap-3 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md sticky top-0 z-50">
        {/* Brand Title & Audio Telemetry Dot */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full bg-primary-container ${
                isListening || isSpeaking ? 'animate-ping' : ''
              }`}
            />
            <h1 className="text-headline-md font-headline-md font-semibold tracking-tight text-on-surface flex items-center gap-2">
              Bimodal Companion
              <span className="text-label-sm font-label-sm px-2 py-0.5 rounded bg-primary-container/20 text-primary border border-primary/30 uppercase tracking-wider">
                Argon v3.8
              </span>
            </h1>
          </div>
          <div className="hidden sm:block h-4 w-[1px] bg-surface-variant" />
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-container-low border border-outline-variant/30">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                wsConnected ? 'bg-tertiary' : 'bg-primary-container'
              }`}
            />
            <span className="text-telemetry-code font-telemetry-code text-on-surface-variant">
              Live Audio · Gemini 3.8 Flash · 30ms TTFB
            </span>
          </div>
        </div>

        {/* Navigation Hub & Surface Mesh Status */}
        <nav className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => {
              setSurfaceMode('unified');
              setWorkspaceTab('hero_live');
            }}
            className={`pb-1 font-label-md text-label-md transition-colors cursor-pointer ${
              surfaceMode === 'unified' && workspaceTab === 'hero_live'
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Voice Pipeline (Hero)
          </button>
          <button
            type="button"
            onClick={() => {
              setSurfaceMode('unified');
              setWorkspaceTab('surface_mesh');
            }}
            className={`pb-1 font-label-md text-label-md transition-colors cursor-pointer ${
              surfaceMode === 'unified' && workspaceTab === 'surface_mesh'
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Surface Mesh & Router (3-Col)
          </button>
          <button
            type="button"
            onClick={() => setSurfaceMode('tv')}
            className={`pb-1 font-label-md text-label-md transition-colors cursor-pointer ${
              surfaceMode === 'tv'
                ? 'text-secondary border-b-2 border-secondary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Wall TV (/tv)
          </button>
          <button
            type="button"
            onClick={() => setSurfaceMode('phone')}
            className="pb-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            Mobile (/phone)
          </button>
        </nav>

        {/* Connected Surface & Controls */}
        <div className="flex items-center gap-2.5">
          {/* Cast Surface Indicator */}
          <button
            type="button"
            onClick={() => handleVoiceCommand('Show me on the LG TV')}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container border border-secondary/30 text-on-surface hover:border-secondary transition cursor-pointer"
            title="Click to beam current visual canvas to LG OLED TV (192.168.1.161)"
          >
            <span className="material-symbols-outlined text-secondary text-[18px]">
              cast_connected
            </span>
            <span className="text-label-md font-label-md text-secondary">
              {activeProjectingDevice?.name || 'MacBook Pro Display'} · Paired
            </span>
          </button>

          {/* Voice Persona & Gemini 3.8 TTS Key Button */}
          <button
            type="button"
            onClick={() => setShowApiKeyModal((v) => !v)}
            className="px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-label-sm font-label-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 cursor-pointer"
            title="Configure Gemini 3.8 Flash TTS API Key & Voice Persona"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">
              record_voice_over
            </span>
            <span>{session.voicePersona}</span>
          </button>

          {/* Mic Live Toggle */}
          <button
            type="button"
            onClick={handleToggleListening}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-md text-label-md font-semibold shadow-sm transition-all cursor-pointer ${
              isListening
                ? 'bg-tertiary text-surface-container-lowest'
                : 'bg-primary-container hover:bg-primary text-surface-container-lowest'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isListening ? 'mic_double' : 'mic'}
            </span>
            <span>{isListening ? 'Listening...' : 'Mic Live'}</span>
          </button>

          {/* Emergency Kill / Barge-In */}
          {isSpeaking && (
            <button
              type="button"
              onClick={stopSpeaking}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-error-container/40 hover:bg-error-container/60 text-error border border-error/40 text-label-sm font-label-sm transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">stop_circle</span>
              Barge-In
            </button>
          )}
        </div>
      </header>

      {/* Collapsible Voice Persona & Gemini 3.8 TTS Config Drawer */}
      {showApiKeyModal && (
        <div className="bg-surface-container border-b border-outline-variant/40 px-6 py-3">
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label-sm font-label-sm uppercase text-outline">
                Gemini 3.8 TTS Voice Persona:
              </span>
              {(['Kore', 'Puck', 'Aoede', 'Charon'] as VoicePersona[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleChangeVoicePersona(p)}
                  className={`px-2.5 py-1 rounded text-label-sm font-label-sm cursor-pointer ${
                    session.voicePersona === p
                      ? 'bg-primary-container text-surface-container-lowest font-bold'
                      : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/30'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (ttsEnabled) stopSpeaking();
                  setTtsEnabled((v) => !v);
                }}
                className={`px-2.5 py-1 rounded text-label-sm font-label-sm cursor-pointer ${
                  ttsEnabled
                    ? 'bg-tertiary/20 text-tertiary border border-tertiary/40'
                    : 'bg-surface-container-low text-outline border border-outline-variant/30'
                }`}
              >
                {ttsEnabled ? 'Audio Output: ON' : 'Audio Output: MUTED'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => handleSaveGeminiApiKey(e.target.value)}
                placeholder="Optional: Paste GEMINI_API_KEY for cloud gemini-3.8-flash-tts..."
                className="w-72 rounded-lg bg-surface-container-lowest border border-outline-variant/40 px-3 py-1 text-telemetry-code font-telemetry-code text-on-surface"
              />
              <span className="text-telemetry-code font-telemetry-code text-outline">
                Active: {activeVoiceEngineLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-5 flex flex-col gap-6">
        {/* 2-Second Voice Screen Disambiguation & Incoming Takeover Prompt */}
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

        {/* ====================================================================
            MODE A: DEDICATED WALL TV (`/tv`) OR WORKBENCH PAD (`/pad`) VIEW
           ==================================================================== */}
        {(surfaceMode === 'tv' || surfaceMode === 'pad') && (
          <section
            ref={canvasContainerRef}
            className="bg-surface-container-low rounded-xl border border-secondary/40 p-6 flex flex-col gap-5 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-secondary" />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/25 pb-4 pl-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">
                    {surfaceMode === 'tv' ? 'tv' : 'tablet_mac'}
                  </span>
                  <span className="text-label-md font-label-md uppercase tracking-wider text-secondary">
                    {surfaceMode === 'tv'
                      ? 'Paired Wall Display Receiver (/tv · Zero-Wait WebSocket Sync)'
                      : 'Paired Workbench iPad Pro Receiver (/pad)'}
                  </span>
                </div>
                <h2 className="text-headline-lg font-headline-lg text-on-surface mt-1">
                  {activeCanvas.dataSpec?.title ||
                    activeCanvas.blueprintSpec?.title ||
                    activeCanvas.brainDeckSpec?.title}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectThread('gp-golf-margins')}
                  className={`px-3 py-1.5 rounded-lg text-label-sm font-label-sm cursor-pointer ${
                    activeCanvas.engine === 'data_analytics'
                      ? 'bg-primary-container text-surface-container-lowest font-bold'
                      : 'bg-surface-container text-on-surface-variant border border-outline-variant/30'
                  }`}
                >
                  1. GP Margin Matrix
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectThread('carpenter-workbench')}
                  className={`px-3 py-1.5 rounded-lg text-label-sm font-label-sm cursor-pointer ${
                    activeCanvas.engine === 'blueprint_svg'
                      ? 'bg-primary-container text-surface-container-lowest font-bold'
                      : 'bg-surface-container text-on-surface-variant border border-outline-variant/30'
                  }`}
                >
                  2. Carpenter CAD
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectThread('second-brain-standup')}
                  className={`px-3 py-1.5 rounded-lg text-label-sm font-label-sm cursor-pointer ${
                    activeCanvas.engine === 'second_brain_deck'
                      ? 'bg-primary-container text-surface-container-lowest font-bold'
                      : 'bg-surface-container text-on-surface-variant border border-outline-variant/30'
                  }`}
                >
                  3. Second Brain Deck
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('unified')}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-high text-secondary border border-secondary/30 text-label-sm font-label-sm cursor-pointer"
                >
                  Exit Theater View
                </button>
              </div>
            </div>

            <div className="pl-2">
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
          </section>
        )}

        {/* ====================================================================
            MODE B: TEMPLATE 1 — VOICE HERO WEB COMPANION WORKSPACE (DEFAULT)
           ==================================================================== */}
        {surfaceMode === 'unified' && workspaceTab === 'hero_live' && (
          <>
            {/* Upper Hero Section: Voice Orb Centerpiece & Quick Command Chips */}
            <section className="relative rounded-2xl bg-gradient-to-b from-surface-container-low to-surface-container-lowest border border-outline-variant/25 p-6 flex flex-col items-center justify-center text-center overflow-hidden">
              {/* Subtle Ambient Radial Glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 50% 35%, rgba(249, 115, 22, 0.12), transparent 65%)',
                }}
              />

              {/* Live Status Tag */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-primary/25 mb-5 relative z-10">
                <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                <span className="text-label-sm font-label-sm text-primary uppercase tracking-widest">
                  {isListening
                    ? 'LISTENING · SPEAK YOUR QUERY'
                    : isSpeaking
                      ? 'SYNTHESIZING VOICE BLUF · SPACEBAR TO BARGE-IN'
                      : 'LISTENING · HANDS-FREE ACTIVE'}
                </span>
              </div>

              {/* Tactical Voice Jewel Orb */}
              <div className="relative flex items-center justify-center my-2 z-10">
                <div className="w-28 h-28 rounded-full border border-primary-container/30 absolute wave-ripple" />
                <div
                  className="w-36 h-36 rounded-full border border-primary-container/15 absolute wave-ripple"
                  style={{ animationDelay: '1.2s' }}
                />
                <button
                  type="button"
                  onClick={handleToggleListening}
                  aria-label="Toggle Voice Orb"
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-on-primary-container via-primary-container to-primary voice-orb-active flex flex-col items-center justify-center relative z-10 cursor-pointer group focus:outline-none"
                >
                  <div className="flex items-center gap-1 h-7">
                    <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-1" />
                    <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-2" />
                    <span className="w-1.5 bg-surface-container-lowest rounded-full bar-anim-3" />
                    <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-4" />
                    <span className="w-1 bg-surface-container-lowest rounded-full bar-anim-5" />
                  </div>
                  <span className="text-[10px] font-label-sm text-surface-container-lowest font-bold uppercase tracking-wider mt-1">
                    {isListening ? 'Active' : 'Speak'}
                  </span>
                </button>
              </div>

              {/* Orb Sub-caption */}
              <p className="text-body-sm text-on-surface-variant mt-3 mb-4 max-w-md relative z-10">
                Tap Voice Orb or say{' '}
                <span className="text-primary font-telemetry-code">&ldquo;Show me&rdquo;</span> to
                stream visual cards to your paired display
              </p>

              {/* Suggested Vocal Inquiry Pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 relative z-10">
                {heroVoiceChips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleVoiceCommand(chip.cmd)}
                    className={
                      chip.active
                        ? 'px-3.5 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-bright border border-primary/40 text-label-md font-label-md text-primary flex items-center gap-1.5 transition-all cursor-pointer'
                        : 'px-3.5 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-label-md font-label-md text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 transition-all cursor-pointer'
                    }
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {chip.active ? 'graphic_eq' : 'auto_awesome'}
                    </span>
                    {chip.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Split Workspace: Spoken BLUF Transcript (Left 5 Cols) + Paired Visual Canvas (Right 7 Cols) */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
              {/* Left Column (5 Cols): Active Spoken BLUF & Audio Stream Control */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 flex flex-col justify-between flex-1 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary-container" />
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 pl-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">
                          record_voice_over
                        </span>
                        <span className="text-label-lg font-label-lg uppercase tracking-wider text-primary">
                          Voice Synthesizer · BLUF Dispatch
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-tertiary-container/20 border border-tertiary/30 text-tertiary text-telemetry-code font-telemetry-code">
                        0ms WAIT · {latestTurn ? Math.max(2, Math.round(latestTurn.wordCount / 3)) : 5}s AUDIO
                      </span>
                    </div>

                    {/* Active User Query Pill */}
                    <div className="mb-4 pl-2">
                      <div className="text-label-sm font-label-sm text-outline uppercase mb-1">
                        Detected Utterance
                      </div>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-body-md font-medium border border-outline-variant/20">
                        <span className="material-symbols-outlined text-primary text-[16px]">
                          mic
                        </span>
                        &ldquo;{latestTurn?.userTranscript}&rdquo;
                      </div>
                    </div>

                    {/* Spoken BLUF Transcript Box */}
                    <div className="pl-2 mb-5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-label-sm font-label-sm text-outline uppercase">
                          Spoken Executive Summary (Ears Channel)
                        </span>
                        <span className="text-telemetry-code font-telemetry-code text-secondary">
                          {activeVoiceEngineLabel}
                        </span>
                      </div>
                      <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/30 space-y-3">
                        <p className="text-body-lg font-body-lg text-on-surface leading-relaxed">
                          &ldquo;{latestTurn?.blufSpokenResponse}&rdquo;
                        </p>
                        {latestReceipt && (
                          <div className="pt-2 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2 text-telemetry-code font-telemetry-code text-outline">
                            <span>
                              Router Split: {latestReceipt.cardinalityScore} facts →{' '}
                              <strong className="text-primary">
                                {latestReceipt.scalarsPermittedInVoice} spoken
                              </strong>{' '}
                              /{' '}
                              <strong className="text-secondary">
                                {latestReceipt.itemsStrippedToVisual} visual
                              </strong>
                            </span>
                            <span className="text-tertiary">
                              {latestReceipt.eyeChannel.dispatched
                                ? `Dispatched (${latestReceipt.eyeChannel.targetSurfaces.join('+')})`
                                : 'Suppressed (Road Gate)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Instant Audio Playback & Speed Bar */}
                    <div className="pl-2 mb-5">
                      <div className="p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/25 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              latestTurn &&
                              void speakNaturalBluf(
                                latestTurn.blufSpokenResponse,
                                session.voicePersona,
                                latestTurn.routingReceipt.earChannel.styleDirective
                              )
                            }
                            className="w-8 h-8 rounded-lg bg-primary-container text-surface-container-lowest flex items-center justify-center hover:bg-primary transition-colors cursor-pointer"
                            title="Replay Spoken BLUF"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {isSpeaking ? 'volume_up' : 'play_arrow'}
                            </span>
                          </button>
                          <div>
                            <div className="text-label-sm font-label-sm text-on-surface">
                              {isSpeaking ? 'Streaming Neural Audio' : 'Instant Audio Ready'}
                            </div>
                            <div className="text-telemetry-code font-telemetry-code text-outline">
                              Persona: {session.voicePersona} · Prosody Normalized
                            </div>
                          </div>
                        </div>

                        {/* Speed Controls */}
                        <div className="flex items-center gap-1 bg-surface-container p-1 rounded-md border border-outline-variant/20">
                          {([1, 1.25, 1.5] as const).map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => handleSetPlaybackSpeed(spd)}
                              className={`px-2 py-0.5 rounded text-telemetry-code font-telemetry-code transition cursor-pointer ${
                                playbackSpeed === spd
                                  ? 'bg-primary-container text-surface-container-lowest font-semibold'
                                  : 'text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>

                        {/* Interrupt Button */}
                        <button
                          type="button"
                          onClick={stopSpeaking}
                          className="px-2.5 py-1 rounded bg-error-container/30 hover:bg-error-container/50 text-error border border-error/30 text-label-sm font-label-sm transition-colors cursor-pointer"
                        >
                          Interrupt
                        </button>
                      </div>
                    </div>

                    {/* Direct Voice Simulator Input */}
                    <form onSubmit={handleCustomUtteranceSubmit} className="pl-2 mb-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customUtterance}
                          onChange={(e) => setCustomUtterance(e.target.value)}
                          placeholder='Type or speak any command (e.g. "Show me on the LG TV")...'
                          className="flex-1 rounded-lg bg-surface-container-lowest border border-outline-variant/30 px-3 py-2 text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customUtterance.trim()) {
                              handleVoiceCommand(customUtterance.trim());
                              setCustomUtterance('');
                            } else {
                              handleVoiceCommand('Show me');
                            }
                          }}
                          className="px-3.5 py-2 rounded-lg bg-primary-container hover:bg-primary text-surface-container-lowest font-label-md text-label-md font-bold cursor-pointer"
                        >
                          Send
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Bottom Prior Turn History */}
                  <div className="pl-2 pt-3 border-t border-outline-variant/20">
                    <div className="flex items-center justify-between text-telemetry-code font-telemetry-code text-outline mb-2">
                      <span>RECENT VOICE EXCHANGES ({session.voiceHistory.length})</span>
                      <span>HOTKEY: SPACEBAR</span>
                    </div>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {session.voiceHistory.slice(1, 4).map((turn) => (
                        <div
                          key={turn.id}
                          className="p-2 rounded-lg bg-surface-container/60 border border-outline-variant/15 flex items-center justify-between text-body-sm text-on-surface-variant"
                        >
                          <span className="truncate">&ldquo;{turn.userTranscript}&rdquo;</span>
                          <span className="text-telemetry-code font-telemetry-code text-tertiary shrink-0 ml-2">
                            {turn.latencyMs}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column (7 Cols): Paired Visual Canvas */}
              <div ref={canvasContainerRef} className="lg:col-span-7 flex flex-col">
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 flex flex-col justify-between flex-1 relative overflow-hidden">
                  {/* Top Cyan Accent Rail for Visual Channel */}
                  <div className="absolute top-0 left-0 w-1 h-full bg-secondary" />
                  <div className="pl-2 space-y-5">
                    {/* Canvas Header & 3 Engine Switcher Pills */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/25 pb-3.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-secondary text-[20px]">
                            monitoring
                          </span>
                          <h2 className="text-headline-md font-headline-md text-on-surface">
                            {activeCanvas.dataSpec?.title ||
                              activeCanvas.blueprintSpec?.title ||
                              activeCanvas.brainDeckSpec?.title}
                          </h2>
                        </div>
                        <p className="text-body-sm text-on-surface-variant mt-0.5">
                          Eyes Channel · Pre-staged background artifact · Controlled live by voice
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectThread('gp-golf-margins')}
                          className={`px-2.5 py-1 rounded-lg text-label-sm font-label-sm flex items-center gap-1 transition cursor-pointer ${
                            activeCanvas.engine === 'data_analytics'
                              ? 'bg-secondary/20 text-secondary border border-secondary/40 font-bold'
                              : 'bg-surface-container text-on-surface-variant border border-outline-variant/25 hover:text-on-surface'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">monitoring</span>
                          1. Golf Margin Matrix
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectThread('carpenter-workbench')}
                          className={`px-2.5 py-1 rounded-lg text-label-sm font-label-sm flex items-center gap-1 transition cursor-pointer ${
                            activeCanvas.engine === 'blueprint_svg'
                              ? 'bg-secondary/20 text-secondary border border-secondary/40 font-bold'
                              : 'bg-surface-container text-on-surface-variant border border-outline-variant/25 hover:text-on-surface'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">carpenter</span>
                          2. Carpenter CAD
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectThread('second-brain-standup')}
                          className={`px-2.5 py-1 rounded-lg text-label-sm font-label-sm flex items-center gap-1 transition cursor-pointer ${
                            activeCanvas.engine === 'second_brain_deck'
                              ? 'bg-secondary/20 text-secondary border border-secondary/40 font-bold'
                              : 'bg-surface-container text-on-surface-variant border border-outline-variant/25 hover:text-on-surface'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">neurology</span>
                          3. Second Brain Deck
                        </button>
                      </div>
                    </div>

                    {/* Staged / Live Visibility Banner */}
                    {activeCanvas.visibility === 'staged_hidden' && (
                      <div className="rounded-xl border border-dashed border-primary/40 bg-primary-container/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-primary text-[18px]">
                            visibility_off
                          </span>
                          <div className="text-body-sm text-on-surface-variant">
                            <strong className="text-primary">Eyes-Free Default State:</strong>{' '}
                            Visual payload pre-staged in background (0ms wait). Say{' '}
                            <code className="text-on-surface">&ldquo;Show me&rdquo;</code> to lock
                            live canvas control.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleVoiceCommand('Show me')}
                          className="px-3 py-1.5 rounded-lg bg-primary-container text-surface-container-lowest font-label-sm text-label-sm font-bold hover:bg-primary transition cursor-pointer"
                        >
                          Say &ldquo;Show Me&rdquo; (0ms Reveal)
                        </button>
                      </div>
                    )}

                    {/* Active Visual Engine Component */}
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
              </div>
            </section>
          </>
        )}

        {/* ====================================================================
            MODE C: TEMPLATE 2 — 3-COLUMN DEMO MODALITY ROUTER & SURFACE MESH
           ==================================================================== */}
        {surfaceMode === 'unified' && workspaceTab === 'surface_mesh' && (
          <>
            {/* Sub-Header: Demo Modality Router Panel (Matches Template 2) */}
            <section className="rounded-xl bg-surface-container-low border border-outline-variant/25 p-4 shadow-lg">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-high border border-outline-variant/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">alt_route</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-label-sm text-label-sm uppercase tracking-widest text-primary">
                        Deterministic Modality Split Engine
                      </span>
                      <span className="px-2 py-0.5 rounded bg-surface-container-highest font-telemetry-code text-telemetry-code text-secondary">
                        Cardinality {latestReceipt?.cardinalityScore || 20} →{' '}
                        {latestReceipt?.scalarsPermittedInVoice || 2} Spoken /{' '}
                        {latestReceipt?.itemsStrippedToVisual || 18} Visual
                      </span>
                    </div>
                    <h2 className="font-headline-md text-headline-md text-on-surface mt-0.5">
                      Environment Context &amp; Channel Allocation Gate
                    </h2>
                  </div>
                </div>

                {/* 3 Interactive Environment Mode Selector Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1 max-w-3xl">
                  <button
                    type="button"
                    onClick={() => handleChangePhysicalContext('multi_screen_room')}
                    className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition-all cursor-pointer ${
                      session.physicalContext === 'multi_screen_room'
                        ? 'bg-surface-container-high border-2 border-primary-container'
                        : 'bg-surface-container hover:bg-surface-container-high border border-outline-variant/25'
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-primary-container/20 flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined text-lg">devices</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-label-md text-label-md text-on-surface truncate">
                        Multi-Screen Room
                      </div>
                      <div className="font-telemetry-code text-telemetry-code text-primary truncate">
                        2s BLUF + Full Visuals
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChangePhysicalContext('hands_busy_workshop')}
                    className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition-all cursor-pointer ${
                      session.physicalContext === 'hands_busy_workshop'
                        ? 'bg-surface-container-high border-2 border-secondary'
                        : 'bg-surface-container hover:bg-surface-container-high border border-outline-variant/25'
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-secondary shrink-0">
                      <span className="material-symbols-outlined text-lg">carpenter</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-label-md text-label-md text-on-surface truncate">
                        Hands-Busy Workshop
                      </div>
                      <div className="font-telemetry-code text-telemetry-code text-secondary truncate">
                        Voice-Driven CAD Zoom
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChangePhysicalContext('in_car_driving')}
                    className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition-all cursor-pointer ${
                      session.physicalContext === 'in_car_driving'
                        ? 'bg-surface-container-high border-2 border-tertiary'
                        : 'bg-surface-container hover:bg-surface-container-high border border-outline-variant/25'
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-tertiary shrink-0">
                      <span className="material-symbols-outlined text-lg">directions_car</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-label-md text-label-md text-on-surface truncate">
                        In-Car / Android Auto
                      </div>
                      <div className="font-telemetry-code text-telemetry-code text-tertiary truncate">
                        Visuals Suppressed → SMS
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Modality Split Receipt Strip */}
              {latestReceipt && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                  <div className="bg-surface-container-lowest/70 rounded-lg p-3 border-l-2 border-primary-container flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-sm">
                          hearing
                        </span>
                        <span className="font-label-md text-label-md text-primary uppercase">
                          1. Ears (BLUF Voice Channel)
                        </span>
                        <span className="font-telemetry-code text-telemetry-code text-on-surface-variant">
                          [{latestReceipt.scalarsPermittedInVoice} Core Facts · ≤8s Audio]
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Phonetic Normalizer:{' '}
                        <span className="font-telemetry-code text-on-surface">
                          &ldquo;{latestReceipt.earChannel.phoneticNormalizedText.slice(0, 95)}
                          ...&rdquo;
                        </span>
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded bg-primary-container/15 border border-primary/30 font-telemetry-code text-telemetry-code text-primary shrink-0">
                      {latestReceipt.earChannel.voiceModel}
                    </span>
                  </div>

                  <div className="bg-surface-container-lowest/70 rounded-lg p-3 border-l-2 border-secondary flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary text-sm">
                          visibility
                        </span>
                        <span className="font-label-md text-label-md text-secondary uppercase">
                          2. Eyes (Surface UI Channel)
                        </span>
                        <span className="font-telemetry-code text-telemetry-code text-on-surface-variant">
                          [{latestReceipt.itemsStrippedToVisual} High-Density Points · 0ms Staged]
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {latestReceipt.eyeChannel.routingReason}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded bg-secondary/15 border border-secondary/30 font-telemetry-code text-telemetry-code text-secondary shrink-0">
                      {latestReceipt.eyeChannel.dispatched
                        ? `SYNCED (${latestReceipt.eyeChannel.targetSurfaces.join('+')})`
                        : 'SUPPRESSED'}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* 3-Column Multi-Panel Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* COLUMN 1 (3 Cols): Surface Proximity Mesh & Disambiguation */}
              <section className="lg:col-span-3 rounded-xl bg-surface-container-low border border-outline-variant/25 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-lg">radar</span>
                    <h3 className="font-headline-md text-headline-md text-on-surface">
                      Surface Proximity Mesh
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleRescanLanDevices}
                    className="px-2 py-0.5 rounded bg-secondary/15 text-secondary font-telemetry-code text-telemetry-code border border-secondary/30 cursor-pointer"
                  >
                    mDNS + BLE Rescan
                  </button>
                </div>

                {/* Voice Pushback Toggle Banner */}
                <div className="p-3.5 bg-primary-container/10 border-b border-primary-container/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm uppercase text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">record_voice_over</span>
                      Voice Disambiguation
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleRequireDisambiguation}
                      className="font-telemetry-code text-telemetry-code text-primary underline cursor-pointer"
                    >
                      {session.requireDisambiguationWhenMultipleScreens ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface leading-snug">
                    &ldquo;Multiple screens detected. Say{' '}
                    <span className="text-primary font-semibold">&lsquo;LG OLED TV&rsquo;</span> or{' '}
                    <span className="text-secondary font-semibold">&lsquo;My Laptop&rsquo;</span>
                    .&rdquo;
                  </p>
                </div>

                {/* Discovered Screen Cards */}
                <div className="p-3.5 space-y-2.5">
                  {session.discoveredScreens.map((dev) => {
                    const isProjecting = dev.status === 'projecting_active';
                    return (
                      <div
                        key={dev.id}
                        className={`p-3 rounded-lg transition-all ${
                          isProjecting
                            ? 'bg-surface-container-high border border-secondary/40'
                            : 'bg-surface-container border border-outline-variant/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`material-symbols-outlined ${
                                isProjecting ? 'text-secondary' : 'text-on-surface-variant'
                              }`}
                            >
                              {dev.surfaceRole === 'tv'
                                ? 'tv'
                                : dev.name.toLowerCase().includes('laptop')
                                  ? 'laptop_mac'
                                  : 'tablet_mac'}
                            </span>
                            <div className="min-w-0">
                              <div className="font-label-lg text-label-lg text-on-surface truncate">
                                {dev.name}
                              </div>
                              <div className="font-telemetry-code text-telemetry-code text-on-surface-variant truncate">
                                {dev.protocol} · {dev.lastSeen}
                              </div>
                            </div>
                          </div>
                          {dev.rssiDbm && (
                            <span className="px-1.5 py-0.5 rounded bg-tertiary/15 text-tertiary font-telemetry-code text-telemetry-code shrink-0">
                              {dev.rssiDbm} dBm
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                          <span className="font-telemetry-code text-telemetry-code text-outline">
                            Role: {dev.surfaceRole.toUpperCase()}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleVoiceCommand(`Show me on ${dev.name}`)}
                            className={`px-2.5 py-1 rounded font-label-sm text-label-sm transition cursor-pointer ${
                              isProjecting
                                ? 'bg-tertiary/20 text-tertiary border border-tertiary/40'
                                : 'bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30'
                            }`}
                          >
                            {isProjecting ? 'Active Target' : 'Project Here'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* COLUMN 2 (4 Cols): Voice Synthesis Hub */}
              <section className="lg:col-span-4 rounded-xl bg-surface-container-low border border-outline-variant/25 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">
                      graphic_eq
                    </span>
                    <h3 className="font-headline-md text-headline-md text-on-surface">
                      Voice Synthesis Hub
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary font-telemetry-code text-telemetry-code border border-primary/30">
                    {session.voicePersona} · 24kHz
                  </span>
                </div>

                <div className="p-6 flex flex-col items-center justify-center relative">
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-primary-container/30 animate-pulse-halo" />
                    <button
                      type="button"
                      onClick={handleToggleListening}
                      className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary-container via-on-primary-fixed-variant to-surface-container-lowest voice-orb-glow flex flex-col items-center justify-center border border-primary/50 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-on-surface text-2xl mb-0.5">
                        {isListening ? 'mic_double' : 'Spatial_Audio_Off'}
                      </span>
                      <span className="font-telemetry-code text-telemetry-code text-primary uppercase">
                        {isListening ? 'Listening' : 'Speak'}
                      </span>
                    </button>
                  </div>

                  {/* Active Spoken BLUF Card */}
                  <div className="w-full mt-5 bg-surface-container rounded-xl p-4 border border-outline-variant/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm uppercase text-primary">
                        Spoken Executive BLUF
                      </span>
                      <span className="font-telemetry-code text-telemetry-code text-tertiary">
                        TTFB: 28ms
                      </span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                      &ldquo;{latestTurn?.blufSpokenResponse}&rdquo;
                    </p>
                  </div>
                </div>
              </section>

              {/* COLUMN 3 (5 Cols): Visual Surface Canvas */}
              <section className="lg:col-span-5 rounded-xl bg-surface-container-low border border-outline-variant/25 p-4 flex flex-col overflow-hidden">
                <DataAnalyticsCanvas
                  canvas={activeCanvas}
                  onVoiceCommand={handleVoiceCommand}
                />
              </section>
            </div>
          </>
        )}

        {/* In-Car / Android Auto Parked Digest Queue ("I'll text you the information") */}
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

      {/* Subtle Footer Status Bar (Matches Template 1) */}
      <footer className="w-full px-6 py-3 border-t border-outline-variant/20 bg-surface-container-lowest flex flex-wrap justify-between items-center gap-2 text-telemetry-code font-telemetry-code text-outline">
        <div className="flex items-center gap-4">
          <span>SESSION: ARGON-DSP-9941A</span>
          <span>·</span>
          <span>MODALITY ROUTER: DETERMINISTIC ACTIVE</span>
          <span>·</span>
          <span>
            SCHEMA KEYS: [
            {activeSchema.availableSeriesNames.join(', ') ||
              activeSchema.availableZoomTargets.join(', ')}
            ]
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>HOTKEY: [SPACE] TOGGLE MIC / BARGE-IN</span>
          <span>·</span>
          <span className="text-tertiary">● ALL PAIRED SURFACES NOMINAL ({lanEndpoint})</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

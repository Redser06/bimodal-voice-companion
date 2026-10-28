export type EngineType = 'data_analytics' | 'blueprint_svg' | 'second_brain_deck';
export type SurfaceRole = 'auto' | 'pad' | 'tv' | 'phone';
export type ChartType = 'bar' | 'stacked_bar' | 'line' | 'waterfall';
export type PeriodFilter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type MetricFocus = 'revenue' | 'net_margin_pct' | 'units';
export type BlueprintZoomTarget = 'overview' | 'mortise_joint' | 'leg_apron' | 'cut_list';
export type BrainFilterStatus = 'all' | 'action_required' | 'failed_runs';

export type PhysicalContextMode =
  | 'multi_screen_room'
  | 'hands_busy_workshop'
  | 'in_car_driving';

export type VoicePersona = 'Kore' | 'Puck' | 'Aoede' | 'Charon';

export interface DiscoveredScreenDevice {
  id: string;
  name: string; // e.g. "Samsung S95BA 65 TV" | "Conor’s Laptop" | "Workbench iPad Pro"
  surfaceRole: 'tv' | 'pad' | 'phone';
  protocol:
    | 'airplay_mdns'
    | 'chromecast_mdns'
    | 'macos_host_spawner'
    | 'websocket_warm_tab'
    | 'ble_continuity';
  proximity: 'near_ble_desk' | 'same_room_lan' | 'other_room_lan';
  rssiDbm?: number; // e.g. -52 dBm for Bluetooth proximity
  status: 'online_ready' | 'standby_cold' | 'projecting_active';
  supportsColdWakeup: boolean;
  lastSeen: string;
}

export interface PendingScreenDisambiguation {
  active: boolean;
  originalUtterance: string;
  candidateScreens: DiscoveredScreenDevice[];
  promptedAt: string;
}

export interface IncomingTakeoverPrompt {
  id: string;
  sourceDeviceName: string;
  targetDevice: DiscoveredScreenDevice;
  threadTitle: string;
  engine: EngineType;
  mode: 'ask_permission' | 'auto_accepted';
  timestamp: string;
}

export interface ModalityRoutingReceipt {
  id: string;
  timestamp: string;
  physicalContext: PhysicalContextMode;
  utteranceIntent:
    | 'query_overview'
    | 'disambiguate_screen'
    | 'reveal_canvas'
    | 'mutate_visual_state'
    | 'switch_thread'
    | 'queue_parked_digest'
    | 'commit_second_brain';
  cardinalityScore: number; // Number of data rows / dimensions in full payload
  scalarsPermittedInVoice: number; // Strictly capped at <= 2
  itemsStrippedToVisual: number;
  earChannel: {
    rawBlufText: string;
    phoneticNormalizedText: string;
    voiceModel: 'gemini-3.8-flash-tts' | 'neural-os-enhanced';
    voicePersona: VoicePersona;
    styleDirective: string;
    routingReason: string;
  };
  eyeChannel: {
    dispatched: boolean;
    suppressedBySafetyGate: boolean;
    awaitingDisambiguation?: boolean;
    targetSurfaces: SurfaceRole[];
    targetDeviceNames?: string[];
    engine: EngineType;
    routingReason: string;
  };
  asyncQueueChannel: {
    autoQueued: boolean;
    routingReason: string;
  };
  secondBrainChannel: {
    stagedForCommit: boolean;
    committedNow: boolean;
    routingReason: string;
  };
}

export interface DataSeriesItem {
  name: string;
  category: string;
  revenue: number; // Annual EUR in thousands (e.g., 168 = €168k)
  cost: number;    // Annual EUR cost in thousands
  marginPct: number;
  units: number;
  q1: number;      // Quarterly revenue €k
  q2: number;
  q3: number;
  q4: number;
  q1MarginPct: number;
  q2MarginPct: number;
  q3MarginPct: number;
  q4MarginPct: number;
  color: string;
}

export interface DataAnalyticsSpec {
  title: string;
  subtitle: string;
  chartType: ChartType;
  activePeriod: PeriodFilter;
  excludedSeries: string[];
  metricFocus: MetricFocus;
  highlightedSeries: string | null;
  series: DataSeriesItem[];
  citations: string[];
}

export interface CutListItem {
  id: string;
  partName: string;
  material: string;
  qty: number;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  joineryNote: string;
}

export interface BlueprintStep {
  stepNumber: number;
  title: string;
  instruction: string;
  criticalDimensionMm: string;
  criticalDimensionIn: string;
}

export interface BlueprintSvgSpec {
  title: string;
  subtitle: string;
  unit: 'mm' | 'in';
  zoomTarget: BlueprintZoomTarget;
  showCutDimensions: boolean;
  completedSteps: number[];
  cutList: CutListItem[];
  steps: BlueprintStep[];
  citations: string[];
}

export interface BrainDeckCard {
  id: string;
  title: string;
  category: 'bot_fleet' | 'decision' | 'lesson' | 'open_loop';
  summary: string;
  metricBadge: string;
  sourcePath: string;
  status: 'healthy' | 'action_required' | 'failed_runs';
  timestamp: string;
}

export interface BrainDeckSpec {
  title: string;
  subtitle: string;
  filterStatus: BrainFilterStatus;
  selectedCardId: string | null;
  pendingCommit: {
    noteType: 'progress' | 'decision_proposal' | 'lesson';
    slug: string;
    title: string;
    summary: string;
    committedPath?: string;
  } | null;
  cards: BrainDeckCard[];
  citations: string[];
}

export interface CanvasState {
  threadId: string;
  threadTitle: string;
  threadDomain: string;
  visibility: 'staging_in_progress' | 'staged_hidden' | 'live_visible';
  targetSurfaces: SurfaceRole[];
  lockedDeviceIds?: string[];
  engine: EngineType;
  lastMutationDescription: string;
  lastMutationLatencyMs: number;
  lastUpdatedIso: string;
  modelUsed: 'gemini-3.8-flash' | 'gemini-4-argon';
  dataSpec?: DataAnalyticsSpec;
  blueprintSpec?: BlueprintSvgSpec;
  brainDeckSpec?: BrainDeckSpec;
}

export interface VoiceTurn {
  id: string;
  timestamp: string;
  threadId: string;
  userTranscript: string;
  blufSpokenResponse: string; // Strictly capped at <= 2 sentences / <= 35 words
  phoneticSpokenResponse: string; // Natural conversational text sent to TTS
  sentenceCount: number;
  wordCount: number;
  toolExecuted: string;
  latencyMs: number;
  modelTier: 'gemini-3.8-flash' | 'gemini-4-argon';
  routingReceipt: ModalityRoutingReceipt;
}

export interface ParkedDigestItem {
  id: string;
  timestamp: string;
  threadId: string;
  threadTitle: string;
  blufSummary: string;
  keyTakeaways: string[];
  deepLinkRoute: string;
  syncedToSecondBrain: boolean;
}

export interface SurfacePresence {
  clientId: string;
  role: 'phone' | 'pad' | 'tv' | 'unified';
  label: string;
  connectedAt: string;
  isLocal?: boolean;
}

export interface BimodalSessionState {
  activeThreadId: string;
  physicalContext: PhysicalContextMode;
  voicePersona: VoicePersona;
  requireDisambiguationWhenMultipleScreens: boolean;
  autoAcceptScreenTakeover: boolean;
  discoveredScreens: DiscoveredScreenDevice[];
  pendingDisambiguation: PendingScreenDisambiguation | null;
  incomingTakeoverPrompt: IncomingTakeoverPrompt | null;
  threads: Record<string, CanvasState>;
  voiceHistory: VoiceTurn[];
  parkedDigests: ParkedDigestItem[];
  surfaces: SurfacePresence[];
}

export interface ActiveSchemaContext {
  threadId: string;
  engine: EngineType;
  availableSeriesNames: string[];
  availableZoomTargets: BlueprintZoomTarget[];
  availableCardIds: string[];
  discoveredScreenNames: string[];
}

export type EngineType = 'data_analytics' | 'blueprint_svg' | 'second_brain_deck';
export type SurfaceRole = 'auto' | 'pad' | 'tv' | 'phone';
export type ChartType = 'bar' | 'stacked_bar' | 'line' | 'waterfall';
export type PeriodFilter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type MetricFocus = 'revenue' | 'net_margin_pct' | 'units';
export type BlueprintZoomTarget = 'overview' | 'mortise_joint' | 'leg_apron' | 'cut_list';
export type BrainFilterStatus = 'all' | 'action_required' | 'failed_runs';

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
  sentenceCount: number;
  wordCount: number;
  toolExecuted: string;
  latencyMs: number;
  modelTier: 'gemini-3.8-flash' | 'gemini-4-argon';
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
}

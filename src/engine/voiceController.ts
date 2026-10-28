import type {
  ActiveSchemaContext,
  BimodalSessionState,
  BlueprintZoomTarget,
  BrainFilterStatus,
  CanvasState,
  ChartType,
  DataSeriesItem,
  DiscoveredScreenDevice,
  MetricFocus,
  ModalityRoutingReceipt,
  ParkedDigestItem,
  PeriodFilter,
  SurfaceRole,
  VoiceTurn,
} from '../types/bimodal';
import {
  evaluateModalityRouting,
  normalizeForNaturalSpeech,
} from './modalityRouter';

/**
 * Dual-Guard BLUF Enforcement (Server/Engine Post-Processor).
 * Strips markdown bullets, URLs, and truncates strictly to <= 2 sentences and <= 35 words.
 */
export function enforceBlufGuard(rawText: string): {
  cleanText: string;
  sentenceCount: number;
  wordCount: number;
} {
  const withoutUrls = rawText.replace(/https?:\/\/\S+/g, '').trim();
  const withoutBullets = withoutUrls
    .split('\n')
    .map((line) => line.replace(/^(\s*[-*•]|\s*\d+\.)\s+/, '').trim())
    .filter(Boolean)
    .join(' ');

  // Match sentences ending with ., !, or ? without splitting inside decimal numbers like 36.6
  const sentenceMatches = withoutBullets
    .split(/(?<!\d)[.!?]+(?=\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cappedSentences = sentenceMatches
    .slice(0, 2)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));
  let joined = cappedSentences.join(' ').replace(/\s+/g, ' ').trim();

  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length > 35) {
    joined = words.slice(0, 35).join(' ');
    if (!/[.!?]$/.test(joined)) {
      joined += '.';
    }
  }

  const finalWords = joined.split(/\s+/).filter(Boolean);

  return {
    cleanText: joined,
    sentenceCount: Math.min(cappedSentences.length, 2),
    wordCount: finalWords.length,
  };
}

/**
 * Extracts active schema keys from the current CanvasState + discovered LAN screens
 * so Loop 1 (`gemini-3.8-flash`) always knows canonical series names, zoom targets, and screen names.
 */
export function extractActiveSchemaContext(
  canvas: CanvasState,
  discoveredScreens: DiscoveredScreenDevice[] = []
): ActiveSchemaContext {
  return {
    threadId: canvas.threadId,
    engine: canvas.engine,
    availableSeriesNames: canvas.dataSpec ? canvas.dataSpec.series.map((s) => s.name) : [],
    availableZoomTargets: ['overview', 'mortise_joint', 'leg_apron', 'cut_list'],
    availableCardIds: canvas.brainDeckSpec ? canvas.brainDeckSpec.cards.map((c) => c.id) : [],
    discoveredScreenNames: discoveredScreens.map((d) => d.name),
  };
}

/**
 * Matches a user utterance against discovered screens on the network.
 * Returns matched screen devices, or `'both'` if the user says "both" / "all screens" / "everywhere".
 */
export function matchScreenFromUtterance(
  lowerUtterance: string,
  discoveredScreens: DiscoveredScreenDevice[]
): {
  matchedDevices: DiscoveredScreenDevice[];
  isExplicitBoth: boolean;
} {
  if (
    lowerUtterance.includes('both') ||
    lowerUtterance.includes('all screen') ||
    lowerUtterance.includes('everywhere')
  ) {
    return { matchedDevices: discoveredScreens, isExplicitBoth: true };
  }

  const matched: DiscoveredScreenDevice[] = [];
  for (const screen of discoveredScreens) {
    const nameLower = screen.name.toLowerCase();
    if (
      lowerUtterance.includes(nameLower) ||
      (screen.surfaceRole === 'tv' &&
        (lowerUtterance.includes('tv') ||
          lowerUtterance.includes('samsung') ||
          lowerUtterance.includes('wall') ||
          lowerUtterance.includes('television'))) ||
      (nameLower.includes('laptop') &&
        (lowerUtterance.includes('laptop') ||
          lowerUtterance.includes('macbook') ||
          lowerUtterance.includes('mac') ||
          lowerUtterance.includes('computer') ||
          lowerUtterance.includes('desktop'))) ||
      (nameLower.includes('ipad') &&
        (lowerUtterance.includes('ipad') ||
          lowerUtterance.includes('tablet') ||
          lowerUtterance.includes('pad')))
    ) {
      matched.push(screen);
    }
  }

  return { matchedDevices: matched, isExplicitBoth: false };
}

/**
 * Calculates blended revenue, net profit, and net margin % for active (non-excluded) series
 * in the selected period ('ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4').
 */
export function calculateDataMetrics(
  series: DataSeriesItem[],
  excludedSeries: string[],
  period: PeriodFilter
): {
  activeSeries: DataSeriesItem[];
  totalRevenueK: number;
  totalProfitK: number;
  blendedMarginPct: number;
  baselineMarginPct: number;
  marginDeltaPct: number;
} {
  const getPeriodRevAndMargin = (item: DataSeriesItem, p: PeriodFilter) => {
    if (p === 'Q1') return { rev: item.q1, marginPct: item.q1MarginPct };
    if (p === 'Q2') return { rev: item.q2, marginPct: item.q2MarginPct };
    if (p === 'Q3') return { rev: item.q3, marginPct: item.q3MarginPct };
    if (p === 'Q4') return { rev: item.q4, marginPct: item.q4MarginPct };
    return { rev: item.revenue, marginPct: item.marginPct };
  };

  let baselineRev = 0;
  let baselineProfit = 0;
  for (const item of series) {
    const { rev, marginPct } = getPeriodRevAndMargin(item, period);
    baselineRev += rev;
    baselineProfit += rev * (marginPct / 100);
  }
  const baselineMarginPct =
    baselineRev > 0 ? Number(((baselineProfit / baselineRev) * 100).toFixed(1)) : 0;

  const excludedLower = new Set(excludedSeries.map((s) => s.toLowerCase()));
  const activeSeries = series.filter((s) => !excludedLower.has(s.name.toLowerCase()));

  let totalRevenueK = 0;
  let totalProfitK = 0;
  for (const item of activeSeries) {
    const { rev, marginPct } = getPeriodRevAndMargin(item, period);
    totalRevenueK += rev;
    totalProfitK += rev * (marginPct / 100);
  }

  const blendedMarginPct =
    totalRevenueK > 0 ? Number(((totalProfitK / totalRevenueK) * 100).toFixed(1)) : 0;
  const marginDeltaPct = Number((blendedMarginPct - baselineMarginPct).toFixed(1));

  return {
    activeSeries,
    totalRevenueK: Number(totalRevenueK.toFixed(1)),
    totalProfitK: Number(totalProfitK.toFixed(1)),
    blendedMarginPct,
    baselineMarginPct,
    marginDeltaPct,
  };
}

/**
 * Deterministic Surface Routing Priority for `targetSurface: 'auto'`
 * 1. Connected `pad` and `tv` surfaces
 * 2. Fallback to `phone` drawer if no external screen is connected
 */
export function resolveTargetSurfaces(
  requested: SurfaceRole,
  connectedRoles: Array<'phone' | 'pad' | 'tv' | 'unified'>
): SurfaceRole[] {
  if (requested !== 'auto') {
    return [requested];
  }
  const external: SurfaceRole[] = [];
  if (connectedRoles.includes('pad') || connectedRoles.includes('unified')) external.push('pad');
  if (connectedRoles.includes('tv')) external.push('tv');
  if (external.length > 0) return external;
  return ['phone'];
}

export interface VoiceCommandExecutionResult {
  nextState: BimodalSessionState;
  turn: VoiceTurn;
  activeSchema: ActiveSchemaContext;
  sideEffect?: {
    type: 'commit_second_brain' | 'stage_async_resolve' | 'trigger_screen_takeover';
    payload: Record<string, unknown>;
  };
}

/**
 * Executes a natural language voice utterance against the Bimodal Session State.
 * Includes the 2-Turn Voice Screen Disambiguation State Machine when multiple screens are discovered.
 */
export function processVoiceUtterance(
  state: BimodalSessionState,
  rawUtterance: string,
  nowTimestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
  usingGeminiCloudTts = true
): VoiceCommandExecutionResult {
  const startMs = performance.now();
  const utterance = rawUtterance.trim();
  const lower = utterance.toLowerCase();

  let nextActiveThreadId = state.activeThreadId;
  const nextThreads: Record<string, CanvasState> = structuredClone(state.threads);
  const nextParkedDigests: ParkedDigestItem[] = structuredClone(state.parkedDigests);
  const nextDiscoveredScreens: DiscoveredScreenDevice[] = structuredClone(state.discoveredScreens);
  let nextPendingDisambiguation = state.pendingDisambiguation
    ? structuredClone(state.pendingDisambiguation)
    : null;
  let nextIncomingTakeoverPrompt = state.incomingTakeoverPrompt
    ? structuredClone(state.incomingTakeoverPrompt)
    : null;

  let spokenDraft = '';
  let toolExecuted = 'bluf_conversational_reply';
  let modelTier: 'gemini-3.8-flash' | 'gemini-4-argon' = 'gemini-3.8-flash';
  let utteranceIntent: ModalityRoutingReceipt['utteranceIntent'] = 'query_overview';
  let explicitTargetSurface: SurfaceRole | null = null;
  let sideEffect: VoiceCommandExecutionResult['sideEffect'] = undefined;

  // 0. Check if we are resolving a Pending Screen Disambiguation ("Which screen do you want?")
  const screenMatch = matchScreenFromUtterance(lower, nextDiscoveredScreens);
  if (nextPendingDisambiguation?.active && screenMatch.matchedDevices.length > 0) {
    const chosenDevices = screenMatch.matchedDevices;
    const currentCanvas = nextThreads[nextActiveThreadId];

    nextPendingDisambiguation = null;
    currentCanvas.visibility = 'live_visible';
    currentCanvas.lockedDeviceIds = chosenDevices.map((d) => d.id);
    explicitTargetSurface =
      chosenDevices.length === 1 ? chosenDevices[0].surfaceRole : 'auto';
    currentCanvas.targetSurfaces = Array.from(
      new Set(chosenDevices.map((d) => d.surfaceRole))
    );

    for (const dev of nextDiscoveredScreens) {
      if (chosenDevices.some((c) => c.id === dev.id)) {
        dev.status = 'projecting_active';
      }
    }

    const primaryTarget = chosenDevices[0];
    const deviceNamesJoined = chosenDevices.map((d) => d.name).join(' and ');
    nextIncomingTakeoverPrompt = {
      id: `takeover-${Date.now()}`,
      sourceDeviceName: "Conor's iPhone (Voice Jewel)",
      targetDevice: primaryTarget,
      threadTitle: currentCanvas.threadTitle,
      engine: currentCanvas.engine,
      mode: state.autoAcceptScreenTakeover ? 'auto_accepted' : 'ask_permission',
      timestamp: nowTimestamp,
    };

    utteranceIntent = 'reveal_canvas';
    toolExecuted = `lock_and_takeover_screen([${chosenDevices.map((d) => `"${d.name}"`).join(', ')}])`;
    currentCanvas.lastMutationDescription = `Projecting onto ${deviceNamesJoined} (${primaryTarget.protocol})`;
    spokenDraft = `Got it, projecting ${currentCanvas.threadDomain} onto ${deviceNamesJoined} now. Say "remove golf balls" or "zoom in" to control it live.`;

    sideEffect = {
      type: 'trigger_screen_takeover',
      payload: {
        devices: chosenDevices,
        threadId: currentCanvas.threadId,
        autoAccept: state.autoAcceptScreenTakeover,
      },
    };
  }
  // 1. Otherwise, normal turn processing
  else {
    // Thread Context Switching
    if (
      lower.includes('carpenter') ||
      lower.includes('carpentry') ||
      lower.includes('workbench') ||
      lower.includes('cut-sheet') ||
      lower.includes('cut list') ||
      lower.includes('mortise') ||
      lower.includes('roubo')
    ) {
      if (nextActiveThreadId !== 'carpenter-workbench') {
        nextActiveThreadId = 'carpenter-workbench';
        toolExecuted = 'switch_or_create_thread("carpenter-workbench")';
        utteranceIntent = 'switch_thread';
      }
    } else if (
      lower.includes('second brain') &&
      (lower.includes('switch') ||
        lower.includes('standup') ||
        lower.includes('bot fleet') ||
        lower.includes('pull up'))
    ) {
      if (nextActiveThreadId !== 'second-brain-standup') {
        nextActiveThreadId = 'second-brain-standup';
        toolExecuted = 'switch_or_create_thread("second-brain-standup")';
        utteranceIntent = 'switch_thread';
      }
    } else if (
      (lower.includes('golf') || lower.includes('sales') || lower.includes('margin')) &&
      (lower.includes('switch') ||
        lower.includes('back to') ||
        nextActiveThreadId !== 'gp-golf-margins')
    ) {
      if (
        lower.includes('golf') ||
        lower.includes('switch to sales') ||
        lower.includes('switch to margin')
      ) {
        nextActiveThreadId = 'gp-golf-margins';
        toolExecuted = 'switch_or_create_thread("gp-golf-margins")';
        utteranceIntent = 'switch_thread';
      }
    }

    const currentCanvas = nextThreads[nextActiveThreadId];
    const schema = extractActiveSchemaContext(currentCanvas, nextDiscoveredScreens);
    const connectedRoles = state.surfaces.map((s) => s.role);

    // 2. Check for "Text me the information" / Car / Android Auto mode
    if (
      lower.includes('text me') ||
      lower.includes('send to my phone') ||
      lower.includes('save for when i park') ||
      lower.includes('android auto')
    ) {
      utteranceIntent = 'queue_parked_digest';
      toolExecuted = 'dispatch_mobile_digest("parked_drawer")';
      spokenDraft = `Queued the ${currentCanvas.threadDomain} digest and deep-link to your phone for when you park. Want to keep going or switch threads?`;
    }
    // 3. Check for Second Brain MCP Commit
    else if (
      lower.includes('write to second brain') ||
      lower.includes('commit to second brain') ||
      lower.includes('log this decision') ||
      lower.includes('save to second brain') ||
      lower.includes('commit it')
    ) {
      utteranceIntent = 'commit_second_brain';
      modelTier = 'gemini-4-argon';
      const commitSummary = buildCurrentThreadDigestSummary(currentCanvas);
      const slug = `${currentCanvas.threadId}-voice-decision`;
      if (currentCanvas.brainDeckSpec) {
        currentCanvas.brainDeckSpec.pendingCommit = {
          noteType: 'progress',
          slug,
          title: `Voice Decision on ${currentCanvas.threadTitle}`,
          summary: commitSummary,
          committedPath: `progress/antigravity/2026-10-27-${slug}.md`,
        };
      }
      currentCanvas.visibility = 'live_visible';
      currentCanvas.lastMutationDescription = `MCP Commit -> progress/antigravity/2026-10-27-${slug}.md`;
      toolExecuted = `commit_to_second_brain("progress", "${slug}")`;
      spokenDraft = `Committed the ${currentCanvas.threadDomain} outcome directly to your Second Brain on main. Ready for your next thread.`;
      sideEffect = {
        type: 'commit_second_brain',
        payload: {
          noteType: 'progress',
          slug,
          title: currentCanvas.threadTitle,
          summary: commitSummary,
        },
      };
    }
    // 4. Simulate Early "Show Me" Staging Race Condition (`staging_in_progress`)
    else if (lower.includes('stage new') || lower.includes('deep synthesis')) {
      utteranceIntent = 'reveal_canvas';
      modelTier = 'gemini-4-argon';
      currentCanvas.visibility = 'staging_in_progress';
      currentCanvas.lastMutationDescription =
        'Loop 2 (gemini-4-argon) synthesizing multi-source payload...';
      toolExecuted = 'reveal_canvas("auto") [staging_in_progress]';
      spokenDraft =
        'Synthesizing the full Q1-Q4 cross-ledger breakdown now; streaming onto your canvas in two seconds.';
      sideEffect = {
        type: 'stage_async_resolve',
        payload: { threadId: currentCanvas.threadId },
      };
    }
    // 5. Screen Takeover, Disambiguation & Engine Mutations
    else {
      const mutationsApplied: string[] = [];

      const hasSpecificMutationCommand =
        lower.includes('waterfall') ||
        lower.includes('line chart') ||
        lower.includes('stacked') ||
        lower.includes('bar chart') ||
        lower.includes('remove') ||
        lower.includes('exclude') ||
        lower.includes('without') ||
        lower.includes('zoom') ||
        lower.includes('filter') ||
        lower.includes('inches') ||
        lower.includes('millimeter');

      const isGenericShowCommand =
        !hasSpecificMutationCommand &&
        (lower.includes('show me') ||
          lower.includes('on the screen') ||
          lower.includes('project this') ||
          lower.includes('pull up') ||
          lower.includes('put this up') ||
          lower.includes('open canvas'));

      // Case 5A: User explicitly named a screen ("Throw that on the Samsung TV", "Show me on my laptop", "Both screens")
      if (screenMatch.matchedDevices.length > 0 && (isGenericShowCommand || lower.includes('throw') || lower.includes('send to') || lower.includes('cast') || lower.includes('pop'))) {
        const chosen = screenMatch.matchedDevices;
        nextPendingDisambiguation = null;
        currentCanvas.visibility = 'live_visible';
        currentCanvas.lockedDeviceIds = chosen.map((d) => d.id);
        explicitTargetSurface = chosen[0].surfaceRole;
        currentCanvas.targetSurfaces = Array.from(new Set(chosen.map((d) => d.surfaceRole)));

        for (const dev of nextDiscoveredScreens) {
          if (chosen.some((c) => c.id === dev.id)) {
            dev.status = 'projecting_active';
          }
        }

        const primaryTarget = chosen[0];
        nextIncomingTakeoverPrompt = {
          id: `takeover-${Date.now()}`,
          sourceDeviceName: "Conor's iPhone (Voice Jewel)",
          targetDevice: primaryTarget,
          threadTitle: currentCanvas.threadTitle,
          engine: currentCanvas.engine,
          mode: state.autoAcceptScreenTakeover ? 'auto_accepted' : 'ask_permission',
          timestamp: nowTimestamp,
        };

        mutationsApplied.push(
          `takeover_screen([${chosen.map((d) => `"${d.name}"`).join(', ')}])`
        );
        utteranceIntent = 'reveal_canvas';
        sideEffect = {
          type: 'trigger_screen_takeover',
          payload: {
            devices: chosen,
            threadId: currentCanvas.threadId,
            autoAccept: state.autoAcceptScreenTakeover,
          },
        };
      }
      // Case 5B: User said generic "Show me" / "Show me on the screen", Multiple Screens are discovered,
      // and no screen is locked yet -> Trigger 2-Second Voice Pushback ("Which screen do you want?")
      else if (
        isGenericShowCommand &&
        screenMatch.matchedDevices.length === 0 &&
        state.requireDisambiguationWhenMultipleScreens &&
        state.physicalContext === 'multi_screen_room' &&
        nextDiscoveredScreens.length > 1 &&
        (!currentCanvas.lockedDeviceIds || currentCanvas.lockedDeviceIds.length === 0)
      ) {
        utteranceIntent = 'disambiguate_screen';
        nextPendingDisambiguation = {
          active: true,
          originalUtterance: utterance,
          candidateScreens: nextDiscoveredScreens,
          promptedAt: nowTimestamp,
        };
        const topTwoNames = nextDiscoveredScreens
          .slice(0, 2)
          .map((d) => d.name)
          .join(' and ');
        toolExecuted = `ask_screen_disambiguation([${nextDiscoveredScreens.map((d) => `"${d.name}"`).join(', ')}])`;
        currentCanvas.lastMutationDescription = `Awaiting 2s voice screen choice (${nextDiscoveredScreens.length} screens on LAN)`;
        spokenDraft = `I see ${topTwoNames} on your network. Which screen do you want, or should I project to both?`;
      }
      // Case 5C: Standard reveal (e.g., when a screen is already locked or disambiguation is disabled)
      else if (isGenericShowCommand) {
        explicitTargetSurface = 'auto';
        currentCanvas.visibility = 'live_visible';
        currentCanvas.targetSurfaces = resolveTargetSurfaces('auto', connectedRoles);
        mutationsApplied.push('reveal_canvas("auto")');
        utteranceIntent = 'reveal_canvas';
      }

      // Only run engine data/blueprint/deck mutations if we didn't pause for screen disambiguation
      if (utteranceIntent !== 'disambiguate_screen') {
        // ENGINE 1: Data Analytics Mutations (`gp-golf-margins`)
        if (currentCanvas.engine === 'data_analytics' && currentCanvas.dataSpec) {
          const spec = currentCanvas.dataSpec;

          const isRemoveIntent =
            lower.includes('remove') ||
            lower.includes('exclude') ||
            lower.includes('strip') ||
            lower.includes('without') ||
            lower.includes('drop') ||
            lower.includes('hide');
          const isRestoreIntent =
            lower.includes('restore') ||
            lower.includes('include') ||
            lower.includes('bring back') ||
            lower.includes('reset') ||
            lower.includes('all series') ||
            lower.includes('add back');

          if (isRestoreIntent) {
            if (lower.includes('golf ball')) {
              spec.excludedSeries = spec.excludedSeries.filter(
                (s) => s.toLowerCase() !== 'golf balls'
              );
              mutationsApplied.push('includeSeries(["Golf Balls"])');
            } else {
              spec.excludedSeries = [];
              spec.activePeriod = 'ALL';
              mutationsApplied.push('reset_filters()');
            }
            currentCanvas.visibility = 'live_visible';
            utteranceIntent = 'mutate_visual_state';
          } else if (isRemoveIntent) {
            for (const seriesName of schema.availableSeriesNames) {
              const sLower = seriesName.toLowerCase();
              const keywords = sLower.split(/\s+/).filter((w) => w.length > 3);
              const matched =
                lower.includes(sLower) ||
                (sLower.includes('golf balls') &&
                  (lower.includes('golf ball') || lower.includes('balls'))) ||
                keywords.some((kw) => lower.includes(kw));

              if (matched && !spec.excludedSeries.includes(seriesName)) {
                spec.excludedSeries.push(seriesName);
                mutationsApplied.push(`excludeSeries(["${seriesName}"])`);
                currentCanvas.visibility = 'live_visible';
                utteranceIntent = 'mutate_visual_state';
              }
            }
          }

          // Period Zoom
          const periodMatch = lower.match(/\bq([1-4])\b/i);
          if (periodMatch) {
            const q = `Q${periodMatch[1]}` as PeriodFilter;
            spec.activePeriod = q;
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push(`activePeriod("${q}")`);
            utteranceIntent = 'mutate_visual_state';
          } else if (lower.includes('full year') || lower.includes('all quarters')) {
            spec.activePeriod = 'ALL';
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push('activePeriod("ALL")');
            utteranceIntent = 'mutate_visual_state';
          }

          // Chart Type Mutation
          let nextChartType: ChartType | null = null;
          if (lower.includes('stacked')) {
            nextChartType = 'stacked_bar';
          } else if (lower.includes('line')) {
            nextChartType = 'line';
          } else if (lower.includes('waterfall') || lower.includes('bridge')) {
            nextChartType = 'waterfall';
          } else if (lower.includes('bar')) {
            nextChartType = 'bar';
          } else if (
            lower.includes('different type') ||
            lower.includes('another graph') ||
            lower.includes('switch graph') ||
            lower.includes('change chart')
          ) {
            const order: ChartType[] = ['bar', 'waterfall', 'line', 'stacked_bar'];
            const idx = order.indexOf(spec.chartType);
            nextChartType = order[(idx + 1) % order.length];
          }

          if (nextChartType && nextChartType !== spec.chartType) {
            spec.chartType = nextChartType;
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push(`chartType("${nextChartType}")`);
            utteranceIntent = 'mutate_visual_state';
          }

          // Metric focus
          let nextMetric: MetricFocus | null = null;
          if (lower.includes('unit') || lower.includes('volume')) {
            nextMetric = 'units';
          } else if (lower.includes('revenue') || lower.includes('sales euro')) {
            nextMetric = 'revenue';
          } else if (lower.includes('margin %') || lower.includes('net margin')) {
            nextMetric = 'net_margin_pct';
          }
          if (nextMetric && nextMetric !== spec.metricFocus) {
            spec.metricFocus = nextMetric;
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push(`metricFocus("${nextMetric}")`);
            utteranceIntent = 'mutate_visual_state';
          }

          const metrics = calculateDataMetrics(
            spec.series,
            spec.excludedSeries,
            spec.activePeriod
          );
          const periodLabel = spec.activePeriod === 'ALL' ? 'FY26' : spec.activePeriod;

          if (mutationsApplied.length > 0) {
            toolExecuted = `mutate_data_canvas({ ${mutationsApplied.join(', ')} })`;
            if (spec.excludedSeries.length > 0) {
              spokenDraft = `Excluded ${spec.excludedSeries.join(' and ')}. ${periodLabel} blended margin jumps from ${metrics.baselineMarginPct}% to ${metrics.blendedMarginPct}%, yielding €${metrics.totalProfitK}k net profit.`;
            } else if (screenMatch.matchedDevices.length > 0) {
              spokenDraft = `Projected ${periodLabel} matrix onto ${screenMatch.matchedDevices.map((d) => d.name).join(' and ')}: blended margin is ${metrics.blendedMarginPct}% across €${metrics.totalRevenueK}k revenue.`;
            } else {
              spokenDraft = `Switched to ${spec.chartType.replace('_', ' ')} for ${periodLabel}: blended margin is ${metrics.blendedMarginPct}% across €${metrics.totalRevenueK}k revenue. Want to strip out Golf Balls next?`;
            }
          } else {
            spokenDraft = `${periodLabel} blended margin sits at ${metrics.blendedMarginPct}% on €${metrics.totalRevenueK}k revenue, dragged down by Golf Balls at 12%. Say "show me on the screen" or "remove sales of golf balls".`;
          }
        }

        // ENGINE 2: Carpenter Blueprint SVG (`carpenter-workbench`)
        else if (currentCanvas.engine === 'blueprint_svg' && currentCanvas.blueprintSpec) {
          const bSpec = currentCanvas.blueprintSpec;

          let nextZoom: BlueprintZoomTarget | null = null;
          if (
            lower.includes('mortise') ||
            lower.includes('tenon') ||
            lower.includes('joint') ||
            lower.includes('zoom in')
          ) {
            nextZoom = 'mortise_joint';
          } else if (
            lower.includes('apron') ||
            lower.includes('stretcher') ||
            lower.includes('leg')
          ) {
            nextZoom = 'leg_apron';
          } else if (
            lower.includes('cut list') ||
            lower.includes('cut-sheet') ||
            lower.includes('schedule')
          ) {
            nextZoom = 'cut_list';
          } else if (
            lower.includes('overview') ||
            lower.includes('zoom out') ||
            lower.includes('full bench')
          ) {
            nextZoom = 'overview';
          }

          if (nextZoom && nextZoom !== bSpec.zoomTarget) {
            bSpec.zoomTarget = nextZoom;
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push(`zoomTarget("${nextZoom}")`);
            utteranceIntent = 'mutate_visual_state';
          }

          if (lower.includes('inch') || lower.includes('imperial')) {
            bSpec.unit = 'in';
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push('unit("in")');
            utteranceIntent = 'mutate_visual_state';
          } else if (
            lower.includes('millimeter') ||
            lower.includes('mm') ||
            lower.includes('metric')
          ) {
            bSpec.unit = 'mm';
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push('unit("mm")');
            utteranceIntent = 'mutate_visual_state';
          }

          const stepMatch = lower.match(/step\s*([1-4])/i);
          if (stepMatch) {
            const stepNum = Number(stepMatch[1]);
            if (!bSpec.completedSteps.includes(stepNum)) {
              bSpec.completedSteps.push(stepNum);
            } else if (lower.includes('unmark') || lower.includes('undo')) {
              bSpec.completedSteps = bSpec.completedSteps.filter((n) => n !== stepNum);
            }
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push(`toggleStepComplete(${stepNum})`);
            utteranceIntent = 'mutate_visual_state';
          }

          if (mutationsApplied.length > 0) {
            toolExecuted = `mutate_blueprint_canvas({ ${mutationsApplied.join(', ')} })`;
            if (bSpec.zoomTarget === 'mortise_joint') {
              const dimText =
                bSpec.unit === 'mm'
                  ? '51mm tenon by 102mm slab depth with a 1.5mm drawbore offset'
                  : '2.01 in tenon by 4.02 in depth with a 1/16 in drawbore offset';
              spokenDraft = `Zoomed into the drawbored through-mortise: ${dimText}. Ready to mark step 2 complete?`;
            } else {
              spokenDraft = `Updated the workbench blueprint to ${bSpec.zoomTarget.replace('_', ' ')} in ${bSpec.unit === 'mm' ? 'millimeters' : 'inches'}. Next up is step ${bSpec.completedSteps.length + 1}.`;
            }
          } else {
            spokenDraft = `The White Oak workbench calls for 102mm slab thickness and 51mm through-tenons with a 1.5mm drawbore offset. Say "show me" or "zoom in on the mortise joint".`;
          }
        }

        // ENGINE 3: Second Brain Deck (`second-brain-standup`)
        else if (currentCanvas.engine === 'second_brain_deck' && currentCanvas.brainDeckSpec) {
          const dSpec = currentCanvas.brainDeckSpec;

          let nextFilter: BrainFilterStatus | null = null;
          if (lower.includes('fail') || lower.includes('error') || lower.includes('broken')) {
            nextFilter = 'failed_runs';
          } else if (
            lower.includes('action') ||
            lower.includes('open loop') ||
            lower.includes('pending')
          ) {
            nextFilter = 'action_required';
          } else if (
            lower.includes('all card') ||
            lower.includes('show all') ||
            lower.includes('reset')
          ) {
            nextFilter = 'all';
          }

          if (nextFilter && nextFilter !== dSpec.filterStatus) {
            dSpec.filterStatus = nextFilter;
            currentCanvas.visibility = 'live_visible';
            mutationsApplied.push(`filterStatus("${nextFilter}")`);
            utteranceIntent = 'mutate_visual_state';
          }

          const visibleCards = dSpec.cards.filter((c) =>
            dSpec.filterStatus === 'all' ? true : c.status === dSpec.filterStatus
          );

          if (mutationsApplied.length > 0) {
            toolExecuted = `mutate_brain_deck({ ${mutationsApplied.join(', ')} })`;
            spokenDraft = `Filtered Second Brain deck to ${visibleCards.length} ${dSpec.filterStatus.replace('_', ' ')} cards. Say "write to Second Brain" to commit this outcome.`;
          } else {
            spokenDraft = `Fleet standup has 14 healthy runs, 2 isolated parse-versus-empty alerts, and 2 action items. Say "show me" or "filter to failed runs".`;
          }
        }

        if (mutationsApplied.length > 0) {
          currentCanvas.lastMutationDescription = mutationsApplied.join(' + ');
        }
      }
    }
  }

  const currentCanvas = nextThreads[nextActiveThreadId];
  const connectedRoles = state.surfaces.map((s) => s.role);

  // Enforce the strict Server-Side BLUF Guard (<= 2 sentences, <= 35 words)
  const bluf = enforceBlufGuard(spokenDraft);

  // Run the Deterministic Modality Router
  const routingDecision = evaluateModalityRouting({
    utterance,
    intent: utteranceIntent,
    canvas: currentCanvas,
    physicalContext: state.physicalContext,
    voicePersona: state.voicePersona,
    blufSpokenText: bluf.cleanText,
    connectedRoles,
    explicitTargetSurface,
    nowTimestamp,
    usingGeminiCloudTts,
  });

  if (utteranceIntent === 'disambiguate_screen') {
    routingDecision.receipt.eyeChannel.awaitingDisambiguation = true;
    routingDecision.receipt.eyeChannel.dispatched = false;
    routingDecision.receipt.eyeChannel.routingReason =
      `DISAMBIGUATION HOLD: ${nextDiscoveredScreens.length} screens discovered (${nextDiscoveredScreens.map((d) => d.name).join(', ')}). Waiting 2s for user voice choice before taking over screen.`;
  } else if (currentCanvas.visibility !== 'staging_in_progress') {
    currentCanvas.visibility = routingDecision.resolvedVisibility;
  }
  currentCanvas.targetSurfaces = routingDecision.resolvedSurfaces;

  if (routingDecision.shouldAutoQueueDigest) {
    const newDigest: ParkedDigestItem = {
      id: `digest-${Date.now()}`,
      timestamp: nowTimestamp,
      threadId: currentCanvas.threadId,
      threadTitle:
        state.physicalContext === 'in_car_driving'
          ? `[Auto-Routed Driving Safety Gate] ${currentCanvas.threadTitle}`
          : currentCanvas.threadTitle,
      blufSummary: buildCurrentThreadDigestSummary(currentCanvas),
      keyTakeaways: buildCurrentThreadTakeaways(currentCanvas),
      deepLinkRoute: `/?thread=${currentCanvas.threadId}&surface=phone`,
      syncedToSecondBrain: true,
    };
    nextParkedDigests.unshift(newDigest);
  }

  const elapsedMs = Math.max(8, Math.round(performance.now() - startMs));

  currentCanvas.lastMutationLatencyMs = elapsedMs;
  currentCanvas.lastUpdatedIso = new Date().toISOString();
  currentCanvas.modelUsed = modelTier;

  const turn: VoiceTurn = {
    id: `turn-${Date.now()}`,
    timestamp: nowTimestamp,
    threadId: currentCanvas.threadId,
    userTranscript: utterance,
    blufSpokenResponse: bluf.cleanText,
    phoneticSpokenResponse: normalizeForNaturalSpeech(bluf.cleanText),
    sentenceCount: bluf.sentenceCount,
    wordCount: bluf.wordCount,
    toolExecuted,
    latencyMs: elapsedMs,
    modelTier,
    routingReceipt: routingDecision.receipt,
  };

  const nextState: BimodalSessionState = {
    ...state,
    activeThreadId: nextActiveThreadId,
    discoveredScreens: nextDiscoveredScreens,
    pendingDisambiguation: nextPendingDisambiguation,
    incomingTakeoverPrompt: nextIncomingTakeoverPrompt,
    threads: nextThreads,
    voiceHistory: [turn, ...state.voiceHistory].slice(0, 20),
    parkedDigests: nextParkedDigests,
  };

  return {
    nextState,
    turn,
    activeSchema: extractActiveSchemaContext(currentCanvas, nextDiscoveredScreens),
    sideEffect,
  };
}

function buildCurrentThreadDigestSummary(canvas: CanvasState): string {
  if (canvas.engine === 'data_analytics' && canvas.dataSpec) {
    const m = calculateDataMetrics(
      canvas.dataSpec.series,
      canvas.dataSpec.excludedSeries,
      canvas.dataSpec.activePeriod
    );
    const excl =
      canvas.dataSpec.excludedSeries.length > 0
        ? ` (Excl. ${canvas.dataSpec.excludedSeries.join(', ')})`
        : '';
    return `GP Golf Shop ${canvas.dataSpec.activePeriod}${excl}: Blended Net Margin ${m.blendedMarginPct}% on €${m.totalRevenueK}k revenue (€${m.totalProfitK}k net profit).`;
  }
  if (canvas.engine === 'blueprint_svg' && canvas.blueprintSpec) {
    return `Roubo White Oak Workbench (${canvas.blueprintSpec.unit}): 1830×585×102mm split-top, 51mm through-tenons with 1.5mm drawbore offset. Completed steps: ${canvas.blueprintSpec.completedSteps.length}/4.`;
  }
  if (canvas.engine === 'second_brain_deck' && canvas.brainDeckSpec) {
    return `Second Brain Standup Deck: ${canvas.brainDeckSpec.cards.length} active items (Filter: ${canvas.brainDeckSpec.filterStatus}). Model policy enforced on gemini-3.8-flash & gemini-4-argon.`;
  }
  return canvas.threadTitle;
}

function buildCurrentThreadTakeaways(canvas: CanvasState): string[] {
  if (canvas.engine === 'data_analytics' && canvas.dataSpec) {
    return [
      'Custom Fitting Studio leads at 62% margin (€64k revenue).',
      'Custom Drivers deliver 44% margin (€158k revenue).',
      'Removing Golf Balls (12% margin) lifts Q3 blended net margin from 36.6% to 44.8%.',
    ];
  }
  if (canvas.engine === 'blueprint_svg' && canvas.blueprintSpec) {
    return [
      'Front & Rear White Oak Slabs: 1830mm length × 102mm finished thickness.',
      'Leg through-tenons: 51mm width × 102mm depth with 9.5mm riven oak pegs.',
      'Drawbore pin offset: 1.5mm (1/16 in) toward shoulder for mechanical lock.',
    ];
  }
  return [
    'One-table handshake fourth pass verified 100% job_id attribution.',
    'Model health check separated JSON parse errors from empty upstream outputs.',
    'Bimodal Voice + Visual Companion ready for TARS integration.',
  ];
}

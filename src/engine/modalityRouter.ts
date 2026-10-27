import type {
  CanvasState,
  ModalityRoutingReceipt,
  PhysicalContextMode,
  SurfaceRole,
  VoicePersona,
} from '../types/bimodal';

/**
 * Deterministic Phonetic Speech Normalizer.
 * Rewrites eye-oriented tabular symbols, currencies, fractions, and CAD abbreviations
 * into natural conversational prose before hitting `gemini-3.8-flash-tts` or neural OS voices.
 */
export function normalizeForNaturalSpeech(rawText: string): string {
  let text = rawText;

  // 1. Currency & Thousands: "€592k" -> "592 thousand euros", "€44.2k" -> "44.2 thousand euros"
  text = text.replace(/€(\d+(?:\.\d+)?)k\b/gi, '$1 thousand euros');
  text = text.replace(/€(\d+(?:\.\d+)?)\b/g, '$1 euros');

  // 2. Percentages: "36.6%" -> "36.6 percent"
  text = text.replace(/(\d+(?:\.\d+)?)%/g, '$1 percent');

  // 3. Quarters & Fiscal Year: "Q1–Q4" / "Q1-Q4" -> "first through fourth quarter", "Q3" -> "Q 3"
  text = text.replace(/\bQ1[–-]Q4\b/gi, 'first through fourth quarter');
  text = text.replace(/\bFY26\b/gi, 'fiscal 26');
  text = text.replace(/\bYoY\b/gi, 'year over year');

  // 4. CAD / Carpentry Dimensions: "51mm × 102mm" -> "51 by 102 millimeters", "±0.5mm" -> "plus or minus 0.5 millimeters"
  text = text.replace(/±(\d+(?:\.\d+)?)mm\b/gi, 'plus or minus $1 millimeters');
  text = text.replace(/(\d+(?:\.\d+)?)mm\b/gi, '$1 millimeters');
  text = text.replace(/1\/16\s*in\b/gi, 'one sixteenth of an inch');
  text = text.replace(/3\/8\s*in\b/gi, 'three eighths of an inch');
  text = text.replace(/1\/4\s*in\b/gi, 'one quarter inch');
  text = text.replace(/(\d+(?:\.\d+)?)\s*in\b/gi, '$1 inches');
  text = text.replace(/\s*[×x]\s*(?=\d)/g, ' by ');

  // 5. Clean up slashes & code tokens that sound robotic when read aloud
  text = text.replace(/\bpad\/tv\b/gi, 'your iPad and TV');
  text = text.replace(/\bpad\b/g, 'iPad');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

export interface ModalityRouterEvaluationInput {
  utterance: string;
  intent: ModalityRoutingReceipt['utteranceIntent'];
  canvas: CanvasState;
  physicalContext: PhysicalContextMode;
  voicePersona: VoicePersona;
  blufSpokenText: string;
  connectedRoles: Array<'phone' | 'pad' | 'tv' | 'unified'>;
  explicitTargetSurface: SurfaceRole | null;
  nowTimestamp: string;
  usingGeminiCloudTts: boolean;
}

/**
 * Deterministic Modality Router & Information Classifier.
 * Decides how information is split across:
 *   1. Primary Channel: Ears (Voice — strictly <= 2 scalars + decision prompt)
 *   2. Secondary Channel: Eyes (Interactive Canvas on `/pad` or `/tv`)
 *   3. In-Transit Safety Gate: Parked Digest Queue (`/phone` Android Auto mode)
 *   4. Permanent Memory: Second Brain MCP (`redser-second-brain`)
 */
export function evaluateModalityRouting(
  input: ModalityRouterEvaluationInput
): {
  receipt: ModalityRoutingReceipt;
  resolvedVisibility: CanvasState['visibility'];
  resolvedSurfaces: SurfaceRole[];
  shouldAutoQueueDigest: boolean;
} {
  const {
    intent,
    canvas,
    physicalContext,
    voicePersona,
    blufSpokenText,
    connectedRoles,
    explicitTargetSurface,
    nowTimestamp,
    usingGeminiCloudTts,
  } = input;

  // 1. Compute Cardinality & Information Density of the underlying artifact
  let cardinalityScore = 5;
  let itemsStrippedToVisual = 15;

  if (canvas.engine === 'data_analytics' && canvas.dataSpec) {
    const activeCount =
      canvas.dataSpec.series.length - canvas.dataSpec.excludedSeries.length;
    cardinalityScore = activeCount * 4; // 5 series × 4 quarters = 20 data points
    itemsStrippedToVisual = Math.max(0, cardinalityScore - 2);
  } else if (canvas.engine === 'blueprint_svg' && canvas.blueprintSpec) {
    cardinalityScore =
      canvas.blueprintSpec.cutList.length * 3 + canvas.blueprintSpec.steps.length; // 19 spatial specs
    itemsStrippedToVisual = Math.max(0, cardinalityScore - 2);
  } else if (canvas.engine === 'second_brain_deck' && canvas.brainDeckSpec) {
    cardinalityScore = canvas.brainDeckSpec.cards.length * 3;
    itemsStrippedToVisual = Math.max(0, cardinalityScore - 2);
  }

  // Count numeric scalars permitted in the BLUF spoken response
  const numericMatches = blufSpokenText.match(/\d+(?:\.\d+)?/g) || [];
  const scalarsPermittedInVoice = Math.min(numericMatches.length, 3);

  // 2. Physical Context & Safety Gate Routing Rules
  let resolvedVisibility = canvas.visibility;
  let resolvedSurfaces: SurfaceRole[] = canvas.targetSurfaces;
  let suppressedBySafetyGate = false;
  let shouldAutoQueueDigest = intent === 'queue_parked_digest';
  let eyeRoutingReason = '';
  let asyncQueueReason = 'Not queued (interactive visual surface active in room).';

  if (physicalContext === 'in_car_driving') {
    // SAFETY GATE: While driving (Android Auto / In-Transit), suppress visual screen popups
    // unless explicitly overridden for a passenger, and auto-queue the dense artifact to the Phone Parked Digest.
    suppressedBySafetyGate = true;
    resolvedVisibility = 'staged_hidden';
    resolvedSurfaces = ['phone'];
    shouldAutoQueueDigest = true;
    eyeRoutingReason =
      'SUPPRESSED BY DRIVING SAFETY GATE (physicalContext="in_car_driving"): Dense chart/blueprint held back from screen to prevent driver distraction.';
    asyncQueueReason =
      'AUTO-QUEUED TO PHONE PARKED DRAWER: High-cardinality payload (' +
      cardinalityScore +
      ' data points) routed to async digest for review when parked.';
  } else if (physicalContext === 'hands_busy_workshop') {
    // CARPENTER / WORKSHOP MODE: Prioritize Workbench iPad (`pad`) with immediate visual lock
    resolvedSurfaces = ['pad'];
    if (
      intent === 'reveal_canvas' ||
      intent === 'mutate_visual_state' ||
      canvas.engine === 'blueprint_svg'
    ) {
      resolvedVisibility = 'live_visible';
    }
    eyeRoutingReason =
      'WORKSHOP HANDS-FREE ROUTE: Routed ' +
      itemsStrippedToVisual +
      ' spatial/tabular specs to Workbench iPad (/pad) so hands stay on tools.';
  } else {
    // MULTI-SCREEN ROOM MODE: Route executive decks / explicit TV casts to `tv`, interactive slicers to `pad` + `tv`
    if (explicitTargetSurface && explicitTargetSurface !== 'auto') {
      resolvedSurfaces = [explicitTargetSurface];
    } else if (canvas.engine === 'second_brain_deck') {
      resolvedSurfaces = connectedRoles.includes('tv') ? ['tv', 'pad'] : ['pad'];
    } else {
      const ext: SurfaceRole[] = [];
      if (connectedRoles.includes('pad') || connectedRoles.includes('unified')) ext.push('pad');
      if (connectedRoles.includes('tv')) ext.push('tv');
      resolvedSurfaces = ext.length > 0 ? ext : ['phone'];
    }
    eyeRoutingReason =
      'CARDINALITY SPLIT (Score=' +
      cardinalityScore +
      '): Stripped ' +
      itemsStrippedToVisual +
      ' multi-dimensional values from speech and routed to ' +
      resolvedSurfaces.join(' + ').toUpperCase() +
      '.';
  }

  // 3. Style Steering Directive for Gemini 3.8 Flash TTS
  const styleDirective =
    physicalContext === 'hands_busy_workshop'
      ? 'calm, precise master craftsperson at the workbench, crisp measurements, natural cadence'
      : physicalContext === 'in_car_driving'
        ? 'clear, eyes-free road briefing, warm conversational tone, unhurried pace'
        : 'warm, sharp executive colleague in a quick standup, natural conversational flow';

  const phoneticNormalizedText = normalizeForNaturalSpeech(blufSpokenText);

  const receipt: ModalityRoutingReceipt = {
    id: `route-${Date.now()}`,
    timestamp: nowTimestamp,
    physicalContext,
    utteranceIntent: intent,
    cardinalityScore,
    scalarsPermittedInVoice,
    itemsStrippedToVisual,
    earChannel: {
      rawBlufText: blufSpokenText,
      phoneticNormalizedText,
      voiceModel: usingGeminiCloudTts ? 'gemini-3.8-flash-tts' : 'neural-os-enhanced',
      voicePersona,
      styleDirective,
      routingReason: `Kept ${scalarsPermittedInVoice} headline scalar(s) + immediate decision prompt (<=35 words); phonetically normalized symbols for natural speech.`,
    },
    eyeChannel: {
      dispatched: resolvedVisibility === 'live_visible' && !suppressedBySafetyGate,
      suppressedBySafetyGate,
      targetSurfaces: resolvedSurfaces,
      engine: canvas.engine,
      routingReason: eyeRoutingReason,
    },
    asyncQueueChannel: {
      autoQueued: shouldAutoQueueDigest,
      routingReason: shouldAutoQueueDigest
        ? asyncQueueReason
        : 'Skipped (user has live visual companion surfaces in room).',
    },
    secondBrainChannel: {
      stagedForCommit:
        intent === 'mutate_visual_state' || intent === 'commit_second_brain',
      committedNow: intent === 'commit_second_brain',
      routingReason:
        intent === 'commit_second_brain'
          ? 'Direct MCP commit triggered -> wrote markdown progress note to redser-second-brain.'
          : intent === 'mutate_visual_state'
            ? 'State delta staged in memory -> ready for 1-word voice commit ("Write to Second Brain").'
            : 'Read-only turn; no Second Brain mutation required.',
    },
  };

  return {
    receipt,
    resolvedVisibility,
    resolvedSurfaces,
    shouldAutoQueueDigest,
  };
}

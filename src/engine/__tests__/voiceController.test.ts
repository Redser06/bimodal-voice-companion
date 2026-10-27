import { describe, expect, it } from 'vitest';
import { INITIAL_SESSION_STATE } from '../../state/seedThreads';
import {
  calculateDataMetrics,
  enforceBlufGuard,
  extractActiveSchemaContext,
  processVoiceUtterance,
  resolveTargetSurfaces,
} from '../voiceController';
import {
  evaluateModalityRouting,
  normalizeForNaturalSpeech,
} from '../modalityRouter';

describe('Bimodal Voice + Visual Companion Controller & Deterministic Modality Router', () => {
  it('enforces the strict <= 2 sentences and <= 35 words BLUF guard and strips markdown bullets', () => {
    const verboseInput = `
      - First item: GP Golf Shop revenue is €592k across five departments.
      - Second item: Golf Balls have a 12% margin which drags down the store average.
      - Third item: You should definitely review https://example.com/report and check Q3 numbers right away.
      - Fourth item: Here is another sentence that must be stripped by the server guard.
    `;
    const result = enforceBlufGuard(verboseInput);
    expect(result.sentenceCount).toBeLessThanOrEqual(2);
    expect(result.wordCount).toBeLessThanOrEqual(35);
    expect(result.cleanText).not.toContain('https://');
    expect(result.cleanText).not.toContain('Third item');
  });

  it('phonetically normalizes eye-oriented shorthand into natural conversational prose for TTS', () => {
    const raw =
      'Q3 blended margin jumps from 36.6% to 44.8% on €158k revenue (51mm × 102mm ±0.5mm, 1/16 in offset).';
    const phonetic = normalizeForNaturalSpeech(raw);

    expect(phonetic).toContain('36.6 percent');
    expect(phonetic).toContain('44.8 percent');
    expect(phonetic).toContain('158 thousand euros');
    expect(phonetic).toContain('51 millimeters by 102 millimeters');
    expect(phonetic).toContain('plus or minus 0.5 millimeters');
    expect(phonetic).toContain('one sixteenth of an inch');
    expect(phonetic).not.toContain('€158k');
  });

  it('reveals pre-staged canvas immediately on "Show me" and routes deterministically to connected pad/tv surfaces', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    expect(initial.threads['gp-golf-margins'].visibility).toBe('staged_hidden');

    const { nextState, turn } = processVoiceUtterance(initial, 'Show me');
    const updatedCanvas = nextState.threads['gp-golf-margins'];

    expect(updatedCanvas.visibility).toBe('live_visible');
    expect(updatedCanvas.targetSurfaces).toEqual(['pad', 'tv']);
    expect(turn.toolExecuted).toContain('reveal_canvas("auto")');
    expect(turn.sentenceCount).toBeLessThanOrEqual(2);
    expect(turn.routingReceipt.cardinalityScore).toBe(20);
    expect(turn.routingReceipt.itemsStrippedToVisual).toBe(18);
  });

  it('executes voice series exclusion ("remove sales of golf balls from the analysis and zoom in on Q3") and recalculates net margin', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    const baselineQ3 = calculateDataMetrics(
      initial.threads['gp-golf-margins'].dataSpec!.series,
      [],
      'Q3'
    );
    expect(baselineQ3.blendedMarginPct).toBeCloseTo(36.6, 1);

    const { nextState, turn } = processVoiceUtterance(
      initial,
      'Remove sales of golf balls from the analysis and zoom in on Q3'
    );
    const spec = nextState.threads['gp-golf-margins'].dataSpec!;

    expect(spec.excludedSeries).toContain('Golf Balls');
    expect(spec.activePeriod).toBe('Q3');
    expect(nextState.threads['gp-golf-margins'].visibility).toBe('live_visible');

    const afterExclusion = calculateDataMetrics(
      spec.series,
      spec.excludedSeries,
      spec.activePeriod
    );
    expect(afterExclusion.blendedMarginPct).toBeGreaterThan(baselineQ3.blendedMarginPct);
    expect(afterExclusion.blendedMarginPct).toBeCloseTo(44.8, 1);
    expect(turn.blufSpokenResponse).toContain('Excluded Golf Balls');
    expect(turn.phoneticSpokenResponse).toContain('percent');
  });

  it('enforces the In-Car Driving Safety Gate: suppresses visual screen popups and auto-queues a Phone Parked Digest', () => {
    const drivingState = structuredClone(INITIAL_SESSION_STATE);
    drivingState.physicalContext = 'in_car_driving';
    const beforeDigests = drivingState.parkedDigests.length;

    const { nextState, turn } = processVoiceUtterance(
      drivingState,
      'Remove sales of golf balls from the analysis'
    );

    // Visual popup must be suppressed by driving safety gate even on mutation
    expect(turn.routingReceipt.eyeChannel.suppressedBySafetyGate).toBe(true);
    expect(nextState.threads['gp-golf-margins'].visibility).toBe('staged_hidden');
    // Dense artifact must be auto-queued to the Phone Parked Digest
    expect(turn.routingReceipt.asyncQueueChannel.autoQueued).toBe(true);
    expect(nextState.parkedDigests.length).toBe(beforeDigests + 1);
    expect(nextState.parkedDigests[0].threadTitle).toContain(
      '[Auto-Routed Driving Safety Gate]'
    );
  });

  it('routes Hands-Busy Workshop context directly to the Workbench iPad (/pad) with craftsperson style steering', () => {
    const workshopCanvas = structuredClone(
      INITIAL_SESSION_STATE.threads['carpenter-workbench']
    );
    const decision = evaluateModalityRouting({
      utterance: 'Zoom in on the mortise joint',
      intent: 'mutate_visual_state',
      canvas: workshopCanvas,
      physicalContext: 'hands_busy_workshop',
      voicePersona: 'Kore',
      blufSpokenText: 'Zoomed into the mortise joint: 51mm tenon.',
      connectedRoles: ['phone', 'pad', 'tv'],
      explicitTargetSurface: null,
      nowTimestamp: '11:40:00',
      usingGeminiCloudTts: true,
    });

    expect(decision.resolvedSurfaces).toEqual(['pad']);
    expect(decision.resolvedVisibility).toBe('live_visible');
    expect(decision.receipt.earChannel.styleDirective).toContain('master craftsperson');
  });

  it('switches chart type via natural voice command ("show me this as a waterfall chart")', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    const { nextState } = processVoiceUtterance(
      initial,
      'Show me this as a waterfall chart'
    );
    expect(nextState.threads['gp-golf-margins'].dataSpec!.chartType).toBe('waterfall');
  });

  it('switches threads to Carpenter Workbench and mutates SVG blueprint zoom & units in one utterance', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    const { nextState, activeSchema } = processVoiceUtterance(
      initial,
      'Switch to the carpenter workbench and zoom in on the mortise joint in inches'
    );

    expect(nextState.activeThreadId).toBe('carpenter-workbench');
    const bSpec = nextState.threads['carpenter-workbench'].blueprintSpec!;
    expect(bSpec.zoomTarget).toBe('mortise_joint');
    expect(bSpec.unit).toBe('in');
    expect(activeSchema.engine).toBe('blueprint_svg');
    expect(activeSchema.availableZoomTargets).toContain('mortise_joint');
  });

  it('handles staging_in_progress skeleton state and extracts schema keys for Loop 1', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    const { nextState, sideEffect } = processVoiceUtterance(
      initial,
      'Run deep synthesis on Q1-Q4'
    );
    expect(nextState.threads['gp-golf-margins'].visibility).toBe('staging_in_progress');
    expect(sideEffect?.type).toBe('stage_async_resolve');

    const schema = extractActiveSchemaContext(nextState.threads['gp-golf-margins']);
    expect(schema.availableSeriesNames).toContain('Golf Balls');
    expect(schema.availableSeriesNames).toContain('Custom Drivers');
  });

  it('falls back to phone drawer when no external pad or tv surface is connected', () => {
    expect(resolveTargetSurfaces('auto', ['phone'])).toEqual(['phone']);
    expect(resolveTargetSurfaces('tv', ['phone', 'tv'])).toEqual(['tv']);
  });
});

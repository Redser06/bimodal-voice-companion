import { describe, expect, it } from 'vitest';
import { INITIAL_SESSION_STATE } from '../../state/seedThreads';
import {
  calculateDataMetrics,
  enforceBlufGuard,
  extractActiveSchemaContext,
  processVoiceUtterance,
  resolveTargetSurfaces,
} from '../voiceController';

describe('Bimodal Voice + Visual Companion Controller', () => {
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

  it('reveals pre-staged canvas immediately on "Show me" and routes deterministically to connected pad/tv surfaces', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    expect(initial.threads['gp-golf-margins'].visibility).toBe('staged_hidden');

    const { nextState, turn } = processVoiceUtterance(initial, 'Show me');
    const updatedCanvas = nextState.threads['gp-golf-margins'];

    expect(updatedCanvas.visibility).toBe('live_visible');
    expect(updatedCanvas.targetSurfaces).toEqual(['pad', 'tv']);
    expect(turn.toolExecuted).toContain('reveal_canvas("auto")');
    expect(turn.sentenceCount).toBeLessThanOrEqual(2);
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

    const afterExclusion = calculateDataMetrics(spec.series, spec.excludedSeries, spec.activePeriod);
    expect(afterExclusion.blendedMarginPct).toBeGreaterThan(baselineQ3.blendedMarginPct);
    expect(afterExclusion.blendedMarginPct).toBeCloseTo(44.8, 1);
    expect(turn.blufSpokenResponse).toContain('Excluded Golf Balls');
  });

  it('switches chart type via natural voice command ("show me this as a waterfall chart")', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    const { nextState } = processVoiceUtterance(initial, 'Show me this as a waterfall chart');
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

  it('queues an In-Transit / Android Auto digest when user says "Text me the information for when I park"', () => {
    const initial = structuredClone(INITIAL_SESSION_STATE);
    const beforeCount = initial.parkedDigests.length;

    const { nextState, turn } = processVoiceUtterance(
      initial,
      'Text me the information for when I park'
    );

    expect(nextState.parkedDigests.length).toBe(beforeCount + 1);
    expect(turn.toolExecuted).toContain('dispatch_mobile_digest');
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

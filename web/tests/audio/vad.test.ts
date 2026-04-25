import { describe, it, expect, vi } from 'vitest';
import { VADAnalyzer } from '../../src/audio/vad.js';

describe('VADAnalyzer', () => {
  function createMockAnalyzer(dataValues: number[]): AnalyserNode {
    return {
      fftSize: dataValues.length,
      getByteTimeDomainData: (arr: Uint8Array) => {
        for (let i = 0; i < dataValues.length; i++) arr[i] = dataValues[i];
      },
    } as unknown as AnalyserNode;
  }

  it('detects silence when RMS is below threshold', () => {
    const analyzer = createMockAnalyzer(new Array(128).fill(128));
    const vad = new VADAnalyzer(analyzer, { thresholdDb: -45, hysteresisDb: 6, smoothingFrames: 1 });
    expect(vad.analyze()).toBe(false);
  });

  it('detects speech when RMS is above threshold', () => {
    const analyzer = createMockAnalyzer(new Array(128).fill(0));
    const vad = new VADAnalyzer(analyzer, { thresholdDb: -45, hysteresisDb: 6, smoothingFrames: 1 });
    expect(vad.analyze()).toBe(true);
  });

  it('requires smoothing frames before switching to speaking', () => {
    const analyzer = createMockAnalyzer(new Array(128).fill(0));
    const vad = new VADAnalyzer(analyzer, { thresholdDb: -45, hysteresisDb: 6, smoothingFrames: 3 });
    expect(vad.analyze()).toBe(false);
    expect(vad.analyze()).toBe(false);
    expect(vad.analyze()).toBe(true);
  });

  it('returns volume in dB', () => {
    const analyzer = createMockAnalyzer(new Array(128).fill(128));
    const vad = new VADAnalyzer(analyzer);
    expect(vad.getVolumeDb()).toBeLessThan(-100);
  });
});

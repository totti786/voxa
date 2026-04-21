import { describe, it, expect, vi } from 'vitest';
import { createAudioGraph, setInputGain, closeAudioGraph } from '../../src/audio/processing.js';

function createMockNode(stream?: MediaStream) {
  const connections: any[] = [];
  const node = {
    connect: (target: any) => { connections.push(target); return target; },
    disconnect: () => { connections.length = 0; },
    gain: { value: 1.0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    fftSize: 0,
    smoothingTimeConstant: 0,
    stream: stream ?? { getAudioTracks: () => [{ id: 'dest-track' }] },
  };
  return node;
}

class MockAudioContext {
  sampleRate: number;
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 48000;
  }
  createMediaStreamSource = () => createMockNode();
  createGain = () => createMockNode();
  createDynamicsCompressor = () => createMockNode();
  createAnalyser = () => createMockNode();
  createMediaStreamDestination = () => createMockNode();
  close = () => Promise.resolve();
}

beforeEach(() => {
  (globalThis as any).AudioContext = MockAudioContext;
});

describe('audio processing', () => {
  it('creates an audio graph', () => {
    const mockStream = { getAudioTracks: () => [{ id: 't1' }] } as unknown as MediaStream;
    const graph = createAudioGraph(mockStream);
    expect(graph.context).toBeDefined();
    expect(graph.source).toBeDefined();
    expect(graph.gate).toBeDefined();
    expect(graph.compressor).toBeDefined();
    expect(graph.analyzer).toBeDefined();
    expect(graph.outputStream).toBeDefined();
    closeAudioGraph(graph);
  });

  it('sets input gain within bounds', () => {
    const mockStream = { getAudioTracks: () => [{ id: 't1' }] } as unknown as MediaStream;
    const graph = createAudioGraph(mockStream);
    setInputGain(graph, 1.5);
    expect(graph.gate.gain.value).toBe(1.5);
    setInputGain(graph, 3.0);
    expect(graph.gate.gain.value).toBe(2.0);
    setInputGain(graph, -1.0);
    expect(graph.gate.gain.value).toBe(0);
    closeAudioGraph(graph);
  });
});

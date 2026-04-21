import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker, getWorker, getMediaCodecs } from '../../src/sfu/worker.js';
import { createRouter, getRouter, closeRouter } from '../../src/sfu/router.js';

describe('mediasoup worker', () => {
  beforeAll(async () => {
    await createWorker();
  });

  afterAll(() => {
    const worker = getWorker();
    worker.close();
  });

  it('creates a worker', () => {
    const worker = getWorker();
    expect(worker).toBeDefined();
    expect(worker.closed).toBe(false);
  });

  it('returns opus codec capability', () => {
    const codecs = getMediaCodecs();
    expect(codecs).toHaveLength(1);
    expect(codecs[0].mimeType).toBe('audio/opus');
    expect(codecs[0].clockRate).toBe(48000);
  });

  it('creates and retrieves a router', async () => {
    const router = await createRouter('test-room');
    expect(router).toBeDefined();
    expect(router.closed).toBe(false);
    expect(getRouter('test-room')).toBe(router);
    closeRouter('test-room');
    expect(router.closed).toBe(true);
  });
});

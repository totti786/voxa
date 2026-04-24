import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker } from '../../src/sfu/worker.js';
import { createRouter } from '../../src/sfu/router.js';
import { createPeerTransports, getTransportIceParams } from '../../src/sfu/peer.js';
import type { Router } from 'mediasoup/node/lib/types.js';

const previousEnv = {
  RTC_MIN_PORT: process.env.RTC_MIN_PORT,
  RTC_MAX_PORT: process.env.RTC_MAX_PORT,
};

const TEST_RTC_MIN_PORT = '25000';
const TEST_RTC_MAX_PORT = '25100';

describe('peer sfu', () => {
  let router: Router;

  beforeAll(async () => {
    process.env.RTC_MIN_PORT = TEST_RTC_MIN_PORT;
    process.env.RTC_MAX_PORT = TEST_RTC_MAX_PORT;
    await createWorker();
    router = await createRouter('peer-test-room');
  });

  afterAll(() => {
    router.close();
    process.env.RTC_MIN_PORT = previousEnv.RTC_MIN_PORT;
    process.env.RTC_MAX_PORT = previousEnv.RTC_MAX_PORT;
  });

  it('creates send and recv transports', async () => {
    const pair = await createPeerTransports(router, 'p1');
    expect(pair.sendTransport).toBeDefined();
    expect(pair.recvTransport).toBeDefined();
    expect(pair.sendTransport.id).not.toBe(pair.recvTransport.id);
    pair.sendTransport.close();
    pair.recvTransport.close();
  });

  it('returns ice parameters', async () => {
    const pair = await createPeerTransports(router, 'p2');
    const params = getTransportIceParams(pair.sendTransport);
    expect(params.id).toBe(pair.sendTransport.id);
    expect(params.iceParameters).toBeDefined();
    expect(params.iceCandidates).toBeDefined();
    expect(params.dtlsParameters).toBeDefined();
    pair.sendTransport.close();
    pair.recvTransport.close();
  });
});

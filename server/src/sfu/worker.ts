import * as mediasoup from 'mediasoup';
import type { Worker, RtpCodecCapability } from 'mediasoup/types';
import { loadConfig } from '../config.js';

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
  },
];

let worker: Worker | null = null;

export async function createWorker(): Promise<Worker> {
  const config = loadConfig();
  worker = await mediasoup.createWorker({
    logLevel: config.logLevel as 'debug' | 'warn' | 'error' | 'none',
    rtcMinPort: config.rtcMinPort,
    rtcMaxPort: config.rtcMaxPort,
  });

  worker.on('died', () => {
    console.error('mediasoup worker died, exiting');
    process.exit(1);
  });

  return worker;
}

export function getWorker(): Worker {
  if (!worker) throw new Error('Worker not initialized');
  return worker;
}

export function getMediaCodecs(): RtpCodecCapability[] {
  return mediaCodecs;
}

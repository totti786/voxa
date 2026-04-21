import * as mediasoup from 'mediasoup';
import type { Worker, RtpCodecCapability } from 'mediasoup/node/lib/types.js';

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];

let worker: Worker | null = null;

export async function createWorker(): Promise<Worker> {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
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

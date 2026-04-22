import { getWorker, getMediaCodecs } from './worker.js';
import type { Router } from 'mediasoup/types';

const routers = new Map<string, Router>();

export async function createRouter(roomId: string): Promise<Router> {
  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs: getMediaCodecs() });
  routers.set(roomId, router);
  return router;
}

export function getRouter(roomId: string): Router | undefined {
  return routers.get(roomId);
}

export function closeRouter(roomId: string): void {
  const router = routers.get(roomId);
  if (router) {
    router.close();
    routers.delete(roomId);
  }
}

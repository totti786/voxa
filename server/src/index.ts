import { loadConfig } from './config.js';
import { createWorker } from './sfu/worker.js';
import { createSignalingServer } from './signaling/server.js';

async function main() {
  const config = loadConfig();

  await createWorker();
  console.log('mediasoup worker started');

  const wss = createSignalingServer(config.port);
  console.log(`Signaling server listening on port ${config.port}`);

  process.on('SIGINT', () => {
    console.log('Shutting down...');
    wss.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

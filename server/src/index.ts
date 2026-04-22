import http from 'http';
import { loadConfig } from './config.js';
import { createWorker } from './sfu/worker.js';
import { createSignalingServer } from './signaling/server.js';
import { roomState } from './room/state.js';

async function main() {
  const config = loadConfig();

  await createWorker();
  console.log('mediasoup worker started');

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/api/rooms' && req.method === 'GET') {
      const rooms = roomState.getRooms();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rooms));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  const wss = createSignalingServer({ server });

  server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });

  process.on('SIGINT', () => {
    console.log('Shutting down...');
    wss.close();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

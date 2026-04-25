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
    const origin = req.headers.origin || '';
    const allowed = config.allowedOrigins && config.allowedOrigins.length > 0
      ? config.allowedOrigins.includes(origin)
      : true;

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin || (config.allowedOrigins?.[0] || '*'));
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

    if (req.url === '/api/rooms' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const roomId = data.roomId || `room-${Date.now()}`;
          const password = data.password || undefined;
          const maxUsers = data.maxUsers || 10;
          roomState.createRoom(roomId, password, maxUsers);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: roomId, maxUsers, hasPassword: !!password }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request' }));
        }
      });
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
    console.log('Shutting down gracefully...');
    wss.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
    setTimeout(() => {
      console.error('Forced shutdown');
      process.exit(1);
    }, 10000);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

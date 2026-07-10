import http from 'http';
import { loadConfig } from './config.js';
import { createWorker } from './sfu/worker.js';
import { createSignalingServer } from './signaling/server.js';
import { roomState } from './room/state.js';

async function main() {
  const config = loadConfig();

  // Restore persisted rooms
  roomState.loadState();

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
      let tooLarge = false;
      req.on('data', (chunk: Buffer) => {
        body += chunk;
        if (body.length > 4096) {
          tooLarge = true;
        }
      });
      req.on('end', () => {
        try {
          if (tooLarge) throw new Error('payload_too_large');
          const data: unknown = JSON.parse(body);
          if (!data || typeof data !== 'object') throw new Error('invalid_request');
          const input = data as Record<string, unknown>;
          const generatedRoomId = `room-${Date.now()}`;
          const roomId = input.roomId === undefined ? generatedRoomId : input.roomId;
          const password = input.password === undefined ? undefined : input.password;
          const maxUsers = input.maxUsers === undefined ? 10 : input.maxUsers;
          if (typeof roomId !== 'string' || !roomId.trim() || roomId.trim().length > 64) throw new Error('invalid_room');
          if (password !== undefined && (typeof password !== 'string' || password.length > 128)) throw new Error('invalid_password');
          if (typeof maxUsers !== 'number' || !Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 10) throw new Error('invalid_max_users');
          if (roomState.getRoom(roomId.trim())) throw new Error('room_exists');
          roomState.createRoom(roomId.trim(), password, maxUsers);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: roomId.trim(), maxUsers, hasPassword: !!password }));
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

  const wss = createSignalingServer({ server, allowedOrigins: config.allowedOrigins });

  server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });

  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    roomState.flushSync();
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

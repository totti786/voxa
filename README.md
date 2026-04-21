# Voice

Web-first, self-hosted, low-latency voice communication.

## Quick Start

1. Build the frontend:
```bash
cd web
npm install
npm run build
```

2. Build and run with Docker Compose:
```bash
cd ..
docker-compose up --build
```

3. Open `http://localhost` in your browser.

## Development

**Frontend:**
```bash
cd web
npm run dev
```

**Backend:**
```bash
cd server
npm install
npm run dev
```

## Configuration

Set environment variables in `docker-compose.yml` or create a `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7880 | Signaling server port |
| `RTC_MIN_PORT` | 10000 | mediasoup UDP min port |
| `RTC_MAX_PORT` | 10100 | mediasoup UDP max port |
| `LOG_LEVEL` | info | Server log level |

## TLS

For production, place an SSL-terminating reverse proxy (Caddy, Nginx, Traefik) in front of the `voice-web` service. WebRTC requires HTTPS for microphone access.

# Voxa

Web-first, self-hosted, low-latency voice communication.

## Quick Start

1. Build and run with Docker Compose:
```bash
docker-compose up --build
```

2. Open `http://localhost` in your browser.

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
| `RTC_ANNOUNCED_IP` | unset | Public IP or hostname announced to remote WebRTC peers |
| `LOG_LEVEL` | info | Server log level |
| `TURN_ENABLED` | false | Enable TURN ICE server injection |
| `TURN_SERVER` | unset | TURN server URL or host:port |
| `TURN_USERNAME` | unset | TURN long-term credential username |
| `TURN_CREDENTIAL` | unset | TURN long-term credential password |

## TLS

For production, place an SSL-terminating reverse proxy (Caddy, Nginx, Traefik) in front of the `voxa-web` service. WebRTC requires HTTPS for microphone access.

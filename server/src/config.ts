export interface ServerConfig {
  port: number;
  rtcMinPort: number;
  rtcMaxPort: number;
  rtcAnnouncedIp?: string;
  logLevel: string;
  turnEnabled: boolean;
  turnServer?: string;
  turnUsername?: string;
  turnCredential?: string;
  allowedOrigins?: string[];
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN_SERVERS: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function parsePort(value: string, name: string, min = 1): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < min || port > 65535) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return port;
}

function normalizeTurnUrls(turnServer: string): string[] {
  const trimmed = turnServer.trim();
  if (!trimmed) return [];

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (/^turns?:/i.test(trimmed) || /^stun:/i.test(trimmed)) {
    return [trimmed];
  }

  return [`turn:${trimmed}?transport=udp`, `turn:${trimmed}?transport=tcp`];
}

export function loadConfig(): ServerConfig {
  const port = parsePort(process.env.PORT || '7880', 'PORT');
  const rtcMinPort = parsePort(process.env.RTC_MIN_PORT || '10000', 'RTC_MIN_PORT', 1024);
  const rtcMaxPort = parsePort(process.env.RTC_MAX_PORT || '10100', 'RTC_MAX_PORT', 1024);

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : undefined;

  return {
    port,
    rtcMinPort,
    rtcMaxPort,
    rtcAnnouncedIp: process.env.RTC_ANNOUNCED_IP || undefined,
    logLevel: process.env.LOG_LEVEL || 'warn',
    turnEnabled: process.env.TURN_ENABLED === 'true',
    turnServer: process.env.TURN_SERVER,
    turnUsername: process.env.TURN_USERNAME,
    turnCredential: process.env.TURN_CREDENTIAL,
    allowedOrigins,
  };
}

export function buildIceServers(config: ServerConfig): IceServerConfig[] {
  const iceServers = [...DEFAULT_STUN_SERVERS];

  if (config.turnEnabled && config.turnServer && config.turnUsername && config.turnCredential) {
    const urls = normalizeTurnUrls(config.turnServer);
    if (urls.length > 0) {
      iceServers.push({
        urls,
        username: config.turnUsername,
        credential: config.turnCredential,
      });
    }
  }

  return iceServers;
}

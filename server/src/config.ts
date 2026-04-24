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
}

export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '7880', 10),
    rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '10000', 10),
    rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '10100', 10),
    rtcAnnouncedIp: process.env.RTC_ANNOUNCED_IP || undefined,
    logLevel: process.env.LOG_LEVEL || 'warn',
    turnEnabled: process.env.TURN_ENABLED === 'true',
    turnServer: process.env.TURN_SERVER,
    turnUsername: process.env.TURN_USERNAME,
    turnCredential: process.env.TURN_CREDENTIAL,
  };
}

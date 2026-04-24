import { describe, it, expect } from 'vitest';
import { loadConfig, buildIceServers } from '../src/config.js';

describe('config', () => {
  it('loads default values', () => {
    const config = loadConfig();
    expect(config.port).toBe(7880);
    expect(config.rtcMinPort).toBe(10000);
    expect(config.rtcMaxPort).toBe(10100);
    expect(config.logLevel).toBe('warn');
    expect(config.turnEnabled).toBe(false);
  });

  it('loads values from environment', () => {
    process.env.PORT = '9000';
    process.env.RTC_MIN_PORT = '20000';
    process.env.RTC_ANNOUNCED_IP = '203.0.113.10';
    const config = loadConfig();
    expect(config.port).toBe(9000);
    expect(config.rtcMinPort).toBe(20000);
    expect(config.rtcAnnouncedIp).toBe('203.0.113.10');
    delete process.env.PORT;
    delete process.env.RTC_MIN_PORT;
    delete process.env.RTC_ANNOUNCED_IP;
  });

  it('builds TURN-aware ice servers when configured', () => {
    process.env.TURN_ENABLED = 'true';
    process.env.TURN_SERVER = 'turn.example.com:3478';
    process.env.TURN_USERNAME = 'voxa';
    process.env.TURN_CREDENTIAL = 'secret';

    const config = loadConfig();
    const iceServers = buildIceServers(config);

    expect(iceServers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'],
        username: 'voxa',
        credential: 'secret',
      },
    ]);

    delete process.env.TURN_ENABLED;
    delete process.env.TURN_SERVER;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  });
});

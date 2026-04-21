import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureAudio, stopCapture } from '../../src/audio/capture.js';

describe('audio capture', () => {
  const mockTrack = { stop: vi.fn(), kind: 'audio' };
  const mockStream = { getTracks: () => [mockTrack] };

  beforeEach(() => {
    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockStream as unknown as MediaStream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'default', label: 'Default', kind: 'audioinput' },
        { deviceId: 'speaker', label: 'Speaker', kind: 'audiooutput' },
      ]),
    } as unknown as MediaDevices;
    vi.clearAllMocks();
  });

  it('captures audio with default constraints', async () => {
    const stream = await captureAudio();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: undefined,
      },
      video: false,
    });
    expect(stream).toBe(mockStream);
  });

  it('captures audio with custom device', async () => {
    await captureAudio({ deviceId: 'mic-1' });
    const call = (navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0].audio.deviceId).toEqual({ exact: 'mic-1' });
  });

  it('stops all tracks', () => {
    stopCapture(mockStream as unknown as MediaStream);
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});

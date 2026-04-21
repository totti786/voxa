export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  await navigator.mediaDevices.getUserMedia({ audio: true });
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 8)}`, kind: d.kind as 'audioinput' | 'audiooutput' }));
}

export interface CaptureOptions {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export async function captureAudio(options: CaptureOptions = {}): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      echoCancellation: options.echoCancellation ?? true,
      noiseSuppression: options.noiseSuppression ?? true,
      autoGainControl: options.autoGainControl ?? true,
    } as MediaTrackConstraints,
    video: false,
  };

  return navigator.mediaDevices.getUserMedia(constraints);
}

export function stopCapture(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

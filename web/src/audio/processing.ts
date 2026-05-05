export interface AudioGraph {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gate: GainNode;
  compressor: DynamicsCompressorNode;
  analyzer: AnalyserNode;
  destination: MediaStreamAudioDestinationNode;
  outputStream: MediaStream;
  keepalive: OscillatorNode;          // silent oscillator to prevent AudioContext suspension
  keepaliveGain: GainNode;            // gain node at 0 to silence the keepalive
  _unloaded: boolean;
}

const SILENT_HZ = 20;  // sub-audible frequency

export function createAudioGraph(inputStream: MediaStream): AudioGraph {
  const context = new AudioContext({ sampleRate: 48000 });
  const source = context.createMediaStreamSource(inputStream);

  // Noise gate
  const gate = context.createGain();
  gate.gain.value = 1.0;

  // Compressor
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  // Analyzer for VU meter / VAD
  const analyzer = context.createAnalyser();
  analyzer.fftSize = 1024;
  analyzer.smoothingTimeConstant = 0.8;

  // Destination for processed stream
  const destination = context.createMediaStreamDestination();

  source.connect(gate);
  gate.connect(compressor);
  compressor.connect(analyzer);
  analyzer.connect(destination);

  // --- Keepalive oscillator to prevent AudioContext suspension on mobile ---
  // A silent, sub-audible oscillator keeps the audio graph "active" so the
  // browser doesn't consider it idle and suspend/kill the mic.
  const keepaliveGain = context.createGain();
  keepaliveGain.gain.value = 0;  // silent

  const keepalive = context.createOscillator();
  keepalive.type = 'sine';
  keepalive.frequency.value = SILENT_HZ;
  keepalive.connect(keepaliveGain);
  keepaliveGain.connect(context.destination);
  keepalive.start();

  return {
    context,
    source,
    gate,
    compressor,
    analyzer,
    destination,
    outputStream: destination.stream,
    keepalive,
    keepaliveGain,
    _unloaded: false,
  };
}

export function setInputGain(graph: AudioGraph, gain: number): void {
  graph.gate.gain.value = Math.max(0, Math.min(2, gain));
}

export function closeAudioGraph(graph: AudioGraph): void {
  if (graph._unloaded) return;
  graph._unloaded = true;

  try { graph.keepalive.stop(); } catch (_) { /* already stopped */ }
  graph.keepalive.disconnect();
  graph.keepaliveGain.disconnect();
  graph.source.disconnect();
  graph.gate.disconnect();
  graph.compressor.disconnect();
  graph.analyzer.disconnect();
  graph.destination.disconnect();
  graph.context.close();
}

/**
 * Set up Media Session API to tell the browser we're a communication app.
 * This helps prevent aggressive audio suspension on mobile.
 */
export function setupMediaSession(roomId?: string): void {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: roomId ? `Room: ${roomId}` : 'Voxa',
    artist: 'Voice Chat',
    album: 'Voxa',
    artwork: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
    ],
  });

  navigator.mediaSession.playbackState = 'playing';

  // Declare ourselves as a voice app so the OS knows to keep audio alive
  try {
    (navigator as any).mediaSession?.setMicrophoneActive?.(true);
  } catch (_) { /* not supported everywhere */ }
}

export function teardownMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = 'none';
  navigator.mediaSession.metadata = null;
}

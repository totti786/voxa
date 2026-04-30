export interface AudioGraph {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gate: GainNode;
  compressor: DynamicsCompressorNode;
  analyzer: AnalyserNode;
  destination: MediaStreamAudioDestinationNode;
  outputStream: MediaStream;
}

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

  return {
    context,
    source,
    gate,
    compressor,
    analyzer,
    destination,
    outputStream: destination.stream,
  };
}

export function setInputGain(graph: AudioGraph, gain: number): void {
  graph.gate.gain.value = Math.max(0, Math.min(2, gain));
}

export function closeAudioGraph(graph: AudioGraph): void {
  graph.source.disconnect();
  graph.gate.disconnect();
  graph.compressor.disconnect();
  graph.analyzer.disconnect();
  graph.destination.disconnect();
  graph.context.close();
}

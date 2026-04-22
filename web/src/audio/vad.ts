export interface VADOptions {
  thresholdDb: number;
  hysteresisDb: number;
  smoothingFrames: number;
}

export class VADAnalyzer {
  private analyzer: AnalyserNode;
  private dataArray: Uint8Array;
  private options: VADOptions;
  private isSpeaking = false;
  private smoothingCount = 0;

  constructor(analyzer: AnalyserNode, options: Partial<VADOptions> = {}) {
    this.analyzer = analyzer;
    this.dataArray = new Uint8Array(new ArrayBuffer(analyzer.frequencyBinCount));
    this.options = {
      thresholdDb: options.thresholdDb ?? -45,
      hysteresisDb: options.hysteresisDb ?? 6,
      smoothingFrames: options.smoothingFrames ?? 3,
    };
  }

  analyze(): boolean {
    (this.analyzer.getByteFrequencyData as (arr: Uint8Array) => void)(this.dataArray);
    const rms = this.computeRMS(this.dataArray);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));

    const thresholdOn = this.options.thresholdDb + this.options.hysteresisDb;
    const thresholdOff = this.options.thresholdDb;

    if (rmsDb > thresholdOn) {
      this.smoothingCount = Math.min(this.smoothingCount + 1, this.options.smoothingFrames);
    } else if (rmsDb < thresholdOff) {
      this.smoothingCount = Math.max(this.smoothingCount - 1, 0);
    }

    const newSpeaking = this.smoothingCount >= this.options.smoothingFrames;
    if (newSpeaking !== this.isSpeaking) {
      this.isSpeaking = newSpeaking;
    }

    return this.isSpeaking;
  }

  getVolumeDb(): number {
    (this.analyzer.getByteFrequencyData as (arr: Uint8Array) => void)(this.dataArray);
    const rms = this.computeRMS(this.dataArray);
    return 20 * Math.log10(Math.max(rms, 1e-10));
  }

  private computeRMS(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = data[i] / 255;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / data.length);
  }
}

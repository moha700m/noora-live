import { pcm16ToFloat } from "./pcm";

export class PcmPlayback {
  private gain: GainNode;
  private analyser: AnalyserNode;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private muted = false;
  private closed = false;

  constructor(private readonly context: AudioContext) {
    this.gain = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
    this.gain.connect(this.analyser);
    this.analyser.connect(context.destination);
  }

  enqueue(pcm: Int16Array, sampleRate: number): void {
    if (this.closed || pcm.length === 0) return;
    const floats = pcm16ToFloat(pcm);
    const buffer = this.context.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(new Float32Array(floats), 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    const now = this.context.currentTime;
    if (this.nextStart < now + 0.02) this.nextStart = now + 0.05;
    source.start(this.nextStart);
    this.nextStart += buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };
  }

  /** Barge-in: drop everything still scheduled. */
  clear(): void {
    for (const source of this.sources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sources.clear();
    this.nextStart = 0;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(muted ? 0 : 1, now);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get pending(): boolean {
    return this.sources.size > 0;
  }

  getLevel(): number {
    if (this.muted || this.sources.size === 0) return 0;
    const bins = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(bins);
    let sum = 0;
    for (let i = 0; i < bins.length; i += 1) {
      const v = ((bins[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / bins.length) * 3.2);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.clear();
    try {
      this.gain.disconnect();
      this.analyser.disconnect();
    } catch {
      /* ignore */
    }
  }
}

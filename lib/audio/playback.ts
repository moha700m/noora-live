import { pcm16ToFloat } from "./pcm.ts";

export class PcmPlayback {
  private readonly context: AudioContext;
  private gain: GainNode;
  private analyser: AnalyserNode;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private muted = false;
  private closed = false;
  private generation = 0;

  constructor(context: AudioContext) {
    this.context = context;
    this.gain = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
    this.gain.connect(this.analyser);
    this.analyser.connect(context.destination);
  }

  async resume(): Promise<boolean> {
    const generation = this.generation;
    if (this.closed || this.context.state === "closed") return false;
    if (this.context.state === "running") return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Audio resume timed out")), 2000);
        }),
      ]);
      return !this.closed && generation === this.generation && (this.context.state as AudioContextState) === "running";
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(bytes.slice(0));
  }

  async enqueue(pcm: Int16Array, sampleRate: number): Promise<boolean> {
    const generation = this.generation;
    if (this.closed || pcm.length === 0 || !(await this.resume()) || generation !== this.generation || this.closed) return false;
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
    return true;
  }

  /** Barge-in: drop everything still scheduled. */
  clear(): void {
    this.generation += 1;
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
    this.generation += 1;
    this.clear();
    try {
      this.gain.disconnect();
      this.analyser.disconnect();
    } catch {
      /* ignore */
    }
  }
}

import { CAPTURE_CHUNK_SAMPLES, downsampleAverage, floatToPcm16, rms } from "./pcm";
import { INPUT_SAMPLE_RATE } from "../gemini/config";

export type MicrophoneCallbacks = {
  onPcm: (pcm: Int16Array) => void;
  onLevel: (level: number) => void;
};

type WorkletMessage = {
  samples: Float32Array;
  rms: number;
  sampleRate: number;
};

export class MicrophoneCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private pending = new Float32Array(0);
  private inputRate = 48_000;
  private sendEnabled = false;
  private stopped = true;

  constructor(private readonly callbacks: MicrophoneCallbacks) {}

  async start(context: AudioContext): Promise<void> {
    this.stopped = false;
    this.context = context;
    this.inputRate = context.sampleRate || 48_000;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "OverconstrainedError" || name === "NotFoundError") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else {
        throw error;
      }
    }

    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = stream;
    await context.audioWorklet.addModule("/audio/pcm-capture-processor.js");
    if (this.stopped) {
      this.stopTracks();
      return;
    }

    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, "pcm-capture-processor");
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(worklet);
    worklet.connect(sink);
    sink.connect(context.destination);

    worklet.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      if (this.stopped) return;
      const { samples, sampleRate } = event.data;
      if (sampleRate) this.inputRate = sampleRate;
      this.callbacks.onLevel(Math.min(1, event.data.rms * 4));
      this.push(samples);
    };

    this.source = source;
    this.worklet = worklet;
    this.sink = sink;
  }

  setSending(enabled: boolean): void {
    this.sendEnabled = enabled;
    const track = this.stream?.getAudioTracks()[0];
    if (track) track.enabled = enabled;
    if (!enabled) this.pending = new Float32Array(0);
  }

  stop(): void {
    this.stopped = true;
    this.sendEnabled = false;
    this.pending = new Float32Array(0);
    try {
      this.worklet?.port.close();
    } catch {
      /* ignore */
    }
    try {
      this.worklet?.disconnect();
      this.source?.disconnect();
      this.sink?.disconnect();
    } catch {
      /* ignore */
    }
    this.worklet = null;
    this.source = null;
    this.sink = null;
    this.stopTracks();
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private push(samples: Float32Array): void {
    if (!this.sendEnabled || samples.length === 0) return;
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending, 0);
    merged.set(samples, this.pending.length);
    const ratio = this.inputRate / INPUT_SAMPLE_RATE;
    const needed = Math.max(1, Math.ceil(CAPTURE_CHUNK_SAMPLES * ratio));
    let offset = 0;
    while (merged.length - offset >= needed) {
      const slice = merged.subarray(offset, offset + needed);
      const down = downsampleAverage(slice, this.inputRate, INPUT_SAMPLE_RATE);
      const chunk = down.subarray(0, CAPTURE_CHUNK_SAMPLES);
      this.callbacks.onLevel(Math.min(1, rms(chunk) * 4));
      this.callbacks.onPcm(floatToPcm16(chunk));
      offset += needed;
    }
    this.pending = merged.slice(offset);
  }
}

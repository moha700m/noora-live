import { mergeTranscriptText } from "./transcript";
import { takeSpeakable } from "./phrases";

type Playback = {
  enqueue: (pcm: Int16Array, sampleRate: number) => void;
  clear: () => void;
};

export class PhraseSpeaker {
  private pending = "";
  private queue: string[] = [];
  private generation = 0;
  private pumping = false;
  private accumulated = "";
  private abort: AbortController | null = null;
  private failed = false;

  constructor(
    private readonly play: Playback,
    private readonly onActive: () => void,
    private readonly onError: (message: string) => void,
  ) {}

  get busy(): boolean {
    return this.pumping || this.queue.length > 0 || this.pending.trim().length > 0;
  }

  push(incoming: string, finished: boolean): void {
    const text = incoming.trim();
    if (text) {
      const merged = mergeTranscriptText(this.accumulated, text);
      const delta = merged.startsWith(this.accumulated) ? merged.slice(this.accumulated.length) : text;
      this.accumulated = merged;
      this.pending += delta;
    }
    this.drain(finished);
  }

  finish(): void {
    this.drain(true);
    this.accumulated = "";
  }

  clear(): void {
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
    this.pending = "";
    this.queue = [];
    this.accumulated = "";
    this.failed = false;
    this.play.clear();
  }

  private drain(finished: boolean): void {
    let rest = this.pending;
    while (rest.trim()) {
      const next = takeSpeakable(rest, finished);
      if (!next.speak) {
        rest = next.rest;
        break;
      }
      this.queue.push(next.speak);
      rest = next.rest;
      if (!finished) break;
    }
    this.pending = rest;
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    const generation = this.generation;
    try {
      while (this.queue.length > 0 && generation === this.generation) {
        const text = this.queue.shift();
        if (text) await this.speak(text, generation);
      }
    } finally {
      this.pumping = false;
      if (this.queue.length > 0 && generation === this.generation) void this.pump();
    }
  }

  private async speak(text: string, generation: number): Promise<void> {
    const controller = new AbortController();
    this.abort = controller;
    let response: Response;
    try {
      response = await fetch("/api/elevenlabs/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } catch {
      if (generation === this.generation && !controller.signal.aborted) this.failOnce();
      return;
    }
    if (generation !== this.generation) return;
    if (!response.ok || !response.body) {
      this.failOnce();
      return;
    }
    const reader = response.body.getReader();
    let odd = new Uint8Array(0);
    try {
      while (generation === this.generation) {
        const chunk = await reader.read();
        if (chunk.done || !chunk.value) break;
        const merged = new Uint8Array(odd.length + chunk.value.length);
        merged.set(odd);
        merged.set(chunk.value, odd.length);
        const even = merged.length - (merged.length % 2);
        odd = merged.slice(even);
        if (even < 2) continue;
        const copy = new Uint8Array(even);
        copy.set(merged.subarray(0, even));
        this.play.enqueue(new Int16Array(copy.buffer), 24_000);
        this.onActive();
      }
    } catch {
      if (generation === this.generation && !controller.signal.aborted) this.failOnce();
    } finally {
      if (generation !== this.generation) {
        try {
          await reader.cancel();
        } catch {
          /* interrupted */
        }
      }
    }
  }

  private failOnce(): void {
    if (this.failed) return;
    this.failed = true;
    this.onError("تعذر تشغيل صوت المساعدة.");
  }
}

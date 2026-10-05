export class TurnBuffer {
  private preroll: Int16Array[] = [];
  private prerollSamples = 0;
  private speech: Int16Array[] = [];
  private speechSamples = 0;
  private heard = false;
  readonly prerollMax = 16_000 * 0.4;
  readonly speechMax = 16_000 * 18;

  push(pcm: Int16Array, speechNow: boolean): void {
    if (!this.heard) {
      this.preroll.push(pcm);
      this.prerollSamples += pcm.length;
      this.trim(this.preroll, "preroll");
      if (!speechNow) return;
      this.heard = true;
      this.speech = this.preroll;
      this.speechSamples = this.prerollSamples;
      this.preroll = [];
      this.prerollSamples = 0;
      return;
    }
    this.speech.push(pcm);
    this.speechSamples += pcm.length;
    this.trim(this.speech, "speech");
  }

  get heardSpeech(): boolean {
    return this.heard;
  }

  get samples(): number {
    return this.speechSamples;
  }

  ready(stillTalking: boolean): boolean {
    return this.heard && !stillTalking && this.speechSamples >= 16_000 * 0.28;
  }

  take(): Int16Array[] | null {
    if (!this.heard || this.speechSamples < 16_000 * 0.28) {
      this.reset();
      return null;
    }
    const chunks = this.speech;
    this.reset();
    return chunks;
  }

  reset(): void {
    this.preroll = [];
    this.prerollSamples = 0;
    this.speech = [];
    this.speechSamples = 0;
    this.heard = false;
  }

  private trim(chunks: Int16Array[], kind: "preroll" | "speech"): void {
    const max = kind === "preroll" ? this.prerollMax : this.speechMax;
    let count = kind === "preroll" ? this.prerollSamples : this.speechSamples;
    while (count > max && chunks.length > 1) {
      const dropped = chunks.shift();
      count -= dropped?.length ?? 0;
    }
    if (kind === "preroll") this.prerollSamples = count;
    else this.speechSamples = count;
  }
}

export function shouldBarge(speakerBusy: boolean, playbackPending: boolean, sustainedMs: number): boolean {
  return (speakerBusy || playbackPending) && sustainedMs >= 320;
}

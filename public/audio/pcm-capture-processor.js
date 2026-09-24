class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;
    const copy = new Float32Array(channel.length);
    let sum = 0;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = channel[i];
      copy[i] = sample;
      sum += sample * sample;
    }
    const level = Math.sqrt(sum / channel.length);
    this.port.postMessage({ samples: copy, rms: level, sampleRate }, [copy.buffer]);
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);

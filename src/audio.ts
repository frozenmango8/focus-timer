let audio: AudioContext | null = null;

export function primeAudio(): void {
  const ctx = context();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export function playChime(): void {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => chime(ctx)).catch(() => {});
    return;
  }
  chime(ctx);
}

function context(): AudioContext | null {
  if (audio) return audio;
  if (typeof AudioContext === "undefined") return null;
  try {
    audio = new AudioContext();
  } catch {
    audio = null;
  }
  return audio;
}

function chime(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  const notes = [
    { freq: 392, at: 0, dur: 0.55, peak: 0.05 },
    { freq: 587.33, at: 0.16, dur: 0.75, peak: 0.04 },
  ];
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const start = t0 + note.at;
    osc.frequency.setValueAtTime(note.freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(note.peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.02);
  }
}

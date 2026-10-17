export type SoundName = 'click' | 'launch' | 'success' | 'toast' | 'error';

let ctx: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loading: Promise<void> | null = null;
let enabled = true;
let volume = 0.5;
const lastPlayed = new Map<SoundName, number>();

// Relative loudness: the game's click is sharp, the level-up jingle long.
const LEVEL: Record<SoundName, number> = { click: 0.45, launch: 0.5, success: 0.6, toast: 0.7, error: 0.8 };

export function configureSounds(on: boolean, vol0to100: number): void {
  enabled = on;
  volume = Math.max(0, Math.min(1, vol0to100 / 100));
}

/** Decode the sounds found in the user's downloaded Minecraft assets (once). */
function load(): Promise<void> {
  loading ??= (async () => {
    ctx = new AudioContext();
    const urls = await window.api.appearance.sounds().catch(() => ({}) as Record<string, string>);
    await Promise.all(
      Object.entries(urls).map(async ([name, url]) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          buffers.set(name as SoundName, await ctx!.decodeAudioData(data));
        } catch {
          /* undecodable — the synthesized stand-in plays instead */
        }
      })
    );
  })();
  return loading;
}

/** Simple synthesized stand-ins, used until the game assets are downloaded. */
function synth(name: SoundName, gain: GainNode): void {
  const c = ctx!;
  const t = c.currentTime;
  const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', peak = 1) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t + start);
    g.gain.setValueAtTime(0.0001, t + start);
    g.gain.exponentialRampToValueAtTime(0.3 * peak, t + start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
    o.connect(g).connect(gain);
    o.start(t + start);
    o.stop(t + start + dur + 0.02);
  };
  if (name === 'click') tone(1400, 0, 0.04, 'square', 0.4);
  else if (name === 'toast') tone(740, 0, 0.12);
  else if (name === 'success') [988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.18));
  else if (name === 'launch') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.22, 'triangle'));
  else if (name === 'error') [220, 165].forEach((f, i) => tone(f, i * 0.12, 0.2, 'triangle'));
}

export function playSound(name: SoundName, force = false): void {
  if ((!enabled && !force) || volume <= 0) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 60) return;
  lastPlayed.set(name, now);
  void load().then(() => {
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = volume * LEVEL[name];
    gain.connect(ctx.destination);
    const buf = buffers.get(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start();
    } else synth(name, gain);
  });
}

let bound = false;
/** Click sound for every enabled button-like element. */
export function initUiSounds(): void {
  if (bound) return;
  bound = true;
  document.addEventListener(
    'click',
    (e) => {
      const t = (e.target as Element | null)?.closest?.(
        'button:not(:disabled), .nav-item, [role="button"], .toggle-row, .accent-swatch'
      );
      if (t) playSound('click');
    },
    true
  );
}

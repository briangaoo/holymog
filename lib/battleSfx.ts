/**
 * Tiny synthesized SFX for mog battles. Uses Web Audio so we don't
 * ship audio files, autoplay policies are friendly (battles always
 * start from a user click), and the mute_battle_sfx toggle has a
 * single source of truth.
 *
 * Public API:
 *   - battleSfx.setMuted(boolean) — read once from /api/account/me on
 *     BattleRoom mount.
 *   - battleSfx.countdownTick(), countdownGo(), win(), loss() — fire
 *     these at the appropriate moments. All no-op when muted or when
 *     AudioContext is unavailable (older browsers, SSR).
 */

class BattleSfx {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(m: boolean): void {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Lazy-construct the AudioContext on first sound play. Browsers
   *  require a user gesture to unlock — battles always start from a
   *  click ("find a battle" / "start"), so by the time SFX fire the
   *  context is unblocked. */
  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        // @ts-expect-error — webkitAudioContext exists on Safari fallback
        const Ctor = window.AudioContext ?? window.webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    // Resume if browser auto-suspended (tab switched, mobile lock, etc).
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    opts?: {
      volume?: number;
      type?: OscillatorType;
      attack?: number;
    },
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts?.type ?? 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const v = opts?.volume ?? 0.18;
    const attack = opts?.attack ?? 0.005;
    const t0 = ctx.currentTime;
    // Soft attack so notes don't click; exponential decay sounds bell-like.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** "3", "2", "1" countdown blip. Mid-pitch, short. */
  countdownTick(): void {
    this.tone(523, 0.10, { volume: 0.13, type: 'sine' });
  }

  /** Countdown 0 / "battle start" — slightly higher + longer. */
  countdownGo(): void {
    this.tone(784, 0.22, { volume: 0.22, type: 'sine' });
  }

  /** Win flourish — ascending major triad (C-E-G). */
  win(): void {
    if (this.muted) return;
    this.tone(523, 0.14, { volume: 0.16 });
    window.setTimeout(() => this.tone(659, 0.14, { volume: 0.18 }), 120);
    window.setTimeout(() => this.tone(784, 0.45, { volume: 0.22 }), 240);
  }

  /** Loss flourish — descending minor with triangle waveform for that
   *  hollow "you got mogged" feel. */
  loss(): void {
    if (this.muted) return;
    this.tone(415, 0.20, { volume: 0.16, type: 'triangle' });
    window.setTimeout(
      () => this.tone(330, 0.45, { volume: 0.16, type: 'triangle' }),
      200,
    );
  }
}

export const battleSfx = new BattleSfx();

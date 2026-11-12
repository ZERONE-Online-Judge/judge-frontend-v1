import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationSoundCue } from './presentationAnnouncements';

const SOUND_STORAGE_KEY = 'zoj.presentation.sound.v1';
const VOLUME_STORAGE_KEY = 'zoj.presentation.volume.v1';
const DEFAULT_VOLUME = 0.75;
const VOICE_GAIN = 0.36;
const WARNING_VOICE_GAIN = 0.82;
const RELEASE_VOICE_GAIN = 0.55;
const REJECTED_VOICE_GAIN = 0.42;
const REPLACEMENT_FADE_SECONDS = 0.008;
type SoundVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
  startsAt: number;
};
const currentVoices = new WeakMap<AudioContext, Set<SoundVoice>>();

function stopCurrentCue(context: AudioContext) {
  const voices = currentVoices.get(context);
  if (!voices) return;
  currentVoices.delete(context);
  const now = context.currentTime;
  for (const voice of voices) {
    const { oscillator, gain, startsAt } = voice;
    const fade =
      context.state === 'running' &&
      startsAt < now &&
      typeof gain.gain.cancelAndHoldAtTime === 'function';
    try {
      if (fade) {
        gain.gain.cancelAndHoldAtTime(now);
        gain.gain.linearRampToValueAtTime(0, now + REPLACEMENT_FADE_SECONDS);
      } else {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
      }
      oscillator.stop(now + (fade ? REPLACEMENT_FADE_SECONDS : 0));
    } catch {
      // An interrupted or closed output may reject scheduling changes.
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(voice);
    } finally {
      if (!fade) {
        oscillator.disconnect();
        gain.disconnect();
        voices.delete(voice);
      }
    }
  }
}

function audioConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

export function presentationSoundNotes(cue: PresentationSoundCue) {
  switch (cue) {
    case 'tick':
      return [{ frequency: 880, offset: 0, duration: 0.085 }];
    case 'warning':
      return [660, 880, 1100, 660, 880, 1100].map((frequency, index) => ({
        frequency,
        offset: (index >= 3 ? 1.75 : 0) + (index % 3) * 0.42,
        duration: 0.38,
      }));
    case 'start':
      return [523.25, 659.25, 783.99].map((frequency, index) => ({
        frequency,
        offset: index * 0.15,
        duration: 0.25,
      }));
    case 'end':
      return [783.99, 659.25, 523.25].map((frequency, index) => ({
        frequency,
        offset: index * 0.19,
        duration: 0.32,
      }));
    case 'reveal':
      return [
        { frequency: 660, offset: 0, duration: 0.1 },
        { frequency: 660, offset: 0.16, duration: 0.14 },
      ];
    case 'accepted':
      return [
        { frequency: 659.25, offset: 0, duration: 0.11 },
        { frequency: 783.99, offset: 0.14, duration: 0.11 },
        { frequency: 1046.5, offset: 0.28, duration: 0.22 },
      ];
    case 'rejected':
      return [
        { frequency: 392, offset: 0, duration: 0.14 },
        { frequency: 329.63, offset: 0.19, duration: 0.22 },
      ];
    case 'result':
      return [
        { frequency: 523.25, offset: 0, duration: 0.16 },
        { frequency: 783.99, offset: 0.2, duration: 0.16 },
        { frequency: 1046.5, offset: 0.4, duration: 0.26 },
      ];
    case 'complete':
      return [
        { frequency: 523.25, offset: 0, duration: 0.14 },
        { frequency: 659.25, offset: 0.18, duration: 0.14 },
        { frequency: 783.99, offset: 0.36, duration: 0.18 },
        { frequency: 1046.5, offset: 0.62, duration: 0.22 },
        { frequency: 783.99, offset: 0.88, duration: 0.18 },
        { frequency: 1046.5, offset: 1.12, duration: 0.38 },
      ];
  }
}

function voiceGain(cue: PresentationSoundCue) {
  switch (cue) {
    case 'warning':
      return WARNING_VOICE_GAIN;
    case 'rejected':
      return REJECTED_VOICE_GAIN;
    case 'reveal':
    case 'accepted':
    case 'result':
    case 'complete':
      return RELEASE_VOICE_GAIN;
    default:
      return VOICE_GAIN;
  }
}

/** Generated locally: no media request, microphone or autoplay permission. */
export function playPresentationSound(
  context: AudioContext,
  cue: PresentationSoundCue,
  volume = DEFAULT_VOLUME,
) {
  if (!Number.isFinite(volume)) return false;
  // Replace the cue, including notes that have not started yet. Repeated test
  // clicks must not stack gain or leave old melodies waiting to play later.
  stopCurrentCue(context);
  if (context.state !== 'running' || volume <= 0) return false;
  const amplitude = Math.min(1, volume) * voiceGain(cue);
  const voices = new Set<SoundVoice>();
  currentVoices.set(context, voices);
  for (const note of presentationSoundNotes(cue)) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime + note.offset;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(
      amplitude,
      at + (cue === 'warning' ? 0.02 : 0.012),
    );
    // Warning and release phrases never overlap. Countdown melodies retain
    // their softer gain and at most two voices, keeping full-scale headroom.
    gain.gain.setValueAtTime(
      amplitude,
      at + note.duration - Math.max(0.03, note.duration * 0.35),
    );
    gain.gain.linearRampToValueAtTime(0, at + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const voice = { oscillator, gain, startsAt: at };
    voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(voice);
      if (!voices.size && currentVoices.get(context) === voices)
        currentVoices.delete(context);
    };
    oscillator.start(at);
    oscillator.stop(at + note.duration + 0.005);
  }
  return true;
}

function storedEnabled() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function storedVolume() {
  try {
    const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const value =
      stored === null || !stored.trim() ? DEFAULT_VOLUME : Number(stored);
    return Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function savePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Playback remains available when browser storage is disabled.
  }
}

export function usePresentationSound() {
  const [enabled, setEnabled] = useState(storedEnabled);
  const [unlocked, setUnlocked] = useState(false);
  const [volume, setVolumeState] = useState(storedVolume);
  const [supported] = useState(() => Boolean(audioConstructor()));
  const playerRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);
  useEffect(() => {
    enabledRef.current = enabled;
    volumeRef.current = volume;
  }, [enabled, volume]);
  useEffect(
    () => () => {
      const player = playerRef.current;
      playerRef.current = null;
      if (player) {
        player.onstatechange = null;
        void player.close().catch(() => undefined);
      }
    },
    [],
  );

  const enable = useCallback(async () => {
    const Constructor = audioConstructor();
    if (!Constructor) return false;
    try {
      let player = playerRef.current;
      if (!player || player.state === 'closed') {
        const created = new Constructor();
        player = created;
        playerRef.current = created;
        created.onstatechange = () => {
          if (playerRef.current === created) {
            if (created.state !== 'running') stopCurrentCue(created);
            setUnlocked(created.state === 'running');
          }
        };
      }
      // Called only by a button: browsers can reject an unsolicited resume.
      await player.resume();
      if (playerRef.current !== player || player.state !== 'running')
        return false;
      enabledRef.current = true;
      setEnabled(true);
      setUnlocked(true);
      savePreference(SOUND_STORAGE_KEY, 'true');
      return true;
    } catch {
      setUnlocked(false);
      return false;
    }
  }, []);
  useEffect(() => {
    if (!enabled || unlocked || !supported) return;
    // Browsers require a gesture before audio can run. Unlock silently when
    // the operator first uses the display; old scheduled cues stay consumed.
    const unlock = () => void enable();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [enable, enabled, supported, unlocked]);
  const disable = useCallback(() => {
    enabledRef.current = false;
    setEnabled(false);
    setUnlocked(false);
    savePreference(SOUND_STORAGE_KEY, 'false');
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      player.onstatechange = null;
      // Closing also drops pending notes; unmuting must not replay an old cue.
      void player.close().catch(() => undefined);
    }
  }, []);
  const play = useCallback((cue: PresentationSoundCue) => {
    const player = playerRef.current;
    if (!enabledRef.current || !player) return;
    try {
      playPresentationSound(player, cue, volumeRef.current);
    } catch {
      // An unavailable audio output must never interrupt the scoreboard.
    }
  }, []);
  const test = useCallback(async () => {
    if (!(await enable())) return false;
    play('warning');
    return true;
  }, [enable, play]);
  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(1, Math.max(0, value));
    volumeRef.current = next;
    if (next === 0 && playerRef.current) stopCurrentCue(playerRef.current);
    setVolumeState(next);
    savePreference(VOLUME_STORAGE_KEY, String(next));
  }, []);
  return {
    enabled,
    unlocked,
    supported,
    volume,
    enable,
    disable,
    test,
    play,
    setVolume,
  };
}

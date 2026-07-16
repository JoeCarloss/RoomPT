import Tts from 'react-native-tts';

const COOLDOWN_MS = 3000;

let lastSpokenAt = 0;
let initialized = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await Tts.getInitStatus();
  await Tts.setDefaultLanguage('ko-KR');
  await Tts.setDucking(true);
  initialized = true;
}

/**
 * Speak text with a 3s cooldown so overlapping feedback doesn't spam the
 * user, mirroring the web PoC's speak() helper. Pass force=true for
 * announcements that should always play immediately (e.g. rep counts).
 */
export async function speak(text: string, force = false): Promise<void> {
  await ensureInit();

  const now = Date.now();
  if (!force && now - lastSpokenAt < COOLDOWN_MS) {
    return;
  }

  if (force) {
    await Tts.stop();
  }

  Tts.speak(text);
  lastSpokenAt = now;
}

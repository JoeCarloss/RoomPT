import Tts from 'react-native-tts';

const COOLDOWN_MS = 3000;

let lastSpokenAt = 0;
let lastSpokenText = '';
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
 * If the spoken text is different from the last one, cooldown is bypassed.
 */
export async function speak(text: string, force = false): Promise<void> {
  try {
    await ensureInit();

    const now = Date.now();
    // 동일한 메시지인 경우에만 3초 쿨다운 적용. 메시지가 다르면 즉시 출력
    if (!force && text === lastSpokenText && now - lastSpokenAt < COOLDOWN_MS) {
      return;
    }

    if (force) {
      await Tts.stop();
    }

    Tts.speak(text);
    lastSpokenAt = now;
    lastSpokenText = text;
  } catch (error) {
    console.warn('[TTS Error]', error);
  }
}

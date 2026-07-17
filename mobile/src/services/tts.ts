import Tts from 'react-native-tts';

const COOLDOWN_MS = 3000;
// 서로 다른 경고 문구가 임계값 경계에서 프레임 단위로 번갈아 나올 때
// (speak()는 WARNING 동안 매 프레임 호출됨) Tts.speak() 큐에 무한정 쌓이는
// 것을 막는 전역 최소 간격. 다른 문구는 3초를 다 기다리지 않고 이 간격만 지나면 발화된다.
const MIN_GAP_MS = 2000;

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
    if (!force) {
      // 동일한 메시지는 3초 쿨다운
      if (text === lastSpokenText && now - lastSpokenAt < COOLDOWN_MS) {
        return;
      }
      // 다른 메시지라도 전역 최소 간격(2초)은 지켜서 큐 폭주 방지
      if (now - lastSpokenAt < MIN_GAP_MS) {
        return;
      }
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

/** 진행 중/대기 중인 발화를 즉시 중단 (앱이 백그라운드·잠금으로 전환될 때 호출) */
export async function stopSpeaking(): Promise<void> {
  try {
    await Tts.stop();
  } catch (error) {
    console.warn('[TTS Error]', error);
  }
}

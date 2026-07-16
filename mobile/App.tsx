/**
 * RoomPT - AI 실시간 피트니스 코치
 *
 * @format
 */

import { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/screens/CameraScreen';
import { SetupGuideScreen } from './src/screens/SetupGuideScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';

type Screen = 'guide' | 'camera' | 'history';

function App() {
  const [screen, setScreen] = useState<Screen>('guide');

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {screen === 'guide' ? (
        <SetupGuideScreen onStart={() => setScreen('camera')} />
      ) : screen === 'history' ? (
        <HistoryScreen onClose={() => setScreen('camera')} />
      ) : (
        <CameraScreen
          onShowGuide={() => setScreen('guide')}
          onShowHistory={() => setScreen('history')}
        />
      )}
    </SafeAreaProvider>
  );
}

export default App;

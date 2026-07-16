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

function App() {
  const [showGuide, setShowGuide] = useState(true);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {showGuide ? (
        <SetupGuideScreen onStart={() => setShowGuide(false)} />
      ) : (
        <CameraScreen onShowGuide={() => setShowGuide(true)} />
      )}
    </SafeAreaProvider>
  );
}

export default App;

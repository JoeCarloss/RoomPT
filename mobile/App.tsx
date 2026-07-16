/**
 * RoomPT - AI 실시간 피트니스 코치
 *
 * @format
 */

import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/screens/CameraScreen';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <CameraScreen />
    </SafeAreaProvider>
  );
}

export default App;

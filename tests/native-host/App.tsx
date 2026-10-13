import {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {createWakeWord} from 'nitro-wakeword';

export default function App() {
  const [status, setStatus] = useState('Checking native bindings');
  useEffect(() => {
    let active = true;
    createWakeWord({models: [], vadThreshold: 0})
      .then(
        async session => {
          await session.unload();
          if (active)
            setStatus('Failed: empty model configuration was accepted');
        },
        error => {
          if (!active) return;
          setStatus(
            error instanceof Error && error.message.includes('at least one')
              ? 'Native bindings ready'
              : `Failed: ${String(error)}`,
          );
        },
      )
      .catch(error => {
        if (active) setStatus(`Failed: ${String(error)}`);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <View>
      <Text accessibilityRole="header">Nitro Wakeword integration host</Text>
      <Text testID="native-binding-status">{status}</Text>
    </View>
  );
}

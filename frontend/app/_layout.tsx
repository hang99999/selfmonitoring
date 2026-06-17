import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UserContext, initUserId } from '../src/userStore';
import { hydrateLanguage, useLanguage } from '../src/i18n';

export default function RootLayout() {
  const [userId, setUserId] = useState<string>('');
  const { language } = useLanguage();

  useEffect(() => {
    Promise.all([initUserId(), hydrateLanguage()]).then(([uid]) => setUserId(uid));
  }, []);

  if (!userId) return null;

  return (
    <UserContext.Provider value={userId}>
      <StatusBar style="dark" />
      <Stack key={language} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chatbot" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="profile" options={{ headerShown: false, presentation: 'card' }} />
      </Stack>
    </UserContext.Provider>
  );
}

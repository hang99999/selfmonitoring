import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UserContext, initUserId } from '../src/userStore';
import { LanguageProvider } from '../src/i18n';

export default function RootLayout() {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    initUserId().then(setUserId);
  }, []);

  if (!userId) return null;

  return (
    <LanguageProvider>
      <UserContext.Provider value={userId}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chatbot" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="profile" options={{ headerShown: false, presentation: 'card' }} />
        </Stack>
      </UserContext.Provider>
    </LanguageProvider>
  );
}

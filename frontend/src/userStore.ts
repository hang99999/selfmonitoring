import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext } from 'react';

const USER_ID_KEY  = 'user_uuid';
const UNLOCKED_KEY = 'is_unlocked';
const PCODE_KEY    = 'participant_code';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Load UUID from storage; generate and save one if missing. */
export async function initUserId(): Promise<string> {
  let id = await AsyncStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = generateUUID();
    await AsyncStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export async function getStoredUserId(): Promise<string | null> {
  return AsyncStorage.getItem(USER_ID_KEY);
}

export async function getIsUnlocked(): Promise<boolean> {
  return (await AsyncStorage.getItem(UNLOCKED_KEY)) === 'true';
}

export async function setUnlocked(participantCode: string): Promise<void> {
  await AsyncStorage.setItem(UNLOCKED_KEY, 'true');
  await AsyncStorage.setItem(PCODE_KEY, participantCode);
}

export async function getParticipantCode(): Promise<string | null> {
  return AsyncStorage.getItem(PCODE_KEY);
}

// React Context — provides userId to the whole app
export const UserContext = createContext<string>('');
export const useUserId = (): string => useContext(UserContext);

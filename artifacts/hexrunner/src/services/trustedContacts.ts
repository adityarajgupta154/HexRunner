import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TRUSTED_CONTACTS_KEY =
  Platform.OS === 'web'
    ? '@hexrunner/trusted-contacts'
    : 'hexrunner.trusted-contacts';
const PHONE_PATTERN = /^[+0-9][0-9 ()-]{5,24}$/;

export type TrustedContact = { name: string; phone: string };

export function validTrustedContact(contact: TrustedContact): boolean {
  return contact.name.trim().length > 0 && PHONE_PATTERN.test(contact.phone.trim());
}

export async function loadTrustedContacts(): Promise<TrustedContact[]> {
  const raw = Platform.OS === 'web'
    ? await AsyncStorage.getItem(TRUSTED_CONTACTS_KEY)
    : await SecureStore.getItemAsync(TRUSTED_CONTACTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is TrustedContact =>
        item && typeof item.name === 'string' && typeof item.phone === 'string',
      )
      .filter(validTrustedContact)
      .slice(0, 2);
  } catch {
    return [];
  }
}

export async function saveTrustedContacts(contacts: TrustedContact[]): Promise<void> {
  const valid = contacts
    .map((contact) => ({ name: contact.name.trim(), phone: contact.phone.trim() }))
    .filter(validTrustedContact)
    .slice(0, 2);
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TRUSTED_CONTACTS_KEY, JSON.stringify(valid));
  } else {
    await SecureStore.setItemAsync(TRUSTED_CONTACTS_KEY, JSON.stringify(valid));
  }
}
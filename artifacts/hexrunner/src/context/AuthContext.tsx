import React, {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  registerAnonymousIdentity,
  setAuthTokenGetter,
} from '@workspace/api-client-react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ANONYMOUS_UID_KEY = '@hexrunner/anonymous-uid';
const ANONYMOUS_CREDENTIAL_KEY = 'hexrunner.anonymous-credential';
const ENROLLMENT_SECRET_KEY = 'hexrunner.enrollment-secret';
const IDENTITY_NOTICE_KEY = '@hexrunner/identity-notice';
const VALID_UID = /^[A-Za-z0-9_-]{8,120}$/;
const VALID_CREDENTIAL = /^hr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;
const VALID_ENROLLMENT_SECRET = /^[0-9a-f]{64}$/;

function createAnonymousUid(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `device_${time}_${random}`;
}

async function createEnrollmentSecret(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getSensitiveValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setSensitiveValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409
  );
}

async function registerIdentity(
  requestedUserId: string,
  enrollmentSecret: string,
) {
  return registerAnonymousIdentity({ requestedUserId, enrollmentSecret });
}

type AuthContextValue = {
  uid: string | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  dismissNotice: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dismissNotice = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(IDENTITY_NOTICE_KEY);
    } finally {
      setNotice(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadIdentity() {
      try {
        const [
          storedUid,
          storedCredential,
          storedEnrollmentSecret,
          storedNotice,
        ] =
          await Promise.all([
            AsyncStorage.getItem(ANONYMOUS_UID_KEY),
            getSensitiveValue(ANONYMOUS_CREDENTIAL_KEY),
            getSensitiveValue(ENROLLMENT_SECRET_KEY),
            AsyncStorage.getItem(IDENTITY_NOTICE_KEY),
          ]);

        if (
          storedUid &&
          VALID_UID.test(storedUid) &&
          storedCredential &&
          VALID_CREDENTIAL.test(storedCredential)
        ) {
          setAuthTokenGetter(() => storedCredential);

          if (active) {
            setUid(storedUid);
            setError(null);
            setNotice(storedNotice);
          }
          return;
        }

        const enrollmentSecret =
          storedEnrollmentSecret &&
          VALID_ENROLLMENT_SECRET.test(storedEnrollmentSecret)
            ? storedEnrollmentSecret
            : await createEnrollmentSecret();
        await setSensitiveValue(ENROLLMENT_SECRET_KEY, enrollmentSecret);

        const requestedUserId =
          storedUid && VALID_UID.test(storedUid)
            ? storedUid
            : createAnonymousUid();

        let identity;
        let migrationNotice: string | null = null;
        try {
          identity = await registerIdentity(
            requestedUserId,
            enrollmentSecret,
          );
        } catch (registrationError: unknown) {
          if (!isConflict(registrationError)) {
            throw registrationError;
          }

          identity = await registerIdentity(
            createAnonymousUid(),
            enrollmentSecret,
          );
          migrationNotice =
            'Your previous local identity could not be securely recovered, so HexRunner created a new protected identity.';
          await AsyncStorage.setItem(
            IDENTITY_NOTICE_KEY,
            migrationNotice,
          );
        }

        await AsyncStorage.setItem(ANONYMOUS_UID_KEY, identity.userId);
        await setSensitiveValue(
          ANONYMOUS_CREDENTIAL_KEY,
          identity.credential,
        );
        setAuthTokenGetter(() => identity.credential);

        if (active) {
          setUid(identity.userId);
          setError(null);
          setNotice(migrationNotice);
        }
      } catch (identityError: unknown) {
        if (!active) return;
        const message =
          identityError instanceof Error
            ? identityError.message
            : 'Unable to secure this HexRunner identity.';
        setAuthTokenGetter(null);
        setUid(null);
        setError(message);
        setNotice(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadIdentity();

    return () => {
      active = false;
      setAuthTokenGetter(null);
    };
  }, []);

  const value = useMemo(
    () => ({ uid, loading, error, notice, dismissNotice }),
    [dismissNotice, error, loading, notice, uid],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}

export { AuthContext };
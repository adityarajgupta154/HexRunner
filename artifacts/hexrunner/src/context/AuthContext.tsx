import React, {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANONYMOUS_UID_KEY = '@hexrunner/anonymous-uid';
const VALID_UID = /^[A-Za-z0-9_-]{8,120}$/;

function createAnonymousUid(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `device_${time}_${random}`;
}

type AuthContextValue = {
  uid: string | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadIdentity() {
      try {
        const storedUid = await AsyncStorage.getItem(ANONYMOUS_UID_KEY);
        const nextUid =
          storedUid && VALID_UID.test(storedUid)
            ? storedUid
            : createAnonymousUid();

        if (storedUid !== nextUid) {
          await AsyncStorage.setItem(ANONYMOUS_UID_KEY, nextUid);
        }

        if (active) {
          setUid(nextUid);
          setError(null);
        }
      } catch (identityError: unknown) {
        if (!active) return;
        const message =
          identityError instanceof Error
            ? identityError.message
            : 'Unable to create a local HexRunner identity.';
        setUid(null);
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadIdentity();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ uid, loading, error }),
    [error, loading, uid],
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
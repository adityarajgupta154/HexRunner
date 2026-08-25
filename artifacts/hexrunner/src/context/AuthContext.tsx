import React, {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  auth,
  firebaseInitializationError,
} from '@/src/services/firebase';

type AuthContextValue = {
  uid: string | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [uid, setUid] = useState<string | null>(
    auth?.currentUser?.uid ?? null,
  );
  const [loading, setLoading] = useState(auth !== null);
  const [error, setError] = useState<string | null>(
    firebaseInitializationError?.message ?? null,
  );

  useEffect(() => {
    const firebaseAuth = auth;

    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    let signInRequested = false;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setUid(user.uid);
        setError(null);
        setLoading(false);
        return;
      }

      setUid(null);

      if (!signInRequested) {
        signInRequested = true;
        setLoading(true);
        signInAnonymously(firebaseAuth).catch((signInError: unknown) => {
          const message =
            signInError instanceof Error
              ? signInError.message
              : 'Anonymous Firebase sign-in failed.';
          setError(message);
          setLoading(false);
        });
      }
    });

    return unsubscribe;
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
import Constants from 'expo-constants';
import {
  type FirebaseApp,
  type FirebaseOptions,
  getApp,
  getApps,
  initializeApp,
} from 'firebase/app';
import { type Auth, getAuth } from 'firebase/auth';
import { type Firestore, getFirestore } from 'firebase/firestore';

type ManifestFirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

const manifestConfig = Constants.expoConfig?.extra?.firebase as
  | ManifestFirebaseConfig
  | undefined;

// Direct process.env reads satisfy Node/build usage. app.config.js mirrors the
// same variables into the Expo manifest for iOS, Android, and web runtimes.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.FIREBASE_API_KEY ?? manifestConfig?.apiKey,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? manifestConfig?.authDomain,
  projectId: process.env.FIREBASE_PROJECT_ID ?? manifestConfig?.projectId,
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ?? manifestConfig?.storageBucket,
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID ??
    manifestConfig?.messagingSenderId,
  appId: process.env.FIREBASE_APP_ID ?? manifestConfig?.appId,
  measurementId:
    process.env.FIREBASE_MEASUREMENT_ID ?? manifestConfig?.measurementId,
};

const requiredConfig: Array<{
  environmentKey: string;
  value: string | undefined;
}> = [
  { environmentKey: 'FIREBASE_API_KEY', value: firebaseConfig.apiKey },
  { environmentKey: 'FIREBASE_AUTH_DOMAIN', value: firebaseConfig.authDomain },
  { environmentKey: 'FIREBASE_PROJECT_ID', value: firebaseConfig.projectId },
  {
    environmentKey: 'FIREBASE_STORAGE_BUCKET',
    value: firebaseConfig.storageBucket,
  },
  {
    environmentKey: 'FIREBASE_MESSAGING_SENDER_ID',
    value: firebaseConfig.messagingSenderId,
  },
  { environmentKey: 'FIREBASE_APP_ID', value: firebaseConfig.appId },
];

const missingEnvironmentKeys = requiredConfig
  .filter(({ value }) => !value)
  .map(({ environmentKey }) => environmentKey);

export const firebaseInitializationError =
  missingEnvironmentKeys.length > 0
    ? new Error(
        `Firebase configuration is missing: ${missingEnvironmentKeys.join(', ')}`,
      )
    : null;

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

if (!firebaseInitializationError) {
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(firebaseApp);
  firestoreInstance = getFirestore(firebaseApp);
}

export const app = firebaseApp;
export const auth = authInstance;
export const db = firestoreInstance;
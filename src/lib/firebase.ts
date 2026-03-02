import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

// If no Firebase credentials are configured, skip initializing.
// The app will still work — auth features simply won't be available.
export const firebaseReady = Boolean(apiKey);

const app = firebaseReady && getApps().length === 0
  ? initializeApp({
      apiKey,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    })
  : (getApps()[0] ?? null);

// These will be null when Firebase isn't configured — hooks check firebaseReady before using them
export const auth           = app ? getAuth(app)      : null as never;
export const db             = app ? getFirestore(app) : null as never;
export const googleProvider = new GoogleAuthProvider();

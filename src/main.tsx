import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { unlockAudio } from './utils/audioPlayback'

// Register a one-time native (non-React) listener so AudioContext is
// unlocked on the very first touch — before React processes any event.
const _earlyUnlock = () => unlockAudio();
document.addEventListener('touchstart', _earlyUnlock, { once: true, capture: true });
document.addEventListener('click',      _earlyUnlock, { once: true, capture: true });

// Seamless PWA updates. The service worker (registerType: autoUpdate +
// skipWaiting + clientsClaim) installs and activates a freshly deployed build
// on its own, but the already-loaded page keeps running the OLD cached JS until
// it reloads — which is why new deploys didn't show up without a manual cache
// clear. Reload once when a new worker takes control. Guarded so it never loops
// and never fires on the first-ever registration (only on real updates).
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  // Force an update check whenever the app is opened or brought back to the
  // foreground. Installed PWAs (especially on iOS) don't reliably re-check the
  // service worker on their own, so a freshly deployed build can sit unseen for
  // a long time. Asking the registration to update on focus/visibility makes a
  // new worker install → skipWaiting → controllerchange → reload above.
  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {});
  };
  window.addEventListener('focus', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)

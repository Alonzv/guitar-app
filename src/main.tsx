import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { unlockAudio } from './utils/audioPlayback'

// Register a one-time native (non-React) listener so AudioContext is
// unlocked on the very first touch — before React processes any event.
const _earlyUnlock = () => unlockAudio();
document.addEventListener('touchstart', _earlyUnlock, { once: true, capture: true });
document.addEventListener('click',      _earlyUnlock, { once: true, capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

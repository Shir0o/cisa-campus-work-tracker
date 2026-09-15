import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || '');
    if (message.includes('Could not establish connection. Receiving end does not exist.')) {
      event.preventDefault();
    }
  });

  // NOTE: deliberately no `vite:preloadError` listener. Vite's preload helper
  // rethrows the chunk error only when the event is *not* defaultPrevented, so
  // calling preventDefault() here made every failed import resolve with
  // `undefined` and hid the failure from `lazyWithRetry`. Reload-on-chunk-failure
  // lives in `lazyWithRetry`, which owns the once-per-session guard.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


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

  window.addEventListener('vite:preloadError', (event) => {
    // Prevent default error handling
    event.preventDefault();
    const pageHasAlreadyBeenReloaded =
      window.sessionStorage?.getItem('cisa_dynamic_import_reloaded') === 'true';

    if (!pageHasAlreadyBeenReloaded) {
      window.sessionStorage?.setItem('cisa_dynamic_import_reloaded', 'true');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


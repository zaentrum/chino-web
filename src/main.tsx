import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { oidcConfig } from './auth/oidc';
import { installErrorReporting } from './lib/errorReporter';

// Global error / unhandled-rejection listeners → auto bug reports.
// Installed before the first render so even a crash during mount is
// caught. Idempotent, so StrictMode / HMR re-evaluation is safe.
installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      {/* Boundary sits INSIDE the AuthProvider so a render crash keeps
          the OIDC session alive — the post-reload sign-in is silent. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AuthProvider>
  </StrictMode>,
);

// Register the PWA service worker — enables "Add to Home Screen" on
// iOS/Android with standalone chrome, caches the app shell + artwork
// for fast cold starts on flaky connections, and is the criterion
// Chrome needs to surface the Install prompt. Failures are
// non-fatal; the app works fine without the SW.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { buildOidcConfig } from './auth/oidc';
import { loadRuntimeConfig, type RuntimeConfig } from './lib/runtimeConfig';
import { installErrorReporting } from './lib/errorReporter';
import { RotateCw } from 'lucide-react';
import { TRY_AGAIN, startupFailure } from './lib/loadFailure';
import { FailureDetails } from './components/CouldntLoad';

// Global error / unhandled-rejection listeners → auto bug reports.
// Installed before the first render so even a crash during mount is
// caught. Idempotent, so StrictMode / HMR re-evaluation is safe.
installErrorReporting();

const root: Root = createRoot(document.getElementById('root')!);

// Minimal, dependency-free splash while we fetch /api/config. Kept in
// plain markup (no app components) so it renders even before the OIDC
// context / app tree exist. Palette matches the on-brand dark cards in
// AuthGate.
function BootstrapLoading() {
  return (
    <div className="min-h-dvh bg-chino-bg text-chino-muted flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-chino-surface border border-chino-border flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-chino-border border-t-chino-accent animate-spin" />
      </div>
      <p className="text-sm italic">Loading…</p>
    </div>
  );
}

// The app couldn't start: what the server's /api/config answered says why,
// by its case (lib/loadFailure.ts startupFailure) - "Can't reach the
// server." only when nothing answered - with try again, which runs the
// start-up again and shows the loading screen while it runs, and the status
// under details. A 404 means the app and the server don't match. A page of
// its own: its title the page's heading, not read out as it appears, as
// every couldn't-load screen (CouldntLoad, StatusPage).
function BootstrapError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { title, reason, status } = startupFailure(error);
  return (
    <main className="min-h-dvh bg-chino-bg text-chino-fg flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-3">
        <h1 className="font-mono text-2xl md:text-3xl font-semibold">{title}</h1>
        <p className="text-chino-muted leading-relaxed">{reason}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 h-12 px-5 inline-flex items-center gap-2 bg-chino-accent hover:brightness-110 text-chino-bg font-mono font-medium"
        >
          <RotateCw className="w-4 h-4" aria-hidden />
          {TRY_AGAIN}
        </button>
        <div className="mt-3">
          <FailureDetails status={status} />
        </div>
      </div>
    </main>
  );
}

function renderApp(cfg: RuntimeConfig) {
  root.render(
    <StrictMode>
      <AuthProvider {...buildOidcConfig(cfg)}>
        {/* Boundary sits INSIDE the AuthProvider so a render crash keeps
            the OIDC session alive — the post-reload sign-in is silent. */}
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </StrictMode>,
  );
}

// Async bootstrap: show a splash, discover runtime config from
// /api/config, then mount the app configured with the discovered OIDC
// authority + client id. On failure render an on-brand error with Retry.
async function bootstrap() {
  root.render(
    <StrictMode>
      <BootstrapLoading />
    </StrictMode>,
  );
  try {
    const cfg = await loadRuntimeConfig();
    renderApp(cfg);
  } catch (err) {
    root.render(
      <StrictMode>
        <BootstrapError error={err} onRetry={() => void bootstrap()} />
      </StrictMode>,
    );
  }
}

void bootstrap();

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

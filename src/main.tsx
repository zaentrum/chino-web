import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { buildOidcConfig } from './auth/oidc';
import { loadRuntimeConfig, type RuntimeConfig } from './lib/runtimeConfig';
import { installErrorReporting } from './lib/errorReporter';

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
    <div className="min-h-dvh bg-[#0d1117] text-[#8b949e] flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-[#161b22] border border-[#30363d] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#30363d] border-t-[#58a6ff] animate-spin" />
      </div>
      <p className="text-sm italic">Loading…</p>
    </div>
  );
}

// On-brand config-load failure with a Retry that re-runs the bootstrap.
function BootstrapError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-dvh bg-[#0d1117] text-[#c9d1d9] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#161b22] border border-[#30363d] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border border-rose-500/40 text-rose-300 flex items-center justify-center text-lg">
            !
          </div>
        </div>
        <h1 className="text-2xl font-semibold mb-2 text-white">Couldn't load configuration</h1>
        <div className="mx-auto max-w-sm text-left bg-[#161b22] border border-rose-500/30 rounded-lg p-3 mb-5">
          <p className="text-sm text-[#c9d1d9]">
            The app couldn't load its configuration from <code>/api/config</code>.
          </p>
          <p className="mt-2 text-xs text-[#8b949e] break-words">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="px-5 py-2 bg-[#58a6ff] hover:bg-[#58a6ff]/80 text-white rounded-lg font-medium"
        >
          Retry
        </button>
        <p className="mt-6 text-xs text-[#8b949e]">
          If this keeps happening, check your network connection or that the server is
          reachable.
        </p>
      </div>
    </div>
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
    const message = err instanceof Error ? err.message : String(err);
    root.render(
      <StrictMode>
        <BootstrapError message={message} onRetry={() => void bootstrap()} />
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

// Runtime-configurable base path.
//
// Vite sets `import.meta.env.BASE_URL` to the configured `base` (always
// ends with `/`). We build with a `/__BASE__/` placeholder and the
// container entrypoint rewrites it to the real BASE_PATH at start, so
// this same bundle works mounted at any URL path — root `/` for the
// neutral self-host, `/chino/` for the demo.

// e.g. "/chino/" or "/" after the entrypoint sed.
export const BASE = import.meta.env.BASE_URL;

// "/chino" or "" — convenient for prefixing absolute in-app paths.
export const BASE_NOSLASH = BASE.replace(/\/+$/, '');

// Prepend the base to an absolute in-app path so navigations land under
// the mount point. `toApp('/player/x')` -> "/chino/player/x" (or
// "/player/x" at root).
export function toApp(path: string): string {
  const p = path.startsWith('/') ? path : '/' + path;
  return (BASE_NOSLASH + p) || '/';
}

// Strip the base off a location.pathname so the root-relative route
// regexes still match. `stripBase('/chino/player/x')` -> "/player/x".
export function stripBase(pathname: string): string {
  if (BASE_NOSLASH && pathname.startsWith(BASE_NOSLASH)) {
    const rest = pathname.slice(BASE_NOSLASH.length);
    return rest.startsWith('/') ? rest : '/' + rest;
  }
  return pathname || '/';
}

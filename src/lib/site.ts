/**
 * Base-path helpers.
 *
 * `import.meta.env.BASE_URL` is the configured `base` and is not guaranteed to
 * end with a slash, so it must be normalised before concatenating paths.
 */
const raw = import.meta.env.BASE_URL || '/';

export const BASE = raw.endsWith('/') ? raw : `${raw}/`;

/** Absolute URL for a path inside the site (leading slashes are ignored). */
export function url(path = ''): string {
  return `${BASE}${path.replace(/^\/+/, '')}`;
}

/**
 * Strips leading and trailing slashes from a base path.
 *
 * @param basePath - Raw `BASE_PATH` value, may be undefined, empty or slash-padded.
 * @returns Base path without surrounding slashes, or an empty string.
 */
export function normalizeBasePath(basePath: string | undefined): string {
  return (basePath ?? '').trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Builds an absolute path underneath the base path.
 *
 * @param basePath - Raw `BASE_PATH` value.
 * @param path - Path to place under the base path, with or without a leading slash.
 * @returns Absolute path starting with a single slash, e.g. `/app/ui` or `/ui`.
 */
export function buildPrefixedPath(basePath: string | undefined, path: string): string {
  const normalized = normalizeBasePath(basePath);
  const cleanPath = path.replace(/^\/+/, '');
  return normalized === '' ? `/${cleanPath}` : `/${normalized}/${cleanPath}`;
}

/**
 * Builds the global API prefix from an optional base path.
 *
 * Every service normalises `BASE_PATH` the same way, so the rule lives here rather than
 * being re-implemented per service: leading and trailing slashes are stripped, an empty
 * or whitespace-only value means "no prefix".
 *
 * @param basePath - Raw `BASE_PATH` value.
 * @param apiPath - Version segment appended after the base path.
 * @returns Prefix without leading or trailing slashes, e.g. `app/api/v1` or `api/v1`.
 */
export function buildApiPrefix(basePath: string | undefined, apiPath = 'api/v1'): string {
  const normalized = normalizeBasePath(basePath);
  return normalized === '' ? apiPath : `${normalized}/${apiPath}`;
}

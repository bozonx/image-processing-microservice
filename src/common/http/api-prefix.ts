export function normalizeBasePath(basePath: string | undefined): string {
  return (basePath ?? '').trim().replace(/^\/+|\/+$/g, '');
}

export function buildPrefixedPath(basePath: string | undefined, path: string): string {
  const normalized = normalizeBasePath(basePath);
  const cleanPath = path.replace(/^\/+/, '');
  return normalized ? `/${normalized}/${cleanPath}` : `/${cleanPath}`;
}

export function buildApiPrefix(basePath: string | undefined, apiPath = 'api/v1'): string {
  const normalized = normalizeBasePath(basePath);
  return normalized ? `${normalized}/${apiPath}` : apiPath;
}

export function buildUiPrefix(basePath: string | undefined, uiPath = 'ui'): string {
  return buildPrefixedPath(basePath, uiPath);
}

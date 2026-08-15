export function normalizeBasePath(basePath: string | undefined): string {
  return (basePath ?? '').trim().replace(/^\/+|\/+$/g, '');
}

export function buildApiPrefix(basePath: string | undefined, apiPath = 'api/v1'): string {
  const normalized = normalizeBasePath(basePath);
  return normalized ? `${normalized}/${apiPath}` : apiPath;
}

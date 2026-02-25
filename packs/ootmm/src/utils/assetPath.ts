const rawBaseUrl = (import.meta as any).env?.BASE_URL || '/';
const normalizedBaseUrl =
  rawBaseUrl === '/'
    ? './'
    : rawBaseUrl.endsWith('/')
      ? rawBaseUrl
      : `${rawBaseUrl}/`;

export function withBasePath(path: string): string {
  return `${normalizedBaseUrl}${path.replace(/^\/+/, '')}`;
}

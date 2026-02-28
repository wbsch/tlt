const rawBaseUrl =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ||
  '/';
const normalizedBaseUrl =
  rawBaseUrl === '/'
    ? './'
    : rawBaseUrl.endsWith('/')
      ? rawBaseUrl
      : `${rawBaseUrl}/`;

export function withBasePath(path: string): string {
  return `${normalizedBaseUrl}${path.replace(/^\/+/, '')}`;
}

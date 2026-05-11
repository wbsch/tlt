import { PUBLIC_IMAGE_ASSET_VERSIONS } from '../generated/publicImageAssetVersions';

const rawBaseUrl =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ||
  '/';
const normalizedBaseUrl =
  rawBaseUrl === '/'
    ? './'
    : rawBaseUrl.endsWith('/')
      ? rawBaseUrl
      : `${rawBaseUrl}/`;

function appendAssetVersion(path: string): string {
  const hashIndex = path.indexOf('#');
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = pathWithoutHash.indexOf('?');
  const pathname =
    queryIndex >= 0 ? pathWithoutHash.slice(0, queryIndex) : pathWithoutHash;
  const query = queryIndex >= 0 ? pathWithoutHash.slice(queryIndex) : '';
  if (query && new URLSearchParams(query.slice(1)).has('v')) {
    return path;
  }

  const version =
    PUBLIC_IMAGE_ASSET_VERSIONS[
      pathname as keyof typeof PUBLIC_IMAGE_ASSET_VERSIONS
    ];

  if (!version) {
    return path;
  }

  return `${pathname}${query}${query ? '&' : '?'}v=${version}${hash}`;
}

export function withBasePath(path: string): string {
  return `${normalizedBaseUrl}${appendAssetVersion(path.replace(/^\/+/, ''))}`;
}

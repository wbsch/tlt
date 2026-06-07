const COOP_ROOM_CODE_PATTERN = /^[A-Za-z0-9]+$/;
const COOP_AUTO_JOIN_HASH_PARAM = 'coop-room';

function toHashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

export function isCoopFeatureEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('coop') === 'true';
}

export function getCoopAutoJoinCode(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = toHashParams(window.location.hash).get(COOP_AUTO_JOIN_HASH_PARAM);
  if (raw === null) return null;
  return isValidCoopRoomCode(raw) ? raw : null;
}

export function isValidCoopRoomCode(value: string): boolean {
  return COOP_ROOM_CODE_PATTERN.test(value);
}

export function clearCoopAutoJoinCodeFromUrl(): void {
  if (typeof window === 'undefined') return;
  const params = toHashParams(window.location.hash);
  if (!params.has(COOP_AUTO_JOIN_HASH_PARAM)) return;
  params.delete(COOP_AUTO_JOIN_HASH_PARAM);
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${
    nextHash ? `#${nextHash}` : ''
  }`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

export function buildCoopShareUrl(roomCode: string): string {
  const base = new URL(window.location.href);
  const params = toHashParams(base.hash);
  params.set(COOP_AUTO_JOIN_HASH_PARAM, roomCode);
  base.searchParams.set('coop', 'true');
  base.hash = params.toString();
  return base.toString();
}

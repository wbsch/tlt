/**
 * Utilities for handling untrusted JSON data safely.
 *
 * - `safeJsonParse`: drop-in `JSON.parse` replacement that strips
 *   prototype-pollution keys via a reviver.
 * - `isSafeKey`: whitelist check for object-property keys originating
 *   from untrusted data (URL share payloads, localStorage, sync messages).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#the_reviver_parameter
 */

/** Keys that must never appear as own-properties on sanitised objects. */
const UNSAFE_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'constructor',
  'prototype',
]);

/**
 * Whitelist regex for object keys coming from untrusted sources.
 *
 * Allowed characters: A-Z  a-z  0-9  _ : ' - & ? @ .  (space)
 * Max length: 200  (longest known ID is ~60 chars)
 *
 * NOTE: The character-class alone cannot reject keys like `__proto__` or
 * `constructor` (they use only allowed characters), so we pair the regex
 * with the explicit deny-set above.
 */
const SAFE_KEY_RE = /^[A-Za-z0-9 _:'\-&?@.]{1,200}$/;

/** Returns `true` when `key` is safe to use as an own-property name. */
export function isSafeKey(key: string): boolean {
  return SAFE_KEY_RE.test(key) && !UNSAFE_KEYS.has(key);
}

function protoReviver(_key: string, value: unknown): unknown {
  if (UNSAFE_KEYS.has(_key)) return undefined;
  return value;
}

export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, protoReviver);
}

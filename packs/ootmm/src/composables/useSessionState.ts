import { ref, Ref } from 'vue'

// Session state storage (persists during session but not across page reloads)
const sessionState = new Map<string, Ref<unknown>>()

/**
 * Creates a reactive ref that persists its state during the session.
 * The state is lost on page reload.
 * 
 * @param key - Unique key for this state
 * @param defaultValue - Default value if no saved state exists
 * @returns A reactive ref that syncs with session state
 */
export function useSessionState<T>(key: string, defaultValue: T): Ref<T> {
  const existing = sessionState.get(key) as Ref<T> | undefined
  if (existing) {
    return existing
  }
  const state = ref<T>(defaultValue) as Ref<T>
  sessionState.set(key, state)
  return state
}

/**
 * Clear all session state
 */
export function clearSessionState() {
  sessionState.clear()
}

/**
 * Clear specific session state key
 */
export function clearSessionStateKey(key: string) {
  sessionState.delete(key)
}

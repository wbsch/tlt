import { afterEach, beforeEach, vi } from 'vitest';

const originalWarn = console.warn.bind(console);

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): Storage {
  const current = window[name];
  if (current && typeof current.clear === 'function') {
    return current;
  }

  const storage = createStorageMock();
  Object.defineProperty(window, name, {
    configurable: true,
    value: storage,
  });
  return storage;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const [firstArg] = args;
    if (
      typeof firstArg === 'string' &&
      firstArg.startsWith('[OoTMM Settings]')
    ) {
      return;
    }
    originalWarn(...args);
  });
});

beforeEach(() => {
  ensureStorage('localStorage').clear();
  ensureStorage('sessionStorage').clear();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  ensureStorage('localStorage').clear();
  ensureStorage('sessionStorage').clear();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

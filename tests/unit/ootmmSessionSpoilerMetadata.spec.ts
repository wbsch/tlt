import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOoTMMSessionStore } from '@packs/ootmm/stores/ootmmSession';
import { sanitizePersistedStateForStore } from '@/stores/persist';

describe('ootmm session spoiler metadata', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hydrates persisted spoiler log metadata for the ootmm session store', () => {
    expect(
      sanitizePersistedStateForStore('ootmm-session', {
        hasImportedSpoilerLog: true,
        importedSpoilerLogVersion: ' 9.9.9-test ',
      }),
    ).toEqual({
      hasImportedSpoilerLog: true,
      importedSpoilerLogVersion: '9.9.9-test',
    });
  });

  it('clears spoiler log metadata on reset and restores it with undo/redo', async () => {
    const sessionStore = useOoTMMSessionStore();

    sessionStore.setSpoilerLogImportState(true, '9.9.9-test');

    expect(sessionStore.hasImportedSpoilerLog).toBe(true);
    expect(sessionStore.importedSpoilerLogVersion).toBe('9.9.9-test');

    await sessionStore.resetSessionStateToDefaults();

    expect(sessionStore.hasImportedSpoilerLog).toBe(false);
    expect(sessionStore.importedSpoilerLogVersion).toBeNull();

    await sessionStore.undo();

    expect(sessionStore.hasImportedSpoilerLog).toBe(true);
    expect(sessionStore.importedSpoilerLogVersion).toBe('9.9.9-test');

    await sessionStore.redo();

    expect(sessionStore.hasImportedSpoilerLog).toBe(false);
    expect(sessionStore.importedSpoilerLogVersion).toBeNull();
  });
});

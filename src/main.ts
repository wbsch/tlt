import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { piniaLocalStoragePlugin } from './stores/persist';
import {
  handlePresetImportFromUrl,
  handleShareStateImportFromCurrentUrl,
} from './utils/shareState';
import {
  getCoopAutoJoinCode,
  isCoopFeatureEnabled,
} from '@packs/ootmm/utils/coopFlag';
import './style.css';

async function initializeApp(): Promise<void> {
  if (typeof window !== 'undefined') {
    // Check for a preset state (?preset=<key>) first.
    // This loads the state directly from the JSON config without asking.
    await handlePresetImportFromUrl();

    // Then handle regular share state import from URL hash.
    handleShareStateImportFromCurrentUrl();

    // Handle same-page navigation (hash-only changes) for share URL imports.
    // When a user navigates to a share URL while the app is already loaded,
    // the browser only fires a hashchange event instead of reloading.
    window.addEventListener('hashchange', () => {
      // A coop invite link is `?coop=true#coop-room=CODE`. Once a room has been
      // joined the code is stripped from the URL (leaving `?coop=true`), so
      // pasting a *new* invite while the app is open changes only the hash and
      // the browser fires hashchange instead of reloading. Reload so the tracker
      // re-reads the new code and shows its join-confirm prompt. (The code is
      // cleared from the URL on mount, so this can't loop.)
      if (isCoopFeatureEnabled() && getCoopAutoJoinCode() !== null) {
        window.location.reload();
        return;
      }

      const result = handleShareStateImportFromCurrentUrl();
      if (result === 'imported' || result === 'partial') {
        // Reload so pinia stores re-hydrate from the updated localStorage.
        window.location.reload();
      }
    });
  }

  const app = createApp(App);
  const pinia = createPinia();
  pinia.use(piniaLocalStoragePlugin);
  app.use(pinia);
  try {
    app.mount('#app');
    document.body.classList.add('tlt-app-mounted');
  } catch (error) {
    console.error('Failed to mount The Last Tracker app:', error);
    document.body.classList.remove('tlt-app-mounted');
    document.body.classList.add('tlt-runtime-error');
  }
}

initializeApp().catch((error) => {
  console.error('Failed to initialize The Last Tracker app:', error);
  document.body.classList.remove('tlt-app-mounted');
  document.body.classList.add('tlt-runtime-error');
});

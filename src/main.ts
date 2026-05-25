import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { piniaLocalStoragePlugin } from './stores/persist';
import { handleShareStateImportFromCurrentUrl } from './utils/shareState';
import './style.css';

if (typeof window !== 'undefined') {
  handleShareStateImportFromCurrentUrl();

  // Handle same-page navigation (hash-only changes) for share URL imports.
  // When a user navigates to a share URL while the app is already loaded,
  // the browser only fires a hashchange event instead of reloading.
  window.addEventListener('hashchange', () => {
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

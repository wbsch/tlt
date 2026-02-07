import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { piniaLocalStoragePlugin } from './stores/persist';
import './style.css';

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

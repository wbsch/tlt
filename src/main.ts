import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { piniaLocalStoragePlugin } from './stores/persist';
import './style.css';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaLocalStoragePlugin);
app.use(pinia);
app.mount('#app');

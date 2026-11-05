import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker immediately for 100% offline startup
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New app version available');
  },
  onOfflineReady() {
    console.log('Music app is ready to work completely offline');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from 'react';
import { createRoot } from 'react-dom/client';
import NewTabPage from './NewTabPage';
import '@src/assets/styles/chat.css';

const container = document.getElementById('newtab-root');
if (!container) {
  throw new Error('Sol NewTab: Root element not found');
}

const root = createRoot(container);
root.render(<NewTabPage />); 
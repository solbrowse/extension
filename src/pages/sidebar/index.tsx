import React from 'react';
import { createRoot } from 'react-dom/client';
import SideBar from './SideBar';
import '@src/assets/styles/tailwind.css';

const container = document.getElementById('sidebar-root');
if (!container) {
  throw new Error('Sol SideBar: Root element not found');
}

const root = createRoot(container);
root.render(<SideBar />); 
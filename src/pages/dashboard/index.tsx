import React from 'react';
import { createRoot } from 'react-dom/client';
import '@assets/styles/tailwind.css';
import Dashboard from '@src/pages/dashboard/Dashboard';

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Dashboard root element");
  
  // Apply shared dashboard styling to body
  document.body.className = 'sol-dashboard-body min-h-screen m-0 p-0';
  
  const root = createRoot(rootContainer);
  root.render(<Dashboard />);
}

init()
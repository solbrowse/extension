import React from 'react';
import { createRoot } from 'react-dom/client';
import '@pages/Dashboard/index.css';
import '@assets/styles/tailwind.css';
import Dashboard from '@src/pages/dashboard/Dashboard';

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Dashboard root element");
  const root = createRoot(rootContainer);
  root.render(<Dashboard />);
}

init()
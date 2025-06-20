import React from 'react';
import { createRoot } from 'react-dom/client';
import '@assets/styles/tailwind.css';
import Popup from '@pages/popup/Popup';

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Popup root element");
  
  // Apply shared popup styling to body
  document.body.className = 'sol-popup-body w-80 min-h-96 m-0 p-0 rounded-xl';
  
  const root = createRoot(rootContainer);
  root.render(<Popup />);
}

init();

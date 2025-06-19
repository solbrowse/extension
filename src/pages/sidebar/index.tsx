import React from 'react';
import { createRoot } from 'react-dom/client';
import AskBar from './Sidebar';
import './index.css';
import './askBarStyles.css';

const App: React.FC = () => {
  const handleClick = (e: React.MouseEvent) => {
    // Only handle clicks on the container itself, not child elements
    if (e.target === e.currentTarget) {
      window.parent.postMessage({
        type: 'sol-click-through',
        x: e.clientX,
        y: e.clientY
      }, '*');
    }
  };

  return (
    <div className="iframe-container" onClick={handleClick}>
      <AskBar />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} 
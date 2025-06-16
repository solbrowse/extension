import React from 'react';
import { createRoot } from 'react-dom/client';
import AskBar from './AskBar';
import './index.css';
import './askBarStyles.css';

const App: React.FC = () => {
  // Handle click-through for areas outside the AskBar
  const handleContainerClick = (e: React.MouseEvent) => {
    // If the click target is the container itself (not a child), 
    // attempt to pass the click through to the parent page
    if (e.target === e.currentTarget) {
      try {
        // Send message to parent to handle click-through
        window.parent.postMessage({
          type: 'sol-click-through',
          x: e.clientX,
          y: e.clientY
        }, '*');
      } catch (error) {
        // Ignore cross-origin errors
      }
    }
  };

  return (
    <div className="iframe-container" onClick={handleContainerClick}>
      <AskBar />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} 
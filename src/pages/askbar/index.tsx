import React from 'react';
import { createRoot } from 'react-dom/client';
import AskBar from './AskBar';
import '@src/assets/styles/chat.css';

const App: React.FC = () => {
  return (
    <div className="iframe-container sol-ask-bar">
      <AskBar />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} 
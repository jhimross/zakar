import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/install'; // listen for the browser's install prompt as early as possible
import App from './App';
import { startUpdates } from './lib/updates';
import { startBackNavigation } from './lib/backnav';
import './styles.css';

startUpdates(); // checks for new versions and refreshes safely
startBackNavigation(); // phone Back button / back swipe moves within the app

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

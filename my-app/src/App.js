import { useState } from 'react';
import { AppProvider, useAppState, useDispatch } from './state/AppContext';
import { AuthProvider } from './state/AuthContext';
import { CLEAR_ERROR } from './state/actions';
import LandingPage from './components/LandingPage';
import LoadingAnimation from './components/LoadingAnimation';
import GalaxyView from './components/GalaxyView';
import SharePage from './components/SharePage';
import AuthModal from './components/auth/AuthModal';
import './App.css';

function AppContent() {
  const { phase, error } = useAppState();
  const dispatch = useDispatch();

  // Simple path-based routing for share pages
  const [sharePageId] = useState(() => {
    const match = window.location.pathname.match(/^\/p\/([a-f0-9-]+)$/);
    return match ? match[1] : null;
  });

  // Render share page if URL matches /p/:id
  if (sharePageId) {
    return <SharePage playlistId={sharePageId} />;
  }

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => dispatch({ type: CLEAR_ERROR })}>
            &times;
          </button>
        </div>
      )}

      {phase === 'inputting' && <LandingPage />}
      {phase === 'loading' && <LoadingAnimation />}
      {phase === 'viewing' && <GalaxyView />}

      <AuthModal />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}

export default App;

import { AppProvider, useAppState, useDispatch } from './state/AppContext';
import { CLEAR_ERROR } from './state/actions';
import LandingPage from './components/LandingPage';
import LoadingAnimation from './components/LoadingAnimation';
import GalaxyView from './components/GalaxyView';
import './App.css';

function AppContent() {
  const { phase, error } = useAppState();
  const dispatch = useDispatch();

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
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;

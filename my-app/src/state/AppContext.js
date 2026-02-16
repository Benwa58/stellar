import { createContext, useContext, useReducer } from 'react';
import { appReducer, initialState } from './appReducer';

const AppContext = createContext(null);
const DispatchContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </AppContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppContext);
  if (context === null) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
}

export function useDispatch() {
  const context = useContext(DispatchContext);
  if (context === null) {
    throw new Error('useDispatch must be used within an AppProvider');
  }
  return context;
}

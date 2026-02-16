import * as actions from './actions';

export const initialState = {
  phase: 'inputting',

  seedArtists: [],
  searchQuery: '',
  searchResults: [],

  loadingProgress: { phase: '', current: 0, total: 0, message: '' },

  galaxyData: null,
  selectedNode: null,
  hoveredNode: null,
  previewTrack: null,
  isPlaying: false,

  error: null,
};

export function appReducer(state, action) {
  switch (action.type) {
    case actions.ADD_SEED_ARTIST: {
      const exists = state.seedArtists.some((a) => a.id === action.payload.id);
      if (exists) return state;
      return {
        ...state,
        seedArtists: [...state.seedArtists, action.payload],
        searchQuery: '',
        searchResults: [],
      };
    }

    case actions.REMOVE_SEED_ARTIST:
      return {
        ...state,
        seedArtists: state.seedArtists.filter((a) => a.id !== action.payload),
      };

    case actions.SET_SEARCH_RESULTS:
      return { ...state, searchResults: action.payload };

    case actions.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload };

    case actions.START_GENERATING:
      return {
        ...state,
        phase: 'loading',
        loadingProgress: { phase: '', current: 0, total: 0, message: 'Initializing...' },
        galaxyData: null,
        selectedNode: null,
        hoveredNode: null,
        previewTrack: null,
        isPlaying: false,
        error: null,
      };

    case actions.SET_LOADING_PROGRESS:
      return {
        ...state,
        loadingProgress: { ...state.loadingProgress, ...action.payload },
      };

    case actions.SET_GALAXY_DATA:
      return {
        ...state,
        phase: 'viewing',
        galaxyData: action.payload,
      };

    case actions.SELECT_NODE:
      return { ...state, selectedNode: action.payload };

    case actions.HOVER_NODE:
      return { ...state, hoveredNode: action.payload };

    case actions.SET_PREVIEW_TRACK:
      return { ...state, previewTrack: action.payload, isPlaying: true };

    case actions.SET_PLAYING:
      return { ...state, isPlaying: action.payload };

    case actions.SET_ERROR:
      return { ...state, error: action.payload, phase: 'inputting' };

    case actions.CLEAR_ERROR:
      return { ...state, error: null };

    case actions.GO_TO_INPUT:
      return {
        ...state,
        phase: 'inputting',
        selectedNode: null,
        hoveredNode: null,
        previewTrack: null,
        isPlaying: false,
      };

    case actions.RESET:
      return { ...initialState };

    default:
      return state;
  }
}

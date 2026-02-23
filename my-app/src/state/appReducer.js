import * as actions from './actions';
import { clusterByGenre } from '../engine/genreAnalysis';

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

  pendingSeedQueue: [],
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

    case actions.ADD_SEED_AND_REGENERATE: {
      const newSeeds = Array.isArray(action.payload) ? action.payload : [action.payload];
      const updatedSeeds = [...state.seedArtists];
      for (const seed of newSeeds) {
        if (!updatedSeeds.some((s) => s.id === seed.id)) {
          updatedSeeds.push(seed);
        }
      }
      return {
        ...state,
        seedArtists: updatedSeeds,
        pendingSeedQueue: [],
        phase: 'loading',
        loadingProgress: { phase: '', current: 0, total: 0, message: 'Initializing...' },
        galaxyData: null,
        selectedNode: null,
        hoveredNode: null,
        previewTrack: null,
        isPlaying: false,
        error: null,
      };
    }

    case actions.LOAD_SAVED_MAP: {
      const { seedArtists, galaxyData } = action.payload;
      const fullGalaxyData = {
        ...galaxyData,
        genreClusters: galaxyData.genreClusters || clusterByGenre(galaxyData.nodes),
      };
      return {
        ...state,
        phase: 'viewing',
        seedArtists,
        galaxyData: fullGalaxyData,
        selectedNode: null,
        hoveredNode: null,
        previewTrack: null,
        isPlaying: false,
        error: null,
        searchQuery: '',
        searchResults: [],
      };
    }

    case actions.MERGE_DRIFT_NODES: {
      const { nodes: driftNodes, links: driftLinks } = action.payload;
      const existingData = state.galaxyData;
      if (!existingData) return state;
      return {
        ...state,
        galaxyData: {
          ...existingData,
          nodes: [...existingData.nodes, ...driftNodes],
          links: [...existingData.links, ...driftLinks],
          genreClusters: clusterByGenre([...existingData.nodes, ...driftNodes]),
          _driftMergeGen: (existingData._driftMergeGen || 0) + 1,
        },
      };
    }

    case actions.REMOVE_DRIFT_NODES: {
      const existingData = state.galaxyData;
      if (!existingData) return state;
      const coreNodes = existingData.nodes.filter((n) => !n.isDrift);
      const coreLinks = existingData.links.filter((l) => !l.isDriftLink);
      return {
        ...state,
        galaxyData: {
          ...existingData,
          nodes: coreNodes,
          links: coreLinks,
          genreClusters: clusterByGenre(coreNodes),
          _driftContractGen: (existingData._driftContractGen || 0) + 1,
        },
      };
    }

    case actions.QUEUE_SEED: {
      const artist = action.payload;
      const alreadySeed = state.seedArtists.some((s) => s.id === artist.id);
      const alreadyQueued = state.pendingSeedQueue.some((s) => s.id === artist.id);
      if (alreadySeed || alreadyQueued) return state;
      return {
        ...state,
        pendingSeedQueue: [...state.pendingSeedQueue, artist],
      };
    }

    case actions.UNQUEUE_SEED:
      return {
        ...state,
        pendingSeedQueue: state.pendingSeedQueue.filter((s) => s.id !== action.payload),
      };

    case actions.CLEAR_SEED_QUEUE:
      return { ...state, pendingSeedQueue: [] };

    case actions.RESET:
      return { ...initialState };

    default:
      return state;
  }
}

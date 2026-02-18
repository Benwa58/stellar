import { STORAGE_KEY, MAX_SAVED_MAPS } from './constants';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function generateMapName(seedArtists) {
  if (!seedArtists || seedArtists.length === 0) return 'Untitled Galaxy';
  const names = seedArtists.map((a) => a.name);
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
}

export function getSavedMaps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const maps = JSON.parse(raw);
    return maps.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  } catch (err) {
    console.error('Failed to read saved maps:', err);
    return [];
  }
}

export function loadSavedMap(id) {
  const maps = getSavedMaps();
  return maps.find((m) => m.id === id) || null;
}

export function saveMap({ name, seedArtists, galaxyData }) {
  try {
    const maps = getSavedMaps();

    if (maps.length >= MAX_SAVED_MAPS) {
      return {
        success: false,
        error: `You can save up to ${MAX_SAVED_MAPS} maps. Delete one to save a new one.`,
      };
    }

    const storableGalaxyData = {
      nodes: galaxyData.nodes,
      links: galaxyData.links,
    };

    const entry = {
      id: generateId(),
      name: name || generateMapName(seedArtists),
      seedArtists,
      galaxyData: storableGalaxyData,
      nodeCount: galaxyData.nodes.length,
      savedAt: new Date().toISOString(),
    };

    maps.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    return { success: true };
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      return {
        success: false,
        error: 'Storage is full. Delete some saved maps and try again.',
      };
    }
    console.error('Failed to save map:', err);
    return { success: false, error: 'Failed to save map.' };
  }
}

export function deleteSavedMap(id) {
  try {
    const maps = getSavedMaps();
    const filtered = maps.filter((m) => m.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error('Failed to delete saved map:', err);
    return false;
  }
}

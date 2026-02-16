const FEATURE_KEYS = [
  'danceability',
  'energy',
  'valence',
  'acousticness',
  'instrumentalness',
  'speechiness',
];

export function normalizeFeatures(rawFeatures) {
  const normalized = {};
  for (const key of FEATURE_KEYS) {
    normalized[key] = rawFeatures[key] || 0;
  }
  if (rawFeatures.tempo) {
    normalized.tempo = rawFeatures.tempo / 250;
  }
  return normalized;
}

export function computeFeatureCentroid(featureVectors) {
  if (featureVectors.length === 0) return null;

  const centroid = {};
  const keys = Object.keys(featureVectors[0]);

  for (const key of keys) {
    centroid[key] = 0;
  }

  for (const vec of featureVectors) {
    for (const key of keys) {
      centroid[key] += vec[key] || 0;
    }
  }

  for (const key of keys) {
    centroid[key] /= featureVectors.length;
  }

  return centroid;
}

export function computeFeatureDistance(vectorA, vectorB) {
  if (!vectorA || !vectorB) return 1;

  const keys = Object.keys(vectorA);
  let sumSq = 0;

  for (const key of keys) {
    const diff = (vectorA[key] || 0) - (vectorB[key] || 0);
    sumSq += diff * diff;
  }

  const maxDistance = Math.sqrt(keys.length);
  return Math.sqrt(sumSq) / maxDistance;
}

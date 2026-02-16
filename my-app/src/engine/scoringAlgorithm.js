import { SCORING_WEIGHTS } from '../utils/constants';
import { computeGenreSimilarity } from './genreAnalysis';
import { computeFeatureDistance } from './audioFeatureAnalysis';

export function scoreCandidates(
  candidates,
  seedArtists,
  genreFrequencyMap,
  audioCentroid,
  audioFeaturesMap
) {
  const seedCount = seedArtists.length;
  const hasAudio = audioCentroid && audioFeaturesMap;

  const weights = hasAudio
    ? { overlap: 0.45, genre: 0.30, audio: 0.15, popularity: 0.10 }
    : { ...SCORING_WEIGHTS };

  const scored = [];

  for (const [candidateId, candidate] of candidates) {
    const overlapScore = seedCount > 0
      ? candidate.relatedToSeeds.size / seedCount
      : 0;

    const genreScore = computeGenreSimilarity(
      candidate.artist.genres,
      genreFrequencyMap
    );

    const popularityScore = (candidate.artist.popularity || 0) / 100;

    let audioScore = 0;
    if (hasAudio && audioFeaturesMap.has(candidateId)) {
      const distance = computeFeatureDistance(
        audioCentroid,
        audioFeaturesMap.get(candidateId)
      );
      audioScore = 1 - distance;
    }

    const compositeScore = hasAudio
      ? weights.overlap * overlapScore +
        weights.genre * genreScore +
        weights.audio * audioScore +
        weights.popularity * popularityScore
      : weights.overlap * overlapScore +
        weights.genre * genreScore +
        weights.popularity * popularityScore;

    scored.push({
      ...candidate.artist,
      overlapScore,
      genreScore,
      audioScore,
      popularityScore,
      compositeScore,
      relatedToSeeds: Array.from(candidate.relatedToSeeds),
      relatedSeedNames: Array.from(candidate.relatedToSeeds)
        .map((id) => seedArtists.find((s) => s.id === id)?.name)
        .filter(Boolean),
    });
  }

  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  return scored;
}

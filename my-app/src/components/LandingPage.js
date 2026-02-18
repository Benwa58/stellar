import { useMemo, useCallback } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { ADD_SEED_ARTIST, REMOVE_SEED_ARTIST, START_GENERATING, SET_ERROR } from '../state/actions';
import { MIN_SEED_ARTISTS } from '../utils/constants';
import { generateRecommendations } from '../engine/recommendationEngine';
import { SET_LOADING_PROGRESS, SET_GALAXY_DATA } from '../state/actions';
import Header from './Header';
import ArtistSearch from './ArtistSearch';
import ArtistChipList from './ArtistChipList';
import GenerateButton from './GenerateButton';
import SavedMapsSection from './SavedMapsSection';
import '../styles/landing.css';

function LandingPage() {
  const { seedArtists } = useAppState();
  const dispatch = useDispatch();

  const selectedIds = useMemo(
    () => new Set(seedArtists.map((a) => a.id)),
    [seedArtists]
  );

  const handleSelect = useCallback(
    (artist) => {
      dispatch({ type: ADD_SEED_ARTIST, payload: artist });
    },
    [dispatch]
  );

  const handleRemove = useCallback(
    (artistId) => {
      dispatch({ type: REMOVE_SEED_ARTIST, payload: artistId });
    },
    [dispatch]
  );

  const handleGenerate = useCallback(async () => {
    if (seedArtists.length < MIN_SEED_ARTISTS) return;

    dispatch({ type: START_GENERATING });

    try {
      const galaxyData = await generateRecommendations(
        seedArtists,
        (progress) => {
          dispatch({ type: SET_LOADING_PROGRESS, payload: progress });
        }
      );
      dispatch({ type: SET_GALAXY_DATA, payload: galaxyData });
    } catch (err) {
      console.error('Generation failed:', err);
      dispatch({
        type: SET_ERROR,
        payload: err.message || 'Failed to generate recommendations. Please try again.',
      });
    }
  }, [seedArtists, dispatch]);

  return (
    <div className="landing-page">
      <Header artistCount={seedArtists.length} />

      <div className="landing-content">
        <div className="landing-hero">
          <h2 className="hero-title">
            Discover Your Musical
            <br />
            <span className="hero-accent">Universe</span>
          </h2>
          <p className="hero-tagline">Find your new favorite music.</p>
          <p className="hero-description">
            Add artists you love and we'll map the galaxy of music that connects them,
            revealing new artists in the spaces between your favorites.
          </p>
        </div>

        <div className="landing-input-section">
          <ArtistSearch onSelect={handleSelect} selectedIds={selectedIds} artistCount={seedArtists.length} />
          <ArtistChipList artists={seedArtists} onRemove={handleRemove} />
          <GenerateButton
            artistCount={seedArtists.length}
            onClick={handleGenerate}
          />
        </div>

        <SavedMapsSection />
      </div>

      <div className="landing-bg-stars" aria-hidden="true" />
    </div>
  );
}

export default LandingPage;

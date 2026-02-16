import '../styles/chips.css';

function ArtistChip({ artist, onRemove }) {
  return (
    <div className="artist-chip">
      {artist.image ? (
        <img
          className="chip-image"
          src={artist.image}
          alt={artist.name}
        />
      ) : (
        <div className="chip-image chip-image-placeholder">
          {artist.name.charAt(0)}
        </div>
      )}
      <span className="chip-name">{artist.name}</span>
      <button
        className="chip-remove"
        onClick={() => onRemove(artist.id)}
        aria-label={`Remove ${artist.name}`}
      >
        &times;
      </button>
    </div>
  );
}

export default ArtistChip;

import ArtistChip from './ArtistChip';

function ArtistChipList({ artists, onRemove }) {
  if (artists.length === 0) return null;

  return (
    <div className="chip-list">
      {artists.map((artist) => (
        <ArtistChip key={artist.id} artist={artist} onRemove={onRemove} />
      ))}
    </div>
  );
}

export default ArtistChipList;

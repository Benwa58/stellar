export function generateMapName(seedArtists) {
  if (!seedArtists || seedArtists.length === 0) return 'Untitled Galaxy';
  const names = seedArtists.map((a) => a.name);
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
}

// Merge Vault notes into one readable plain-text document.
// Notes are ordered oldest first. Each note gets its date as a heading; its own paragraphs are kept,
// and a "* * *" divider with blank lines separates one note from the next.
export const NOTE_DIVIDER = '* * *';

const dateLabel = (iso, timeZone) =>
  new Intl.DateTimeFormat('en', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(new Date(iso));
// Normalize line endings and trailing spaces, and keep at most one blank line between paragraphs.
export function tidyText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export function notesToText(notes, { timeZone = 'UTC', exportedAt = new Date().toISOString() } = {}) {
  const ordered = [...notes].sort((a, b) => a.created.localeCompare(b.created));
  const header = `Twesk notes · ${ordered.length} ${ordered.length === 1 ? 'note' : 'notes'} · exported ${dateLabel(exportedAt, timeZone)}`;
  const sections = ordered.map(note => {
    const kind = note.kind === 'journal' ? ' · Journal' : '';
    return `${dateLabel(note.created, timeZone)}${kind}\n\n${tidyText(note.text)}`;
  });
  return `${header}\n\n\n${sections.join(`\n\n\n${NOTE_DIVIDER}\n\n\n`)}\n`;
}

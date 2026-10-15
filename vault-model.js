// Vault shelves are exclusive, except All and Archive. Journals never need inbox triage.
export const VAULT_SECTIONS = [
  { id: 'inbox', label: 'Needs review', title: 'Awaiting a little clarity', art: 'review' },
  { id: 'kept', label: 'Notes', title: 'Notes worth keeping', art: 'note' },
  { id: 'journal', label: 'Journal', title: 'Your personal chronicle', art: 'journal' },
  { id: 'all', label: 'All', title: 'Everything in your Vault', art: 'vault' },
  { id: 'archived', label: 'Archive', title: 'Safely put away', art: 'archive' },
];
export const needsReview = note => note.kind !== 'journal' && note.status === 'inbox';
export function inVaultSection(note, section) {
  if (section === 'archived') return note.status === 'archived';
  if (note.status === 'archived') return false;
  if (section === 'all') return true;
  if (section === 'journal') return note.kind === 'journal';
  if (section === 'inbox') return needsReview(note);
  return section === 'kept' && note.kind !== 'journal' && note.status === 'kept';
}
export const vaultTone = note => note.status === 'archived' ? 'archived' : note.kind === 'journal' ? 'journal' : needsReview(note) ? 'inbox' : 'kept';

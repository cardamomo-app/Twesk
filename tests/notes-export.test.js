import test from 'node:test';
import assert from 'node:assert/strict';
import {notesToText,tidyText,NOTE_DIVIDER} from '../notes-export.js';

const note=(text,created,kind='note')=>({id:created,text,created,kind,status:'kept'});
test('merged notes are ordered oldest first with dated headings and clear dividers',()=>{
  const text=notesToText([note('Second thought',  '2026-10-08T09:00:00Z'),note('First idea\n\nWith a second paragraph','2026-10-01T09:00:00Z'),note('Dear diary','2026-10-05T09:00:00Z','journal')],{timeZone:'UTC',exportedAt:'2026-10-09T10:00:00Z'});
  const lines=text.split('\n');
  assert.equal(lines[0],'Twesk notes · 3 notes · exported Friday, October 9, 2026');
  assert.ok(text.indexOf('First idea')<text.indexOf('Dear diary')&&text.indexOf('Dear diary')<text.indexOf('Second thought'));
  assert.match(text,/Thursday, October 1, 2026\n\nFirst idea\n\nWith a second paragraph\n\n\n\* \* \*\n\n\nMonday, October 5, 2026 · Journal\n\nDear diary/);
  assert.equal(text.split(NOTE_DIVIDER).length,3,'one divider between each pair of notes');
  assert.ok(text.endsWith('Second thought\n'));
  assert.doesNotMatch(text,/\n{4,}/,'never more than two blank lines in a row');
});
test('note text is tidied without losing its paragraphs',()=>{
  assert.equal(tidyText('  Line one   \r\nLine two\r\n\r\n\r\n\r\nNew paragraph  \n'),'Line one\nLine two\n\nNew paragraph');
  assert.match(notesToText([note('Only one','2026-10-01T09:00:00Z')],{timeZone:'UTC'}),/^Twesk notes · 1 note ·/);
});
test('a journal-only export reads as a journal',()=>{
  const text=notesToText([note('Calm morning','2026-10-02T08:00:00Z','journal'),note('Long day','2026-10-01T20:00:00Z','journal')],{timeZone:'UTC',exportedAt:'2026-10-09T10:00:00Z'});
  assert.match(text,/^Twesk journal · 2 entries · exported/);
  assert.doesNotMatch(text,/· Journal/,'no redundant per-entry label');
  assert.ok(text.indexOf('Long day')<text.indexOf('Calm morning'));
});
test('dates follow the chosen timezone',()=>{
  const late=note('Late night','2026-10-01T23:30:00Z');
  assert.match(notesToText([late],{timeZone:'UTC'}),/October 1, 2026/);
  assert.match(notesToText([late],{timeZone:'Asia/Tokyo'}),/October 2, 2026/);
});

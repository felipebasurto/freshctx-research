import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expected, score } from './checker.mjs';
const task = JSON.parse(await readFile(new URL('./task.json', import.meta.url)));
test('external checker rejects stale, guessed-header, malformed and stubbed answers', () => {
  assert.equal(expected(task.after), 74);
  assert.equal(expected(task.before), 40);
  assert.equal(score('{"answer":74}', task.after), true);
  for (const text of ['{"answer":40}', '{"answer":70}', '{"answer":"74"}', '74', 'missing', '{"answer":null}']) assert.equal(score(text, task.after), false);
  assert.equal(score('{"answer":74}', { ...task.after, 'fees.js': '// Fee rules\n' }), false);
});

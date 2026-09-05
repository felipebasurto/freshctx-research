import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { expected, score } from './checker.mjs';

const task = JSON.parse(await readFile(new URL('./task.json', import.meta.url)));
const catalog = JSON.parse(await readFile(new URL('./tasks/catalog.json', import.meta.url)));
const isolationTasks = [];
for (const name of catalog.tasks) {
  isolationTasks.push(JSON.parse(await readFile(new URL(`./tasks/${name}`, import.meta.url))));
}

test('external checker rejects stale, guessed-header, malformed and stubbed answers', () => {
  assert.equal(expected(task.after), 74);
  assert.equal(expected(task.before), 40);
  assert.equal(score('{"answer":74}', task.after), true);
  for (const text of ['{"answer":40}', '{"answer":70}', '{"answer":"74"}', '74', 'missing', '{"answer":null}']) {
    assert.equal(score(text, task.after), false);
  }
  assert.equal(score('{"answer":74}', { ...task.after, 'fees.js': '// Fee rules\n' }), false);
});

test('fenced current numeric JSON passes; fenced wrong gold still fails', () => {
  const current = 'total(3) = 3 * 20 = 60\nfee(3) = 3 + 11 = 14\n60 + 14 = 74\n\n```json\n{"answer": 74}\n```';
  assert.equal(score(current, task.after), true);
  assert.equal(score('```json\n{"answer":74}\n```', task.after), true);
  assert.equal(score('```\n{"answer":74}\n```', task.after), true);
  assert.equal(score('```json\n{"answer":40}\n```', task.after), false);
  assert.equal(score('```json\n{"answer":"74"}\n```', task.after), false);
  assert.equal(score('```json\n74\n```', task.after), false);
  assert.equal(score('```json\n{"answer":71}\n```', task.after), false);
});

test('preregistered isolation tasks: stale observed bytes imply the wrong answer', () => {
  assert.equal(isolationTasks.length, 5);
  assert.equal(catalog.livePrimary, 'rate-constant-v1');
  const golds = new Set();
  for (const item of isolationTasks) {
    const iso = item.isolation;
    const header = item.after[iso.unreadPath].split('\n')[0];
    const staleFiles = { ...item.after, [iso.observedPath]: item.before[iso.observedPath] };
    const headerOnly = { ...item.after, [iso.unreadPath]: header + '\n' };
    assert.equal(expected(item.after, item.expression), item.gold);
    assert.equal(expected(staleFiles, item.expression), item.staleObservedCurrentUnread);
    assert.notEqual(item.gold, item.staleObservedCurrentUnread);
    assert.equal(score(JSON.stringify({ answer: item.gold }), item.after, item.expression), true);
    assert.equal(score('```json\n' + JSON.stringify({ answer: item.gold }) + '\n```', item.after, item.expression), true);
    assert.equal(score(JSON.stringify({ answer: item.staleObservedCurrentUnread }), item.after, item.expression), false);
    assert.equal(score('```json\n' + JSON.stringify({ answer: item.staleObservedCurrentUnread }) + '\n```', item.after, item.expression), false);
    assert.equal(score(JSON.stringify({ answer: item.gold }), headerOnly, item.expression), false);
    assert.equal(score(JSON.stringify({ answer: item.gold }), item.before, item.expression), false);
    assert.ok(!header.includes(iso.staleObserved));
    assert.ok(!header.includes(iso.currentObserved));
    for (const needle of iso.unreadBodies) {
      assert.ok(!header.includes(needle), 'unread body must not be guessable from the header');
      assert.ok(!/\d/.test(header), 'unread header must not carry a numeric leak');
    }
    assert.ok(item.before[iso.observedPath].includes(iso.staleObserved));
    assert.ok(item.after[iso.observedPath].includes(iso.currentObserved));
    assert.ok(!item.after[iso.observedPath].includes(iso.staleObserved));
    golds.add(item.gold);
  }
  assert.equal(golds.size, isolationTasks.length);
});

test('catalog files on disk match the frozen list', async () => {
  const names = (await readdir(new URL('./tasks/', import.meta.url))).filter(name => name.endsWith('.json') && name !== 'catalog.json').sort();
  assert.deepEqual(names, [...catalog.tasks].sort());
});

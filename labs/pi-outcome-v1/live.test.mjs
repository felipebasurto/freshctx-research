import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expected, score } from './checker.mjs';

const task = JSON.parse(await readFile(new URL('./task.json', import.meta.url)));
const live = JSON.parse(await readFile(new URL('./live-1788612329848.json', import.meta.url)));

test('recorded DeepSeek pair stays a real-model N=1 on the frozen task', () => {
  assert.equal(live.mode, 'real-model');
  assert.equal(live.task, 'resume-multifile-header-v1');
  assert.equal(live.N, 1);
  assert.equal(live.modelRequested, 'deepseek-v4-flash');
  assert.equal(live.productSha, '3e3c4489969fbe02b7313b666767651d1faf133c');
  assert.deepEqual(live.arms.map(a => a.arm), ['withoutFreshCtx', 'withFreshCtx']);
});

test('recorded harness flags stay 0/1 both arms; gold 74 is unchanged', () => {
  const without = live.arms[0];
  const withFresh = live.arms[1];
  assert.equal(without.pass, false);
  assert.equal(withFresh.pass, false);
  assert.equal(without.requestsToPass, null);
  assert.equal(withFresh.requestsToPass, null);
  assert.equal(without.requests.length, 4);
  assert.equal(withFresh.requests.length, 4);
  assert.equal(without.toolCalls.length, 4);
  assert.equal(withFresh.toolCalls.length, 4);
  assert.equal(expected(task.after), 74);
  assert.match(without.submissions[0].answer, /\{"answer": 74\}/);
  assert.equal(withFresh.submissions[0].answer, '{"answer": 71}');
});

test('fence-tolerant checker would accept the recorded 74 and still reject 71', () => {
  const without = live.arms[0];
  const withFresh = live.arms[1];
  for (const submission of without.submissions) {
    assert.equal(score(submission.answer, task.after), true);
  }
  for (const submission of withFresh.submissions) {
    assert.equal(score(submission.answer, task.after), false);
  }
});

test('first measured requests keep the frozen freshness facts', () => {
  const without = live.arms[0].initialEvidence;
  const withFresh = live.arms[1].initialEvidence;
  assert.deepEqual(without, { staleTotal: true, currentTotal: false, unreadFeeExposed: false });
  assert.deepEqual(withFresh, { staleTotal: false, currentTotal: true, unreadFeeExposed: false });
  const returned = live.arms.flatMap(arm => arm.requests.map(request => {
    const line = request.response.split('\n').find(row => row.startsWith('data: {'));
    return JSON.parse(line.slice(6)).model;
  }));
  assert.equal(new Set(returned).size, 1);
  assert.equal(returned[0], 'deepseek-v4-flash');
  assert.ok(live.arms.every(arm => arm.requests.every(request => request.status === 200)));
});

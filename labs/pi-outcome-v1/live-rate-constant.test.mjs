import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expected, score } from './checker.mjs';

const task = JSON.parse(await readFile(new URL('./tasks/rate-constant-v1.json', import.meta.url)));
const live = JSON.parse(await readFile(new URL('./live-1788614404231.json', import.meta.url)));

test('recorded DeepSeek pair is a real-model N=1 on frozen rate-constant-v1', () => {
  assert.equal(live.mode, 'real-model');
  assert.equal(live.task, 'rate-constant-v1');
  assert.equal(live.N, 1);
  assert.equal(live.modelRequested, 'deepseek-v4-flash');
  assert.equal(live.productSha, '3e3c4489969fbe02b7313b666767651d1faf133c');
  assert.equal(live.researchSha, '7c2d0ebec4155f7bdc973a8ed5110cbbd5f852ac');
  assert.deepEqual(live.arms.map(a => a.arm), ['withoutFreshCtx', 'withFreshCtx']);
  assert.equal(expected(task.after, task.expression), 80);
});

test('both arms pass; without is first-submission, with needs a retry', () => {
  const without = live.arms[0];
  const withFresh = live.arms[1];
  assert.equal(without.pass, true);
  assert.equal(withFresh.pass, true);
  assert.equal(without.firstSubmissionPass, true);
  assert.equal(withFresh.firstSubmissionPass, false);
  assert.equal(without.requestsToPass, 2);
  assert.equal(withFresh.requestsToPass, 5);
  assert.equal(without.requests.length, 2);
  assert.equal(withFresh.requests.length, 5);
  assert.equal(without.toolCalls.length, 2);
  assert.equal(withFresh.toolCalls.length, 6);
  assert.equal(score(without.submissions[0].answer, task.after, task.expression), true);
  assert.equal(score(withFresh.submissions[0].answer, task.after, task.expression), false);
  assert.equal(score(withFresh.submissions[1].answer, task.after, task.expression), true);
  assert.match(without.submissions[0].answer, /```json\n\{"answer": 80\}\n```/);
  assert.match(withFresh.submissions[0].answer, /\{"answer": 80\}/);
  assert.ok(!withFresh.submissions[0].answer.includes('```'));
  assert.equal(withFresh.submissions[1].answer, '{"answer": 80}');
});

test('first measured requests keep stale-versus-current isolation', () => {
  const without = live.arms[0].initialEvidence;
  const withFresh = live.arms[1].initialEvidence;
  assert.deepEqual(without, { staleObserved: true, currentObserved: false, unreadBodyExposed: false });
  assert.deepEqual(withFresh, { staleObserved: false, currentObserved: true, unreadBodyExposed: false });
  const returned = live.arms.flatMap(arm => arm.requests.map(request => {
    const line = request.response.split('\n').find(row => row.startsWith('data: {'));
    return JSON.parse(line.slice(6)).model;
  }));
  assert.equal(new Set(returned).size, 1);
  assert.equal(returned[0], 'deepseek-v4-flash');
  assert.ok(live.arms.every(arm => arm.requests.every(request => request.status === 200)));
  assert.ok(live.spendUsdPeak < 5);
});

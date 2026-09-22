// Replays one real SWE-rebench OpenHands case through the real FreshCtx sidecar:
// the agent views canvasapi/module.py, then its own str_replace changes lines the
// view displayed. Without FreshCtx the next request still carries the old view.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const cli = process.argv[2];
const casePath = process.argv[3] ?? new URL('case.json', import.meta.url);
const c = JSON.parse(await readFile(casePath, 'utf8'));
const rel = 'canvasapi/module.py';
const root = await mkdtemp(path.join(tmpdir(), 'freshctx-replay-'));
await mkdir(path.join(root, 'canvasapi'));
await writeFile(path.join(root, rel), c.viewed);
assert.equal(c.viewed.split(c.old_str).length, 2, 'old_str must be unique, as OpenHands enforces');
const edited = c.viewed.replace(c.old_str, () => c.new_str);

const child = spawn(process.execPath, [cli, 'serve', '--stdio', '--root', root], { stdio: ['pipe', 'pipe', 'inherit'] });
const closed = new Promise(resolve => child.once('close', resolve));
const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
let seq = 0;
async function request(op, fields = {}) {
  const id = String(++seq);
  child.stdin.write(JSON.stringify({ ...fields, protocol: 'freshctx/1', id, op }) + '\n');
  const reply = JSON.parse((await replies.next()).value);
  if (!reply.ok) throw new Error(JSON.stringify(reply.error));
  return reply.result;
}

try {
  await request('hello', { session_id: 'replay', capabilities: {
    request_rewrite: true, stable_result_identity: true, projection_insertion: true, shared_workspace: true,
  } });
  await request('observe', {
    result_id: 'view-21', path: rel, content_utf8_base64: Buffer.from(c.viewed).toString('base64'),
    range: { start_byte: 0, end_byte: Buffer.byteLength(c.viewed) },
  });
  await writeFile(path.join(root, rel), edited);
  const plan = await request('prepare', { request_id: 'request-after-edit', result_ids: ['view-21'], budget_bytes: 65536 });
  const projection = Buffer.from(plan.projection_utf8_base64, 'base64').toString('utf8');
  assert.equal((await request('commit', { plan_id: plan.plan_id })).applied, true);
  const staleLine = c.old_str.split('\n').find(l => l.trim() && !c.new_str.includes(l));
  const newLine = c.new_str.split('\n').find(l => l.trim() && !c.old_str.includes(l));
  const outgoing = plan.replacements[0].marker + '\n' + projection;
  const result = {
    trajectory_id: c.trajectory_id,
    withoutFreshCtx: { carriesStaleLine: c.viewed.includes(staleLine), carriesCurrentLine: c.viewed.includes(newLine) },
    withFreshCtx: { carriesStaleLine: outgoing.includes(staleLine), carriesCurrentLine: outgoing.includes(newLine),
      marker: plan.replacements[0].marker, projectionBytes: Buffer.byteLength(projection) },
    staleLine, newLine,
  };
  assert.deepEqual([result.withoutFreshCtx.carriesStaleLine, result.withoutFreshCtx.carriesCurrentLine], [true, false]);
  assert.deepEqual([result.withFreshCtx.carriesStaleLine, result.withFreshCtx.carriesCurrentLine], [false, true]);
  console.log(JSON.stringify(result, null, 2));
} finally {
  child.kill();
  await closed;
  await rm(root, { recursive: true, force: true });
}

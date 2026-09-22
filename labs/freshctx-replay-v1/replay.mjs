// Replays rebuilt OpenHands trajectories through the real FreshCtx engine (`freshctx serve --stdio`).
// Usage: node replay.mjs <product>/bin/freshctx.mjs scripts.jsonl [budget_bytes]
// FRESHCTX_REPLAY_DUMP=<file> also writes the first five stale cases for inspection.
// Each request copy replaces every observed view result with its FreshCtx marker
// and appends the projection, as bridges/openhands/src/bridge.mjs does.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const [cli, scriptsPath, budgetArg] = process.argv.slice(2);
const budget = Number(budgetArg ?? 131072);
const bytes = s => Buffer.byteLength(s, 'utf8');
const sha = s => 'sha256:' + createHash('sha256').update(s).digest('hex');

function frames(projection) {
  const out = [];
  let buf = Buffer.from(projection, 'utf8');
  while (buf.length) {
    const nl = buf.indexOf(10);
    const header = buf.subarray(0, nl).toString('utf8');
    const m = /^(.*?)(?::[a-z_]+)?:(\d+)bytes$/u.exec(header);
    assert.ok(m, `bad frame header ${header}`);
    const n = Number(m[2]);
    out.push({ path: m[1], body: buf.subarray(nl + 1, nl + 1 + n).toString('utf8') });
    buf = buf.subarray(nl + 1 + n);
  }
  return out;
}

function serve(root) {
  const child = spawn(process.execPath, [cli, 'serve', '--stdio', '--root', root], { stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = new Promise(resolve => child.once('close', resolve));
  const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let seq = 0;
  return {
    async request(op, fields = {}) {
      const id = String(++seq);
      child.stdin.write(JSON.stringify({ ...fields, protocol: 'freshctx/1', id, op }) + '\n');
      const next = await replies.next();
      assert.ok(!next.done, 'engine exited');
      const reply = JSON.parse(next.value);
      assert.equal(reply.id, id);
      if (!reply.ok) throw Object.assign(new Error(reply.error.code), { reply });
      return reply.result;
    },
    async close() { child.kill(); await closed; },
  };
}

const agg = {
  budget_bytes: budget, trajectories: 0, trajectories_with_replayed_request: 0,
  requests_total: 0, requests_replayed: 0, requests_with_views: 0,
  cut_reasons: {}, errors: {},
  baseline_bytes: 0, freshctx_bytes: 0,
  baseline_view_bytes: 0, freshctx_marker_bytes: 0, freshctx_projection_bytes: 0,
  final_request: [],
  stale_view_instances: 0, stale_view_requests_baseline: 0, stale_view_requests_freshctx: 0,
  stale_views_replaced: 0, stale_views_unit_projected: 0, stale_views_unit_not_projected: {},
  stale_snippet_instances: 0, stale_snippet_requests: 0,
  stale_any_requests_baseline: 0, stale_any_requests_freshctx: 0,
  projection_frames: 0, projection_frames_current: 0, projection_over_budget: 0, commits_applied: 0,
};
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const dumpPath = process.env.FRESHCTX_REPLAY_DUMP;
const dumpLimit = dumpPath ? 5 : 0;
const dumps = [];

async function replay(s) {
  agg.trajectories++;
  agg.requests_total += s.requests_total;
  bump(agg.cut_reasons, s.cut ?? 'complete');
  const root = await mkdtemp(path.join(tmpdir(), 'fc-replay-'));
  const files = new Map();
  const views = [];
  const snippets = [];
  const isStale = v => {
    const cur = (files.get(v.path) ?? '').split('\n').slice(v.start_line - 1, v.start_line - 1 + v.lines.length);
    return cur.length !== v.lines.length || cur.some((l, k) => l !== v.lines[k]);
  };
  const engine = serve(root);
  let last = null;
  try {
    await engine.request('hello', { session_id: 'replay', capabilities: {
      request_rewrite: true, stable_result_identity: true, projection_insertion: true, shared_workspace: true,
    } });
    for (const e of s.events) {
      if (e.op === 'write') {
        files.set(e.path, e.text);
        await mkdir(path.dirname(path.join(root, e.path)), { recursive: true });
        await writeFile(path.join(root, e.path), e.text);
      } else if (e.op === 'view') {
        const text = files.get(e.path);
        const lines = text.split('\n');
        const start = bytes(lines.slice(0, e.start_line - 1).map(l => l + '\n').join(''));
        assert.equal(Buffer.from(text).subarray(start, start + bytes(e.text)).toString('utf8'), e.text);
        const r = await engine.request('observe', {
          result_id: e.rid, path: e.path, content_utf8_base64: Buffer.from(e.text).toString('base64'),
          ...(bytes(e.text) ? { range: { start_byte: start, end_byte: start + bytes(e.text) } } : {}),
        });
        views.push({ ...e, unit_id: r.unit_id, lines: e.text.split('\n') });
      } else if (e.op === 'snippet') {
        snippets.push({ ...e, lines: e.text.split('\n') });
      } else if (e.op === 'request') {
        agg.requests_replayed++;
        let fc = e.base_bytes;
        let lastStaleLeft = false;
        if (views.length) {
          agg.requests_with_views++;
          const plan = await engine.request('prepare', { request_id: randomUUID(), result_ids: views.map(v => v.rid), budget_bytes: budget });
          const projection = Buffer.from(plan.projection_utf8_base64, 'base64').toString('utf8');
          assert.equal(sha(projection), plan.projection_sha256);
          if (bytes(projection) > budget) agg.projection_over_budget++;
          const markers = new Map(plan.replacements.map(r => [r.result_id, r.marker]));
          const nativeBytes = views.reduce((n, v) => n + v.native_bytes, 0);
          const markerBytes = views.reduce((n, v) => n + (markers.has(v.rid) ? bytes(markers.get(v.rid)) : v.native_bytes), 0);
          fc = e.base_bytes - nativeBytes + markerBytes + bytes(projection);
          agg.baseline_view_bytes += nativeBytes;
          agg.freshctx_marker_bytes += markerBytes;
          agg.freshctx_projection_bytes += bytes(projection);
          const bodies = frames(projection);
          for (const f of bodies) {
            agg.projection_frames++;
            if ((files.get(f.path) ?? '').includes(f.body)) agg.projection_frames_current++;
          }
          const selected = new Set(plan.selected);
          const omitted = new Map(plan.omitted.map(o => [o.unitId, o.reason]));
          const unresolved = new Map(plan.unresolved.map(u => [u.result_id, u.reason]));
          let staleHere = 0, staleLeft = 0;
          for (const v of views) {
            if (!isStale(v)) continue;
            staleHere++;
            agg.stale_view_instances++;
            if (markers.has(v.rid)) agg.stale_views_replaced++; else staleLeft++;
            if (selected.has(v.unit_id)) agg.stale_views_unit_projected++;
            else bump(agg.stale_views_unit_not_projected, omitted.get(v.unit_id) ?? `unresolved:${unresolved.get(v.rid)}`);
          }
          if (staleHere) agg.stale_view_requests_baseline++;
          if (staleLeft) agg.stale_view_requests_freshctx++;
          lastStaleLeft = staleLeft > 0;
          if (dumps.length < dumpLimit && staleHere) {
            const v = views.find(isStale);
            dumps.push({
              trajectory_id: s.trajectory_id, path: v.path, view_start_line: v.start_line,
              stale_view: v.text, marker_sent_instead: markers.get(v.rid),
              unit_projected: selected.has(v.unit_id),
              projection_frames_for_path: bodies.filter(f => f.path === v.path).map(f => f.body),
            });
          }
          const committed = await engine.request('commit', { plan_id: plan.plan_id });
          if (committed.applied === true) agg.commits_applied++;
        }
        const staleSnippets = snippets.filter(isStale).length;
        const staleViews = views.filter(isStale).length;
        agg.stale_snippet_instances += staleSnippets;
        if (staleSnippets) agg.stale_snippet_requests++;
        if (staleSnippets || staleViews) agg.stale_any_requests_baseline++;
        if (staleSnippets || (staleViews && lastStaleLeft)) agg.stale_any_requests_freshctx++;
        agg.baseline_bytes += e.base_bytes;
        agg.freshctx_bytes += fc;
        last = [e.base_bytes, fc];
      }
    }
  } catch (error) {
    bump(agg.errors, error.message);
  } finally {
    await engine.close();
    await rm(root, { recursive: true, force: true });
  }
  if (last) { agg.trajectories_with_replayed_request++; agg.final_request.push(last); }
}

const input = createInterface({ input: createReadStream(scriptsPath) });
for await (const line of input) if (line.trim()) await replay(JSON.parse(line));

const finals = agg.final_request;
const median = xs => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
agg.final_request = {
  count: finals.length,
  baseline_sum: finals.reduce((n, [b]) => n + b, 0),
  freshctx_sum: finals.reduce((n, [, f]) => n + f, 0),
  baseline_median: median(finals.map(([b]) => b)),
  freshctx_median: median(finals.map(([, f]) => f)),
  freshctx_smaller: finals.filter(([b, f]) => f < b).length,
  freshctx_larger: finals.filter(([b, f]) => f > b).length,
};
if (dumpPath) await writeFile(dumpPath, JSON.stringify(dumps, null, 2) + '\n');
console.log(JSON.stringify(agg, null, 2));

// E11: real files, the model's own conclusion, real edit, resumed session; tail notice rule with and without the FreshCtx bridge. See PROTOCOL-E11.md.
//   FRESHCTX_PRODUCT=... FRESHCTX_PRODUCT_SHA=... node labs/jev-stale-view-v1/e11_run.mjs --item=e11-08 --rep=0 [--live]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const live = process.argv.includes('--live');
const rep = Number(arg('rep') ?? 0);
const LAB = resolve('labs/jev-stale-view-v1');
const items = JSON.parse(await readFile(join(LAB, 'results/e11_items.json'), 'utf8'));
const itemIndex = items.findIndex(i => i.id === arg('item'));
const item = items[itemIndex];
assert.ok(item, 'unknown --item');
const product = resolve(process.env.FRESHCTX_PRODUCT);
const piRoot = join(product, 'bridges/pi/node_modules/@earendil-works/pi-coding-agent');
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(join(piRoot, 'dist/index.js')));

const MODEL = 'deepseek-v4-flash', TEMPERATURE = 0, MAX_TOKENS_INVESTIGATE = 1024, MAX_TOKENS = 512;
const MAX_REQUESTS = 8, MAX_REQUESTS_INVESTIGATE = 16, MAX_BYTES = 400000, MAX_SUBMISSIONS = 2, CAP_USD = 6;
const outDir = join(LAB, 'results/e11'); await mkdir(outDir, { recursive: true });
const spentFile = join(outDir, '.spent.json');
let spent = 0; try { spent = JSON.parse(await readFile(spentFile, 'utf8')).usd; } catch { /* first run */ }
if (live && spent >= CAP_USD) throw new Error(`Spend cap reached: ${spent}`);

const rel = item.rel;
const investigatePrompt = `Investigate this question about ${rel}: ${item.question} Read the relevant code and explain what you find, citing the lines. Do not return JSON yet.`;
const prompt = `Answer this question about ${rel}: ${item.question} Return only a JSON object with the boolean field answer.`;
const retryPrompt = 'The external checker rejected your answer. Inspect the current workspace as needed and return only a JSON object with the boolean field answer.';
// Deterministic rule (PROTOCOL-E11.md): one notice per file changed since the session was saved; E9/E10 wording.
const TAIL = `\n\n[FreshCtx: your earlier note about ${rel} is withdrawn because the file changed after it was written. Do not rely on it.]`;
const beforeOnly = item.edit_old.split('\n').find(l => l.trim().length >= 12 && !item.edit_new.split('\n').includes(l));
const afterOnly = item.edit_new.split('\n').find(l => l.trim().length >= 12 && !item.edit_old.split('\n').includes(l));

function parseBool(text) {
  const raw = String(text ?? ''); const cands = [raw.trim(), ...[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1].trim())];
  for (const c of cands) { try { const p = JSON.parse(c); if (p && typeof p === 'object' && typeof p.answer === 'boolean') return p.answer; } catch { /* next */ } }
  return null;
}
function scripted(res, delta, finish) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const choice of [{ delta, finish_reason: null }, { delta: {}, finish_reason: finish }]) res.write('data: ' + JSON.stringify({ id: 'dry', object: 'chat.completion.chunk', created: 1, model: MODEL, choices: [{ index: 0, ...choice }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
}
function usageFromResponse(text) {
  let u = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
  for (const line of (text ?? '').split('\n')) {
    if (!line.startsWith('data: {')) continue;
    try { const c = JSON.parse(line.slice(6)); if (c.usage) { const hit = c.usage.prompt_cache_hit_tokens ?? 0; u = { prompt_tokens: c.usage.prompt_tokens ?? 0, completion_tokens: c.usage.completion_tokens ?? 0, prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: c.usage.prompt_cache_miss_tokens ?? Math.max(0, (c.usage.prompt_tokens ?? 0) - hit) }; } } catch { /* skip */ }
  }
  return u;
}
const textOf = m => typeof m.content === 'string' ? m.content : (m.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('');

let key;
if (live) key = JSON.parse(await readFile(join(homedir(), '.pi/agent/auth.json'))).deepseek?.key;
const ARMS = ['A_native', 'A_rule', 'F_fc', 'F_rule'];
const shift = itemIndex + rep;
const order = ARMS.map((_, i) => ARMS[(i + shift) % ARMS.length]);
const output = join(outDir, `${live ? 'live' : 'dry'}-${item.id}-rep${rep}-${Date.now()}.json`);
await writeFile(output, '', { flag: 'wx' });
const report = {
  schema: 1, experiment: 'E11', startedAt: new Date().toISOString(), mode: live ? 'real-model' : 'dry-scripted', item: item.id, source: item.source, rep, order,
  repo: item.repo, baseCommit: item.base_commit, rel, lines: item.lines, question: item.question, gold: item.gold, investigatePrompt, prompt, tail: TAIL,
  model: MODEL, node: process.version, pi: JSON.parse(await readFile(join(piRoot, 'package.json'))).version,
  productSha: process.env.FRESHCTX_PRODUCT_SHA, researchSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  itemsSha256: createHash('sha256').update(await readFile(join(LAB, 'results/e11_items.json'))).digest('hex'),
  runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  investigate: { requests: [], toolCalls: [], errors: [] }, arms: [],
};

// One loopback provider for the whole run; `current` says which record the next request belongs to.
let current = report.investigate, phase = 'investigate', applyTail = false;
async function forward(payload, res, maxTokens) {
  payload.model = MODEL; payload.temperature = TEMPERATURE; payload.max_tokens = maxTokens;
  delete payload.max_completion_tokens; payload.thinking = { type: 'disabled' }; payload.stream_options = { include_usage: true };
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Request byte cap reached');
  const entry = { index: current.requests.length + 1, bytes: Buffer.byteLength(serialized), payload };
  current.requests.push(entry);
  if (live) {
    const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: serialized, signal: AbortSignal.timeout(120000) });
    entry.status = r.status; entry.response = await r.text(); entry.usage = usageFromResponse(entry.response);
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'text/event-stream' });
    return res.end(entry.response);
  }
  // Dry: investigate = one read then a fixed stale-looking conclusion; measurement = the stale answer.
  if (phase === 'investigate') {
    if (!payload.messages.some(m => m.role === 'tool')) return scripted(res, { role: 'assistant', tool_calls: [{ index: 0, id: 'dry_read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: rel }) } }] }, 'tool_calls');
    return scripted(res, { role: 'assistant', content: `Dry-run conclusion: the answer is ${!item.gold}.` }, 'stop');
  }
  return scripted(res, { role: 'assistant', content: JSON.stringify({ answer: !item.gold }) }, 'stop');
}
const server = createServer(async (req, res) => {
  try {
    let body = ''; for await (const c of req) body += c;
    const payload = JSON.parse(body);
    if (current.requests.length >= (phase === 'investigate' ? MAX_REQUESTS_INVESTIGATE : MAX_REQUESTS)) throw new Error(`${phase} request cap reached`);
    if (phase === 'measurement' && applyTail) {
      const q = payload.messages.find(x => x.role === 'user' && textOf(x).includes(prompt));
      if (!q) throw new Error('Question user message not found');
      if (typeof q.content === 'string') q.content += TAIL;
      else { const parts = q.content.filter(c => c.type === 'text'); parts.at(-1).text += TAIL; }
    }
    return await forward(payload, res, phase === 'investigate' ? MAX_TOKENS_INVESTIGATE : MAX_TOKENS);
  } catch (error) { current.errors.push(error.message); res.writeHead(500); res.end('Harness request rejected'); }
});
await new Promise((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });

const root = await mkdtemp(join(tmpdir(), 'freshctx-e11-'));
const snapshot = await mkdtemp(join(tmpdir(), 'freshctx-e11-snap-'));
const agentDir = join(root, 'agent');
let session;
try {
  await mkdir(agentDir); await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), item.before);
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, modelsStorePath: join(agentDir, 'models.json'), refreshOnCreate: false });
  modelRuntime.registerProvider('paired', { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'loopback-only', models: [{ id: MODEL, name: MODEL, reasoning: false, input: ['text'], cost: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0.44 }, contextWindow: 128000, maxTokens: MAX_TOKENS_INVESTIGATE }] });
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const open = async (manager, bridge) => {
    const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalExtensionPaths: bridge ? [join(product, 'bridges/pi/extension.js')] : [],
      extensionFactories: [pi => { pi.on('tool_call', e => { current.toolCalls.push({ name: e.toolName, input: e.input }); }); }] });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { session: s } = await createAgentSession({ cwd: root, agentDir, modelRuntime, model: modelRuntime.getModel('paired', MODEL), thinkingLevel: 'off', tools: ['read'], resourceLoader: loader, sessionManager: manager, settingsManager });
    await s.bindExtensions({ onError: e => current.errors.push(String(e.message ?? e)) });
    return s;
  };
  const close = async () => { if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' }); session.dispose(); session = null; } };

  // Phase 1: the model investigates the real pre-edit file with the bridge loaded (so FreshCtx observes the reads).
  const manager = SessionManager.create(root, join(root, 'sessions'));
  const sessionFile = () => manager.getSessionFile();
  session = await open(manager, true);
  await session.prompt(investigatePrompt);
  const last = session.messages.at(-1);
  report.investigate.conclusion = textOf({ content: last.content });
  report.investigate.stopReason = last.stopReason;
  report.investigate.reads = report.investigate.toolCalls.filter(t => t.name === 'read').length;
  report.investigate.conclusionParsed = parseBool(report.investigate.conclusion);
  await close();
  assert.ok(report.investigate.reads > 0, 'investigation must read the file');
  assert.equal(report.investigate.stopReason, 'stop', 'investigation must finish');
  const savedPath = sessionFile();
  const saved = await readFile(savedPath, 'utf8');
  // External edit: the agent's real str_replace, applied while the session is closed. Snapshot the workspace (incl. .freshctx/).
  await writeFile(join(root, rel), item.after);
  await cp(root, snapshot, { recursive: true });

  phase = 'measurement';
  for (const arm of order) {
    const result = { arm, requests: [], submissions: [], toolCalls: [], errors: [] };
    report.arms.push(result); current = result;
    applyTail = arm.endsWith('_rule');
    try {
      await rm(root, { recursive: true, force: true }); await cp(snapshot, root, { recursive: true });
      assert.equal(await readFile(savedPath, 'utf8'), saved);
      session = await open(SessionManager.open(savedPath), arm.startsWith('F_'));
      for (let attempt = 0; attempt < MAX_SUBMISSIONS; attempt++) {
        await session.prompt(attempt === 0 ? prompt : retryPrompt);
        const msg = session.messages.at(-1);
        const answer = textOf({ content: msg.content });
        const parsed = parseBool(answer);
        const pass = msg.stopReason === 'stop' && parsed === item.gold;
        result.submissions.push({ attempt: attempt + 1, answer, parsed, pass, staleDerived: parsed === !item.gold, stopReason: msg.stopReason, error: msg.errorMessage, requests: result.requests.length, toolCalls: result.toolCalls.length });
        if (pass || msg.stopReason !== 'stop') break;
      }
      await close();
      const first = JSON.stringify(result.requests[0]?.payload.messages ?? []);
      const has = s => s != null && first.includes(JSON.stringify(s).slice(1, -1));
      result.initialEvidence = { staleCode: has(beforeOnly), currentCode: has(afterOnly), conclusionPresent: has(report.investigate.conclusion), tailApplied: has(TAIL.trim()) };
      result.historyPreserved = (await readFile(savedPath, 'utf8')).startsWith(saved);
      result.pass = result.submissions.some(s => s.pass);
      result.firstSubmissionPass = result.submissions[0]?.pass ?? false;
      result.reads = result.toolCalls.filter(t => t.name === 'read').length;
    } catch (error) { result.errors.push(error.message); result.pass = false; await close().catch(() => {}); }
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
} catch (error) { report.investigate.errors.push(error.message); await session?.extensionRunner?.emit({ type: 'session_shutdown', reason: 'exit' }).catch(() => {}); }
finally {
  if (server.listening) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  await rm(root, { recursive: true, force: true }); await rm(snapshot, { recursive: true, force: true });
  const sum = rs => rs.reduce((u, r) => { for (const k of Object.keys(u)) u[k] += r.usage?.[k] ?? 0; return u; }, { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 });
  report.investigate.usage = sum(report.investigate.requests);
  for (const a of report.arms) a.usage = sum(a.requests);
  const total = sum([...report.investigate.requests, ...report.arms.flatMap(a => a.requests)]);
  report.usage = total;
  report.spendUsdPeak = (total.prompt_tokens * 0.44 + total.completion_tokens * 1.32) / 1e6;
  report.spendUsdCached = (total.prompt_cache_hit_tokens * 0.014 + total.prompt_cache_miss_tokens * 0.44 + total.completion_tokens * 1.32) / 1e6;
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (live) await writeFile(spentFile, JSON.stringify({ usd: spent + report.spendUsdPeak }));
}
console.log(JSON.stringify({ item: item.id, rep, lines: item.lines, spend: report.spendUsdPeak, investigate: { reads: report.investigate.reads, parsed: report.investigate.conclusionParsed, errors: report.investigate.errors, conclusion: (report.investigate.conclusion ?? '').slice(0, 160) },
  arms: report.arms.map(({ arm, firstSubmissionPass, pass, reads, initialEvidence, errors, usage }) => ({ arm, firstSubmissionPass, pass, reads, initialEvidence, errors, hit: usage?.prompt_cache_hit_tokens, prompt: usage?.prompt_tokens })) }));

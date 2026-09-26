// E5: does a stale assistant conclusion hurt, and does a Jev marker recover it? See PROTOCOL-E5.md.
// Based on labs/pi-outcome-v1/run.mjs. Usage (from the research checkout root):
//   FRESHCTX_PRODUCT=... TYPESAFE_API_KEY=... node labs/jev-stale-view-v1/e5_run.mjs --task=<task.json> --rep=<n> [--live]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expected, score } from '../pi-outcome-v1/checker.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const live = process.argv.includes('--live');
const taskPath = resolve(arg('task'));
const rep = Number(arg('rep') ?? 0);
const taskBytes = await readFile(taskPath);
const task = JSON.parse(taskBytes);
const iso = task.isolation;
const expression = task.expression;
const product = resolve(process.env.FRESHCTX_PRODUCT ?? '../official');
const piRoot = join(product, 'bridges/pi/node_modules/@earendil-works/pi-coding-agent');
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(join(piRoot, 'dist/index.js')));
const CAP_USD = 2;
const spentFile = resolve('labs/jev-stale-view-v1/results/e5/.spent.json');
await mkdir(resolve('labs/jev-stale-view-v1/results/e5'), { recursive: true });
let spent = 0;
try { spent = JSON.parse(await readFile(spentFile, 'utf8')).usd; } catch { /* first run */ }
if (live && spent >= CAP_USD) throw new Error(`Spend cap reached: ${spent}`);

// ---- seeded conclusion and neutral prompt (fixed in PROTOCOL-E5.md) ----
const obsBefore = task.before[iso.observedPath];
const m = obsBefore.match(/function (\w+)\(quantity\) \{\n\s*return (.+);/);
const fn = m[1], staleExpr = m[2];
const fn2 = task.before[iso.unreadPath].match(/function (\w+)\(\)/)[1];
const staleValue = runInNewContext(`${obsBefore}\n${fn}(3)`, {}, { timeout: 100 });
const claim = `I read ${iso.observedPath}: ${fn}(quantity) returns ${staleExpr}, so ${fn}(3) = ${staleValue}. For ${iso.unreadPath} I only saw the header line, not ${fn2}().`;
const prompt = `Compute ${expression} from the files in this workspace. You may read any required code. Return only a JSON object with the numeric field answer.`;
const staleAnswer = staleValue + runInNewContext(`${task.after[iso.unreadPath]}\n${fn2}()`, {}, { timeout: 100 });

// Tiny line diff for small files: removed lines (-) then added lines (+), shared lines as context.
function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n'), setA = new Set(A), setB = new Set(B);
  return [...A.map(l => (setB.has(l) ? ' ' : '-') + l), ...B.filter(l => !setA.has(l)).map(l => '+' + l)].join('\n');
}
const observedDiff = lineDiff(task.before[iso.observedPath], task.after[iso.observedPath]);

// ---- Jev fan-out (E2 Noul, frozen) ----
const E2_Q = 'Does `statement` make a concrete claim about the code in `file` that was true before the edit but is false after it?';
const E2_CRIT = { true: 'statement describes code, lines, names or behaviour that the edit removed or changed, so the statement is now outdated', false: 'statement is a plan, a runtime observation, about another file, or still accurate after the edit' };
const WITHDRAWN = `[FreshCtx: an earlier note about ${iso.observedPath} was withdrawn because the file changed after it was written.]`;
const MARK = `\n\n[FreshCtx note: ${iso.observedPath} changed after this message was written; claims about it may be outdated.]`;
async function jevScores(texts) {
  const questions = Object.fromEntries(texts.map((t, k) => [`q${k}`, { type: 'noul', instructions: { statement: t, question: E2_Q }, criteria: E2_CRIT }]));
  const t0 = Date.now();
  const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ state: { file: iso.observedPath, edit_diff: observedDiff }, model: 'jev-1.13.0', questions }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Jev HTTP ${r.status}`);
  const j = await r.json();
  return { p: texts.map((_, k) => j.answers[`q${k}`].noul), ms: Date.now() - t0, tokens: j.usage.input_tokens };
}

function scripted(res, delta, finish) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const choice of [{ delta, finish_reason: null }, { delta: {}, finish_reason: finish }]) res.write('data: ' + JSON.stringify({ id: 'controlled-seed', object: 'chat.completion.chunk', created: 1, model: task.model, choices: [{ index: 0, ...choice }] }) + '\n\n');
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
const seedPrompt = `Read ${task.seedReads.map(r => r.offset === 1 && r.limit === 1 ? `only line 1 of ${r.path}` : `lines ${r.offset}-${r.offset + r.limit - 1} of ${r.path}`).join(' and ')}, then summarise what you found.`;

let key;
if (live) key = JSON.parse(await readFile(join(homedir(), '.pi/agent/auth.json'))).deepseek?.key;
const ARMS = (process.env.E5_ARMS ?? 'A_base,B_fc,C_fc_jev,D_fc_noclaim').split(',');
const order = ARMS.map((_, i) => ARMS[(i + rep) % ARMS.length]);
const output = resolve(`labs/jev-stale-view-v1/results/e5/${live ? 'live' : 'dry'}-${process.env.E5_TAG ?? 'e5'}-${task.id}-rep${rep}-${Date.now()}.json`);
await writeFile(output, '', { flag: 'wx' });
const report = {
  schema: 1, experiment: 'E5', startedAt: new Date().toISOString(), mode: live ? 'real-model' : 'dry-scripted', task: task.id, rep, order,
  claim, prompt, staleAnswer, gold: expected(task.after, expression), observedDiff, model: task.model, node: process.version,
  pi: JSON.parse(await readFile(join(piRoot, 'package.json'))).version,
  productSha: process.env.FRESHCTX_PRODUCT_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: product, encoding: 'utf8' }).trim(),
  researchSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  taskSha256: createHash('sha256').update(taskBytes).digest('hex'),
  runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  arms: [],
};

try {
  for (const arm of order) {
    const fc = arm !== 'A_base', withClaim = arm !== 'D_fc_noclaim', useJev = arm === 'C_fc_jev' || arm === 'E_fc_jev_withdraw', withdraw = arm === 'E_fc_jev_withdraw';
    const root = await mkdtemp(join(tmpdir(), 'freshctx-e5-'));
    const agentDir = join(root, 'agent'); await mkdir(agentDir);
    const result = { arm, seedRequests: 0, requests: [], submissions: [], toolCalls: [], errors: [], jev: null };
    report.arms.push(result);
    let phase = 'seed', session, server;
    const jevCache = new Map();
    try {
      for (const [p, body] of Object.entries(task.before)) await writeFile(join(root, p), body);
      server = createServer(async (req, res) => {
        try {
          let body = ''; for await (const c of req) body += c;
          const payload = JSON.parse(body);
          if (phase === 'seed') {
            const n = result.seedRequests++;
            if (n === 0) return scripted(res, { role: 'assistant', tool_calls: task.seedReads.map((args, index) => ({ index, id: `seed_${index}`, type: 'function', function: { name: 'read', arguments: JSON.stringify(args) } })) }, 'tool_calls');
            return scripted(res, { role: 'assistant', content: withClaim ? claim : 'Ready.' }, 'stop');
          }
          if (result.requests.length >= task.maxRequestsPerArm) throw new Error('Post-resume request cap reached');
          if (useJev) {
            const targets = payload.messages.filter(x => x.role === 'assistant' && typeof x.content === 'string' && x.content.trim() && !x.content.includes(MARK) && x.content !== WITHDRAWN);
            const todo = targets.map(x => x.content).filter(t => !jevCache.has(t));
            if (todo.length) {
              const r = await jevScores(todo);
              todo.forEach((t, k) => jevCache.set(t, r.p[k]));
              result.jev = [...(result.jev ?? []), { n: todo.length, ms: r.ms, tokens: r.tokens }];
            }
            for (const x of targets) if (jevCache.get(x.content) >= 0.5) x.content = withdraw ? WITHDRAWN : x.content + MARK;
          }
          payload.model = task.model; payload.temperature = task.temperature; payload.max_tokens = task.maxTokens;
          delete payload.max_completion_tokens; payload.thinking = { type: 'disabled' }; payload.stream_options = { include_usage: true };
          const serialized = JSON.stringify(payload);
          if (Buffer.byteLength(serialized) > task.maxRequestBytes) throw new Error('Request byte cap reached');
          const entry = { index: result.requests.length + 1, bytes: Buffer.byteLength(serialized), payload };
          result.requests.push(entry);
          if (live) {
            const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: serialized, signal: AbortSignal.timeout(60000) });
            entry.status = response.status; entry.response = await response.text();
            res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'text/event-stream' });
            return res.end(entry.response);
          }
          return scripted(res, { role: 'assistant', content: JSON.stringify({ answer: staleAnswer }) }, 'stop');
        } catch (error) { result.errors.push(error.message); res.writeHead(500); res.end('Harness request rejected'); }
      });
      await new Promise((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });
      const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, modelsStorePath: join(agentDir, 'models.json'), refreshOnCreate: false });
      modelRuntime.registerProvider('paired', { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'loopback-only', models: [{ id: task.model, name: task.model, reasoning: false, input: ['text'], cost: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0.44 }, contextWindow: 32000, maxTokens: task.maxTokens }] });
      const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
      const open = async manager => {
        const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: fc ? [join(product, 'bridges/pi/extension.js')] : [], extensionFactories: [pi => { pi.on('tool_call', e => { if (phase !== 'seed') result.toolCalls.push({ name: e.toolName, input: e.input }); }); }] });
        await loader.reload();
        assert.deepEqual(loader.getExtensions().errors, []);
        const { session: s } = await createAgentSession({ cwd: root, agentDir, modelRuntime, model: modelRuntime.getModel('paired', task.model), thinkingLevel: 'off', tools: ['read'], resourceLoader: loader, sessionManager: manager, settingsManager });
        await s.bindExtensions({ onError: e => result.errors.push(String(e.message ?? e)) });
        return s;
      };
      const manager = SessionManager.create(root, join(root, 'sessions'));
      session = await open(manager);
      await session.prompt(seedPrompt);
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' }); session.dispose(); session = null;
      const saved = await readFile(manager.getSessionFile(), 'utf8');
      assert.ok(saved.includes(iso.staleObserved));
      assert.equal(saved.includes(claim), withClaim);
      for (const [p, body] of Object.entries(task.after)) await writeFile(join(root, p), body);
      phase = 'measurement';
      session = await open(SessionManager.open(manager.getSessionFile()));
      for (let attempt = 0; attempt < task.maxSubmissions; attempt++) {
        await session.prompt(attempt === 0 ? prompt : task.retryPrompt);
        const last = session.messages.at(-1);
        const answer = last.content?.filter(c => c.type === 'text').map(c => c.text).join('') ?? '';
        const files = Object.fromEntries(await Promise.all(Object.keys(task.after).map(async p => [p, await readFile(join(root, p), 'utf8')])));
        const pass = last.stopReason === 'stop' && score(answer, files, expression);
        const stale = score(answer, { ...task.after, [iso.observedPath]: task.before[iso.observedPath] }, expression);
        result.submissions.push({ attempt: attempt + 1, answer, pass, staleDerived: stale, stopReason: last.stopReason, error: last.errorMessage, requests: result.requests.length, toolCalls: result.toolCalls.length });
        if (pass || last.stopReason !== 'stop') break;
      }
      const first = JSON.stringify(result.requests[0]?.payload.messages ?? []);
      result.initialEvidence = {
        staleObservedCode: first.includes(iso.staleObserved), currentObservedCode: first.includes(iso.currentObserved),
        claimPresent: first.includes(claim), markerApplied: first.includes(MARK.trim()), withdrawn: first.includes(WITHDRAWN),
      };
      result.jevClaimP = useJev ? jevCache.get(claim) ?? null : null;
      result.historyPreserved = (await readFile(manager.getSessionFile(), 'utf8')).startsWith(saved);
      result.pass = result.submissions.some(s => s.pass);
      result.firstSubmissionPass = result.submissions[0]?.pass ?? false;
      result.requestsToPass = result.pass ? result.requests.length : null;
      result.reads = result.toolCalls.filter(t => t.name === 'read').length;
    } catch (error) { result.errors.push(error.message); result.pass = false; }
    finally {
      if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' }); session.dispose(); }
      if (server?.listening) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
      await rm(root, { recursive: true, force: true });
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally {
  const total = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
  for (const a of report.arms) {
    a.usage = { ...total, prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    for (const r of a.requests) { const u = usageFromResponse(r.response); for (const k of Object.keys(a.usage)) a.usage[k] += u[k]; }
    for (const k of Object.keys(total)) total[k] += a.usage[k];
  }
  report.usage = total;
  report.spendUsdPeak = (total.prompt_tokens * 0.44 + total.completion_tokens * 1.32) / 1e6;
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (live) await writeFile(spentFile, JSON.stringify({ usd: spent + report.spendUsdPeak }));
}
console.log(JSON.stringify({ output, task: task.id, rep, spendUsdPeak: report.spendUsdPeak, arms: report.arms.map(({ arm, pass, firstSubmissionPass, requestsToPass, reads, initialEvidence, jevClaimP, errors, submissions }) => ({ arm, pass, firstSubmissionPass, requestsToPass, reads, staleFirst: submissions[0]?.staleDerived, initialEvidence, jevClaimP, errors })) }, null, 1));

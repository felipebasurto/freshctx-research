// E10: E9 setup; tail withdrawal chosen by Jev vs a deterministic rule, on stale and control items. See PROTOCOL-E10.md. Derived from e9_run.mjs.
//   FRESHCTX_PRODUCT=... FRESHCTX_PRODUCT_SHA=... TYPESAFE_API_KEY=... node labs/jev-stale-view-v1/e10_run.mjs --item=e10s-08 --rep=0 [--live]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const live = process.argv.includes('--live');
const rep = Number(arg('rep') ?? 0);
const promptMode = 'neutral', readMode = 'cleared';
assert.ok(['current', 'neutral'].includes(promptMode), '--prompt=current|neutral');
assert.ok(['cleared', 'removed'].includes(readMode), '--read=cleared|removed');
const cell = `${promptMode}-${readMode}`;
const LAB = resolve('labs/jev-stale-view-v1');
const items = JSON.parse(await readFile(join(LAB, 'results/e10_items.json'), 'utf8'));
const itemIndex = items.findIndex(i => i.id === arg('item'));
const item = items[itemIndex];
assert.ok(item, 'unknown --item');
const product = resolve(process.env.FRESHCTX_PRODUCT);
const piRoot = join(product, 'bridges/pi/node_modules/@earendil-works/pi-coding-agent');
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(join(piRoot, 'dist/index.js')));

const MODEL = 'deepseek-v4-flash', TEMPERATURE = 0, MAX_TOKENS = 512, MAX_REQUESTS = 8, MAX_BYTES = 64000, MAX_SUBMISSIONS = 2, CAP_USD = 2;
const outDir = join(LAB, 'results/e10'); await mkdir(outDir, { recursive: true });
const spentFile = join(outDir, '.spent.json');
let spent = 0; try { spent = JSON.parse(await readFile(spentFile, 'utf8')).usd; } catch { /* first run */ }
if (live && spent >= CAP_USD) throw new Error(`Spend cap reached: ${spent}`);

const file = item.file;
// Fixed mechanical rewrite (PROTOCOL-E8b.md); nothing else changes in the question.
const neutralQuestion = q => q
  .replace(/^In the current code, is /, 'Is ')
  .replace(/\bthe current code\b/g, 'the code')
  .replace(/\bthe current (\S+)/g, 'the $1')
  .replace(/ currently\b/g, '')
  .replace(/ still\b/g, '');
const question = promptMode === 'current' ? item.question : neutralQuestion(item.question);
const prompt = promptMode === 'current'
  ? `Answer this question about the current code in ${file}: ${question} You may read any required code. Return only a JSON object with the boolean field answer.`
  : `Answer this question about ${file}: ${question} Return only a JSON object with the boolean field answer.`;
const retryPrompt = 'The external checker rejected your answer. Inspect the current workspace as needed and return only a JSON object with the boolean field answer.';
const seedPrompt = `Read ${file}, then summarise what you found.`;
const claim = item.claim;
const beforeOnly = item.before.split('\n').find(l => l.trim() && !item.after.split('\n').includes(l));
const afterOnly = item.after.split('\n').find(l => l.trim() && !item.before.split('\n').includes(l));

function parseBool(text) {
  const raw = String(text ?? ''); const cands = [raw.trim(), ...[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1].trim())];
  for (const c of cands) { try { const p = JSON.parse(c); if (p && typeof p === 'object' && typeof p.answer === 'boolean') return p.answer; } catch { /* next */ } }
  return null;
}

// ---- Jev (E2 Noul, frozen) ----
const E2_Q = 'Does `statement` make a concrete claim about the code in `file` that was true before the edit but is false after it?';
const E2_CRIT = { true: 'statement describes code, lines, names or behaviour that the edit removed or changed, so the statement is now outdated', false: 'statement is a plan, a runtime observation, about another file, or still accurate after the edit' };
const WITHDRAWN = `[FreshCtx: an earlier note about ${file} was withdrawn because the file changed after it was written.]`;
const TAIL = `\n\n[FreshCtx: your earlier note about ${file} is withdrawn because the file changed after it was written. Do not rely on it.]`;
const CLEARED = '[tool result cleared to save context]';
async function jevScores(texts) {
  const questions = Object.fromEntries(texts.map((t, k) => [`q${k}`, { type: 'noul', instructions: { statement: t, question: E2_Q }, criteria: E2_CRIT }]));
  const t0 = Date.now();
  const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ state: { file: item.path, edit_diff: item.diff }, model: 'jev-1.13.0', questions }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Jev HTTP ${r.status}`);
  const j = await r.json();
  return { p: texts.map((_, k) => j.answers[`q${k}`].noul), ms: Date.now() - t0, tokens: j.usage.input_tokens };
}

function scripted(res, delta, finish) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const choice of [{ delta, finish_reason: null }, { delta: {}, finish_reason: finish }]) res.write('data: ' + JSON.stringify({ id: 'controlled-seed', object: 'chat.completion.chunk', created: 1, model: MODEL, choices: [{ index: 0, ...choice }] }) + '\n\n');
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

let key;
if (live) key = JSON.parse(await readFile(join(homedir(), '.pi/agent/auth.json'))).deepseek?.key;
const ARMS = ['B_claim', 'E_tail', 'E_tail_rule'];
const shift = itemIndex + rep;
const order = ARMS.map((_, i) => ARMS[(i + shift) % ARMS.length]);
const output = join(outDir, `${live ? 'live' : 'dry'}-${cell}-${item.id}-rep${rep}-${Date.now()}.json`);
await writeFile(output, '', { flag: 'wx' });
const report = {
  schema: 1, experiment: 'E10', kind: item.kind, tail: TAIL, cell, promptMode, readMode, bridge: 'none (Pi native read)', cleared: CLEARED, startedAt: new Date().toISOString(), mode: live ? 'real-model' : 'dry-scripted', item: item.id, source: item.source, rep, order,
  question, originalQuestion: item.question, gold: item.gold, prompt, model: MODEL, node: process.version,
  pi: JSON.parse(await readFile(join(piRoot, 'package.json'))).version,
  productSha: process.env.FRESHCTX_PRODUCT_SHA, researchSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  itemsSha256: createHash('sha256').update(await readFile(join(LAB, 'results/e10_items.json'))).digest('hex'),
  runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  arms: [],
};

try {
  for (const arm of order) {
    const withClaim = true, useJev = arm === 'E_tail';
    const root = await mkdtemp(join(tmpdir(), 'freshctx-e10-'));
    const agentDir = join(root, 'agent'); await mkdir(agentDir);
    const result = { arm, seedRequests: 0, requests: [], submissions: [], toolCalls: [], errors: [], jev: null, warm: null };
    report.arms.push(result);
    let phase = 'seed', session, server;
    const jevCache = new Map();
    try {
      await writeFile(join(root, file), item.before);
      server = createServer(async (req, res) => {
        try {
          let body = ''; for await (const c of req) body += c;
          const payload = JSON.parse(body);
          if (phase === 'seed') {
            const n = result.seedRequests++;
            if (n === 0) return scripted(res, { role: 'assistant', tool_calls: [{ index: 0, id: 'seed_0', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: file }) } }] }, 'tool_calls');
            return scripted(res, { role: 'assistant', content: withClaim ? claim : 'Ready.' }, 'stop');
          }
          if (result.requests.length >= MAX_REQUESTS) throw new Error('Post-resume request cap reached');
          // Clear (content -> placeholder) or remove (both halves of the pair) the seeded read in the outgoing copy; the saved session is not touched.
          const seedResults = payload.messages.filter(x => x.role === 'tool' && x.tool_call_id === 'seed_0');
          if (seedResults.length !== 1) throw new Error(`Expected one seed tool result, found ${seedResults.length}`);
          if (readMode === 'cleared') seedResults[0].content = CLEARED;
          else {
            const seedCalls = payload.messages.filter(x => x.role === 'assistant' && x.tool_calls?.some(t => t.id === 'seed_0'));
            if (seedCalls.length !== 1 || seedCalls[0].tool_calls.length !== 1 || (typeof seedCalls[0].content === 'string' && seedCalls[0].content.trim())) throw new Error('Unexpected seed tool-call message');
            payload.messages = payload.messages.filter(x => x !== seedCalls[0] && x !== seedResults[0]);
          }
          const textOf = m => typeof m.content === 'string' ? m.content : (m.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('');
          const claimMsgs = payload.messages.filter(x => x.role === 'assistant' && textOf(x) === claim);
          if (claimMsgs.length !== 1) throw new Error(`Expected one claim message, found ${claimMsgs.length}`);
          const claimIdx = payload.messages.indexOf(claimMsgs[0]);
          // Warm-up: the pre-edit outgoing history up to the claim, sent once so the provider has it cached (PROTOCOL-E9.md).
          if (!result.warm) {
            const warm = { ...payload, messages: [...structuredClone(payload.messages.slice(0, claimIdx + 1)), { role: 'user', content: 'Continue.' }], model: MODEL, temperature: TEMPERATURE, max_tokens: 1, thinking: { type: 'disabled' }, stream: true, stream_options: { include_usage: true } };
            delete warm.max_completion_tokens;
            result.warm = { claimMessage: JSON.stringify(payload.messages[claimIdx]), messages: warm.messages.length };
            if (live) {
              const wr = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(warm), signal: AbortSignal.timeout(60000) });
              result.warm.status = wr.status; result.warm.usage = usageFromResponse(await wr.text());
              await new Promise(r => setTimeout(r, 1500));
            }
          }
          let apply = arm === 'E_tail_rule';
          if (useJev) {
            if (!jevCache.has(claim)) {
              const r = await jevScores([claim]);
              jevCache.set(claim, r.p[0]);
              result.jev = [...(result.jev ?? []), { n: 1, ms: r.ms, tokens: r.tokens }];
            }
            apply = jevCache.get(claim) >= 0.5;
          }
          if (apply) {
            const q = payload.messages.slice(claimIdx + 1).find(x => x.role === 'user' && textOf(x).includes(prompt));
            if (!q) throw new Error('Question user message not found');
            if (typeof q.content === 'string') q.content += TAIL;
            else { const parts = q.content.filter(c => c.type === 'text'); parts.at(-1).text += TAIL; }
          }
          payload.model = MODEL; payload.temperature = TEMPERATURE; payload.max_tokens = MAX_TOKENS;
          delete payload.max_completion_tokens; payload.thinking = { type: 'disabled' }; payload.stream_options = { include_usage: true };
          const serialized = JSON.stringify(payload);
          if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Request byte cap reached');
          const entry = { index: result.requests.length + 1, bytes: Buffer.byteLength(serialized), payload };
          result.requests.push(entry);
          if (live) {
            const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: serialized, signal: AbortSignal.timeout(60000) });
            entry.status = response.status; entry.response = await response.text();
            res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'text/event-stream' });
            return res.end(entry.response);
          }
          return scripted(res, { role: 'assistant', content: JSON.stringify({ answer: !item.gold }) }, 'stop');
        } catch (error) { result.errors.push(error.message); res.writeHead(500); res.end('Harness request rejected'); }
      });
      await new Promise((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });
      const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, modelsStorePath: join(agentDir, 'models.json'), refreshOnCreate: false });
      modelRuntime.registerProvider('paired', { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'loopback-only', models: [{ id: MODEL, name: MODEL, reasoning: false, input: ['text'], cost: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0.44 }, contextWindow: 32000, maxTokens: MAX_TOKENS }] });
      const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
      const open = async manager => {
        const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: [], extensionFactories: [pi => { pi.on('tool_call', e => { if (phase !== 'seed') result.toolCalls.push({ name: e.toolName, input: e.input }); }); }] });
        await loader.reload();
        assert.deepEqual(loader.getExtensions().errors, []);
        const { session: s } = await createAgentSession({ cwd: root, agentDir, modelRuntime, model: modelRuntime.getModel('paired', MODEL), thinkingLevel: 'off', tools: ['read'], resourceLoader: loader, sessionManager: manager, settingsManager });
        await s.bindExtensions({ onError: e => result.errors.push(String(e.message ?? e)) });
        return s;
      };
      const manager = SessionManager.create(root, join(root, 'sessions'));
      session = await open(manager);
      await session.prompt(seedPrompt);
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' }); session.dispose(); session = null;
      const saved = await readFile(manager.getSessionFile(), 'utf8');
      assert.ok(saved.includes(JSON.stringify(item.before.split('\n').find(l => l.trim())).slice(1, -1)), 'seed read must contain the pre-edit code');
      assert.equal(saved.includes(JSON.stringify(claim).slice(1, -1)), withClaim);
      await writeFile(join(root, file), item.after);
      phase = 'measurement';
      session = await open(SessionManager.open(manager.getSessionFile()));
      for (let attempt = 0; attempt < MAX_SUBMISSIONS; attempt++) {
        await session.prompt(attempt === 0 ? prompt : retryPrompt);
        const last = session.messages.at(-1);
        const answer = last.content?.filter(c => c.type === 'text').map(c => c.text).join('') ?? '';
        const parsed = parseBool(answer);
        const pass = last.stopReason === 'stop' && parsed === item.gold;
        result.submissions.push({ attempt: attempt + 1, answer, parsed, pass, staleDerived: parsed === !item.gold, stopReason: last.stopReason, error: last.errorMessage, requests: result.requests.length, toolCalls: result.toolCalls.length });
        if (pass || last.stopReason !== 'stop') break;
      }
      const first = JSON.stringify(result.requests[0]?.payload.messages ?? []);
      const esc = s => JSON.stringify(s).slice(1, -1);
      const has = s => s != null && first.includes(esc(s));
      const outsideClaim = first.split(esc(claim)).join('');
      const fileLines = [...new Set([...item.before.split('\n'), ...item.after.split('\n')].map(l => l.trim()).filter(l => l.length >= 12))];
      const seedMsg = result.requests[0]?.payload.messages.find(x => x.role === 'tool' && x.tool_call_id === 'seed_0');
      result.initialEvidence = {
        seedCleared: seedMsg?.content === CLEARED, seedRemoved: !seedMsg && !first.includes('seed_0'),
        staleCode: has(beforeOnly), staleCodeOutsideClaim: beforeOnly != null && outsideClaim.includes(esc(beforeOnly)),
        currentCode: has(afterOnly), fileLinesOutsideClaim: fileLines.filter(l => outsideClaim.includes(esc(l))),
        claimPresent: has(claim), withdrawn: has(WITHDRAWN), tailApplied: has(TAIL.trim()),
        claimMessageAsWarm: JSON.stringify(result.requests[0]?.payload.messages.find(x => x.role === 'assistant' && (typeof x.content === 'string' ? x.content : '') === claim) ?? null) === result.warm?.claimMessage,
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
    a.usage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    for (const r of a.requests) { const u = usageFromResponse(r.response); r.usage = u; for (const k of Object.keys(a.usage)) a.usage[k] += u[k]; }
    for (const k of Object.keys(total)) total[k] += a.usage[k] + (a.warm?.usage?.[k] ?? 0);
  }
  report.usage = total;
  report.spendUsdPeak = (total.prompt_tokens * 0.44 + total.completion_tokens * 1.32) / 1e6;
  report.spendUsdCached = (total.prompt_cache_hit_tokens * 0.014 + total.prompt_cache_miss_tokens * 0.44 + total.completion_tokens * 1.32) / 1e6;
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (live) await writeFile(spentFile, JSON.stringify({ usd: spent + report.spendUsdPeak }));
}
console.log(JSON.stringify({ cell, kind: item.kind, item: item.id, rep, spend: report.spendUsdPeak, arms: report.arms.map(({ arm, firstSubmissionPass, pass, reads, initialEvidence, jevClaimP, errors, warm, requests }) => ({ arm, firstSubmissionPass, pass, reads, initialEvidence, jevClaimP, errors, warm: warm?.usage, first: requests[0]?.usage })) }));

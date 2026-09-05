import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expected, score } from './checker.mjs';

const directory = new URL('./', import.meta.url);
const argTask = process.argv.find(a => a.startsWith('--task='))?.slice('--task='.length);
const taskUrl = argTask || process.env.FRESHCTX_TASK
  ? pathToFileURL(resolve(argTask ?? process.env.FRESHCTX_TASK))
  : new URL('./tasks/rate-constant-v1.json', directory);
const taskBytes = await readFile(taskUrl);
const task = JSON.parse(taskBytes);
const expression = task.expression ?? 'total(3) + fee(3)';
const iso = task.isolation ?? {
  observedPath: 'price.js',
  unreadPath: 'fees.js',
  staleObserved: 'quantity * 10',
  currentObserved: 'quantity * 20',
  unreadBodies: ['quantity + 11', 'quantity + 7'],
};
const product = resolve(process.env.FRESHCTX_PRODUCT ?? '../official');
const piRoot = join(product, 'bridges/pi/node_modules/@earendil-works/pi-coding-agent');
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(join(piRoot, 'dist/index.js')));
const live = process.argv.includes('--live');
if (live && !(Number(process.env.FRESHCTX_APPROVED_USD) >= 5)) throw new Error('Live run requires explicit user authorization of up to $5 and FRESHCTX_APPROVED_USD=5');
const output = resolve(process.env.FRESHCTX_RESULT ?? `labs/pi-outcome-v1/${live ? 'live' : 'fixture'}-${Date.now()}.json`);
// Reserve the destination before any provider call. Never overwrite a previous attempt.
await writeFile(output, '', { flag: 'wx' });
const report = {
  schema: 1, startedAt: new Date().toISOString(), mode: live ? 'real-model' : 'scripted-validation-no-LLM',
  task: task.id, N: task.N, modelRequested: task.model, node: process.version,
  pi: JSON.parse(await readFile(join(piRoot, 'package.json'))).version,
  productSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: product, encoding: 'utf8' }).trim(),
  researchSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  taskPath: taskUrl.pathname,
  taskSha256: createHash('sha256').update(taskBytes).digest('hex'),
  checkerSha256: createHash('sha256').update(await readFile(new URL('checker.mjs', directory))).digest('hex'),
  runnerSha256: createHash('sha256').update(await readFile(new URL('run.mjs', directory))).digest('hex'),
  limits: { requestsPerArm: task.maxRequestsPerArm, requestBytes: task.maxRequestBytes, outputTokens: task.maxTokens, approvedUsd: live ? Number(process.env.FRESHCTX_APPROVED_USD) : 0 },
  pricingReference: 'https://api-docs.deepseek.com/quick_start/pricing/',
  spendingGuard: 'At most 16 live requests, each <=64000 serialized UTF-8 bytes and <=512 output tokens. Conservative input reserve 128000 tokens/request at peak $0.44/M plus output $1.32/M: $0.9129344 total. Cap $5. No automatic retries. Pricing snapshot 2026-09-05. This is a preflight reserve, not measured billing.',
  arms: [],
};
let key;
if (live) {
  const auth = JSON.parse(await readFile(join(homedir(), '.pi/agent/auth.json')));
  key = auth.deepseek?.key;
  assert.equal(typeof key, 'string', 'Configured DeepSeek API key required');
}
function scripted(res, delta, finish) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const choice of [{ delta, finish_reason: null }, { delta: {}, finish_reason: finish }]) res.write('data: ' + JSON.stringify({ id: 'controlled-seed', object: 'chat.completion.chunk', created: 1, model: task.model, choices: [{ index: 0, ...choice }] }) + '\n\n');
  res.end('data: [DONE]\n\n');
}
function seedPrompt() {
  const parts = task.seedReads.map(read => read.offset === 1 && read.limit === 1
    ? `only line 1 of ${read.path}`
    : `lines ${read.offset}-${read.offset + read.limit - 1} of ${read.path}`);
  return `Read ${parts.join(' and ')}, then say Ready.`;
}
function evidenceText(payload) {
  return payload.messages.filter(m => m.role === 'tool' || m.role === 'user').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
}
function filesFromEvidence(evidence) {
  const files = { ...task.after };
  if (evidence.includes(iso.staleObserved) && !evidence.includes(iso.currentObserved)) files[iso.observedPath] = task.before[iso.observedPath];
  return files;
}
function usageFromResponse(text) {
  const empty = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
  if (!text) return empty;
  let usage = empty;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: {')) continue;
    try {
      const chunk = JSON.parse(line.slice(6));
      if (!chunk.usage) continue;
      const hit = chunk.usage.prompt_cache_hit_tokens ?? chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
      const prompt = chunk.usage.prompt_tokens ?? 0;
      usage = {
        prompt_tokens: prompt,
        completion_tokens: chunk.usage.completion_tokens ?? 0,
        prompt_cache_hit_tokens: hit,
        prompt_cache_miss_tokens: chunk.usage.prompt_cache_miss_tokens ?? Math.max(0, prompt - hit),
      };
    } catch { /* skip malformed SSE */ }
  }
  return usage;
}
try {
  for (const arm of task.armOrder) {
    const root = await mkdtemp(join(tmpdir(), 'freshctx-outcome-'));
    const agentDir = join(root, 'agent');
    await mkdir(agentDir);
    const result = { arm, seedRequests: 0, requests: [], submissions: [], toolCalls: [], errors: [] };
    report.arms.push(result);
    let phase = 'seed';
    let session;
    let server;
    try {
      for (const [path, body] of Object.entries(task.before)) await writeFile(join(root, path), body);
      server = createServer(async (req, res) => {
        try {
          let body = '';
          for await (const chunk of req) body += chunk;
          const payload = JSON.parse(body);
          if (phase === 'seed') {
            const n = result.seedRequests++;
            if (n === 0) return scripted(res, { role: 'assistant', tool_calls: task.seedReads.map((args, index) => ({ index, id: `seed_${index}`, type: 'function', function: { name: 'read', arguments: JSON.stringify(args) } })) }, 'tool_calls');
            assert.equal(n, 1);
            return scripted(res, { role: 'assistant', content: 'Ready.' }, 'stop');
          }
          if (result.requests.length >= task.maxRequestsPerArm) throw new Error('Post-resume request cap reached');
          payload.model = task.model;
          payload.temperature = task.temperature;
          payload.max_tokens = task.maxTokens;
          delete payload.max_completion_tokens;
          payload.thinking = { type: 'disabled' };
          payload.stream_options = { include_usage: true };
          const serialized = JSON.stringify(payload);
          if (Buffer.byteLength(serialized) > task.maxRequestBytes) throw new Error('Request byte cap reached');
          const entry = { index: result.requests.length + 1, bytes: Buffer.byteLength(serialized), payload };
          result.requests.push(entry);
          if (live) {
            const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: serialized, signal: AbortSignal.timeout(60000) });
            entry.status = response.status;
            entry.response = await response.text();
            res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'text/event-stream' });
            return res.end(entry.response);
          }
          // Fixture policy tests checker feedback and permitted rereads, not intelligence.
          const evidence = evidenceText(payload);
          const retry = payload.messages.some(m => JSON.stringify(m.content).includes(task.retryPrompt));
          const hasUnread = iso.unreadBodies.some(needle => evidence.includes(needle));
          const path = !hasUnread ? iso.unreadPath : retry && evidence.includes(iso.staleObserved) && !evidence.includes(iso.currentObserved) ? iso.observedPath : null;
          if (path) return scripted(res, { role: 'assistant', tool_calls: [{ index: 0, id: `fixture_${entry.index}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path }) } }] }, 'tool_calls');
          return scripted(res, { role: 'assistant', content: JSON.stringify({ answer: expected(filesFromEvidence(evidence), expression) }) }, 'stop');
        } catch (error) {
          result.errors.push(error.message);
          res.writeHead(500); res.end('Harness request rejected');
        }
      });
      await new Promise((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });
      const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, modelsStorePath: join(agentDir, 'models.json'), refreshOnCreate: false });
      modelRuntime.registerProvider('paired', { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'loopback-only', models: [{ id: task.model, name: task.model, reasoning: false, input: ['text'], cost: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0.44 }, contextWindow: 32000, maxTokens: task.maxTokens }] });
      const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
      const open = async manager => {
        const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: arm === 'withFreshCtx' ? [join(product, 'bridges/pi/extension.js')] : [], extensionFactories: [pi => { pi.on('tool_call', e => { if (phase !== 'seed') result.toolCalls.push({ name: e.toolName, input: e.input }); }); }] });
        await loader.reload();
        assert.deepEqual(loader.getExtensions().errors, []);
        const { session: s } = await createAgentSession({ cwd: root, agentDir, modelRuntime, model: modelRuntime.getModel('paired', task.model), thinkingLevel: 'off', tools: ['read'], resourceLoader: loader, sessionManager: manager, settingsManager });
        await s.bindExtensions({ onError: e => result.errors.push(String(e.message ?? e)) });
        return s;
      };
      const manager = SessionManager.create(root, join(root, 'sessions'));
      session = await open(manager);
      await session.prompt(seedPrompt());
      assert.equal(result.seedRequests, 2);
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' }); session.dispose(); session = null;
      const saved = await readFile(manager.getSessionFile(), 'utf8');
      assert.ok(saved.includes(iso.staleObserved));
      for (const needle of iso.unreadBodies) assert.ok(!saved.includes(needle), 'Header read must not seed unread function');
      for (const [path, body] of Object.entries(task.after)) await writeFile(join(root, path), body);
      phase = 'measurement';
      session = await open(SessionManager.open(manager.getSessionFile()));
      for (let attempt = 0; attempt < task.maxSubmissions; attempt++) {
        await session.prompt(attempt === 0 ? task.prompt : task.retryPrompt);
        const last = session.messages.at(-1);
        const answer = last.content?.filter(c => c.type === 'text').map(c => c.text).join('') ?? '';
        const files = Object.fromEntries(await Promise.all(Object.keys(task.after).map(async p => [p, await readFile(join(root, p), 'utf8')])));
        const pass = last.stopReason === 'stop' && score(answer, files, expression);
        result.submissions.push({ attempt: attempt + 1, answer, pass, stopReason: last.stopReason, error: last.errorMessage, requests: result.requests.length, toolCalls: result.toolCalls.length });
        if (pass || last.stopReason !== 'stop') break;
      }
      const firstEvidence = JSON.stringify(result.requests[0]?.payload.messages.filter(m => m.role === 'tool' || m.role === 'user'));
      result.initialEvidence = {
        staleObserved: firstEvidence.includes(iso.staleObserved),
        currentObserved: firstEvidence.includes(iso.currentObserved),
        unreadBodyExposed: iso.unreadBodies.some(needle => firstEvidence.includes(needle)),
      };
      assert.equal(result.initialEvidence.unreadBodyExposed, false, 'Unread body leaked');
      assert.equal(result.initialEvidence.currentObserved, arm === 'withFreshCtx');
      assert.equal(result.initialEvidence.staleObserved, arm !== 'withFreshCtx');
      result.historyPreserved = (await readFile(manager.getSessionFile(), 'utf8')).startsWith(saved);
      assert.ok(result.historyPreserved);
      result.pass = result.submissions.some(s => s.pass);
      result.firstSubmissionPass = result.submissions[0]?.pass ?? false;
      result.requestsToPass = result.pass ? result.requests.length : null;
    } catch (error) { result.errors.push(error.message); result.pass = false; }
    finally {
      if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' }); session.dispose(); }
      if (server?.listening) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
      await rm(root, { recursive: true, force: true });
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally {
  const usage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
  for (const arm of report.arms) {
    arm.usage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    for (const request of arm.requests) {
      const parsed = usageFromResponse(request.response);
      for (const key of Object.keys(arm.usage)) arm.usage[key] += parsed[key];
    }
    for (const key of Object.keys(usage)) usage[key] += arm.usage[key];
  }
  report.usage = usage;
  report.spendUsdPeak = (usage.prompt_tokens * 0.44 + usage.completion_tokens * 1.32) / 1e6;
  report.spendUsdCache = (usage.prompt_cache_hit_tokens * 0.014 + usage.prompt_cache_miss_tokens * 0.44 + usage.completion_tokens * 1.32) / 1e6;
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({
  output, mode: report.mode, task: report.task,
  spendUsdPeak: report.spendUsdPeak, spendUsdCache: report.spendUsdCache,
  arms: report.arms.map(({ arm, pass, firstSubmissionPass, requestsToPass, initialEvidence, errors }) => ({ arm, pass, firstSubmissionPass, requestsToPass, initialEvidence, errors })),
}, null, 2));
if (report.arms.some(a => a.errors.length)) process.exitCode = 1;
if (live && report.spendUsdPeak > 5) process.exitCode = 1;

if (!live) {
  assert.deepEqual(report.arms.map(a => [a.pass, a.firstSubmissionPass, a.requestsToPass, a.toolCalls.length]), [[true, false, 4, 2], [true, true, 2, 1]], 'Scripted regression must exercise failure, reread, correction, and FreshCtx current bytes');
}

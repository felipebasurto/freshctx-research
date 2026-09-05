import { runInNewContext } from 'node:vm';

export function expected(files, expression = 'total(3) + fee(3)') {
  return runInNewContext(Object.values(files).join('\n') + '\n' + expression, {}, { timeout: 100 });
}

export function parseAnswer(text) {
  const raw = String(text ?? '');
  const candidates = [raw.trim()];
  for (const match of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.push(match[1].trim());
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && typeof parsed.answer === 'number' && Number.isFinite(parsed.answer)) {
        return parsed;
      }
    } catch { /* try the next candidate */ }
  }
  return null;
}

export function score(text, files, expression) {
  try {
    const parsed = parseAnswer(text);
    return parsed !== null && parsed.answer === expected(files, expression);
  } catch {
    return false;
  }
}

import { runInNewContext } from 'node:vm';
export function expected(files) {
  return runInNewContext(files['price.js'] + '\n' + files['fees.js'] + '\ntotal(3) + fee(3)', {}, { timeout: 100 });
}
export function score(text, files) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed.answer === 'number' && parsed.answer === expected(files);
  } catch { return false; }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { archiveLogLines, recoverArchive } from './ci-report-log.mjs';

const sourceSha = 'a'.repeat(40);

test('numbered log transport recovers rich binary evidence with runner timestamps', () => {
  const bytes = randomBytes(32 * 1024 + 17);
  const lines = [...archiveLogLines(bytes, sourceSha)];
  const log = ['ordinary runner output', ...lines.map(line => `2026-10-29T12:00:00.000Z ${line}`), 'done'].join('\r\n');
  assert.deepEqual(recoverArchive(log, sourceSha).archive, bytes);
});

test('missing, reordered and duplicated chunks or incomplete logs never recover silently', () => {
  const lines = [...archiveLogLines(randomBytes(20 * 1024), sourceSha)];
  for (const broken of [
    lines.filter((_, index) => index !== 2),
    [lines[0], lines[2], lines[1], ...lines.slice(3)],
    [lines[0], lines[1], lines[1], ...lines.slice(2)],
    lines.slice(0, -1),
  ]) assert.throws(() => recoverArchive(broken.join('\n'), sourceSha));
});

test('content corruption, masking and a different source commit are rejected', () => {
  const lines = [...archiveLogLines(Buffer.from('trace bytes and JSON failure evidence'), sourceSha)];
  assert.throws(() => recoverArchive(lines.join('\n'), 'b'.repeat(40)), /source SHA/);
  const corrupt = [...lines];
  corrupt[1] = corrupt[1].replace(/DATA 0 ./, 'DATA 0 A');
  assert.throws(() => recoverArchive(corrupt.join('\n'), sourceSha), /checksum/);
  const redacted = [...lines];
  redacted[1] = redacted[1].replace(/DATA 0 .+/, 'DATA 0 ***');
  assert.throws(() => recoverArchive(redacted.join('\n'), sourceSha), /base64/);
});

test('real CLI retains HTML, JSON and a binary trace; decoder refuses to overwrite', t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, 'quantumfire-log-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), tempRoot);
    assert.ok(path.basename(root).startsWith('quantumfire-log-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'playwright-report/data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test-results'));
  const trace = randomBytes(8193);
  const html = '<html>assertion failed</html>';
  const json = JSON.stringify({ suites: [{ errors: [{ message: 'expected 42, received 41', stack: 'at assertion' }] }] });
  fs.writeFileSync(path.join(root, 'playwright-report/index.html'), html);
  fs.writeFileSync(path.join(root, 'playwright-report/data/trace.zip'), trace);
  fs.writeFileSync(path.join(root, 'test-results/ci-results.json'), json);
  const script = fileURLToPath(new URL('./ci-report-log.mjs', import.meta.url));
  const emitted = spawnSync(process.execPath, [script, 'emit'], {
    cwd: root, env: { ...process.env, GITHUB_SHA: sourceSha, GITHUB_STEP_SUMMARY: '' }, encoding: 'utf8',
  });
  assert.equal(emitted.status, 0, emitted.stderr);
  const logFile = path.join(root, 'downloaded-step.txt');
  fs.writeFileSync(logFile, emitted.stdout);
  const recovered = path.join(root, 'recovered.tar.gz');
  const args = [script, 'recover', logFile, recovered, sourceSha];
  const decoded = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(decoded.status, 0, decoded.stderr);
  const extracted = path.join(root, 'extracted');
  fs.mkdirSync(extracted);
  const unpack = spawnSync('tar', ['-xzf', recovered, '-C', extracted], { encoding: 'utf8' });
  assert.equal(unpack.status, 0, unpack.stderr);
  assert.deepEqual(fs.readFileSync(path.join(extracted, 'playwright-report/data/trace.zip')), trace);
  assert.equal(fs.readFileSync(path.join(extracted, 'playwright-report/index.html'), 'utf8'), html);
  assert.equal(fs.readFileSync(path.join(extracted, 'test-results/ci-results.json'), 'utf8'), json);
  assert.equal(JSON.parse(fs.readFileSync(path.join(extracted, 'manifest.json'))).mode, 'complete');
  const previous = fs.readFileSync(recovered);
  assert.notEqual(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
  assert.deepEqual(fs.readFileSync(recovered), previous);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { MAX_ARCHIVE_BYTES, MAX_UPLOAD_BYTES, packageReport } from './package-ci-report.mjs';

function fixture(t, { attachmentBytes = 100, errorBytes = 0 } = {}) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, 'quantumfire-report-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('quantumfire-report-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'playwright-report/data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test-results'));
  fs.writeFileSync(path.join(root, 'playwright-report/index.html'), '<html>failed assertion and source context</html>');
  fs.writeFileSync(path.join(root, 'playwright-report/data/trace.zip'), randomBytes(attachmentBytes));
  const report = { suites: [{ tests: [{ results: [{ status: 'failed', errors: [{ message: 'Expected 42, received 41', stack: randomBytes(errorBytes).toString('hex') }] }] }] }] };
  fs.writeFileSync(path.join(root, 'test-results/ci-results.json'), JSON.stringify(report));
  return { root, report };
}

function extract(root, archive) {
  const destination = path.join(root, 'extracted');
  fs.mkdirSync(destination);
  const result = spawnSync('tar', ['-xzf', archive, '-C', destination], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return destination;
}

test('ordinary failure evidence includes all metadata and rich attachments within the upload bound', async t => {
  const { root, report } = fixture(t);
  const result = await packageReport({ root, log: () => {} });
  assert.equal(result.mode, 'complete');
  assert.equal(result.overBudget, false);
  assert.ok(result.bytes <= MAX_ARCHIVE_BYTES);
  assert.ok(MAX_ARCHIVE_BYTES + 64 * 1024 <= MAX_UPLOAD_BYTES);
  const extracted = extract(root, result.archive);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extracted, 'test-results/ci-results.json'))), report);
  assert.equal(fs.statSync(path.join(extracted, 'playwright-report/data/trace.zip')).size, 100);
});

test('oversized rich traces preserve every essential failure record and surface a budget failure', async t => {
  const { root, report } = fixture(t, { attachmentBytes: 128 * 1024 });
  const result = await packageReport({ root, maxArchiveBytes: 4096, log: () => {} });
  assert.equal(result.mode, 'essential-only');
  assert.equal(result.overBudget, true);
  assert.ok(result.bytes <= 4096);
  const extracted = extract(root, result.archive);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extracted, 'test-results/ci-results.json'))), report);
  assert.ok(fs.existsSync(path.join(extracted, 'playwright-report/index.html')));
  const manifest = JSON.parse(fs.readFileSync(path.join(extracted, 'manifest.json')));
  assert.deepEqual(manifest.omitted, ['playwright-report/data/trace.zip']);
  assert.match(manifest.originalFiles.find(file => file.path.endsWith('trace.zip')).sha256, /^[a-f0-9]{64}$/);
});

test('oversized essential evidence is emitted completely to logs and never uploaded above the bound', async t => {
  const { root, report } = fixture(t, { errorBytes: 64 * 1024 });
  const logs = [];
  const result = await packageReport({ root, maxArchiveBytes: 4096, log: message => logs.push(message) });
  assert.equal(result.mode, 'job-log-and-manifest');
  assert.equal(result.overBudget, true);
  assert.ok(result.bytes <= 4096);
  assert.ok(logs.includes(JSON.stringify(report)));
  const manifest = JSON.parse(fs.readFileSync(path.join(extract(root, result.archive), 'manifest.json')));
  assert.match(manifest.essentialEvidence, /job log/);
});

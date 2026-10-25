import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
// Leave room for upload-artifact's uncompressed, single-file ZIP envelope.
export const MAX_ARCHIVE_BYTES = MAX_UPLOAD_BYTES - 64 * 1024;

function inside(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Report path escapes the checkout: ${target}`);
  }
  return target;
}

async function inventory(root, directory) {
  if (!fs.existsSync(directory)) return [];
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`Report directory cannot be a symlink: ${directory}`);
  inside(root, fs.realpathSync(directory));
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = inside(root, path.join(directory, entry.name));
    if (entry.isSymbolicLink()) throw new Error(`Report symlink is not allowed: ${absolute}`);
    if (entry.isDirectory()) files.push(...await inventory(root, absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export async function packageReport({
  root = process.cwd(),
  maxArchiveBytes = MAX_ARCHIVE_BYTES,
  log = message => process.stderr.write(`${message}\n`),
} = {}) {
  root = fs.realpathSync(root);
  const reportDirectory = inside(root, path.join(root, 'playwright-report'));
  const resultsDirectory = inside(root, path.join(root, 'test-results'));
  fs.mkdirSync(resultsDirectory, { recursive: true });
  inside(root, fs.realpathSync(resultsDirectory));
  const stage = fs.mkdtempSync(path.join(resultsDirectory, 'ci-report-stage-'));
  const uploadDirectory = inside(root, path.join(resultsDirectory, 'ci-upload'));
  fs.mkdirSync(uploadDirectory, { recursive: true });
  inside(root, fs.realpathSync(uploadDirectory));
  const archive = path.join(uploadDirectory, 'ci-report.tar.gz');
  const resultFile = path.join(resultsDirectory, 'ci-results.json');
  const files = await inventory(root, reportDirectory);
  if (fs.existsSync(resultFile)) {
    if (fs.lstatSync(resultFile).isSymbolicLink()) throw new Error('JSON report cannot be a symlink');
    files.push(resultFile);
  }
  const records = [];
  for (const file of files) {
    const relative = path.relative(root, file);
    const destination = inside(stage, path.join(stage, relative));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    records.push({
      path: relative.split(path.sep).join('/'),
      bytes: fs.statSync(file).size,
      sha256: hash.digest('hex'),
    });
  }
  const essential = new Set(['playwright-report/index.html', 'test-results/ci-results.json']);
  const manifest = {
    mode: records.length ? 'complete' : 'no-report',
    maxArchiveBytes,
    included: records.map(record => record.path),
    omitted: [],
    originalFiles: records,
    essentialEvidence: 'Full line-reporter assertion failures remain in the GitHub job log; structured JSON and HTML are included when available.',
  };
  function pack() {
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const result = spawnSync('tar', ['-czf', archive, '-C', stage, '.'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
    return fs.statSync(archive).size;
  }
  let bytes = pack();
  let overBudget = false;
  if (bytes > maxArchiveBytes) {
    overBudget = true;
    manifest.mode = 'essential-only';
    for (const record of records) {
      if (essential.has(record.path)) continue;
      fs.unlinkSync(inside(stage, path.join(stage, record.path)));
      manifest.omitted.push(record.path);
    }
    manifest.included = records.filter(record => essential.has(record.path)).map(record => record.path);
    log('Full diagnostic archive exceeded its size budget. Keeping every JSON/HTML failure record; optional rich attachments are listed by hash in manifest.json. This artifact-budget failure keeps the job red.');
    bytes = pack();
  }
  if (bytes > maxArchiveBytes) {
    // Never silently discard essential failure records to satisfy storage policy.
    // Logs do not consume artifact storage, and the line reporter already writes
    // every assertion/stack. Also emit the complete structured report here.
    log('Essential report exceeds the artifact budget. Complete structured evidence follows in the job log:');
    if (fs.existsSync(resultFile)) log(fs.readFileSync(resultFile, 'utf8'));
    manifest.mode = 'job-log-and-manifest';
    manifest.essentialEvidence = 'Complete structured report and original line-reporter failures are retained in the GitHub job log.';
    for (const record of records.filter(record => essential.has(record.path))) {
      fs.unlinkSync(inside(stage, path.join(stage, record.path)));
      manifest.omitted.push(record.path);
    }
    manifest.included = [];
    bytes = pack();
  }
  if (bytes > maxArchiveBytes) {
    fs.unlinkSync(archive);
    throw new Error('Even the diagnostic manifest exceeds the upload budget; no oversized artifact will be uploaded. Failure evidence remains in job logs.');
  }
  log(`Diagnostic archive: ${bytes} bytes; limit ${maxArchiveBytes}; mode ${manifest.mode}.`);
  return { archive, bytes, mode: manifest.mode, overBudget };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await packageReport();
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `\nFailure diagnostics: ${result.mode}; ${result.bytes} bytes; retained for one day. Full assertion failures remain in job logs.\n`);
    }
    if (result.overBudget) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

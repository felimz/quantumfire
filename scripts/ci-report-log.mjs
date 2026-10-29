import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MAX_ARCHIVE_BYTES, packageReport } from './package-ci-report.mjs';

const PREFIX = 'QF_CI_REPORT_V1';
const CHUNK_BYTES = 6 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Short, numbered lines survive timestamp prefixes in downloaded GitHub job logs.
// Base64 also prevents report contents from becoming workflow commands.
export function* archiveLogLines(archive, sourceSha = null) {
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error('Diagnostic archive exceeds the existing size bound');
  }
  if (sourceSha !== null && !/^[0-9a-f]{40,64}$/.test(sourceSha)) {
    throw new Error('Invalid source SHA');
  }
  const sha256 = digest(archive);
  const chunks = Math.ceil(archive.length / CHUNK_BYTES);
  const metadata = { schema: 1, bytes: archive.length, sha256, chunks, sourceSha };
  yield `${PREFIX} ${sha256} META ${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
  for (let index = 0; index < chunks; index++) {
    const payload = archive.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    yield `${PREFIX} ${sha256} DATA ${index} ${payload.toString('base64')}`;
  }
  yield `${PREFIX} ${sha256} END ${chunks}`;
}

function decodeBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid or redacted diagnostic base64');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('Noncanonical diagnostic base64');
  return bytes;
}

export function recoverArchive(logText, expectedSourceSha) {
  let metadata;
  let ended = false;
  const chunks = [];
  for (const line of logText.split(/\r?\n/)) {
    const start = line.indexOf(`${PREFIX} `);
    if (start < 0) continue;
    const parts = line.slice(start).trim().split(' ');
    const [, id, kind, value, payload] = parts;
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Invalid diagnostic archive ID');
    if (kind === 'META' && parts.length === 4 && !metadata) {
      metadata = JSON.parse(decodeBase64(value).toString('utf8'));
      if (metadata.schema !== 1 || metadata.sha256 !== id ||
          !Number.isSafeInteger(metadata.bytes) || metadata.bytes < 0 || metadata.bytes > MAX_ARCHIVE_BYTES ||
          metadata.chunks !== Math.ceil(metadata.bytes / CHUNK_BYTES) ||
          (metadata.sourceSha !== null && !/^[0-9a-f]{40,64}$/.test(metadata.sourceSha))) {
        throw new Error('Invalid diagnostic archive metadata');
      }
      if (expectedSourceSha !== undefined && metadata.sourceSha !== expectedSourceSha) {
        throw new Error('Diagnostic source SHA does not match the expected commit');
      }
    } else if (kind === 'DATA' && parts.length === 5 && metadata && !ended &&
        id === metadata.sha256 && value === String(chunks.length) && chunks.length < metadata.chunks) {
      const chunk = decodeBase64(payload);
      const expectedBytes = Math.min(CHUNK_BYTES, metadata.bytes - chunks.length * CHUNK_BYTES);
      if (chunk.length !== expectedBytes) throw new Error('Diagnostic chunk length mismatch');
      chunks.push(chunk);
    } else if (kind === 'END' && parts.length === 4 && metadata && !ended &&
        id === metadata.sha256 && value === String(metadata.chunks) && chunks.length === metadata.chunks) {
      ended = true;
    } else {
      throw new Error('Missing, duplicate, reordered or malformed diagnostic record');
    }
  }
  if (!metadata || !ended) throw new Error('Incomplete diagnostic log; full downloaded step log is required');
  const archive = Buffer.concat(chunks);
  if (archive.length !== metadata.bytes || digest(archive) !== metadata.sha256) {
    throw new Error('Diagnostic archive checksum mismatch');
  }
  return { archive, metadata };
}

async function writeLine(line) {
  // Await each write so large reports cannot be truncated by process exit or
  // exceed the output pipe's backpressure limit.
  await new Promise((resolve, reject) => {
    process.stdout.write(`${line}\n`, error => error ? reject(error) : resolve());
  });
}

async function main() {
  const [mode, input, output, expectedSha] = process.argv.slice(2);
  if (mode === 'recover' && input && output) {
    const { archive, metadata } = recoverArchive(fs.readFileSync(input, 'utf8'), expectedSha);
    // Never overwrite an existing file or automatically extract an archive.
    fs.writeFileSync(output, archive, { flag: 'wx' });
    console.log(`Recovered ${metadata.bytes} bytes; SHA-256 ${metadata.sha256}; source ${metadata.sourceSha ?? 'local'}`);
    return;
  }
  if (mode !== 'emit' || input !== undefined) {
    throw new Error('Usage: node scripts/ci-report-log.mjs emit | recover <step-log.txt> <new-report.tar.gz> [expected-source-sha]');
  }
  const token = randomUUID();
  await writeLine(`::stop-commands::${token}`);
  try {
    const result = await packageReport();
    const archive = fs.readFileSync(result.archive);
    const lines = [...archiveLogLines(archive, process.env.GITHUB_SHA || null)];
    // Verify the exact transport locally before printing it; downloaded log
    // recovery is a separate check and detects truncation or secret masking.
    recoverArchive(lines.join('\n'), process.env.GITHUB_SHA || undefined);
    for (const line of lines) await writeLine(line);
    if (result.overBudget) process.exitCode = 1;
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `\nFailure diagnostics are encoded in this step's downloadable log (${result.mode}, ${result.bytes} archive bytes). No artifact or cache upload. Recovery: scripts/CI-DIAGNOSTICS.md.\n`);
    }
  } finally {
    await writeLine(`::${token}::`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

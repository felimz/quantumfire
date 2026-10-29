# Recovering CI failure evidence without artifact storage

Both workflows use public standard `ubuntu-latest` runners. They do not save npm
caches or upload artifacts. Tests, retries, thresholds and timeouts are unchanged.
Line, HTML and JSON reporters run together. On failure, the report packager keeps
its existing 64 MiB envelope and overflow behavior: oversized optional rich
attachments are listed by hash, essential records remain, and budget overflow
keeps the job red. Complete assertion stacks remain in the original test log.

The diagnostic step encodes its archive into numbered base64 log lines after
completed runs, including successful runs so hosted recovery can be qualified.
Metadata includes the source SHA, byte count, chunk count and SHA-256. This retains
the HTML, JSON and binary trace contents when the archive fits the existing bound.
No storage allowance is assumed. GitHub documents public standard runners as free
and job logs/summaries as excluded from artifact storage billing:
<https://docs.github.com/en/billing/concepts/product-billing/github-actions>.

1. Download the **complete log** for the failure-diagnostic step, or download and
   unzip the job logs and select that step's text file. A browser excerpt is not
   sufficient. Avoid combining logs from different jobs.
2. Run this from the reviewed checkout, replacing the paths and SHA:

   ```sh
   node scripts/ci-report-log.mjs recover downloaded-step.txt recovered-report.tar.gz EXPECTED_SOURCE_SHA
   ```

   For PR workflows, use the run's `GITHUB_SHA` (the tested merge ref). The optional
   expected SHA is checked against metadata; the archive hash is always checked.
   Recovery fails on missing, duplicate, reordered, corrupted or masked chunks.
   It refuses to overwrite an existing destination and does not extract files.
3. Inspect the recovered archive's `manifest.json` and open its report with the
   usual Playwright HTML/trace tools. Any omitted attachments and their hashes are
   explicit in the manifest. Extract only a verified archive from the intended run.

The local tests verify the real exporter, decoder and archive contents, including
HTML, JSON and binary trace recovery. They also verify detection of truncation,
redaction, corruption and the wrong source SHA. They do **not** prove GitHub's
server retained a complete large log. A downloaded-log roundtrip on the exact
hosted candidate remains required before claiming hosted evidence retention.
Logs expire under the repository's existing retention policy; recover needed
evidence locally before that date. No repository retention setting is changed.

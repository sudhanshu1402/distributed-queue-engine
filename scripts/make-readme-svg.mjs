#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ponytail: width assumes a 0.6em-wide monospace glyph; a wider face clips the right edge.
const CELL = 8.4;
const LINE = 22;
const PAD = 26;
const BAR = 38;

const COLOR = {
  bg: '#0d1117',
  bar: '#161b22',
  panel: '#161b22',
  chrome: '#30363d',
  head: '#e6edf3',
  dim: '#7d8590',
  text: '#c9d1d9',
  good: '#3fb950',
};

const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
const CHROME = 'jest, offline';

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(text) {
  return esc(text).replace(/"/g, '&quot;');
}

// SVG collapses runs of spaces, so columns are held apart with non-breaking spaces instead.
function cells(text) {
  return esc(text).replace(/ /g, '\u00a0');
}

// Asserts the captured output still proves what the README's alt text promises.
function must(lines, expected) {
  for (const want of expected) {
    if (!lines.some((line) => want.test(line))) {
      throw new Error(`${want} is missing from the captured output:\n${lines.join('\n')}`);
    }
  }
  return lines;
}

// Real jest output, not hand typed: --silent mutes test-file console.log, TZ is pinned.
function runTests() {
  const dir = mkdtempSync(join(tmpdir(), 'dqe-svg-'));
  const reporterPath = join(dir, 'lines-reporter.cjs');
  const jestBin = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'jest.cmd' : 'jest');
  writeFileSync(
    reporterPath,
    `class LinesReporter {
  onTestResult(_test, result) {
    for (const t of result.testResults) {
      const status = t.status === 'passed' ? 'PASS' : t.status.toUpperCase();
      process.stdout.write(\`\${status}  \${t.fullName}\\n\`);
    }
  }
  onRunComplete(_contexts, results) {
    process.stdout.write(\`\${results.numPassedTests} passed, \${results.numFailedTests} failed\\n\`);
  }
}
module.exports = LinesReporter;
`
  );
  try {
    const proc = spawnSync(jestBin, [`--reporters=${reporterPath}`, '--silent'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TZ: 'UTC', NO_COLOR: '1' },
    });
    if (proc.error) throw proc.error;
    if (proc.status !== 0) {
      throw new Error(`jest exited ${proc.status}:\n${proc.stdout}\n${proc.stderr}`);
    }
    return plain(proc.stdout).replace(/\n+$/, '').split('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function colorOf(line) {
  if (/^PASS /.test(line) || /^\d+ passed, 0 failed$/.test(line)) return COLOR.good;
  return COLOR.text;
}

// GitHub Actions colours jest output, which made the summary filter match nothing.
function plain(out) {
  return out.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '');
}

function frame(width, height, title) {
  const dots = ['#ff5f57', '#febc2e', '#28c840']
    .map((fill, i) => `<circle cx="${20 + i * 18}" cy="19" r="6" fill="${fill}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(title)}">
  <rect width="${width}" height="${height}" rx="10" fill="${COLOR.bg}" stroke="${COLOR.chrome}"/>
  <path d="M0 10a10 10 0 0 1 10-10h${width - 20}a10 10 0 0 1 10 10v28H0z" fill="${COLOR.bar}"/>
  ${dots}
  <text x="${PAD + 48}" y="23" font-family="${MONO}" font-size="12" fill="${COLOR.dim}">${esc(CHROME)}</text>`;
}

function box(lines, caption) {
  return {
    width: Math.round(Math.max(...lines.map((l) => l.length), caption.length + 24) * CELL + PAD * 2),
    height: BAR + lines.length * LINE + PAD,
  };
}

function terminal(lines, label) {
  const { width, height } = box(lines, CHROME);
  const rows = lines
    .map((line, i) => `<text x="${PAD}" y="${BAR + 16 + i * LINE}" fill="${colorOf(line)}">${cells(line)}</text>`)
    .join('\n    ');
  return `${frame(width, height, label)}
  <g font-family="${MONO}" font-size="14" font-weight="500">
    ${rows}
  </g>
</svg>
`;
}

// Jest reorders suite files run to run, so sort here instead of trusting run order.
function stableOrder(lines) {
  const summary = lines.filter((l) => /^\d+ passed, \d+ failed$/.test(l));
  const rest = lines.filter((l) => !/^\d+ passed, \d+ failed$/.test(l)).sort();
  return [...rest, ...summary];
}

function demo(lines) {
  const label =
    'jest tests pass with no live Redis: retryable failure, exponential backoff, priority routing and graceful shutdown';
  return terminal(lines, label);
}

const TILE_TEXT = [
  ['QUEUE', 'Redis+BullMQ', 'priority + retries'],
  ['FAILURE', 'slow SMTP', 'blocks the request path'],
  ['FIX', '202 async', 'workers do the wait'],
];

function glance(passCount) {
  const tiles = [...TILE_TEXT, ['PROOF', `${passCount} passing`, 'no live Redis needed']];
  // 195px tile holds 24 glyphs at font-size 12, 14 at font-size 16.
  for (const [, big, small] of tiles) {
    if (small.length > 24 || big.length > 14) throw new Error(`tile text too long: ${big} / ${small}`);
  }
  const width = 880;
  const height = 150;
  const rendered = tiles.map(([role, big, small], i) => {
    const x = 20 + i * 215;
    return `<rect x="${x}" y="30" width="195" height="96" rx="8" fill="${COLOR.panel}" stroke="${COLOR.chrome}"/>
    <text x="${x + 16}" y="56" fill="${COLOR.dim}" font-size="11" letter-spacing="1">${role}</text>
    <text x="${x + 16}" y="82" fill="${COLOR.head}" font-size="16" font-weight="600">${cells(big)}</text>
    <text x="${x + 16}" y="106" fill="${COLOR.dim}" font-size="12">${cells(small)}</text>`;
  }).join('\n    ');
  const label = `distributed-queue-engine at a glance: Redis and BullMQ, the failure is a slow SMTP call blocking the request, the fix is a 202 and a worker, proof is ${passCount} passing tests with no live Redis`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(label)}">
  <rect width="${width}" height="${height}" rx="10" fill="${COLOR.bg}" stroke="${COLOR.chrome}"/>
  <g font-family="${MONO}">
    ${rendered}
  </g>
</svg>
`;
}

const testLines = must(stableOrder(runTests()), [
  /^PASS {2}email processor throws a retryable error when the RNG lands in the failure band$/,
  /^PASS {2}email producer configures 3 attempts with 5s exponential backoff and removeOnComplete$/,
  /^PASS {2}email producer routes password_reset at high priority/,
  /^\d+ passed, 0 failed$/,
]);
const passCount = testLines[testLines.length - 1].match(/^(\d+) passed/)[1];

mkdirSync(join(ROOT, 'assets'), { recursive: true });
for (const [name, markup] of [
  ['glance.svg', glance(passCount)],
  ['demo.svg', demo(testLines)],
]) {
  writeFileSync(join(ROOT, 'assets', name), markup);
  process.stdout.write(`wrote assets/${name}\n`);
}

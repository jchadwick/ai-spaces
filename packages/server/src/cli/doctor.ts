#!/usr/bin/env tsx
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import 'dotenv/config';

const HOME = process.env.HOME ?? '';
const AI_SPACES_DATA = process.env.AI_SPACES_DATA ?? path.join(HOME, '.ai-spaces');

const config = {
  AI_SPACES_DB: process.env.AI_SPACES_DB ?? path.join(AI_SPACES_DATA, 'ai-spaces.db'),
  AI_SPACES_PORT: parseInt(process.env.AI_SPACES_PORT ?? '3001', 10),
  AI_SPACES_URL: process.env.AI_SPACES_URL ?? 'http://127.0.0.1:3001',
  PLUGIN_URL: process.env.PLUGIN_URL,
  GATEWAY_TOKEN: process.env.GATEWAY_TOKEN,
  JWT_SECRET: process.env.JWT_SECRET,
};

const asJson = process.argv.includes('--json');
const doFix = process.argv.includes('--fix');
const autoYes = process.argv.includes('--yes') || process.argv.includes('-y');

type CheckResult = { name: string; status: 'PASS' | 'FAIL' | 'WARN'; detail?: string };
const results: CheckResult[] = [];

function pass(name: string, detail?: string): CheckResult {
  return { name, status: 'PASS', detail };
}
function fail(name: string, detail?: string): CheckResult {
  return { name, status: 'FAIL', detail };
}
function warn(name: string, detail?: string): CheckResult {
  return { name, status: 'WARN', detail };
}

function checkNodeVersion(): CheckResult {
  const major = parseInt(process.version.slice(1), 10);
  return major >= 20
    ? pass('Node version', `${process.version}`)
    : fail('Node version', `${process.version} — requires >= 20`);
}

function checkEnvVars(): CheckResult[] {
  const checks: CheckResult[] = [];
  if (!config.GATEWAY_TOKEN) checks.push(fail('GATEWAY_TOKEN', 'not set'));
  else checks.push(pass('GATEWAY_TOKEN', 'set'));

  if (!config.JWT_SECRET) checks.push(warn('JWT_SECRET', 'not set — using insecure default'));
  else if (config.JWT_SECRET === 'ai-spaces-dev-secret-change-in-production')
    checks.push(warn('JWT_SECRET', 'using insecure dev default'));
  else checks.push(pass('JWT_SECRET', 'set'));

  return checks;
}

function checkFilesystem(): CheckResult[] {
  const checks: CheckResult[] = [];
  const dbDir = path.dirname(config.AI_SPACES_DB);
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    fs.accessSync(dbDir, fs.constants.W_OK);
    checks.push(pass('DB directory writable', dbDir));
  } catch {
    checks.push(fail('DB directory writable', `${dbDir} — not writable`));
  }

  // Check SQLite DB if it exists
  if (fs.existsSync(config.AI_SPACES_DB)) {
    checks.push(pass('DB file exists', config.AI_SPACES_DB));
  } else {
    checks.push(warn('DB file exists', `${config.AI_SPACES_DB} — will be created on first run`));
  }

  return checks;
}

async function checkPort(): Promise<CheckResult> {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(warn('Port available', `${config.AI_SPACES_PORT} — may already be in use`)));
    srv.once('listening', () => srv.close(() => resolve(pass('Port available', String(config.AI_SPACES_PORT)))));
    srv.listen(config.AI_SPACES_PORT, '127.0.0.1');
  });
}

async function checkServerConnectivity(): Promise<CheckResult> {
  try {
    const res = await fetch(`${config.AI_SPACES_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return pass('Server /health', `${config.AI_SPACES_URL} → ${res.status}`);
    return warn('Server /health', `${config.AI_SPACES_URL} → ${res.status}`);
  } catch (err) {
    return warn('Server /health', `${config.AI_SPACES_URL} — unreachable (${err instanceof Error ? err.message : String(err)})`);
  }
}

async function checkPluginConnectivity(): Promise<CheckResult | null> {
  if (!config.PLUGIN_URL) return null;
  try {
    const res = await fetch(`${config.PLUGIN_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return pass('Plugin /health', `${config.PLUGIN_URL} → ${res.status}`);
    return warn('Plugin /health', `${config.PLUGIN_URL} → ${res.status}`);
  } catch (err) {
    return warn('Plugin /health', `${config.PLUGIN_URL} — unreachable (${err instanceof Error ? err.message : String(err)})`);
  }
}

function findOrphanFiles(dir: string, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findOrphanFiles(fullPath, depth + 1, maxDepth));
    } else if (entry.isFile() && (entry.name.endsWith('.tmp') || entry.name.endsWith('.lock'))) {
      found.push(fullPath);
    }
  }
  return found;
}

async function runFixes(): Promise<void> {
  const dbDir = path.dirname(config.AI_SPACES_DB);

  // Clear stale orphan files under the DB dir
  const orphans = findOrphanFiles(dbDir, 0, 5);
  if (orphans.length > 0) {
    process.stdout.write(`\nFound ${orphans.length} orphaned .tmp/.lock file(s):\n`);
    for (const f of orphans) process.stdout.write(`  ${f}\n`);
    const proceed = autoYes || await confirm('Remove these files?');
    if (proceed) {
      let removed = 0;
      for (const f of orphans) {
        try { fs.unlinkSync(f); removed++; } catch { /* ignore */ }
      }
      process.stdout.write(`Removed ${removed} file(s).\n`);
    }
  } else {
    process.stdout.write('\nNo orphaned files found.\n');
  }
}

async function confirm(question: string): Promise<boolean> {
  process.stdout.write(`${question} [y/N] `);
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.once('data', (data: string) => {
      process.stdin.pause();
      resolve(data.trim().toLowerCase() === 'y');
    });
  });
}

async function main(): Promise<void> {
  results.push(checkNodeVersion());
  results.push(...checkEnvVars());
  results.push(...checkFilesystem());
  results.push(await checkPort());
  results.push(await checkServerConnectivity());
  const pluginResult = await checkPluginConnectivity();
  if (pluginResult) results.push(pluginResult);

  if (asJson) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    for (const r of results) {
      const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⚠';
      const detail = r.detail ? ` — ${r.detail}` : '';
      process.stdout.write(`  ${icon} ${r.name}${detail}\n`);
    }
    process.stdout.write('\n');
  }

  if (doFix) {
    await runFixes();
  }

  const hasFail = results.some(r => r.status === 'FAIL');
  process.exit(hasFail ? 1 : 0);
}

main().catch(err => {
  process.stderr.write(`Doctor error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

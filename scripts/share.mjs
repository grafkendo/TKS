#!/usr/bin/env node
// ============================================================================
// share.mjs — build, serve, and expose Tackticus for friends to try.
//
// No cloud account required. Runs the built-in Node server on your LAN and
// optionally opens a free public tunnel (localtunnel) so a remote friend
// can open the game in their browser.
//
// Usage:
//   npm run share           # LAN URLs + public tunnel URL
//   npm run share:lan       # LAN only (no tunnel)
//
// Keep this terminal open while your friend plays. Ctrl+C stops everything.
// ============================================================================

import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT ?? '8080', 10);
const lanOnly = process.argv.includes('--lan-only');

function log(msg) {
  console.log(msg);
}

function banner(title) {
  log('');
  log('═'.repeat(56));
  log(`  ${title}`);
  log('═'.repeat(56));
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, '0.0.0.0');
  });
}

function lanAddresses() {
  const out = [];
  for (const entries of Object.values(networkInterfaces())) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family !== 'IPv4' || e.internal) continue;
      out.push(e.address);
    }
  }
  return out;
}

function printLinks(publicBase) {
  const paths = [
    { label: 'Launcher (pick 3D or 2D)', path: '/' },
    { label: '3D mech demo', path: '/3d/index.html' },
    { label: '2D rules sandbox', path: '/local/index.html' },
  ];

  banner('Share these links with your friend');
  log('');
  log('  On this PC:');
  for (const { label, path } of paths) {
    log(`    ${label}`);
    log(`      http://localhost:${PORT}${path}`);
  }

  const ips = lanAddresses();
  if (ips.length > 0) {
    log('');
    log('  Same Wi‑Fi / LAN (friend on your network):');
    for (const ip of ips) {
      log(`    http://${ip}:${PORT}/3d/index.html`);
    }
  }

  if (publicBase) {
    log('');
    log('  Internet (remote friend — send this):');
    log(`    ${publicBase}/3d/index.html`);
    log('');
    log('  Note: localtunnel may show a one-time “Click to continue” page.');
    log('  Your friend clicks through, then the game loads.');
  } else if (!lanOnly) {
    log('');
    log('  Public tunnel failed — use LAN links above, or run: npm run share:lan');
  }

  log('');
  log('  Each person gets their own solo game (vs AI). Online co-op is not wired yet.');
  log('  Press Ctrl+C here when done.');
  log('');
}

/** Wait until our server child prints its ready line (or exits). */
function waitForServerReady(proc, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const onData = (buf) => {
      process.stdout.write(buf);
      if (buf.toString().includes('Tackticus server running')) {
        clearTimeout(timeout);
        proc.stdout?.off('data', onData);
        resolve();
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', (d) => process.stderr.write(d));

    proc.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Server exited with code ${code} (is port ${PORT} already in use?)`));
      }
    });
  });
}

let serverProc = null;
let tunnel = null;

function shutdown(code = 0) {
  if (tunnel) {
    try { tunnel.close(); } catch { /* ignore */ }
  }
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  banner('Tackticus — local share setup');
  log('');
  log('Step 1/3: Building static client (dist/local/)…');
  execSync('npm run build:local', { cwd: ROOT, stdio: 'inherit' });

  log('');
  log(`Step 2/3: Starting server on http://0.0.0.0:${PORT} …`);

  const free = await isPortFree(PORT);
  if (!free) {
    throw new Error(
      `Port ${PORT} is already in use. Stop the other process, or run:\n` +
      `  $env:PORT='8081'; npm run share`,
    );
  }

  serverProc = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '0.0.0.0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      log(`Server exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  await waitForServerReady(serverProc);

  let publicUrl = null;
  if (!lanOnly) {
    log('');
    log('Step 3/3: Opening public tunnel (no Google Cloud needed)…');
    try {
      const lt = await import('localtunnel');
      tunnel = await lt.default({ port: PORT });
      publicUrl = tunnel.url.replace(/\/$/, '');
      tunnel.on('close', () => {
        log('Tunnel closed.');
      });
      tunnel.on('error', (err) => {
        log(`Tunnel error: ${err.message}`);
      });
    } catch (err) {
      log(`Could not start tunnel: ${err.message}`);
      log('Install with: npm install');
      log('Or use LAN-only: npm run share:lan');
    }
  } else {
    log('');
    log('Step 3/3: Skipped (--lan-only). Use LAN URLs below.');
  }

  printLinks(publicUrl);

  if (process.platform === 'win32') {
    log('  Windows tip: if LAN links fail, allow Node.js through the firewall');
    log('  (Settings → Firewall → Allow an app).');
    log('');
  }
}

main().catch((err) => {
  console.error(err);
  shutdown(1);
});

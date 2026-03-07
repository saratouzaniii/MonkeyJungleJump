import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data.toString());
      if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || 'CDP error'));
      else pending.resolve(msg.result ?? {});
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.ws.send(JSON.stringify(payload));
    return promise;
  }

  close() {
    this.ws?.close();
  }
}

async function waitForJson(url, retries = 60, delay = 500) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      // endpoint not ready yet
    }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getExtensionId(userDataDir, extensionPath) {
  const prefPath = path.join(userDataDir, 'Default', 'Preferences');
  const extensionReal = path.resolve(extensionPath);

  for (let i = 0; i < 30; i += 1) {
    try {
      const raw = await readFile(prefPath, 'utf8');
      const prefs = JSON.parse(raw);
      const settings = prefs?.extensions?.settings;
      if (!settings || typeof settings !== 'object') {
        await sleep(300);
        continue;
      }

      for (const [id, value] of Object.entries(settings)) {
        const extPath = value?.path ? path.resolve(String(value.path)) : '';
        if (extPath === extensionReal) return id;
      }
    } catch {
      // prefs not yet written
    }
    await sleep(300);
  }

  throw new Error('Could not resolve extension ID from Chrome profile');
}

function chromeExecutable() {
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

function bytesToExtensionId(buf) {
  const alphabet = 'abcdefghijklmnop';
  let id = '';
  for (let i = 0; i < 16; i += 1) {
    const value = buf[i];
    id += alphabet[(value >> 4) & 0x0f];
    id += alphabet[value & 0x0f];
  }
  return id;
}

function unpackedIdFromPath(p) {
  const digest = crypto.createHash('sha256').update(p).digest();
  return bytesToExtensionId(digest);
}

function extensionIdFromManifestKey(base64Key) {
  const keyBytes = Buffer.from(base64Key, 'base64');
  const digest = crypto.createHash('sha256').update(keyBytes).digest();
  return bytesToExtensionId(digest);
}

function keyPayload(type, key, code, vkCode) {
  return {
    type,
    key,
    code,
    windowsVirtualKeyCode: vkCode,
    nativeVirtualKeyCode: vkCode,
    unmodifiedText: key.length === 1 ? key : '',
    text: type === 'keyDown' && key.length === 1 ? key : ''
  };
}

async function pressKey(cdp, sessionId, key, code, vkCode, holdMs = 120) {
  await cdp.send('Input.dispatchKeyEvent', keyPayload('keyDown', key, code, vkCode), sessionId);
  await sleep(holdMs);
  await cdp.send('Input.dispatchKeyEvent', keyPayload('keyUp', key, code, vkCode), sessionId);
}

async function holdVirtualButton(cdp, sessionId, button, holdMs) {
  const buttonToPos = {
    left: { x: 68, y: 436 },
    right: { x: 174, y: 436 },
    jump: { x: 852, y: 436 }
  };
  const pos = buttonToPos[button];
  if (!pos) throw new Error(`Unknown virtual button: ${button}`);

  const expression = `
    (async () => {
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width / canvas.width;
      const sy = rect.height / canvas.height;
      const clientX = rect.left + (${pos.x} * sx);
      const clientY = rect.top + (${pos.y} * sy);
      const down = new PointerEvent('pointerdown', { bubbles: true, clientX, clientY, pointerId: 1, pointerType: 'mouse' });
      const up = new PointerEvent('pointerup', { bubbles: true, clientX, clientY, pointerId: 1, pointerType: 'mouse' });
      canvas.dispatchEvent(down);
      await new Promise((resolve) => setTimeout(resolve, ${holdMs}));
      canvas.dispatchEvent(up);
      return true;
    })();
  `;
  await cdp.send('Runtime.evaluate', { expression, awaitPromise: true }, sessionId);
}

async function capture(cdp, sessionId, outFile) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(outFile, Buffer.from(result.data, 'base64'));
}

async function getGameState(cdp, sessionId) {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      expression: 'window.__MONKEY_DEBUG__ ? window.__MONKEY_DEBUG__.getState() : null',
      returnByValue: true
    },
    sessionId
  );
  return result?.result?.value ?? null;
}

async function main() {
  const extensionPath = path.resolve('/Users/sara/Documents/New project/chrome-monkey-offline');
  await readFile(path.join(extensionPath, 'manifest.json'), 'utf8');
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactsDir = path.join(extensionPath, 'test-artifacts', `ui-${runStamp}`);
  await mkdir(artifactsDir, { recursive: true });

  const userDataDir = await mkdtemp(path.join(tmpdir(), 'monkey-chrome-profile-'));
  const debugPort = 9333;

  const chrome = spawn(
    chromeExecutable(),
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let cdp;
  try {
    const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    cdp = new CdpClient(version.webSocketDebuggerUrl);
    await cdp.connect();

    const gameUrl = `file://${path.join(extensionPath, 'game.html')}`;
    const { targetId } = await cdp.send('Target.createTarget', { url: gameUrl });
    const attach = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attach.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    await sleep(1200);

    await capture(cdp, sessionId, path.join(artifactsDir, '01-initial.png'));

    await holdVirtualButton(cdp, sessionId, 'right', 900);
    await sleep(350);
    await capture(cdp, sessionId, path.join(artifactsDir, '02-after-move-right.png'));

    await holdVirtualButton(cdp, sessionId, 'jump', 120);
    await sleep(450);
    await capture(cdp, sessionId, path.join(artifactsDir, '03-after-jump.png'));

    await holdVirtualButton(cdp, sessionId, 'right', 900);
    await sleep(500);
    await capture(cdp, sessionId, path.join(artifactsDir, '04-after-water-hazard.png'));

    const preDamageState = await getGameState(cdp, sessionId);
    await cdp.send(
      'Runtime.evaluate',
      { expression: 'window.__MONKEY_DEBUG__ && window.__MONKEY_DEBUG__.forceLoseLife()', returnByValue: true },
      sessionId
    );
    await sleep(250);
    await capture(cdp, sessionId, path.join(artifactsDir, '05-after-forced-damage.png'));
    const state = await getGameState(cdp, sessionId);
    const assertions = {
      scoreIncreased: Boolean(state && state.score > 0),
      lifeLost: Boolean(preDamageState && state && state.lives < preDamageState.lives)
    };

    await writeFile(
      path.join(artifactsDir, 'result.json'),
      JSON.stringify(
        {
          gameUrl,
          state,
          assertions,
          screenshots: [
            '01-initial.png',
            '02-after-move-right.png',
            '03-after-jump.png',
            '04-after-water-hazard.png',
            '05-after-forced-damage.png'
          ]
        },
        null,
        2
      )
    );

    console.log('UI smoke test completed.');
    console.log(`Artifacts: ${artifactsDir}`);
    console.log(JSON.stringify(assertions));
  } finally {
    try {
      cdp?.close();
    } catch {
      // ignore close errors
    }
    if (!chrome.killed) {
      chrome.kill('SIGTERM');
      await sleep(300);
      if (!chrome.killed) chrome.kill('SIGKILL');
    }
  }
}

main().catch((error) => {
  console.error('UI smoke test failed:', error.message);
  process.exitCode = 1;
});

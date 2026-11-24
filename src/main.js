const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { status } = require('minecraft-server-util');
const { Rcon } = require('rcon-client');
const { Client } = require('ssh2');

let mainWindow = null;
const logStreams = new Map();
const BUILD = 'setup-form-only';

function debugLog(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch { }
}

const serversFile = () => path.join(app.getPath('userData'), 'servers.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function loadServers() {
  try {
    return JSON.parse(fs.readFileSync(serversFile(), 'utf8'));
  } catch {
    return [];
  }
}

function saveServers(servers) {
  fs.writeFileSync(serversFile(), JSON.stringify(servers, null, 2));
}

const historyDir = () => path.join(app.getPath('userData'), 'history');

function loadHistory(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(historyDir(), `${id}.json`), 'utf8'));
  } catch {
    return [];
  }
}

function appendHistory(id, point) {
  fs.mkdirSync(historyDir(), { recursive: true });
  const file = path.join(historyDir(), `${id}.json`);
  const history = loadHistory(id);
  history.push(point);
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  let pruned = history;
  if (history.length > 30000) {
    pruned = history.filter((p, i) => now - p.ts < dayMs || i % 40 === 0);
  }
  fs.writeFileSync(file, JSON.stringify(pruned.slice(-30000)));
}

function publicServer(server) {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    queryPort: server.queryPort,
    rconPort: server.rconPort,
    hasPassword: Boolean(server.encryptedPassword),
    sshPort: server.sshPort,
    sshUser: server.sshUser,
    serverDir: server.serverDir,
    hasSshPassword: Boolean(server.encryptedSshPassword),
    sshKey: server.sshKey,
    hasSshKey: Boolean(server.sshKey),
  };
}

function decrypt(value) {
  if (!value) return null;
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

async function ping(host, port) {
  const res = await status(host, port, { timeout: 5000 });
  const motd = typeof res.motd === 'string' ? res.motd : res.motd?.clean || res.motd?.raw || '';
  return {
    version: res.version?.name,
    protocol: res.version?.protocol,
    playersOnline: res.players?.online,
    playersMax: res.players?.max,
    playersSample: (res.players?.sample || []).map((p) => p.name),
    motd,
    latency: res.latency ?? res.ping ?? res.roundTripLatency,
  };
}

async function runRcon({ host, port, password }, commands) {
  if (!password) throw new Error('Mot de passe RCON manquant — renseigne-le dans le formulaire du serveur.');
  const rcon = new Rcon({ host, port, password, timeout: 5000 });
  await rcon.connect();
  try {
    const out = {};
    for (const cmd of commands) out[cmd] = await rcon.send(cmd);
    return out;
  } finally {
    await rcon.end();
  }
}

async function probe({ host, queryPort, rconPort, password }) {
  const result = { ping: null, list: null, tps: null, error: null };
  try {
    result.ping = await ping(host, Number(queryPort) || 25565);
  } catch (err) {
    result.error = `Query: ${err.message}`;
  }
  try {
    const out = await runRcon({ host, port: Number(rconPort) || 25575, password }, ['list', 'tps']);
    result.list = out['list'];
    const m = String(out['tps'] || '').match(/1m:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (m) result.tps = Number(m[1]);
  } catch (err) {
    const msg = `RCON: ${err.message}`;
    result.error = result.error ? `${result.error} | ${msg}` : msg;
  }
  return result;
}

function stopLogStream(id) {
  const s = logStreams.get(id);
  if (!s) return;
  try { s.stream.destroy(); } catch { }
  try { s.client.end(); } catch { }
  logStreams.delete(id);
}

function startLogStream(server) {
  stopLogStream(server.id);
  const client = new Client();
  let remainder = '';
  let privateKey = null;
  if (server.sshKey) {
    try {
      privateKey = fs.readFileSync(server.sshKey);
    } catch (err) {
      debugLog(`ssh key unreadable: ${server.sshKey} (${err.message})`);
      if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: `Clé SSH introuvable : ${server.sshKey}` });
      return;
    }
  }
  const pwd = privateKey ? null : decrypt(server.encryptedSshPassword);
  if (!privateKey && !pwd) {
    debugLog('ssh: ni cle ni mot de passe configuré');
    if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: 'Configure la clé SSH ou le mot de passe SSH dans le formulaire du serveur.' });
    return;
  }
  debugLog(`ssh connect host=${server.host} port=${server.sshPort || 22} user=${server.sshUser} auth=${privateKey ? 'cle' : 'motdepasse'} key=${server.sshKey || '-'}`);
  client.on('ready', () => {
    const raw = (server.serverDir || '~/minecraft').trim().replace(/^~\s*/, '~');
    const dirExpr = raw.startsWith('~') ? `"$HOME${raw.slice(1)}"` : `"${raw}"`;
    client.exec(`tail -n 400 -F ${dirExpr}/logs/latest.log`, (err, stream) => {
      if (err) {
        if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: err.message });
        client.end();
        return;
      }
      logStreams.set(server.id, { client, stream });
      stream.on('data', (data) => {
        remainder += data.toString('utf8');
        const lines = remainder.split('\n');
        remainder = lines.pop();
        for (const l of lines) {
          if (l.trim() && mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, line: l });
        }
      });
      stream.stderr.on('data', (d) => {
        if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: d.toString().trim() });
      });
    });
  });
  client.on('error', (err) => {
    debugLog(`ssh error: ${err.message} level=${err.level || ''}`);
    if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: err.message });
  });
  const sshConfig = {
    host: server.host,
    port: Number(server.sshPort) || 22,
    username: server.sshUser,
    readyTimeout: 8000,
  };
  if (privateKey) sshConfig.privateKey = privateKey;
  else sshConfig.password = pwd;
  client.connect(sshConfig);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'MC Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  debugLog('window created');
  win.webContents.on('console-message', (event, level, message) => {
    debugLog(`[console.${level}] ${message}`);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    debugLog(`render-process-gone: ${JSON.stringify(details)}`);
  });
  win.on('closed', () => {
    for (const id of [...logStreams.keys()]) stopLogStream(id);
    mainWindow = null;
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  debugLog('app ready');
  ipcMain.handle('app:build', () => BUILD);

  ipcMain.handle('debug:log', (event, msg) => {
    debugLog(`[renderer] ${msg}`);
    return true;
  });

  ipcMain.handle('settings:get', (event, key) => loadSettings()[key]);

  ipcMain.handle('settings:set', (event, key, value) => {
    const s = loadSettings();
    s[key] = value;
    fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
    return true;
  });

  ipcMain.handle('ssh:default-key', () => {
    for (const name of ['id_ed25519', 'id_rsa', 'id_ecdsa']) {
      const p = path.join(os.homedir(), '.ssh', name);
      try {
        fs.accessSync(p);
        debugLog(`default ssh key: ${p}`);
        return p;
      } catch { }
    }
    return null;
  });

  ipcMain.handle('servers:list', () => loadServers().map(publicServer));

  ipcMain.handle('servers:save', (event, input) => {
    const servers = loadServers();
    const existing = servers.find((s) => s.id === input.id);
    const encrypt = (v) => (v ? safeStorage.encryptString(v).toString('base64') : null);
    const entry = {
      id: input.id || String(Date.now()),
      name: input.name,
      host: input.host,
      queryPort: Number(input.queryPort) || 25565,
      rconPort: Number(input.rconPort) || 25575,
      encryptedPassword: encrypt(input.password) || (existing ? existing.encryptedPassword : null),
      sshPort: Number(input.sshPort) || 22,
      sshUser: input.sshUser || '',
      encryptedSshPassword: encrypt(input.sshPassword) || (existing ? existing.encryptedSshPassword : null),
      sshKey: input.sshKey || (existing ? existing.sshKey : ''),
      serverDir: (input.serverDir || '~/minecraft').trim().replace(/^~\s*/, '~'),
    };
    const index = servers.findIndex((s) => s.id === entry.id);
    if (index >= 0) servers[index] = entry;
    else servers.push(entry);
    saveServers(servers);
    debugLog(`saved id=${entry.id} name=${entry.name} host=${entry.host} sshUser=${entry.sshUser || '(vide)'} sshKey=${entry.sshKey || '(vide)'} hasRconPwd=${Boolean(entry.encryptedPassword)}`);
    return publicServer(entry);
  });

  ipcMain.handle('servers:delete', (event, id) => {
    saveServers(loadServers().filter((s) => s.id !== id));
    return true;
  });

  ipcMain.handle('server:test', (event, input) =>
    probe({
      host: input.host,
      queryPort: input.queryPort,
      rconPort: input.rconPort,
      password: input.password,
    })
  );

  ipcMain.handle('server:status', async (event, id) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) throw new Error('Serveur introuvable');
    const result = await probe({
      host: server.host,
      queryPort: server.queryPort,
      rconPort: server.rconPort,
      password: decrypt(server.encryptedPassword),
    });
    if (result.ping) {
      appendHistory(server.id, {
        ts: Date.now(),
        players: result.ping.playersOnline,
        latency: result.ping.latency ?? null,
        tps: result.tps,
      });
    }
    return result;
  });

  ipcMain.handle('server:history', (event, id) => loadHistory(id));

  ipcMain.handle('server:logs:start', (event, id) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) throw new Error('Serveur introuvable');
    if (!server.sshUser) return { started: false };
    startLogStream(server);
    return { started: true };
  });

  ipcMain.handle('server:logs:stop', (event, id) => {
    stopLogStream(id);
    return true;
  });

  ipcMain.handle('server:command', async (event, { id, command }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) throw new Error('Serveur introuvable');
    const out = await runRcon(
      { host: server.host, port: server.rconPort, password: decrypt(server.encryptedPassword) },
      [command]
    );
    return out[command];
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

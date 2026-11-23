const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { status } = require('minecraft-server-util');
const { Rcon } = require('rcon-client');
const { Client } = require('ssh2');

let mainWindow = null;
const logStreams = new Map();

const serversFile = () => path.join(app.getPath('userData'), 'servers.json');

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

async function runRcon({ host, port, password }, command) {
  if (!password) throw new Error('Mot de passe RCON manquant — renseigne-le dans le formulaire du serveur.');
  const rcon = new Rcon({ host, port, password, timeout: 5000 });
  await rcon.connect();
  try {
    return await rcon.send(command);
  } finally {
    await rcon.end();
  }
}

async function probe({ host, queryPort, rconPort, password }) {
  const result = { ping: null, list: null, error: null };
  try {
    result.ping = await ping(host, Number(queryPort) || 25565);
  } catch (err) {
    result.error = `Query: ${err.message}`;
  }
  try {
    result.list = await runRcon({ host, port: Number(rconPort) || 25575, password }, 'list');
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
  client.on('ready', () => {
    const dir = (server.serverDir || '~/minecraft').replace(/^~/, '$HOME');
    client.exec(`tail -n 400 -F "${dir}/logs/latest.log"`, (err, stream) => {
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
    if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: err.message });
  });
  client.connect({
    host: server.host,
    port: Number(server.sshPort) || 22,
    username: server.sshUser,
    password: decrypt(server.encryptedSshPassword),
    readyTimeout: 8000,
  });
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
  win.on('closed', () => {
    for (const id of [...logStreams.keys()]) stopLogStream(id);
    mainWindow = null;
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
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
      serverDir: input.serverDir || '~/minecraft',
    };
    const index = servers.findIndex((s) => s.id === entry.id);
    if (index >= 0) servers[index] = entry;
    else servers.push(entry);
    saveServers(servers);
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
    return probe({
      host: server.host,
      queryPort: server.queryPort,
      rconPort: server.rconPort,
      password: decrypt(server.encryptedPassword),
    });
  });

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
    return runRcon(
      { host: server.host, port: server.rconPort, password: decrypt(server.encryptedPassword) },
      command
    );
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

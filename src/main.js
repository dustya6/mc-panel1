const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { status } = require('minecraft-server-util');
const { Rcon } = require('rcon-client');
const { Client } = require('ssh2');

let mainWindow = null;
const logStreams = new Map();
const BUILD = 'plugins-install';

function tcpCheck(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function sshExec(server, command, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const client = new Client();
    const finish = (res) => {
      clearTimeout(timer);
      try { client.end(); } catch { }
      resolve(res);
    };
    const timer = setTimeout(() => finish({ error: 'timeout' }), timeoutMs);
    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) { finish({ error: err.message }); return; }
        let out = '';
        stream.on('data', (d) => {
          out += d.toString('utf8');
          if (out.length > 1000000) { out = out.slice(0, 1000000); try { stream.destroy(); } catch { } }
        });
        stream.stderr.on('data', () => { });
        stream.on('close', () => finish({ out }));
      });
    });
    client.on('error', (err) => finish({ error: err.message }));
    const cfg = { host: server.host, port: Number(server.sshPort) || 22, username: server.sshUser, readyTimeout: 8000 };
    if (server.encryptedSshPassword) cfg.password = decrypt(server.encryptedSshPassword);
    if (server.sshKey) {
      try { cfg.privateKey = fs.readFileSync(server.sshKey); } catch { }
    }
    client.connect(cfg);
  });
}

function cleanDir(d) {
  return (d || '~/minecraft').trim().replace(/^cd\s+/, '').replace(/^~\s*/, '~');
}

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
    startCmd: server.startCmd || '',
    type: server.type === 'aternos' ? 'aternos' : 'vps',
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
    offline: /offline/i.test(motd),
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

async function probe({ host, queryPort, rconPort, password, type }) {
  const result = { ping: null, list: null, tps: null, error: null };
  const port = Number(queryPort) || 25565;
  const tcpOk = await tcpCheck(host, port);
  if (!tcpOk) {
    result.error = 'Port du jeu fermé — le serveur est éteint.';
    return result;
  }
  try {
    result.ping = await ping(host, port);
    if (result.ping && result.ping.offline) {
      result.error = 'Serveur éteint (le proxy répond « Offline »).';
      result.ping = null;
    }
  } catch (err) {
    result.error = `Query: ${err.message}`;
  }
  if (type !== 'aternos') {
    try {
      const out = await runRcon({ host, port: Number(rconPort) || 25575, password }, ['list', 'tps']);
      result.list = out['list'];
      const tpsRaw = String(out['tps'] || '').replace(/\u00a7[0-9a-fk-or]/gi, '');
      debugLog(`tps raw: ${tpsRaw.slice(0, 120)}`);
      const m = tpsRaw.match(/1m:?\s*([0-9]+(?:\.[0-9]+)?)/)
        || tpsRaw.match(/:\s*([0-9]+(?:\.[0-9]+)?)/)
        || tpsRaw.match(/tps\D*([0-9]+(?:\.[0-9]+)?)/i);
      if (m) result.tps = Number(m[1]);
    } catch (err) {
      const msg = `RCON: ${err.message}`;
      result.error = result.error ? `${result.error} | ${msg}` : msg;
    }
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
  const pwd = decrypt(server.encryptedSshPassword);
  if (!privateKey && !pwd) {
    debugLog('ssh: ni cle ni mot de passe configuré');
    if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: 'Configure la clé SSH ou le mot de passe SSH dans le formulaire du serveur.' });
    return;
  }
  debugLog(`ssh connect host=${server.host} port=${server.sshPort || 22} user=${server.sshUser} auth=${pwd ? 'motdepasse' : 'cle'} key=${server.sshKey || '-'}`);
  client.on('ready', () => {
    const raw = cleanDir(server.serverDir);
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
    const hint = /authentication/i.test(err.message) ? ' → Essaie avec le MOT DE PASSE SSH (vide le champ clé) ou vérifie que la clé est bien dans ~/.ssh/authorized_keys du serveur.' : '';
    if (mainWindow) mainWindow.webContents.send('server:logs', { id: server.id, error: err.message + hint });
  });
  const sshConfig = {
    host: server.host,
    port: Number(server.sshPort) || 22,
    username: server.sshUser,
    readyTimeout: 8000,
  };
  if (pwd) sshConfig.password = pwd;
  else sshConfig.privateKey = privateKey;
  client.connect(sshConfig);
}

// ---------- Hangar (recherche de plugins + compatibilite version) ----------
const HANGAR_API = 'https://hangar.papermc.io/api/v1';
const PAPERMC_URL_RE = /^https:\/\/([A-Za-z0-9-]+\.)*papermc\.io\//;
const HANGAR_PLATFORMS = {
  paper: 'PAPER', purpur: 'PAPER', spigot: 'SPIGOT', fabric: 'FABRIC', quilt: 'QUILT',
  forge: 'FORGE', neoforge: 'NEOFORGE', velocity: 'VELOCITY', bungeecord: 'BUNGEECORD',
  waterfall: 'WATERFALL', folia: 'FOLIA', sponge: 'SPONGE',
};

async function hangarGet(pathName, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(HANGAR_API + pathName + qs, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'mc-panel/1.0' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function verParts(v) {
  return String(v || '').split('.').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
}
// true si la version saisie (a) couvre une version supportee (b) : ex "26" couvre "26.2", "26.2" couvre "26.2"
function verCovers(a, b) {
  const A = verParts(a);
  const B = verParts(b);
  if (!A.length || !B.length || A.length > B.length) return false;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
  return true;
}

function safeFileName(s) {
  return String(s || 'plugin').replace(/[^A-Za-z0-9._-]/g, '_');
}

function makeInstall(owner, slug, v) {
  if (!v) return null;
  const url = v.downloadUrl || `${HANGAR_API}/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(v.name || '')}/download`;
  return {
    version: v.name || '',
    url,
    fileName: safeFileName(`${slug}-${v.name || 'latest'}.jar`),
  };
}

async function hangarVersions(owner, slug) {
  const all = [];
  let offset = 0;
  for (let page = 0; page < 3; page++) {
    const d = await hangarGet(`/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions`, { limit: 100, offset });
    const list = Array.isArray(d) ? d : (d.result || []);
    all.push(...list);
    offset += list.length;
    const count = d && d.pagination ? Number(d.pagination.count) : list.length;
    if (!list.length || offset >= count) break;
  }
  return all;
}

async function hangarProjectList(query) {
  const q = String(query || '').trim();
  if (q) {
    try { return await hangarGet('/projects', { limit: 20, sort: '-relevance', q }); }
    catch { try { return await hangarGet('/projects', { limit: 20, q }); } catch { return await hangarGet('/projects', { limit: 100 }); } }
  }
  try { return await hangarGet('/projects', { limit: 12, sort: '-downloads' }); }
  catch { return await hangarGet('/projects', { limit: 12 }); }
}

function normProjects(data) {
  const list = Array.isArray(data) ? data : ((data && data.result) || []);
  return list.filter((p) => !p.visibility || p.visibility === 'public');
}

async function searchPlugins(query, platform, version) {
  const platCode = HANGAR_PLATFORMS[String(platform || 'paper').toLowerCase()] || 'PAPER';
  let list = normProjects(await hangarProjectList(query));
  const q = String(query || '').trim().toLowerCase();
  if (q) {
    const matches = (p) =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.description || '').toLowerCase().includes(q) ||
      String((p.namespace && p.namespace.owner) || '').toLowerCase().includes(q);
    let filtered = list.filter(matches);
    if (!filtered.length) {
      try {
        filtered = normProjects(await hangarGet('/projects', { limit: 100 })).filter(matches);
      } catch { }
    }
    list = filtered.slice(0, 10);
  } else {
    list = list.slice(0, 12);
  }
  const results = await Promise.all(list.map(async (p) => {
    const owner = (p.namespace && p.namespace.owner) || '';
    const slug = (p.namespace && p.namespace.slug) || p.name;
    const out = {
      name: p.name || slug,
      slug: `${owner}/${slug}`,
      description: p.description || '',
      author: owner,
      downloads: (p.stats && p.stats.downloads) || 0,
      stars: (p.stats && p.stats.stars) || 0,
      url: `https://hangar.papermc.io/${owner}/${slug}`,
      compatible: null,
      versions: [],
      install: null,
    };
    try {
      const vs = await hangarVersions(owner, slug);
      const mine = vs.filter((v) => Array.isArray(v.platforms) && v.platforms.some((x) => String(x).toUpperCase() === platCode));
      if (mine.length) {
        let pool = mine;
        if (version) {
          const covering = mine.filter((v) => (v.gameVersions || []).some((g) => verCovers(version, g)));
          out.compatible = covering.length > 0;
          pool = covering;
        } else {
          out.compatible = null;
        }
        if (pool.length) {
          const sorted = [...pool].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          out.install = makeInstall(owner, slug, sorted[0]);
        }
        const set = [];
        for (const v of mine.slice(0, 8)) for (const g of (v.gameVersions || [])) if (!set.includes(g)) set.push(g);
        out.versions = set.slice(0, 12);
      }
    } catch { /* compatibilite inconnue */ }
    return out;
  }));
  return results;
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

  function newsFile() { return path.join(app.getPath('userData'), 'news.json'); }
  function loadNews() {
    try { return JSON.parse(fs.readFileSync(newsFile(), 'utf8')); } catch { return []; }
  }
  ipcMain.handle('news:list', () => loadNews());
  ipcMain.handle('news:clear', () => {
    fs.writeFileSync(newsFile(), '[]');
    return true;
  });
  ipcMain.handle('news:add', (event, item) => {
    const n = loadNews();
    n.unshift({ ts: item.ts || Date.now(), type: item.type || 'info', msg: String(item.msg || '') });
    fs.writeFileSync(newsFile(), JSON.stringify(n.slice(0, 300)));
    return true;
  });

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
      serverDir: cleanDir(input.serverDir),
      startCmd: input.startCmd || (existing ? existing.startCmd : ''),
      type: input.type === 'aternos' ? 'aternos' : 'vps',
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
      type: input.type,
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
      type: server.type,
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

  ipcMain.handle('server:hist-add', (event, { id, point }) => {
    const history = loadHistory(id);
    const last = history[history.length - 1];
    if (last && Date.now() - last.ts < 90000) Object.assign(last, point);
    else history.push(point);
    fs.mkdirSync(historyDir(), { recursive: true });
    fs.writeFileSync(path.join(historyDir(), `${id}.json`), JSON.stringify(history.slice(-30000)));
    return true;
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

  ipcMain.handle('server:ssh-exec', async (event, { id, command }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) throw new Error('Serveur introuvable');
    if (!server.sshUser) return { error: 'SSH non configuré sur ce serveur' };
    return sshExec(server, command);
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

  ipcMain.handle('plugins:search', async (event, args) => {
    try {
      const results = await searchPlugins((args && args.query) || '', (args && args.platform) || 'paper', (args && args.version) || '');
      return { ok: true, results };
    } catch (err) {
      debugLog(`plugins:search error: ${(err && err.message) || err}`);
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('app:open-url', async (event, url) => {
    if (typeof url === 'string' && /^https:\/\/hangar\.papermc\.io\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // Telecharge le .jar du plugin directement dans plugins/ du serveur via SSH (VPS)
  ipcMain.handle('plugins:install', async (event, { id, url, fileName }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) return { ok: false, error: 'Serveur introuvable' };
    if (!server.sshUser) return { ok: false, error: 'Pas de SSH sur ce serveur (Aternos gratuit) — utilise « Télécharger le .jar » puis upload-le toi-même.' };
    if (typeof url !== 'string' || !PAPERMC_URL_RE.test(url)) return { ok: false, error: 'URL de téléchargement invalide' };
    let file = safeFileName(fileName || 'plugin.jar');
    if (!file.endsWith('.jar')) file += '.jar';
    const dir = cleanDir(server.serverDir);
    const cmd = `cd "${dir}" && mkdir -p plugins && (curl -sSL --fail -o "plugins/${file}" "${url}" || wget -q -O "plugins/${file}" "${url}") && ls -l "plugins/${file}"`;
    const r = await sshExec(server, cmd, 90000);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, out: r.out || '', file };
  });

  // Telecharge le .jar sur le PC du client (sans SSH, ex Aternos)
  ipcMain.handle('plugins:download', async (event, { url, fileName }) => {
    if (typeof url !== 'string' || !PAPERMC_URL_RE.test(url)) return { ok: false, error: 'URL de téléchargement invalide' };
    let file = safeFileName(fileName || 'plugin.jar');
    if (!file.endsWith('.jar')) file += '.jar';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'mc-panel/1.0' } });
      clearTimeout(timer);
      if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
      const buf = Buffer.from(await r.arrayBuffer());
      const win = BrowserWindow.getAllWindows()[0];
      const dlg = await dialog.showSaveDialog(win, {
        title: 'Enregistrer le plugin',
        defaultPath: file,
        filters: [{ name: 'Plugin Minecraft (.jar)', extensions: ['jar'] }],
      });
      if (dlg.canceled || !dlg.filePath) return { ok: false, canceled: true };
      await fs.promises.writeFile(dlg.filePath, buf);
      return { ok: true, path: dlg.filePath, size: buf.length };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // Liste les .jar deja presents dans plugins/ du serveur (via SSH)
  ipcMain.handle('plugins:installed', async (event, id) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) return { ok: false, error: 'Serveur introuvable' };
    if (!server.sshUser) return { ok: false, noSsh: true };
    const dir = cleanDir(server.serverDir);
    const r = await sshExec(server, `cd "${dir}" 2>/dev/null; ls -1 plugins/*.jar 2>/dev/null | xargs -r -n1 basename`, 20000);
    if (r.error) return { ok: false, error: r.error };
    const files = String(r.out || '').split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.jar'));
    return { ok: true, files };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

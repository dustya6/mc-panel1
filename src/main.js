const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { status } = require('minecraft-server-util');
const { Rcon } = require('rcon-client');
const { Client } = require('ssh2');

let mainWindow = null;
const logStreams = new Map();
const BUILD = 'ui-v9';

// ---- Licence (niveau 2 : activation en ligne sur NOTRE serveur) ----
// REMPLACE par l'URL HTTPS de ton serveur de licences avant la vraie vente
// (ex: https://licence.ton-domaine.ch). Pour les tests : le VPS en HTTP.
const LICENSE_API = 'http://62.220.136.19:8787';
// Page d'achat (bouton "Acheter une clé" dans l'appli) — REMPLACE par ta vraie URL
const BUY_URL = 'https://ton-domaine.ch/mcpanel-7f3k/';
const LICENSE_GRACE_MS = 7 * 24 * 3600 * 1000; // 7 jours de grâce hors ligne
// Canaux autorisés SANS licence active (le reste est bloqué côté main)
const LICENSE_PUBLIC_CHANNELS = new Set(['app:build', 'debug:log', 'settings:get', 'settings:set', 'license:status', 'license:activate']);

function licenseFile() { return path.join(app.getPath('userData'), 'license.json'); }
function loadLicense() {
  try { return JSON.parse(fs.readFileSync(licenseFile(), 'utf8')); } catch { return null; }
}
// Empreinte du PC (hostname + MACs + plateforme), hachée — envoyée au serveur de licences
function hwid() {
  const macs = Object.values(os.networkInterfaces()).flat()
    .filter((b) => b && b.mac && b.mac !== '00:00:00:00:00:00')
    .map((b) => b.mac).sort().join(',');
  return crypto.createHash('sha256').update(os.hostname() + '|' + macs + '|' + os.platform() + '|' + os.arch()).digest('hex');
}
function licensed() {
  try {
    const lic = loadLicense();
    if (!lic || !lic.key || !lic.hwid || !lic.lastOk) return false;
    if (lic.hwid !== hwid()) return false;
    return (Date.now() - lic.lastOk) <= LICENSE_GRACE_MS;
  } catch { return false; }
}
async function licensePost(endpoint, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(LICENSE_API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally { clearTimeout(t); }
}
async function licenseVerifyOnline() {
  const lic = loadLicense();
  if (!lic || !lic.key) return false;
  try {
    const r = await licensePost('/verify', { key: lic.key, hwid: hwid() });
    if (r && r.ok) {
      lic.lastOk = Date.now();
      fs.writeFileSync(licenseFile(), JSON.stringify(lic));
      return true;
    }
    if (r && r.ok === false) {
      try { fs.unlinkSync(licenseFile()); } catch { }
      debugLog('licence invalide/révoquée côté serveur -> supprimée');
      return false;
    }
    return licensed(); // serveur injoignable : on garde la grâce hors ligne
  } catch {
    return licensed();
  }
}

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

// id sûr pour les chemins de fichiers locaux (anti path traversal ../../)
function safeId(id) { return String(id == null ? '' : id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'x'; }
// id d'automatisation : uniquement "auto" + chiffres (utilisé dans des commandes SSH)
function validAutoId(id) { return /^auto[0-9]{6,}$/.test(String(id || '')); }
// echappe une chaine pour l'intérieur d'une double quote shell
function escDq(s) { return String(s).replace(/([\\ "$`])/g, '\\$1'); }

// Expression shell pour cd : developpe ~ en $HOME (entre guillemets, ~ ne se developpe PAS)
function dirExprFor(d) {
  const raw = cleanDir(d);
  return raw.startsWith('~') ? `"$HOME${escDq(raw.slice(1))}"` : `"${escDq(raw)}"`;
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
    return JSON.parse(fs.readFileSync(path.join(historyDir(), `${safeId(id)}.json`), 'utf8'));
  } catch {
    return [];
  }
}

function appendHistory(id, point) {
  fs.mkdirSync(historyDir(), { recursive: true });
  const file = path.join(historyDir(), `${safeId(id)}.json`);
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

// ---------- Automatisations : editeur de blocs -> script bash + cron/watcher sur le VPS ----------
function autoDir() { return path.join(app.getPath('userData'), 'automations'); }
function autoFile(id) { return path.join(autoDir(), `${safeId(id)}.json`); }
function loadAutos(serverId) {
  try { return JSON.parse(fs.readFileSync(autoFile(serverId), 'utf8')); } catch { return []; }
}
function saveAutos(serverId, list) {
  fs.mkdirSync(autoDir(), { recursive: true });
  fs.writeFileSync(autoFile(serverId), JSON.stringify(list, null, 2));
}

function shQuote(s) {
  return `'${String(s == null ? '' : s).replace(/'/g, `'\\''`)}'`;
}

const RCON_PY = `#!/usr/bin/env python3
import socket, struct, sys
def pkt(sock, rid, ptype, payload):
    body = struct.pack('>ii', rid, ptype) + payload.encode('utf-8') + bytes(2)
    sock.sendall(struct.pack('>i', len(body)) + body)
def read_pkt(sock):
    raw = b''
    while len(raw) < 4:
        c = sock.recv(4 - len(raw))
        if not c: raise SystemExit('connexion fermee par le serveur (mauvaise IP/port ou auth RCON ?)')
        raw += c
    (ln,) = struct.unpack('>i', raw)
    data = b''
    while len(data) < ln:
        c = sock.recv(ln - len(data))
        if not c: break
        data += c
    rid, ptype = struct.unpack('>ii', data[:8])
    return rid, ptype, data[8:-2].decode('utf-8', 'replace')
def main():
    if len(sys.argv) < 5:
        sys.stderr.write('usage: rcon.py host port password command\\n'); sys.exit(2)
    host, port, password, cmd = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    s = socket.create_connection((host, port), timeout=8)
    pkt(s, 1, 3, password)
    while True:
        rid, ptype, _ = read_pkt(s)
        if ptype == 2 or rid == -1:
            break
    if rid == -1:
        sys.stderr.write('RCON auth failed\\n'); sys.exit(3)
    pkt(s, 2, 2, cmd)
    rid, ptype, body = read_pkt(s)
    print(body)
    s.close()
if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print('rcon error: ' + str(e), file=sys.stderr)
        sys.exit(1)
`;

function configSh(server) {
  const raw = cleanDir(server.serverDir);
  // ~ s'étend via $HOME hors des quotes, le reste est quoté avec shQuote (anti injection)
  const dirVal = raw.startsWith('~') ? `$HOME${shQuote(raw.slice(1))}` : shQuote(raw);
  return [
    `RCON_PORT=${Number(server.rconPort) || 25575}`,
    `RCON_HOST=${shQuote(server.host || '127.0.0.1')}`,
    `RCON_PASSWORD=${shQuote(decrypt(server.encryptedPassword) || '')}`,
    `SERVER_DIR=${dirVal}`,
    `START_CMD=${shQuote(server.startCmd || '')}`,
    '',
  ].join('\n');
}

function cronForTrigger(tr, id) {
  const script = `$HOME/.mc-panel/auto-${id}.sh`;
  const p = tr.params || {};
  // heure HH:MM sanitisée : hh 0-23, mm 0-59, toujours sur 2 chiffres
  const tp = String(p.time || '03:00').split(':');
  let hh = parseInt(tp[0], 10), mm = parseInt(tp[1], 10);
  if (!Number.isFinite(hh)) hh = 3;
  if (!Number.isFinite(mm)) mm = 0;
  hh = Math.max(0, Math.min(23, hh));
  mm = Math.max(0, Math.min(59, mm));
  const HH = String(hh).padStart(2, '0');
  const MM = String(mm).padStart(2, '0');
  switch (tr.kind) {
    case 'tr_daily': return [`${MM} ${HH} * * * ${script} --run`];
    case 'tr_every_min': return [`*/${Math.min(59, Math.max(1, Number(p.n) || 5))} * * * * ${script} --run`];
    case 'tr_every_hour': return [`0 */${Math.min(23, Math.max(1, Number(p.n) || 1))} * * * ${script} --run`];
    case 'tr_weekday': {
      const days = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
      return [`${MM} ${HH} * * ${days[p.day] != null ? days[p.day] : 1} ${script} --run`];
    }
    default: return null; // watcher
  }
}

function condExpr(b) {
  const p = (b && b.params) || {};
  switch (b && b.kind) {
    case 'c_online': case 'online': return 'online';
    case 'c_offline': case 'offline': return '! online';
    case 'c_ram': case 'ram90': return `ram_pct_gt ${Number(p.n) || 90}`;
    case 'c_tps': case 'tps15': return `tps_lt ${Number(p.n) || 15}`;
    case 'c_cpu': case 'cpu90': return `cpu_pct_gt ${Number(p.n) || 90}`;
    case 'c_disk': case 'disk10': return `disk_free_lt ${Number(p.n) || 10}`;
    case 'c_backup_ok': return '[ "$LAST_BACKUP_RC" -eq 0 ]';
    case 'c_backup_fail': return '[ "$LAST_BACKUP_RC" -ne 0 ]';
    case 'c_time': return `[ "$(date +%H:%M)" = ${shQuote(p.time || '00:00')} ]`;
    case 'c_last': case 'last': return '[ "$LAST_COND" -eq 0 ]';
  }
  return 'true';
}

function actionSnippet(b) {
  const p = b.params || {};
  switch (b.kind) {
    case 'a_start': return `if online; then log 'start: déjà en ligne'; else cd "$SERVER_DIR" && nohup setsid bash -c "$START_CMD" >/dev/null 2>&1 & sleep 2; log 'start: lancé'; fi`;
    case 'a_stop': return `rcon 'stop'; log 'stop: arrêt demandé'`;
    case 'a_restart': return `rcon 'stop'; sleep 5; cd "$SERVER_DIR" && nohup setsid bash -c "$START_CMD" >/dev/null 2>&1 & sleep 2; log 'restart: relancé'`;
    case 'a_save': return `rcon 'save-all'; log 'save-all envoyé'`;
    case 'a_backup': return `rcon 'save-all'; sleep 3; mkdir -p "$SERVER_DIR/backups"; D=""; for d in world world_nether world_the_end; do [ -d "$SERVER_DIR/$d" ] && D="$D $d"; done; if [ -z "$D" ]; then log 'backup: aucun dossier world trouvé'; LAST_BACKUP_RC=1; else F="$SERVER_DIR/backups/backup-$(date +%F-%H%M%S).tgz"; i=1; while [ -e "$F" ]; do F="$SERVER_DIR/backups/backup-$(date +%F-%H%M%S)-$i.tgz"; i=$((i+1)); done; tar -czf "$F" -C "$SERVER_DIR" $D 2>>"$LOG"; LAST_BACKUP_RC=$?; log "backup: $F rc=$LAST_BACKUP_RC"; fi`;
    case 'a_prune': return `find "$SERVER_DIR/backups" -name '*.tgz' -mtime +${Math.max(1, Number(p.days) || 7)} -delete 2>>"$LOG"; log 'prune: anciennes sauvegardes supprimées'`;
    case 'a_state': return `if online; then log "state: EN LIGNE $(rcon 'list')"; else log 'state: HORS LIGNE'; fi`;
    case 'a_perf': return `log "perf: tps=$(tpsval) ram=$(free -m 2>/dev/null | awk '/^Mem:/{if($2>0) print int($3*100/$2); exit}')% cpu=$(top -bn1 2>/dev/null | awk '/[Cc]pu/{for(i=1;i<=NF;i++) if($i=="id"){print int(100-$(i-1)); exit}}')% disque_libre=$(df -BG "$SERVER_DIR" 2>/dev/null | awk 'NR==2{gsub(/[^0-9]/,"",$4); print $4}')Go"`;
    case 'a_cmd': return `rcon ${shQuote(p.cmd || '')}`;
    case 'a_mnt_on': return `rcon 'whitelist on'; log 'maintenance ON (whitelist activée)'`;
    case 'a_mnt_off': return `rcon 'whitelist off'; log 'maintenance OFF (whitelist désactivée)'`;
    case 'a_report': return `R="$DIR/report-$AUTO_ID-$(date +%F-%H%M).txt"; { echo "Rapport $(date)"; rcon 'list'; echo "TPS: $(tpsval)"; free -m; df -h "$SERVER_DIR"; } > "$R" 2>&1; log "rapport: $R"`;
    case 'a_event': return `event ${shQuote(p.msg || 'événement')}`;
  }
  return `log ${shQuote('action inconnue ' + b.kind)}`;
}

function emitBlocks(blocks, ind) {
  let out = '';
  let prevSnippet = null;
  const gates = [];
  const pad = '  '.repeat(ind);
  for (const b of blocks || []) {
    const label = b.label || b.kind;
    if (b.cat === 'cond' && b.kind !== 'c_if') {
      const expr = condExpr(b);
      out += `${pad}if ${expr}; then LAST_COND=0; else LAST_COND=1; fi; log "cond ${label}: $LAST_COND"\n`;
      out += `${pad}if ${expr}; then\n`; // la condition bloque tous les blocs suivants de cette zone
      gates.push({ mark: out.length }); // si rien ne suit, on mettra un no-op (then vide = erreur de syntaxe bash)
      continue;
    } else if (b.kind === 'c_if') {
      out += `${pad}if ${condExpr({ kind: b.params.cond })}; then LAST_COND=0\n${emitBlocks(b.children.then, ind + 1)}${pad}else LAST_COND=1\n${emitBlocks(b.children.else, ind + 1)}${pad}fi\n`;
    } else if (b.kind === 't_repeat') {
      const n = Math.max(1, Number(b.params.n) || 3);
      out += `${pad}for i in $(seq 1 ${n}); do log "répétition $i/${n}"\n${emitBlocks(b.children.body, ind + 1)}${pad}done\n`;
    } else if (b.kind === 't_repeat_until') {
      out += `${pad}i=0; while ! ${condExpr({ kind: b.params.cond })}; do\n${emitBlocks(b.children.body, ind + 1)}${pad}  i=$((i+1)); [ $i -ge 1000 ] && { log 'repeat_until: limite atteinte'; break; }; sleep ${Math.max(1, Number(b.params.pause) || 15)}; done\n`;
    } else if (b.kind === 'e_on_fail' || b.kind === 'e_noresp' || b.kind === 'e_backup_fail') {
      const test = b.kind === 'e_noresp' ? '! online' : b.kind === 'e_backup_fail' ? '[ "${LAST_BACKUP_RC:-1}" -ne 0 ]' : '[ "$LAST_RC" -ne 0 ]';
      out += `${pad}if ${test}; then log "branche erreur: ${label}"\n${emitBlocks(b.children.body, ind + 1)}${pad}fi\n`;
    } else if (b.kind === 'e_retry') {
      const n = Math.max(1, Number(b.params.n) || 3);
      if (prevSnippet) out += `${pad}i=0; LAST_RC=1; while [ "$LAST_RC" -ne 0 ] && [ $i -lt ${n} ]; do i=$((i+1)); log "nouvel essai $i/${n}"; ${prevSnippet}; LAST_RC=$?; done; [ "$LAST_RC" -ne 0 ] && log "ERR: ${label} a échoué après ${n} essais"\n`;
    } else if (b.kind === 't_redo') {
      if (prevSnippet) out += `${pad}${prevSnippet}; LAST_RC=$?\n`;
    } else if (b.kind === 't_wait') {
      const nw = Math.max(1, Number(b.params.n) || 10);
      const mult = b.params.unit === 'heures' ? 3600 : b.params.unit === 'minutes' ? 60 : 1;
      const sec = Math.max(1, Math.min(604800, Math.round(nw * mult)));
      out += `${pad}sleep ${sec}; log "attente ${nw} ${b.params.unit || 'secondes'}"\n`;
    } else if (b.kind === 't_stop') {
      out += `${pad}log "arrêt de l'automatisation demandé"; exit 0\n`;
    } else if (b.kind === 't_skip') {
      out += `${pad}: # étape ignorée\n`;
    } else if (b.kind === 'e_stop_err') {
      out += `${pad}ERRMODE=stop; log "mode erreur: arrêt du scénario en cas d'erreur"\n`;
    } else if (b.kind === 'e_cont_err') {
      out += `${pad}ERRMODE=continue; log "mode erreur: continuer malgré les erreurs"\n`;
    } else if (b.kind === 'e_log_err') {
      out += `${pad}if [ "$LAST_RC" -ne 0 ]; then log "ERR: l'étape précédente a échoué"; fi\n`;
    } else if (b.cat === 'action') {
      const snip = actionSnippet(b);
      out += `${pad}${snip}; LAST_RC=$?\n${pad}if [ "$LAST_RC" -ne 0 ]; then log "ERR ${label}"; [ "$ERRMODE" = "stop" ] && exit 1; fi\n`;
      prevSnippet = snip;
    }
  }
  for (let gi = gates.length - 1; gi >= 0; gi--) {
    if (out.length === gates[gi].mark) out += `${pad}: # (aucun bloc après la condition)\n`;
    out += `${pad}fi\n`;
  }
  return out;
}

const WATCHER_KINDS = ['tr_at', 'tr_start', 'tr_stop', 'tr_crash', 'tr_offline', 'tr_online'];

function compileAutomation(auto, server) {
  const id = auto.id;
  if (!auto.trigger || !auto.trigger.kind) throw new Error('Pas de bloc déclencheur (jaune) en premier.');
  const tr = auto.trigger;
  const isWatcher = WATCHER_KINDS.includes(tr.kind);
  const head = `#!/usr/bin/env bash
set -u
DIR="$HOME/.mc-panel"
AUTO_ID=${shQuote(id)}
source "$DIR/config.sh"
LOG="$DIR/auto-$AUTO_ID.log"
STATE="$DIR/auto-$AUTO_ID.state"
exec 9>"$DIR/auto-$AUTO_ID.lock"
flock -n 9 || exit 0
LAST_RC=0; LAST_COND=0; LAST_BACKUP_RC=0; ERRMODE=continue
log(){ echo "$(date '+%F %T') [$AUTO_ID] $*" >> "$LOG"; }
event(){ echo "$(date '+%F %T') EVENT: $*" >> "$LOG"; }
has_screen(){ screen -ls 2>/dev/null | grep -q minecraft; }
rcon(){ if has_screen; then if screen -S minecraft -X stuff "$1"$'\\n'; then log "via screen: $1"; return 0; fi; fi; python3 "$DIR/rcon.py" "\${RCON_HOST:-127.0.0.1}" "\${RCON_PORT:-25575}" "$RCON_PASSWORD" "$1" 2>>"$LOG" && return 0; python3 "$DIR/rcon.py" 127.0.0.1 "\${RCON_PORT:-25575}" "$RCON_PASSWORD" "$1" 2>>"$LOG"; }
online(){ local p d; d=$(cd "$SERVER_DIR" 2>/dev/null && pwd -P) || return 1; for p in $(pgrep -f java 2>/dev/null); do [ "$(readlink "/proc/$p/cwd" 2>/dev/null)" = "$d" ] && return 0; done; return 1; }
tpsval(){ local t; t=$(python3 "$DIR/rcon.py" "\${RCON_HOST:-127.0.0.1}" "\${RCON_PORT:-25575}" "$RCON_PASSWORD" tps 2>/dev/null | grep -oE '[0-9]+([.][0-9]+)?' | head -1); if [ -z "$t" ] && has_screen; then screen -S minecraft -X hardcopy /tmp/mcpanel-cap 2>/dev/null; t=$(tail -100 /tmp/mcpanel-cap 2>/dev/null | grep -oiE 'tps[^0-9]{0,20}[0-9]+([.][0-9]+)?' | tail -1 | grep -oE '[0-9]+([.][0-9]+)?$'); fi; echo "$t"; }
ram_pct_gt(){ read -r u t <<< "$(free -m 2>/dev/null | awk '/^Mem:/{print $3, $2}')"; [ -n "$t" ] && [ "$t" -gt 0 ] && [ $((u*100/t)) -gt "$1" ]; }
cpu_pct_gt(){ local c; c=$(top -bn1 2>/dev/null | awk '/%Cpu/{print int(100-$8); exit}'); [ -n "$c" ] && [ "$c" -gt "$1" ]; }
tps_lt(){ local t; t=$(tpsval); [ -n "$t" ] && awk -v t="$t" -v x="$1" 'BEGIN{exit !(t<x)}'; }
disk_free_lt(){ local g; g=$(df -BG "$SERVER_DIR" 2>/dev/null | awk 'NR==2{gsub(/[^0-9]/,"",$4); print $4}'); [ -n "$g" ] && [ "$g" -lt "$1" ]; }
run_body(){
  log "=== déclenchement ==="
${emitBlocks(auto.blocks, 1)}  log "=== fin ==="
}
MODE="\${1:---run}"
# mode --dry (test) : on logue ce qui serait fait, AUCUNE action réelle
if [ "$MODE" = "--dry" ]; then
  rcon(){ log "DRY rcon: $1"; return 0; }
  tar(){ log "DRY tar $*"; return 0; }
  find(){ log "DRY find $*"; return 0; }
  sleep(){ log "DRY sleep $*"; return 0; }
  nohup(){ log "DRY nohup $*"; return 0; }
  setsid(){ log "DRY setsid $*"; return 0; }
  screen(){ log "DRY screen $*"; return 0; }
fi
`;
  let tail;
  if (isWatcher) {
    tail = `
if [ "$MODE" = "--watch" ]; then
  log "watcher démarré"
  while true; do
    case "${tr.kind}" in
      tr_at)
        now=$(date +%H:%M); key="$(date +%F) $now"
        if [ "$now" = ${shQuote(tr.params.time || '03:00')} ] && ! grep -qxF "$key" "$STATE" 2>/dev/null; then echo "$key" >> "$STATE"; tail -n 400 "$STATE" > "$STATE.tmp" 2>/dev/null && mv "$STATE.tmp" "$STATE"; run_body; fi ;;
      tr_start|tr_online)
        if online; then cur=1; else cur=0; fi; prev=$(cat "$STATE.online" 2>/dev/null || echo 0)
        if [ "$cur" = 1 ] && [ "$prev" = 0 ]; then echo 1 > "$STATE.online"; run_body; fi
        [ "$cur" = 0 ] && echo 0 > "$STATE.online" ;;
      tr_stop|tr_offline)
        if online; then cur=1; else cur=0; fi; prev=$(cat "$STATE.online" 2>/dev/null || echo 1)
        if [ "$cur" = 0 ] && [ "$prev" = 1 ]; then echo 0 > "$STATE.online"; run_body; fi
        [ "$cur" = 1 ] && echo 1 > "$STATE.online" ;;
      tr_crash)
        L="$SERVER_DIR/logs/latest.log"; CR="$SERVER_DIR/crash-reports"
        size=$(stat -c%s "$L" 2>/dev/null || echo 0)
        ccount=$(ls "$CR"/crash-*.txt 2>/dev/null | wc -l)
        read off fired cprev < "$STATE.crash" 2>/dev/null || { off=0; fired=0; cprev=0; }
        [ "$size" -lt "$off" ] && off=0
        n=$(tail -c +"$((off+1))" "$L" 2>/dev/null | grep -cE 'SEVERE|Exception')
        newc=0; [ "$ccount" -gt "$cprev" ] && newc=1
        if { [ "$n" -ge 3 ] || [ "$newc" = 1 ]; } && [ "$fired" = 0 ]; then echo "$size 1 $ccount" > "$STATE.crash"; run_body
        elif [ "$n" -lt 3 ] && [ "$newc" = 0 ]; then echo "$size 0 $ccount" > "$STATE.crash"
        else echo "$size $fired $ccount" > "$STATE.crash"; fi ;;
    esac
    sleep 15
  done
fi
if [ "$MODE" = "--run" ] || [ "$MODE" = "--dry" ]; then
  run_body
fi
`;
  } else {
    tail = `
if [ "$MODE" = "--run" ] || [ "$MODE" = "--dry" ]; then
  run_body
fi
`;
  }
  let cron = cronForTrigger(tr, id) || [];
  if (isWatcher) cron.push(`@reboot $HOME/.mc-panel/auto-${id}.sh --watch`);
  return { script: head + tail, cron, watcher: isWatcher };
}

async function deployAutomation(server, auto) {
  const id = String((auto && auto.id) || '');
  if (!validAutoId(id)) return { ok: false, error: 'id d’automatisation invalide' };
  if (!auto.trigger || !auto.trigger.kind) return { ok: false, error: 'Ajoute un bloc déclencheur (jaune) comme premier bloc.' };
  const { script, cron, watcher } = compileAutomation(auto, id);
  const problems = [];
  const mk = await sshExec(server, `mkdir -p "$HOME/.mc-panel" && chmod 700 "$HOME/.mc-panel" && echo MKOK`, 20000);
  if (mk.error) return { ok: false, error: mk.error };
  const py = await sshExec(server, `command -v python3 >/dev/null 2>&1 && echo PYOK || echo NOPYTHON3`, 20000);
  if (!String(py.out || '').includes('PYOK')) problems.push('python3 est introuvable sur le VPS → installe-le : sudo apt install python3');
  const r1 = await sshExec(server, `cat > "$HOME/.mc-panel/rcon.py" <<'RCONPY_EOF'
${RCON_PY}RCONPY_EOF
chmod 700 "$HOME/.mc-panel/rcon.py" && test -f "$HOME/.mc-panel/rcon.py" && echo HELPOK || echo HELPERR`, 30000);
  if (r1.error) return { ok: false, error: r1.error };
  if (!String(r1.out || '').includes('HELPOK')) problems.push('rcon.py n’a pas pu être écrit sur le VPS');
  const r2 = await sshExec(server, `cat > "$HOME/.mc-panel/config.sh" <<'CFG_EOF'
${configSh(server)}CFG_EOF
chmod 600 "$HOME/.mc-panel/config.sh" && test -f "$HOME/.mc-panel/config.sh" && echo CFGOK || echo CFGEERR`, 30000);
  if (r2.error) return { ok: false, error: r2.error };
  if (!String(r2.out || '').includes('CFGOK')) problems.push('config.sh n’a pas pu être écrit sur le VPS');
  const r3 = await sshExec(server, `cat > "$HOME/.mc-panel/auto-${id}.sh" <<'AUTO_EOF'
${script}AUTO_EOF
chmod 700 "$HOME/.mc-panel/auto-${id}.sh" && test -x "$HOME/.mc-panel/auto-${id}.sh" && echo SCRIPTOK || echo SCRIPTKO`, 30000);
  if (r3.error) return { ok: false, error: r3.error };
  if (!String(r3.out || '').includes('SCRIPTOK')) problems.push('le script auto n’a pas pu être écrit sur le VPS');
  const tag = `mc-panel:${id}`;
  const enabled = auto.enabled !== false;
  const echoLines = cron.map((l) => `echo ${shQuote((enabled ? '' : '# ') + l + ' # ' + tag)}`).join('; ');
  const r4 = await sshExec(server, `command -v crontab >/dev/null 2>&1 || echo NOCRON; (crontab -l 2>/dev/null | grep -v '${tag}$'; ${echoLines}) 2>/dev/null | crontab - 2>/dev/null && echo CRONOK || echo CRONERR`, 30000);
  if (r4.error) return { ok: false, error: r4.error };
  const out4 = String(r4.out || '');
  if (out4.includes('NOCRON')) problems.push('la commande crontab manque sur le VPS → sudo apt install cron');
  if (!out4.includes('CRONOK')) problems.push('l’écriture du crontab a échoué → installe cron : sudo apt install cron && sudo systemctl enable --now cron');
  const crond = await sshExec(server, `if pgrep -x cron >/dev/null 2>&1 || pgrep -x crond >/dev/null 2>&1 || pgrep -f 'cron -f' >/dev/null 2>&1; then echo CRONDOK; else echo NOCROND; fi`, 20000);
  if (!String(crond.out || '').includes('CRONDOK')) problems.push('le démon cron ne tourne pas sur le VPS → sudo systemctl enable --now cron');
  if (watcher) {
    if (enabled) {
      // on redémarre proprement puis on VÉRIFIE que le watcher tourne vraiment
      const w = await sshExec(server, `pkill -f "auto-${id}.sh --watch" 2>/dev/null; sleep 1; nohup "$HOME/.mc-panel/auto-${id}.sh" --watch >/dev/null 2>&1 & sleep 2; pgrep -f "auto-${id}.sh --watch" >/dev/null && echo WATCHOK || echo WATCHERR`, 30000);
      if (!String(w.out || '').includes('WATCHOK')) problems.push(`le watcher n'a pas démarré sur le VPS → voir ~/.mc-panel/auto-${id}.log`);
    } else {
      const w = await sshExec(server, `pkill -f "auto-${id}.sh --watch" 2>/dev/null; sleep 1; pgrep -f "auto-${id}.sh --watch" >/dev/null && echo STILLRUNNING || echo STOPPED`, 20000);
      if (String(w.out || '').includes('STILLRUNNING')) problems.push("l'ancien watcher tourne encore sur le VPS (pkill a échoué)");
    }
  }
  return { ok: problems.length === 0, problems, cron, watcher };
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

// Garde-fou IPC : seuls les appels venant de NOTRE fenêtre sont acceptés
const _ipcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => _ipcHandle(channel, (event, ...args) => {
  if (mainWindow && event.sender !== mainWindow.webContents) {
    debugLog(`IPC refusé (origine inconnue) : ${channel}`);
    return { ok: false, error: 'appel refusé (origine inconnue)' };
  }
  if (!LICENSE_PUBLIC_CHANNELS.has(channel) && !licensed()) {
    debugLog(`IPC refusé (licence inactive) : ${channel}`);
    return { ok: false, error: 'licence requise — activez votre clé de licence' };
  }
  return fn(event, ...args);
});

app.whenReady().then(async () => {
  debugLog('app ready');
  // Vide le cache disque AVANT de créer la fenêtre : le CSS/JS chargés sont bien ceux du build courant
  try { await session.defaultSession.clearCache(); } catch { }
  ipcMain.handle('app:build', () => BUILD);

  ipcMain.handle('license:status', () => {
    const lic = loadLicense();
    return { licensed: licensed(), key: (lic && lic.key) || null, buyUrl: BUY_URL, build: BUILD };
  });

  ipcMain.handle('license:activate', async (event, keyRaw) => {
    const key = String(keyRaw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(key)) {
      return { ok: false, error: 'Format de clé invalide (ex : XXXX-XXXX-XXXX-XXXX).' };
    }
    const h = hwid();
    let r;
    try {
      r = await licensePost('/activate', { key, hwid: h });
    } catch (e) {
      return { ok: false, error: 'Serveur de licences injoignable (' + LICENSE_API + ').' };
    }
    if (r && r.ok) {
      fs.writeFileSync(licenseFile(), JSON.stringify({ key, hwid: h, lastOk: Date.now(), activatedAt: Date.now() }));
      debugLog('licence activée sur ce PC');
      return { ok: true };
    }
    return { ok: false, error: (r && r.error) || 'Activation refusée.' };
  });

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
    fs.writeFileSync(path.join(historyDir(), `${safeId(id)}.json`), JSON.stringify(history.slice(-30000)));
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
    if (typeof command !== 'string' || !command.trim()) return { error: 'commande vide' };
    debugLog('ssh-exec: ' + command.slice(0, 400));
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
    const cmd = `cd ${dirExprFor(server.serverDir)} && mkdir -p plugins && (curl -sSL --fail -o "plugins/${file}" "${url}" || wget -q -O "plugins/${file}" "${url}") && test -s "plugins/${file}" && echo "OK $(wc -c < "plugins/${file}")"`;
    const r = await sshExec(server, cmd, 90000);
    if (r.error) return { ok: false, error: r.error };
    if (!String(r.out || '').startsWith('OK')) {
      debugLog(`plugins:install echec dir=${cleanDir(server.serverDir)} out=${JSON.stringify(r.out)}`);
      return { ok: false, error: 'Échec du téléchargement ou dossier introuvable — vérifie « Dossier du serveur » dans Mes serveurs.' };
    }
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
    const r = await sshExec(server, `cd ${dirExprFor(server.serverDir)} 2>/dev/null && ls -1 plugins/*.jar 2>/dev/null | xargs -r -n1 basename || echo CDERR`, 20000);
    if (r.error) return { ok: false, error: r.error };
    const out = String(r.out || '');
    if (out.includes('CDERR')) return { ok: false, error: `Dossier introuvable sur le serveur : ${cleanDir(server.serverDir)} — vérifie « Dossier du serveur » dans Mes serveurs.` };
    const files = out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.jar'));
    return { ok: true, files };
  });

  ipcMain.handle('auto:list', (event, id) => loadAutos(id));
  ipcMain.handle('auto:save', (event, { id, list }) => { saveAutos(id, Array.isArray(list) ? list : []); return true; });
  ipcMain.handle('auto:deploy', async (event, { id, auto }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server) return { ok: false, error: 'Serveur introuvable' };
    if (!server.sshUser) return { ok: false, error: 'SSH requis (onglet Automatisations = VPS avec SSH)' };
    try { return await deployAutomation(server, auto); } catch (err) { debugLog(`auto:deploy error: ${err.message}`); return { ok: false, error: String((err && err.message) || err) }; }
  });
  ipcMain.handle('auto:test', async (event, { id, autoId }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server || !server.sshUser) return { ok: false, error: 'SSH requis' };
    if (!validAutoId(autoId)) return { ok: false, error: 'id invalide' };
    const r = await sshExec(server, `L="$HOME/.mc-panel/auto-${autoId}.log"; B=$(wc -l < "$L" 2>/dev/null || echo 0); "$HOME/.mc-panel/auto-${autoId}.sh" --dry; echo "RC=$?"; echo '--- log (nouvelles lignes de ce test, mode DRY, aucune action reelle) ---'; tail -n +$((B+1)) "$L" 2>/dev/null`, 90000);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, out: r.out || '' };
  });
  ipcMain.handle('auto:status', async (event, id) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server || !server.sshUser) return { ok: false, noSsh: true };
    const r = await sshExec(server, `echo '--- cron ---'; crontab -l 2>/dev/null | grep 'mc-panel:' || echo '(aucune ligne)'; echo '--- watchers ---'; pgrep -af 'mc-panel/auto-.*sh --watch' || echo '(aucun)'; echo '--- scripts ---'; ls -1 "$HOME/.mc-panel"/auto-*.sh 2>/dev/null || echo '(aucun)'`, 20000);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, out: r.out || '' };
  });
  ipcMain.handle('auto:log', async (event, { id, autoId, n }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server || !server.sshUser) return { ok: false, noSsh: true };
    if (!validAutoId(autoId)) return { ok: false, error: 'id invalide' };
    const r = await sshExec(server, `tail -n ${Math.max(10, Number(n) || 60)} "$HOME/.mc-panel/auto-${autoId}.log" 2>/dev/null || echo '(pas encore de log)'`, 20000);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, out: r.out || '' };
  });
  ipcMain.handle('auto:clean', async (event, { id, autoId }) => {
    const server = loadServers().find((s) => s.id === id);
    if (!server || !server.sshUser) return { ok: false, noSsh: true };
    if (!validAutoId(autoId)) return { ok: true };
    await sshExec(server, `pkill -f "auto-${autoId}.sh --watch" 2>/dev/null; rm -f "$HOME/.mc-panel/auto-${autoId}.sh" "$HOME/.mc-panel/auto-${autoId}.log" "$HOME/.mc-panel/auto-${autoId}.state" "$HOME/.mc-panel/auto-${autoId}.lock"; (crontab -l 2>/dev/null | grep -v 'mc-panel:${autoId}$') | crontab -; true`, 30000);
    return { ok: true };
  });

  createWindow();

  // Vérification de la licence au démarrage puis toutes les 6 h
  licenseVerifyOnline();
  setInterval(() => { licenseVerifyOnline(); }, 6 * 3600 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

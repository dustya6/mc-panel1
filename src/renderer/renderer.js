const origConsoleError = console.error.bind(console);
console.error = (...args) => {
  origConsoleError(...args);
  if (window.api && window.api.logDebug) window.api.logDebug(args.map(String).join(' '));
};

window.addEventListener('error', (e) => {
  if (window.api && window.api.logDebug) window.api.logDebug(`[JS] ${e.message} @ ${e.filename}:${e.lineno}`);
  const el = document.getElementById('console-out');
  if (el) {
    const div = document.createElement('div');
    div.className = 'line err';
    div.textContent = `[JS] ${e.message}`;
    el.appendChild(div);
  }
});

const listEl = document.getElementById('server-list');
const formEl = document.getElementById('server-form');
const testBtn = document.getElementById('btn-test');
const testResultEl = document.getElementById('test-result');
const pageOverview = document.getElementById('page-overview');
const pageConsole = document.getElementById('page-console');
const pageServers = document.getElementById('page-servers');
const pagePlayers = document.getElementById('page-players');
const pageServer = document.getElementById('page-server');
const srvCtlStatus = document.getElementById('srv-ctl-status');
const srvStateEl = document.getElementById('srv-state');
const srvUptimeEl = document.getElementById('srv-uptime');
const srvPidEl = document.getElementById('srv-pid');
const srvDirEl = document.getElementById('srv-dir');
const btnSrvStart = document.getElementById('btn-srv-start');
const btnSrvStop = document.getElementById('btn-srv-stop');
const btnSrvRestart = document.getElementById('btn-srv-restart');
const playersOnlineEl = document.getElementById('players-online');
const whitelistListEl = document.getElementById('whitelist-list');
const whitelistStatusEl = document.getElementById('whitelist-status');
const banListEl = document.getElementById('ban-list');
const banStatusEl = document.getElementById('ban-status');
const wlForm = document.getElementById('wl-form');
const wlInput = document.getElementById('wl-input');
const btnRefreshPlayers = document.getElementById('btn-refresh-players');
const btnRefresh = document.getElementById('btn-refresh');
const modal = document.getElementById('player-modal');
const modalPlayerEl = document.getElementById('modal-player');
const modalResult = document.getElementById('modal-result');
const modalExtra = document.getElementById('modal-extra');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const searchResults = document.getElementById('search-results');
let modalPlayer = null;
const statusEl = document.getElementById('status');
const kpiPlayersEl = document.getElementById('kpi-players');
const kpiLatencyEl = document.getElementById('kpi-latency');
const kpiTpsEl = document.getElementById('kpi-tps');
const sparkLatencyEl = document.getElementById('spark-latency');
const chartMainEl = document.getElementById('chart-main');
const resStatusEl = document.getElementById('res-status');
const resCpuFill = document.getElementById('res-cpu-fill');
const resCpuTxt = document.getElementById('res-cpu-txt');
const resRamFill = document.getElementById('res-ram-fill');
const resRamTxt = document.getElementById('res-ram-txt');
const resDiskFill = document.getElementById('res-disk-fill');
const resDiskTxt = document.getElementById('res-disk-txt');
const playersEl = document.getElementById('players');
const consoleForm = document.getElementById('console-form');
const cmdInput = document.getElementById('cmd');
const consoleOut = document.getElementById('console-out');
const welcomeEl = document.getElementById('welcome');
const setupEl = document.getElementById('setup');
const btnWelcomeAdd = document.getElementById('btn-welcome-add');
const btnSubmit = document.getElementById('btn-submit');
const navEl = document.getElementById('nav');
const formCard = document.getElementById('form-card');
const setupFormSlot = document.getElementById('setup-form-slot');
const serversFormSlot = document.getElementById('servers-form-slot');
const setupChoiceEl = document.getElementById('setup-choice');
const btnTypeAternos = document.getElementById('btn-type-aternos');
const btnTypeVps = document.getElementById('btn-type-vps');
const btnSetupBack = document.getElementById('btn-setup-back');
const vpsFieldsEl = document.getElementById('vps-fields');
const hostLabelEl = document.getElementById('host-label');
const hostInfoEl = document.getElementById('host-info');
const fHostInput = document.getElementById('f-host');
const consoleNoRconEl = document.getElementById('console-norcon');
let setupType = null;
let lastStatus = null;

let currentServer = null;
let statusTimer = null;
let currentPage = 'overview';
let currentRange = 86400000;
let currentMetric = 'players';
let lastHistory = [];
let lastResult = null;
let mode = 'welcome';
let cmdHistory = [];
let cmdIndex = 0;
let cmdDraft = '';

function historyKey() {
  return `mcpanel-cmds-${currentServer ? currentServer.id : 'default'}`;
}

function loadCmdHistory() {
  try {
    cmdHistory = JSON.parse(localStorage.getItem(historyKey()) || '[]');
  } catch {
    cmdHistory = [];
  }
  cmdIndex = cmdHistory.length;
}

function pushCmdHistory(cmd) {
  if (cmdHistory[cmdHistory.length - 1] !== cmd) {
    cmdHistory.push(cmd);
    if (cmdHistory.length > 50) cmdHistory = cmdHistory.slice(-50);
    localStorage.setItem(historyKey(), JSON.stringify(cmdHistory));
  }
  cmdIndex = cmdHistory.length;
}

function setMode(m) {
  mode = m;
  welcomeEl.hidden = m !== 'welcome';
  setupEl.hidden = m !== 'setup';
  navEl.hidden = m !== 'app';
  pageOverview.hidden = m !== 'app' || currentPage !== 'overview';
  pageConsole.hidden = m !== 'app' || currentPage !== 'console';
  pageServers.hidden = m !== 'app' || currentPage !== 'servers';
  pagePlayers.hidden = m !== 'app' || currentPage !== 'players';
  pageServer.hidden = m !== 'app' || currentPage !== 'server';
  btnSubmit.textContent = m === 'setup' ? 'Se connecter' : 'Enregistrer';
  formCard.hidden = false;
  if (m === 'app') serversFormSlot.appendChild(formCard);
  else setupFormSlot.appendChild(formCard);
  if (m === 'setup') {
    setupType = null;
    setupChoiceEl.hidden = false;
    setupFormSlot.hidden = true;
  } else {
    setupChoiceEl.hidden = true;
    setupFormSlot.hidden = false;
  }
}

function showPage(page) {
  currentPage = page;
  for (const b of document.querySelectorAll('.nav-btn')) {
    b.classList.toggle('active', b.dataset.page === page);
  }
  pageOverview.hidden = page !== 'overview';
  pageConsole.hidden = page !== 'console';
  pageServers.hidden = page !== 'servers';
  pagePlayers.hidden = page !== 'players';
  pageServer.hidden = page !== 'server';
  if (page === 'players') refreshPlayers();
  if (page === 'server') loadServerCtl();
}

document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => {
    if (mode !== 'app') return;
    showPage(b.dataset.page);
  });
});

function field(id) {
  return document.getElementById(id).value.trim();
}

function formData() {
  const type = mode === 'app' ? ((currentServer && currentServer.type) || 'vps') : (setupType || 'vps');
  const rawHost = field('f-host');
  if (type === 'aternos') {
    const parts = rawHost.split(':');
    return {
      id: currentServer ? currentServer.id : undefined,
      type,
      name: field('f-name'),
      host: (parts[0] || '').trim(),
      queryPort: (parts[1] || '').trim() || '25565',
      rconPort: '',
      password: '',
      sshPort: '',
      sshUser: '',
      sshPassword: '',
      serverDir: '',
    };
  }
  return {
    id: currentServer ? currentServer.id : undefined,
    type,
    name: field('f-name'),
    host: rawHost,
    queryPort: field('f-query-port') || '25565',
    rconPort: field('f-rcon-port') || '25575',
    password: document.getElementById('f-password').value,
    sshPort: field('f-ssh-port') || '22',
    sshUser: field('f-ssh-user'),
    sshPassword: document.getElementById('f-ssh-pass').value,
    serverDir: field('f-server-dir') || '~/minecraft',
    startCmd: field('f-start-cmd'),
  };
}

async function doConnect() {
  const data = formData();
  testResultEl.className = '';
  if (!data.name || !data.host) {
    testResultEl.className = 'err';
    testResultEl.textContent = 'Remplis le nom et l\u2019adresse du serveur.';
    return;
  }
  if (data.type === 'vps' && !data.password) {
    testResultEl.className = 'err';
    testResultEl.textContent = 'Mets le mot de passe RCON (rcon.password dans server.properties).';
    return;
  }
  testResultEl.textContent = 'Test de connexion en cours...';
  const res = await window.api.testServer(data);
  const aternos = data.type === 'aternos';
  const offlineProxy = /offline/i.test(res.error || '');
  if (!res.ping && !(aternos && offlineProxy)) {
    testResultEl.className = 'err';
    testResultEl.textContent = `Serveur injoignable : ${res.error || 'ping impossible'}`;
    return;
  }
  if (aternos && !res.ping) {
    testResultEl.className = 'ok';
    testResultEl.textContent = 'Serveur Aternos \u00e9teint pour l\u2019instant — il est enregistr\u00e9, le statut passera \u00ab En ligne \u00bb quand tu le d\u00e9marreras sur Aternos. Connexion...';
  } else if (res.error && res.error.includes('RCON')) {
    testResultEl.className = 'ok';
    testResultEl.textContent = `OK (${res.ping.playersOnline}/${res.ping.playersMax} joueurs) — RCON non disponible : ${res.error} → pas de console/logs (normal sur Aternos gratuit). Connexion...`;
  } else {
    testResultEl.className = 'ok';
    testResultEl.textContent = `OK — ${res.ping.playersOnline}/${res.ping.playersMax} joueurs en ligne. Connexion...`;
  }
  const saved = await window.api.saveServer(data);
  formEl.reset();
  await selectServer(saved);
}

function parseList(list) {
  if (!list) return [];
  const idx = list.indexOf(':');
  if (idx === -1) return [];
  return list
    .slice(idx + 1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function playerChip(name) {
  const li = document.createElement('li');
  const img = document.createElement('img');
  img.alt = name;
  img.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/26`;
  const fb = document.createElement('span');
  fb.className = 'avatar-fallback';
  fb.textContent = (name[0] || '?').toUpperCase();
  fb.style.display = 'none';
  img.onerror = () => {
    img.style.display = 'none';
    fb.style.display = 'inline-flex';
  };
  const label = document.createElement('span');
  label.textContent = name;
  li.appendChild(img);
  li.appendChild(fb);
  li.appendChild(label);
  return li;
}

function renderStatus(result) {
  statusEl.innerHTML = '';
  const online = Boolean(result.ping);
  const badge = document.createElement('span');
  badge.className = `badge ${online ? 'online' : 'offline'}`;
  const dot = document.createElement('span');
  dot.className = 'dot';
  badge.appendChild(dot);
  badge.appendChild(document.createTextNode(online ? 'En ligne' : 'Hors ligne'));
  statusEl.appendChild(badge);
  if (result.error) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = result.error;
    statusEl.appendChild(p);
  }
  if (result.ping) {
    const p = document.createElement('p');
    const lat = result.ping.latency != null ? `, latence ${result.ping.latency} ms` : '';
    p.textContent = `Version ${result.ping.version} — ${result.ping.playersOnline}/${result.ping.playersMax} joueurs${lat}`;
    statusEl.appendChild(p);
    if (result.ping.motd) {
      const m = document.createElement('p');
      m.className = 'motd';
      m.textContent = result.ping.motd;
      statusEl.appendChild(m);
    }
  }
  playersEl.innerHTML = '';
  const clean = (n) => n.replace(/^\*+/, '').trim();
  const names = [...new Set(parseList(result.list).map(clean))];
  if (names.length === 0 && result.ping && result.ping.playersSample) {
    names.push(...new Set(result.ping.playersSample.map(clean)));
  }
  if (names.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Aucun joueur en ligne';
    playersEl.appendChild(li);
  } else {
    for (const n of names) playersEl.appendChild(playerChip(n));
  }
}

function fmtTime(ts, rangeMs) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  if (rangeMs <= 3 * 86400000) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}h`;
}

function svgText(svg, ns, x, y, str, anchor, fill, size) {
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  if (anchor) t.setAttribute('text-anchor', anchor);
  t.setAttribute('fill', fill || '#8b96a8');
  t.setAttribute('font-size', String(size || 10));
  t.textContent = str;
  svg.appendChild(t);
}

function svgLine(svg, ns, x1, y1, x2, y2, stroke) {
  const l = document.createElementNS(ns, 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  l.setAttribute('stroke', stroke);
  svg.appendChild(l);
}

const METRICS = {
  players: { color: '#3b82f6', unit: '', digits: 0, label: 'Joueurs en ligne' },
  latency: { color: '#d29922', unit: ' ms', digits: 1, label: 'Latence' },
  tps: { color: '#3fb950', unit: '', digits: 1, label: 'TPS' },
};

function metricPoints(history, key, since) {
  let pts = (history || [])
    .filter((p) => p.ts >= since && p[key] != null)
    .map((p) => ({ ts: p.ts, v: Number(p[key]) }));
  if (pts.length > 240) {
    const size = Math.ceil(pts.length / 240);
    const buckets = [];
    for (let i = 0; i < pts.length; i += size) {
      const chunk = pts.slice(i, i + size);
      buckets.push({ ts: chunk[0].ts, v: chunk.reduce((a, p) => a + p.v, 0) / chunk.length });
    }
    pts = buckets;
  }
  return pts;
}

function drawSpark(svg, history, key, color) {
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const pts = metricPoints(history, key, Date.now() - 3600000);
  if (pts.length === 0) return;
  const w = 200;
  const h = 36;
  const vals = pts.map((p) => p.v);
  let max = Math.max(...vals);
  let min = Math.min(...vals);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const X = (i) => (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w);
  const Y = (v) => h - 2 - ((v - min) / (max - min)) * (h - 4);
  const linePts = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`);
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `0,${h} ${linePts.join(' ')} ${w},${h}`);
  area.setAttribute('fill', color);
  area.setAttribute('fill-opacity', '0.15');
  svg.appendChild(area);
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', linePts.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(line);
}

function drawMain(history) {
  const svg = chartMainEl;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const m = METRICS[currentMetric] || METRICS.players;
  const since = currentRange === 'all' ? 0 : Date.now() - currentRange;
  const pts = metricPoints(history, currentMetric, since);
  const w = 600;
  const h = 240;
  const padL = 44;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  if (pts.length === 0) {
    svgText(svg, ns, w / 2, h / 2, 'Pas de donn\u00e9es sur cette p\u00e9riode.', 'middle', '#8b96a8', 13);
    return;
  }
  const vals = pts.map((p) => p.v);
  let max = Math.max(...vals);
  let min = Math.min(...vals);
  if (max === min) {
    max += 1;
    min = Math.max(0, min - 1);
  }
  const span = max - min;
  const effRange = currentRange === 'all' ? pts[pts.length - 1].ts - pts[0].ts : currentRange;
  const X = (i) => padL + (pts.length === 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
  const Y = (v) => padT + ph - ((v - min) / span) * ph;
  svgLine(svg, ns, padL, padT, padL, padT + ph, '#2a3342');
  svgLine(svg, ns, padL, padT + ph, padL + pw, padT + ph, '#2a3342');
  for (const f of [0, 0.5, 1]) {
    const v = min + span * f;
    const yy = Y(v);
    svgLine(svg, ns, padL, yy, padL + pw, yy, '#1c2330');
    svgText(svg, ns, padL - 6, yy + 3, `${v.toFixed(m.digits)}${m.unit}`, 'end');
  }
  const nTicks = 5;
  for (let i = 0; i <= nTicks; i++) {
    const idx = Math.round((i / nTicks) * (pts.length - 1));
    svgText(svg, ns, X(idx), h - 6, fmtTime(pts[idx].ts, effRange), 'middle');
  }
  const linePts = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`);
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `${padL},${padT + ph} ${linePts.join(' ')} ${padL + pw},${padT + ph}`);
  area.setAttribute('fill', m.color);
  area.setAttribute('fill-opacity', '0.18');
  svg.appendChild(area);
  if (pts.length === 1) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', String(X(0)));
    c.setAttribute('cy', String(Y(vals[0])));
    c.setAttribute('r', '3.5');
    c.setAttribute('fill', m.color);
    svg.appendChild(c);
  } else {
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', linePts.join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', m.color);
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);
  }
  svgText(svg, ns, padL + 6, padT + 12, m.label, null, m.color, 11);
  svgText(svg, ns, w - padR, padT + 12, `${vals[vals.length - 1].toFixed(m.digits)}${m.unit} maintenant`, 'end', m.color, 11);
}

function latencyColor(ms) {
  if (ms == null) return '';
  if (ms < 50) return '#3fb950';
  if (ms < 100) return '#d29922';
  if (ms < 200) return '#f0883e';
  return '#e5534b';
}

function drawDashboard(history, result) {
  lastHistory = history || [];
  if (result !== undefined) lastResult = result;
  const r = lastResult || {};
  const last = lastHistory.length ? lastHistory[lastHistory.length - 1] : null;
  const pOnline = r.ping && r.ping.playersOnline != null ? r.ping.playersOnline : last ? last.players : null;
  const pMax = r.ping && r.ping.playersMax != null ? r.ping.playersMax : null;
  kpiPlayersEl.textContent = pOnline != null ? (pMax != null ? `${pOnline}/${pMax}` : `${pOnline}`) : '\u2014';
  const lat = r.ping && r.ping.latency != null ? r.ping.latency : last ? last.latency : null;
  const latColor = latencyColor(lat);
  kpiLatencyEl.textContent = lat != null ? `${Math.round(lat)} ms` : '\u2014';
  kpiLatencyEl.style.color = latColor;
  const tps = r.tps != null ? r.tps : last ? last.tps : null;
  kpiTpsEl.textContent = tps != null ? `${Number(tps).toFixed(1)}` : '\u2014';
  drawMain(lastHistory);
  drawSpark(sparkLatencyEl, lastHistory, 'latency', latColor || METRICS.latency.color);
}

document.querySelectorAll('.range-btn').forEach((b) => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.range-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    currentRange = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
    if (currentServer) drawDashboard(await window.api.getHistory(currentServer.id), lastResult);
  });
});

document.querySelectorAll('.metric-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.metric-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    currentMetric = b.dataset.metric;
    drawDashboard(lastHistory, lastResult);
  });
});

async function refreshList() {
  const servers = await window.api.listServers();
  listEl.innerHTML = '';
  if (servers.length === 0) {
    const li = document.createElement('li');
    li.className = 'server-empty';
    li.textContent = 'Aucun serveur enregistré.';
    listEl.appendChild(li);
    return;
  }
  for (const s of servers) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'server-item';
    if (currentServer && currentServer.id === s.id) btn.classList.add('active');
    btn.textContent = s.name + ' ';
    const tb = document.createElement('span');
    tb.className = 'type-badge';
    tb.textContent = s.type === 'aternos' ? 'Aternos' : 'VPS';
    btn.appendChild(tb);
    btn.addEventListener('click', () => selectServer(s));
    const del = document.createElement('button');
    del.className = 'server-del';
    del.textContent = '✕';
    del.title = 'Supprimer ce serveur';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer le serveur « ${s.name} » ?`)) return;
      const wasCurrent = currentServer && currentServer.id === s.id;
      if (wasCurrent) {
        await window.api.stopLogs(s.id);
        currentServer = null;
        clearInterval(statusTimer);
      }
      await window.api.deleteServer(s.id);
      const remaining = await window.api.listServers();
      await refreshList();
      if (remaining.length === 0) {
        setMode('welcome');
      } else if (wasCurrent) {
        await selectServer(remaining[0]);
      }
    });
    li.appendChild(btn);
    li.appendChild(del);
    listEl.appendChild(li);
  }
}

async function loadStatus() {
  if (!currentServer) return;
  const result = await window.api.getStatus(currentServer.id);
  renderStatus(result);
  lastStatus = result;
  const history = await window.api.getHistory(currentServer.id);
  if (window.api.logDebug) window.api.logDebug(`status: ping=${result.ping ? 'ok' : 'ko'} err=${result.error} histPoints=${history.length}`);
  try {
    drawDashboard(history, result);
  } catch (err) {
    if (window.api.logDebug) window.api.logDebug(`draw error: ${err.message}`);
  }
  loadResources();
}

function resColor(pct) {
  if (pct == null || isNaN(pct)) return '';
  if (pct < 60) return '#3fb950';
  if (pct < 80) return '#d29922';
  if (pct < 90) return '#f0883e';
  return '#e5534b';
}

function setRes(fill, txt, pct, label) {
  const color = resColor(pct);
  fill.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
  fill.style.background = color || 'var(--ok)';
  txt.style.color = color;
  txt.textContent = label;
}

function fmtSize(used, total) {
  if (isNaN(used) || isNaN(total) || total <= 0) return '?';
  if (total >= 1024) return `${(used / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} Go`;
  return `${Math.round(used)} / ${Math.round(total)} Mo`;
}

let resLoading = false;

async function loadResources() {
  if (!currentServer || resLoading) return;
  if (!currentServer.sshUser) {
    resStatusEl.textContent = 'SSH non configur\u00e9 (voir Mes serveurs)';
    return;
  }
  resLoading = true;
  const cmd = [
    "a=$(awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6}' /proc/stat)",
    "sleep 2",
    "b=$(awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6}' /proc/stat)",
    "awk -v a=\"$a\" -v b=\"$b\" 'BEGIN{split(a,A,\" \"); split(b,B,\" \"); d=B[1]-A[1]; if(d>0) printf \"%.1f\\n\", 100*((d-(B[2]-A[2]))/d); else print \"0\"}'",
    "free -m | awk '/^Mem:/ {printf \"%.0f %.0f %.1f\\n\", $3, $2, $3*100/$2}'",
    "df -h / | tail -1 | awk '{gsub(/%/,\"\",$5); print $5, $3, $2}'",
    "echo \"raw:$a|$b\"",
  ].join('; ');
  let res;
  try {
    res = await window.api.sshExec(currentServer.id, cmd);
  } catch (err) {
    resStatusEl.textContent = `Erreur SSH : ${err.message}`;
    resLoading = false;
    return;
  }
  resLoading = false;
  if (res.error) {
    resStatusEl.textContent = `Erreur SSH : ${res.error}`;
    return;
  }
  if (window.api.logDebug) window.api.logDebug(`res raw: ${JSON.stringify(res.out)}`);
  resStatusEl.textContent = '';
  const lines = (res.out || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const cpu = Number(lines[0]);
  setRes(resCpuFill, resCpuTxt, cpu, `${isNaN(cpu) ? '?' : Math.round(cpu) + '%'}`);
  const ram = (lines[1] || '').split(/\s+/);
  const ramUsed = Number(ram[0]);
  const ramTotal = Number(ram[1]);
  let ramPct = Number(ram[2]);
  if (isNaN(ramPct) && ramTotal > 0) ramPct = (ramUsed / ramTotal) * 100;
  setRes(resRamFill, resRamTxt, ramPct, `${isNaN(ramPct) ? '?' : Math.round(ramPct) + '%'} (${fmtSize(ramUsed, ramTotal)})`);
  const disk = (lines[2] || '').split(/\s+/);
  const diskPct = Number(disk[0]);
  setRes(resDiskFill, resDiskTxt, diskPct, `${isNaN(diskPct) ? '?' : Math.round(diskPct) + '%'} (${disk[1] || '?'} / ${disk[2] || '?'})`);
  if (isNaN(cpu) && isNaN(ramPct) && isNaN(diskPct)) {
    resStatusEl.textContent = `Re\u00e7u du serveur : ${JSON.stringify(res.out || '').slice(0, 120)}`;
  }
}

async function selectServer(s) {
  if (currentServer && currentServer.id !== s.id) await window.api.stopLogs(currentServer.id);
  currentServer = s;
  setMode('app');
  await window.api.setSetting('lastServerId', s.id);
  const chartSrv = document.getElementById('chart-srv');
  if (chartSrv) chartSrv.textContent = s.name;
  drawDashboard([], null);
  document.getElementById('f-name').value = s.name;
  document.getElementById('f-host').value = (s.type === 'aternos') ? `${s.host}:${s.queryPort}` : s.host;
  document.getElementById('f-query-port').value = s.queryPort;
  document.getElementById('f-rcon-port').value = s.rconPort;
  document.getElementById('f-ssh-port').value = s.sshPort || 22;
  document.getElementById('f-ssh-user').value = s.sshUser || '';
  document.getElementById('f-server-dir').value = s.serverDir || '~/minecraft';
  document.getElementById('f-start-cmd').value = s.startCmd || '';
  applyFormType(s.type || 'vps');
  const noRcon = (s.type === 'aternos') || !s.hasPassword;
  consoleForm.hidden = noRcon;
  if (consoleNoRconEl) consoleNoRconEl.hidden = !noRcon;
  const hasRcon = !noRcon;
  const hasSsh = Boolean(s.sshUser);
  const navConsole = document.getElementById('nav-console');
  if (navConsole) {
    navConsole.hidden = !(hasRcon || hasSsh);
    if (navConsole.hidden && currentPage === 'console') showPage('overview');
  }
  const cardWl = document.getElementById('card-whitelist');
  const cardBans = document.getElementById('card-bans');
  const cardSearch = document.getElementById('card-search');
  const plLimited = document.getElementById('players-limited');
  if (cardWl) cardWl.hidden = !hasRcon;
  if (cardBans) cardBans.hidden = !hasRcon;
  if (cardSearch) cardSearch.hidden = !hasSsh;
  if (plLimited) plLimited.hidden = hasRcon;
  const resCard = document.getElementById('res-card');
  if (resCard) resCard.hidden = !hasSsh;
  const navServer = document.getElementById('nav-server');
  if (navServer) {
    navServer.hidden = !hasSsh;
    if (navServer.hidden && currentPage === 'server') showPage('overview');
  }
  srvRunning = false;
  updateSrvButtons();
  if (currentPage === 'server') loadServerCtl();
  const sshBox = document.querySelector('.ssh-box');
  if (sshBox && s.sshUser && !s.hasSshPassword) sshBox.open = true;
  consoleOut.innerHTML = '';
  loadCmdHistory();
  await refreshList();
  await loadStatus();
  if (currentPage === 'players') refreshPlayers();
  clearInterval(statusTimer);
  statusTimer = setInterval(loadStatus, 15000);
  if (window.api.logDebug) window.api.logDebug(`selectServer id=${s.id} sshUser=${s.sshUser || '(vide)'}`);
  if (s.sshUser) {
    const r = await window.api.startLogs(s.id);
    if (window.api.logDebug) window.api.logDebug(`startLogs -> ${JSON.stringify(r)}`);
  } else {
    addConsoleLine('Logs en direct inactifs — remplis la connexion SSH (mot de passe) dans Mes serveurs pour voir le chat et les logs.', 'ts', false);
  }
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (mode === 'setup') {
    await doConnect();
    return;
  }
  const data = formData();
  if (data.type !== 'aternos' && !data.password && !(currentServer && currentServer.hasPassword)) {
    testResultEl.className = 'err';
    testResultEl.textContent = "Mets le mot de passe RCON avant d'enregistrer, sinon la console ne marchera pas.";
    return;
  }
  const saved = await window.api.saveServer(data);
  formEl.reset();
  await selectServer(saved);
});

testBtn.addEventListener('click', async () => {
  testResultEl.className = '';
  testResultEl.textContent = 'Test en cours...';
  const result = await window.api.testServer(formData());
  if (result.error) {
    testResultEl.className = 'err';
    testResultEl.textContent = `Échec : ${result.error}`;
  } else {
    const parts = [];
    if (result.ping) parts.push(`${result.ping.playersOnline}/${result.ping.playersMax} joueurs en ligne`);
    if (result.list) parts.push(`RCON OK : ${result.list}`);
    testResultEl.className = 'ok';
    testResultEl.textContent = `OK — ${parts.join(' | ')}`;
  }
});

function addConsoleLine(text, cls, withTs = true) {
  const div = document.createElement('div');
  div.className = `line ${cls}`;
  if (withTs) {
    const t = document.createElement('span');
    t.className = 'ts';
    t.textContent = `[${new Date().toLocaleTimeString('fr-FR')}] `;
    div.appendChild(t);
  }
  div.appendChild(document.createTextNode(text));
  consoleOut.appendChild(div);
  consoleOut.scrollTop = consoleOut.scrollHeight;
}

function logClass(line) {
  if (/ERROR|SEVERE/i.test(line)) return 'err';
  if (/WARN/i.test(line)) return 'warn';
  return 'log';
}

window.api.onLogs((data) => {
  if (!currentServer || data.id !== currentServer.id) return;
  if (data.error) {
    if (window.api.logDebug) window.api.logDebug(`[SSH error] ${data.error}`);
    addConsoleLine(`[SSH] ${data.error}`, 'err', false);
  } else if (data.line) {
    addConsoleLine(data.line, logClass(data.line), false);
  }
});

consoleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentServer) return;
  const cmd = cmdInput.value.trim();
  if (!cmd) return;
  pushCmdHistory(cmd);
  addConsoleLine(`> ${cmd}`, 'cmd');
  try {
    const out = await window.api.sendCommand(currentServer.id, cmd);
    for (const l of String(out).split('\n')) {
      if (l.trim()) addConsoleLine(l, 'out');
    }
  } catch (err) {
    addConsoleLine(`Erreur : ${err.message}`, 'err');
  }
  cmdInput.value = '';
});

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdIndex > 0) {
      if (cmdIndex === cmdHistory.length) cmdDraft = cmdInput.value;
      cmdIndex -= 1;
      cmdInput.value = cmdHistory[cmdIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cmdIndex < cmdHistory.length - 1) {
      cmdIndex += 1;
      cmdInput.value = cmdHistory[cmdIndex];
    } else {
      cmdIndex = cmdHistory.length;
      cmdInput.value = cmdDraft;
    }
  }
});

function parseNames(out) {
  if (!out) return [];
  const idx = out.indexOf(':');
  if (idx === -1) return [];
  return out.slice(idx + 1)
    .split(/[,\n]/)
    .map((s) => s.replace(/^\*+/, '').replace(/\(.*$/, '').trim())
    .filter((s) => /^[A-Za-z0-9_]{2,16}$/.test(s));
}

async function runCmd(cmd) {
  return window.api.sendCommand(currentServer.id, cmd);
}

async function refreshPlayers() {
  if (!currentServer) return;
  const canRcon = currentServer.type !== 'aternos' && currentServer.hasPassword;
  if (!canRcon) {
    playersOnlineEl.innerHTML = '';
    const sample = (lastStatus && lastStatus.ping && lastStatus.ping.playersSample) || [];
    const names = [...new Set(sample.map((x) => String(x).replace(/^\*+/, '').trim()).filter(Boolean))];
    if (!names.length) playersOnlineEl.innerHTML = '<li class="muted">Aucun joueur en ligne (d\u2019apr\u00e8s le ping)</li>';
    for (const n of names) {
      const li = document.createElement('li');
      li.textContent = n;
      playersOnlineEl.appendChild(li);
    }
    whitelistStatusEl.textContent = 'Whitelist : n\u00e9cessite RCON (non disponible sur Aternos gratuit)';
    whitelistListEl.innerHTML = '<li class="muted">—</li>';
    banListEl.innerHTML = '<li class="muted">—</li>';
    if (banStatusEl) banStatusEl.textContent = '';
    searchStatus.textContent = 'Recherche dans les logs : n\u00e9cessite SSH (non disponible sur Aternos gratuit)';
    searchResults.innerHTML = '';
    return;
  }
  try {
    const list = await runCmd('list');
    playersOnlineEl.innerHTML = '';
    const names = parseNames(list);
    if (!names.length) playersOnlineEl.innerHTML = '<li class="muted">Aucun joueur en ligne</li>';
    for (const n of names) {
      const li = document.createElement('li');
      li.className = 'player-action';
      li.textContent = n;
      li.title = 'Actions (kick, ban, op...)';
      li.addEventListener('click', () => openModal(n));
      playersOnlineEl.appendChild(li);
    }
    const wl = await runCmd('whitelist list');
    whitelistStatusEl.textContent = /turned off/i.test(wl)
      ? '⚠ marche uniquement si la whitelist est activée (white-list=true dans server.properties)'
      : (parseNames(wl).length ? '' : 'activée, vide');
    whitelistListEl.innerHTML = '';
    const wnames = parseNames(wl);
    if (!wnames.length) whitelistListEl.innerHTML = '<li class="muted">Vide — clique un pseudo pour retirer</li>';
    for (const n of wnames) {
      const li = document.createElement('li');
      li.className = 'player-action';
      li.textContent = `${n} ✕`;
      li.title = 'Retirer de la whitelist';
      li.addEventListener('click', async () => {
        try { await runCmd(`whitelist remove ${n}`); } catch (err) { whitelistStatusEl.textContent = `Erreur : ${err.message}`; }
        await refreshPlayers();
      });
      whitelistListEl.appendChild(li);
    }
    const bans = await runCmd('banlist players');
    banListEl.innerHTML = '';
    banStatusEl.textContent = '';
    const bnames = parseNames(bans);
    if (!bnames.length) banListEl.innerHTML = '<li class="muted">Aucun joueur banni</li>';
    for (const n of bnames) {
      const li = document.createElement('li');
      li.className = 'player-action';
      li.textContent = n;
      li.title = 'Cliquer pour d\u00e9bannir';
      li.addEventListener('click', async () => {
        let msg;
        try {
          const out = await runCmd(`unban ${n}`);
          addConsoleLine(`> unban ${n}`, 'cmd');
          if (out) addConsoleLine(out, 'out');
          msg = `${n} d\u00e9banni`;
        } catch (err) {
          msg = `Erreur : ${err.message}`;
        }
        await refreshPlayers();
        banStatusEl.textContent = msg;
      });
      banListEl.appendChild(li);
    }
  } catch (err) {
    playersOnlineEl.innerHTML = `<li class="muted error">${err.message}</li>`;
  }
}

function openModal(name) {
  modalPlayer = name;
  modalPlayerEl.textContent = name;
  modalResult.textContent = '';
  modalExtra.value = '';
  modal.hidden = false;
}

document.getElementById('modal-close').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

document.querySelectorAll('#player-modal [data-act]').forEach((b) => {
  b.addEventListener('click', async () => {
    if (!modalPlayer || !currentServer) return;
    const p = modalPlayer;
    const extra = modalExtra.value.trim();
    let cmds = [];
    switch (b.dataset.act) {
      case 'kick': cmds = [`kick ${p}${extra ? ` ${extra}` : ''}`]; break;
      case 'ban': cmds = [`ban ${p}${extra ? ` ${extra}` : ''}`]; break;
      case 'op': cmds = [`op ${p}`]; break;
      case 'deop': cmds = [`deop ${p}`]; break;
      case 'gm_creative': cmds = [`gamemode creative ${p}`]; break;
      case 'gm_survival': cmds = [`gamemode survival ${p}`]; break;
      case 'wl_add': cmds = [`whitelist add ${p}`]; break;
      case 'wl_remove': cmds = [`whitelist remove ${p}`]; break;
    }
    if (!cmds.length) {
      modalResult.textContent = 'Mets une raison dans le champ pour kick/ban.';
      return;
    }
    modalResult.textContent = 'En cours...';
    let allOut = '';
    try {
      for (const c of cmds) {
        const out = await runCmd(c);
        addConsoleLine(`> ${c}`, 'cmd');
        if (out) {
          addConsoleLine(out, 'out');
          allOut += out + '\n';
        }
      }
      modalResult.textContent = allOut.trim() || 'OK';
    } catch (err) {
      modalResult.textContent = `Erreur : ${err.message}`;
    }
    await refreshPlayers();
    await loadStatus();
  });
});

wlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = wlInput.value.trim();
  if (!name || !currentServer) return;
  try {
    await runCmd(`whitelist add ${name}`);
    wlInput.value = '';
    await refreshPlayers();
  } catch (err) {
    whitelistStatusEl.textContent = `Erreur : ${err.message}`;
  }
});

async function withRefresh(btn, fn) {
  if (!btn) return fn();
  btn.classList.add('loading');
  btn.disabled = true;
  const start = Date.now();
  try {
    await fn();
  } finally {
    const wait = Math.max(0, 600 - (Date.now() - start));
    setTimeout(() => {
      btn.classList.remove('loading');
      btn.disabled = false;
    }, wait);
  }
}

btnRefreshPlayers.addEventListener('click', () => withRefresh(btnRefreshPlayers, refreshPlayers));

btnRefresh.addEventListener('click', () => withRefresh(btnRefresh, async () => {
  await refreshList();
  await loadStatus();
  await loadResources();
  if (currentPage === 'players') await refreshPlayers();
}));

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentServer) return;
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;
  searchStatus.textContent = 'Recherche dans les logs du serveur...';
  searchResults.innerHTML = '';
  const dir = currentServer.serverDir || '~/minecraft';
  const cmd = `D=${dir}; cd "$D" 2>/dev/null; { grep -h "joined the game" logs/latest.log 2>/dev/null; zcat logs/*.gz 2>/dev/null | grep "joined the game"; } | sed -E 's/.*\\]: *([^ ]+) joined the game.*/\\1/' | sort -u`;
  const res = await window.api.sshExec(currentServer.id, cmd);
  if (res.error) {
    searchStatus.textContent = `Erreur SSH : ${res.error}`;
    return;
  }
  const all = (res.out || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const found = all.filter((n) => n.toLowerCase().includes(q));
  searchStatus.textContent = `${found.length} joueur(s) trouvé(s) sur ${all.length} au total`;
  if (!found.length) searchResults.innerHTML = '<li class="muted">Aucun résultat</li>';
  for (const n of found) {
    const li = document.createElement('li');
    li.className = 'player-action';
    li.textContent = n;
    li.title = 'Actions (ban, op, whitelist...)';
    li.addEventListener('click', () => openModal(n));
    searchResults.appendChild(li);
  }
});

function applyFormType(t) {
  const aternos = t === 'aternos';
  if (vpsFieldsEl) vpsFieldsEl.hidden = aternos;
  if (hostLabelEl) hostLabelEl.textContent = aternos ? 'Adresse Aternos' : 'Adresse IP';
  if (hostInfoEl) {
    hostInfoEl.dataset.tip = aternos
      ? 'Adresse compl\u00e8te affich\u00e9e sur ton panel Aternos : xxx.aternos.me:PORT (ex : abc.aternos.me:12345). Le port change \u00e0 chaque d\u00e9marrage du serveur : mets-le \u00e0 jour dans Mes serveurs.'
      : 'IP publique de la machine qui h\u00e9berge le serveur. Pour la trouver, sur le serveur tape : curl ifconfig.me (IP publique) ou hostname -I (IP locale si m\u00eame r\u00e9seau).';
  }
  if (fHostInput) fHostInput.placeholder = aternos ? 'xxx.aternos.me:PORT' : '';
  const h2 = formCard.querySelector('h2');
  if (h2) h2.textContent = aternos ? 'Ajouter un serveur Aternos' : 'Ajouter / modifier un serveur';
  const hb = formCard.querySelector('.help-box');
  if (hb) hb.hidden = aternos;
}

btnTypeAternos.addEventListener('click', () => {
  setupType = 'aternos';
  applyFormType('aternos');
  setupChoiceEl.hidden = true;
  setupFormSlot.hidden = false;
  if (fHostInput) fHostInput.focus();
});
btnTypeVps.addEventListener('click', () => {
  setupType = 'vps';
  applyFormType('vps');
  setupChoiceEl.hidden = true;
  setupFormSlot.hidden = false;
});
btnSetupBack.addEventListener('click', () => setMode('welcome'));

function fmtUptime(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

let srvRunning = false;

function updateSrvButtons() {
  if (!btnSrvStart) return;
  const hasStartCmd = Boolean(currentServer && currentServer.startCmd);
  btnSrvStart.disabled = srvRunning || !hasStartCmd;
  btnSrvStop.disabled = !srvRunning;
  btnSrvRestart.disabled = !srvRunning;
}

async function loadServerCtl() {
  if (!currentServer || !currentServer.sshUser) return;
  if (srvDirEl) srvDirEl.textContent = `Dossier : ${currentServer.serverDir || '—'}`;
  const cmd = "p=$(pgrep -f 'server\.jar' | head -1); if [ -n \"$p\" ]; then echo \"PID=$p\"; ps -o etimes= -p \"$p\" | tr -d ' '; else echo STOPPED; fi";
  let res;
  try {
    res = await window.api.sshExec(currentServer.id, cmd);
  } catch (err) {
    if (srvStateEl) srvStateEl.textContent = `Erreur SSH : ${err.message}`;
    return;
  }
  if (res.error) {
    if (srvStateEl) srvStateEl.textContent = `Erreur SSH : ${res.error}`;
    return;
  }
  const out = (res.out || '').trim();
  if (out === 'STOPPED' || !out) {
    srvRunning = false;
    if (srvStateEl) srvStateEl.textContent = 'Processus du serveur arrêté (hors ligne).';
    if (srvPidEl) srvPidEl.textContent = 'PID : —';
    if (srvUptimeEl) srvUptimeEl.textContent = 'Uptime : —';
  } else {
    srvRunning = true;
    const m = out.match(/PID=(\d+)/);
    const sec = Number(out.split('\n').pop());
    if (srvStateEl) srvStateEl.textContent = 'Processus du serveur en cours d\u2019exécution.';
    if (srvPidEl) srvPidEl.textContent = `PID : ${m ? m[1] : '?'}`;
    if (srvUptimeEl) srvUptimeEl.textContent = `Uptime : ${fmtUptime(sec)}`;
  }
  updateSrvButtons();
}

async function srvStop() {
  const hasRcon = currentServer.type !== 'aternos' && currentServer.hasPassword;
  if (hasRcon) {
    const out = await runCmd('stop');
    addConsoleLine('> stop', 'cmd');
    if (out) addConsoleLine(out, 'out');
  } else {
    await window.api.sshExec(currentServer.id, "pkill -f 'server\.jar'");
  }
}

async function srvStart() {
  if (!currentServer.startCmd) {
    if (srvCtlStatus) srvCtlStatus.textContent = 'Mets la « commande de démarrage » dans Mes serveurs (section SSH) pour activer ce bouton.';
    return;
  }
  const r = await window.api.sshExec(currentServer.id, currentServer.startCmd);
  if (srvCtlStatus) srvCtlStatus.textContent = r.error ? `Erreur : ${r.error}` : 'Commande de démarrage envoyée.';
}

btnSrvStart.addEventListener('click', () => withRefresh(btnSrvStart, async () => {
  await srvStart();
  await new Promise((r) => setTimeout(r, 3000));
  await loadServerCtl();
  await loadStatus();
}));

btnSrvStop.addEventListener('click', () => withRefresh(btnSrvStop, async () => {
  if (srvCtlStatus) srvCtlStatus.textContent = 'Arrêt demandé (stop)...';
  try {
    await srvStop();
  } catch (err) {
    if (srvCtlStatus) srvCtlStatus.textContent = `Erreur : ${err.message}`;
  }
  await new Promise((r) => setTimeout(r, 3000));
  await loadServerCtl();
  await loadStatus();
}));

btnSrvRestart.addEventListener('click', () => withRefresh(btnSrvRestart, async () => {
  if (srvCtlStatus) srvCtlStatus.textContent = 'Redémarrage : arrêt en cours...';
  try {
    await srvStop();
  } catch (err) { /* le serveur est peut-être déjà arrêté */ }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await window.api.getStatus(currentServer.id);
    if (!st.ping) break;
  }
  if (srvCtlStatus) srvCtlStatus.textContent = 'Démarrage...';
  await srvStart();
  await new Promise((r) => setTimeout(r, 5000));
  await loadServerCtl();
  await loadStatus();
}));

btnWelcomeAdd.addEventListener('click', () => setMode('setup'));

window.api.getBuild().then((b) => {
  const tag = document.getElementById('build-tag');
  if (tag) tag.textContent = `build ${b}`;
});

(async () => {
  const servers = await window.api.listServers();
  await refreshList();
  if (servers.length === 0) {
    setMode('welcome');
  } else {
    const last = await window.api.getSetting('lastServerId');
    const s = servers.find((x) => x.id === last) || servers[0];
    await selectServer(s);
  }
})();

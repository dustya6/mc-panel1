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
const pageSettings = document.getElementById('page-settings');
const pageNews = document.getElementById('page-news');
const pagePlugins = document.getElementById('page-plugins');
const plugPlatformEl = document.getElementById('plug-platform');
const plugVersionEl = document.getElementById('plug-version');
const plugSavedEl = document.getElementById('plug-saved');
const plugForm = document.getElementById('plug-form');
const plugQEl = document.getElementById('plug-q');
const plugResultsEl = document.getElementById('plug-results');
const cardPlugInstalled = document.getElementById('card-plug-installed');
const plugInstalledEl = document.getElementById('plug-installed');
const plugInstalledHint = document.getElementById('plug-installed-hint');
const btnPlugInstalled = document.getElementById('btn-plug-installed');
const pageAutomations = document.getElementById('page-automations');
const pageStats = document.getElementById('page-stats');
const statsGrid = document.getElementById('stats-grid');
const statsEmpty = document.getElementById('stats-empty');
const statsSearchForm = document.getElementById('stats-search-form');
const statsSearchInput = document.getElementById('stats-search-input');
const statsSearchStatus = document.getElementById('stats-search-status');
const statsSearchResults = document.getElementById('stats-search-results');
const newsDot = document.getElementById('news-dot');
const settingsStatusEl = document.getElementById('settings-status');
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
const modalProfileEl = document.getElementById('modal-profile');
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
const quickCmdsEl = document.getElementById('quick-cmds');
const quickForm = document.getElementById('quick-form');
const qcLabel = document.getElementById('qc-label');
const qcCmd = document.getElementById('qc-cmd');
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
let refreshSec = 15;
let prevPing = undefined;
let lastPlayersMax = 20;
const activeAlerts = {};
const logAlertAt = {};
const pluginErrCount = {};
const restartTimes = [];
let restartAlerted = false;
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
  pageSettings.hidden = m !== 'app' || currentPage !== 'settings';
  pageNews.hidden = m !== 'app' || currentPage !== 'news';
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
  pageSettings.hidden = page !== 'settings';
  pageNews.hidden = page !== 'news';
  pagePlugins.hidden = page !== 'plugins';
  pageAutomations.hidden = page !== 'automations';
  pageStats.hidden = page !== 'stats';
  if (page === 'players') { refreshPlayers(); drawHeatmap(lastHistory); }
  if (page === 'stats') loadStats();
  if (page === 'server') loadServerCtl();
  if (page === 'console') renderQuickCmds();
  if (page === 'settings') renderSettings();
  if (page === 'news') {
    renderNews();
    window.api.setSetting('newsLastSeen', Date.now()).then(() => updateNewsDot());
  }
  if (page === 'plugins') initPluginsPage();
  if (page === 'automations' && window.AutoPage) window.AutoPage.init();
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
  cpu: { color: '#f0883e', unit: '%', digits: 0, label: 'CPU du VPS' },
  ram: { color: '#56b6c2', unit: '%', digits: 0, label: 'RAM du VPS' },
  disk: { color: '#98c379', unit: '%', digits: 0, label: 'Disque' },
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
  updatePeakAvg(lastHistory);
  drawHeatmap(lastHistory);
  drawSpark(sparkLatencyEl, lastHistory, 'latency', latColor || METRICS.latency.color);
}

function renderHeatLegend(maxP) {
  const ceil = (f) => Math.ceil(maxP * f);
  const b1 = ceil(0.10);
  const b2 = ceil(0.25);
  const b3 = ceil(0.45);
  const b4 = ceil(0.75);
  const labels = ['0', `1–${b1}`, `${b1 + 1}–${b2}`, `${b2 + 1}–${b3}`, `${b3 + 1}–${b4}`, `${b4 + 1}–${maxP}`];
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('lg' + i);
    if (el) el.textContent = labels[i] + (i === 0 ? '' : ' joueurs');
  }
  const hint = document.getElementById('lg-hint');
  if (hint) hint.textContent = `joueurs (limite max du serveur : ${maxP})`;
}

function heatColorAbs(v, max) {
  // seuils en % de la limite max du serveur : 0 = gris, 1-10% vert clair, 11-25% vert fonce, 26-45% jaune, 46-75% rouge clair, 76-100% rouge fonce
  if (v < 0.05) return null;
  const pct = max > 0 ? (v / max) * 100 : 0;
  if (pct <= 10) return '#a8e6a1';
  if (pct <= 25) return '#2e7d32';
  if (pct <= 45) return '#e3b341';
  if (pct <= 75) return '#ef5350';
  return '#a40e26';
}

const HEAT_HOURS = [9, 11, 16, 18, 20, 22];

function heatRowHour(hour) {
  let r = null;
  for (const h of HEAT_HOURS) {
    if (hour >= h) r = h;
    else break;
  }
  return r;
}

function drawHeatmap(history) {
  const el = document.getElementById('heatmap');
  if (!el) return;
  el.innerHTML = '';
  // toute l'historique cumulee (30 jours) : le tableau ne recommence pas chaque semaine
  const pts = (history || []).filter((p) => p.players != null);
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const grid = el;
  grid.style.gridTemplateColumns = `36px repeat(7, 1fr)`;
  if (!pts.length) {
    const empty = document.createElement('div');
    empty.className = 'hm-empty';
    empty.textContent = 'Pas de données sur cette période.';
    grid.appendChild(empty);
    return;
  }
  const allPts = (history || []).filter((p) => p.players != null);
  const avg = allPts.length ? allPts.reduce((a, p) => a + Number(p.players), 0) / allPts.length : null;
  const maxP = lastPlayersMax || 20;
  renderHeatLegend(maxP);
  const cells = {};
  for (const p of pts) {
    const d = new Date(p.ts);
    const rh = heatRowHour(d.getHours());
    if (rh == null) continue;
    const key = ((d.getDay() + 6) % 7) + '-' + rh;
    if (!cells[key]) cells[key] = { sum: 0, n: 0 };
    cells[key].sum += Number(p.players);
    cells[key].n++;
  }
  for (const h of HEAT_HOURS) {
    const lab = document.createElement('div');
    lab.className = 'hm-hour';
    const hi = HEAT_HOURS.indexOf(h);
    const hnext = HEAT_HOURS[hi + 1] || 24;
    lab.textContent = `${h}h–${hnext}h`;
    grid.appendChild(lab);
    for (let dow = 0; dow < 7; dow++) {
      const c = document.createElement('div');
      c.className = 'hm-cell';
      const cell = cells[dow + '-' + h];
      let tip;
      const v = cell ? cell.sum / cell.n : 0;
      const label = String(v > 0 ? Math.ceil(v) : 0);
      const color = cell ? heatColorAbs(v, maxP) : null;
      const hi2 = HEAT_HOURS.indexOf(h);
      const hnext2 = HEAT_HOURS[hi2 + 1] || 24;
      if (color) c.style.background = color;
      else c.style.background = 'var(--panel-2)';
      tip = `${days[dow]} ${h}h–${hnext2}h : ${label} joueur${Number(label) > 1 ? 's' : ''}`;
      c.addEventListener('mouseenter', (e) => showHmTip(tip, e));
      c.addEventListener('mouseleave', hideHmTip);
      grid.appendChild(c);
    }
  }
  // jours en bas
  const corner = document.createElement('div');
  corner.className = 'hm-corner';
  grid.appendChild(corner);
  for (const d of days) {
    const c = document.createElement('div');
    c.className = 'hm-day';
    c.textContent = d;
    grid.appendChild(c);
  }
}

function updatePeakAvg(history) {
  const el = document.getElementById('peak-avg');
  if (!el) return;
  const since = currentRange === 'all' ? 0 : Date.now() - currentRange;
  const pts = (history || []).filter((p) => p.ts >= since && p.players != null);
  if (!pts.length) {
    el.textContent = '';
    return;
  }
  const hours = new Array(24).fill(null);
  for (const p of pts) {
    const hh = new Date(p.ts).getHours();
    if (!hours[hh]) hours[hh] = { sum: 0, n: 0 };
    hours[hh].sum += Number(p.players);
    hours[hh].n++;
  }
  let peak = 0;
  let peakV = -1;
  hours.forEach((x, i) => {
    if (x && x.sum / x.n > peakV) {
      peakV = x.sum / x.n;
      peak = i;
    }
  });
  const txt = `${peak}h — ${peakV.toFixed(1)} joueurs en moyenne`;
  el.textContent = `pic moyen : ${peak}h (${peakV.toFixed(1)} joueurs)`;
  const big = document.getElementById('stat-peak');
  if (big) big.textContent = txt;
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


// Événements des automatisations -> page Actualités (sans lire le .log à la main)
let autoEventPoll = false;
async function pollAutoEvents() {
  if (!currentServer || autoEventPoll || !currentServer.sshUser) return;
  autoEventPoll = true;
  try {
    const autos = await window.api.autoList(currentServer.id).catch(() => []);
    for (const a of autos || []) {
      const r = await window.api.autoLog({ id: currentServer.id, autoId: a.id, n: 300 }).catch(() => null);
      if (!r || !r.ok || !r.out) continue;
      const lines = String(r.out).split('\n').filter((l) => l.includes('EVENT:') || l.includes(' ERR '));
      const key = `autoSeen_${a.id}`;
      const seen = Number(await window.api.getSetting(key)) || 0;
      for (const line of lines.slice(seen)) {
        const isErr = line.includes(' ERR ');
        const msg = line.split(isErr ? ' ERR ' : 'EVENT:')[1].trim();
        if (msg) await addNews(isErr ? 'alerte' : 'auto', `[${a.name || a.id}] ${msg}`);
      }
      await window.api.setSetting(key, lines.length);
    }
  } catch { }
  autoEventPoll = false;
}

async function loadStatus() {
  if (!currentServer) return;
  const result = await window.api.getStatus(currentServer.id);
  renderStatus(result);
  lastStatus = result;
  if (result.ping && result.ping.version) autoFillPlatform(result.ping.version).catch(() => {});
  if (prevPing !== undefined) {
    if (prevPing && !result.ping) addNews('serveur', 'Le serveur est passé hors ligne.');
    else if (!prevPing && result.ping) addNews('serveur', 'Le serveur est de retour en ligne.');
  }
  prevPing = result.ping || null;
  if (result.ping && result.ping.playersMax) lastPlayersMax = result.ping.playersMax;
  await checkAlert('tps', result.tps != null && result.tps < 18, `TPS bas : ${result.tps}`);
  const history = await window.api.getHistory(currentServer.id);
  const hist = (history || []).filter((p) => p.players != null);
  const avgP = hist.length ? hist.reduce((a, p) => a + Number(p.players), 0) / hist.length : null;
  const curP = result.ping ? result.ping.playersOnline : 0;
  await checkAlert('picjoueurs', avgP != null && curP >= 3 && curP > Math.max(2 * avgP, avgP + 5), `Pic de joueurs inhabituel : ${curP} en ligne (moyenne ${avgP == null ? '?' : avgP.toFixed(1)})`);
  if (window.api.logDebug) window.api.logDebug(`status: ping=${result.ping ? 'ok' : 'ko'} err=${result.error} histPoints=${history.length}`);
  try {
    drawDashboard(history, result);
  } catch (err) {
    if (window.api.logDebug) window.api.logDebug(`draw error: ${err.message}`);
  }
  loadResources();
  if (currentPage === 'stats') loadStatsLight();
  pollAutoEvents(); // événements des autos -> Actualités
}

// ---------- Page Statistiques ----------
let statsLogsCache = 0;
let statsLogsData = null;
let lastHistLen = -1;

function fmtDurMs(ms) {
  if (ms == null || isNaN(ms) || ms <= 0) return '0 min';
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 48) return h + ' h ' + (m % 60) + ' min';
  return Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
}
function fmtDate(ts) {
  const d = new Date(ts); const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

function statCard(id, title, kw, value, sub) {
  const d = document.createElement('div');
  d.className = 'stat-big stats-card';
  d.id = id;
  d.dataset.kw = (title + ' ' + kw).toLowerCase();
  d.innerHTML = `<span class="pl">${escapeHtml(title)}</span><span class="pv-big">${escapeHtml(String(value))}</span>` + (sub ? `<span class="hint">${escapeHtml(String(sub))}</span>` : '');
  return d;
}

async function loadStats() {
  if (!currentServer) return;
  const hist = await window.api.getHistory(currentServer.id).catch(() => []);
  renderStats(hist || []);
  applyStatsFilter();
  if (currentServer.sshUser) loadStatsLogs();
}
function loadStatsLight() {
  if (!currentServer) return;
  window.api.getHistory(currentServer.id).then((h) => { renderStats(h || []); applyStatsFilter(); }).catch(() => {});
}

function renderStats(hist) {
  if (!statsGrid) return;
  lastHistLen = hist.length;
  statsGrid.innerHTML = '';
  let rec = null;
  for (const p of hist) if (p.players != null && (!rec || p.players > rec.players)) rec = p;
  const sd = statsLogsData;
  const needSsh = currentServer && currentServer.sshUser;
  const cards = [];
  // 1) temps de fonctionnement (uptime)
  cards.push(statCard('st-uptime', 'Temps de fonctionnement', 'uptime fonctionnement actif depuis durée serveur en ligne marche', sd ? (sd.uptimeSec != null ? fmtDurMs(sd.uptimeSec * 1000) : '—') : '…', sd ? (sd.uptimeLine || 'session en cours (process java)') : (needSsh ? 'chargement…' : 'nécessite SSH (VPS)')));
  // 2) record de joueurs
  if (rec) cards.push(statCard('st-record', 'Record de joueurs', 'record max pic joueurs jamais simultanés maximum', rec.players, 'le ' + fmtDate(rec.ts)));
  // 3) monde : taille + régions explorées (proxy de "chunks chargés")
  cards.push(statCard('st-monde', 'Monde : taille + régions', 'monde chunks régions taille monde exploré gigas dossiers', sd ? (sd.mondeSize || '—') : '…', sd ? (sd.regions + ' régions explorées (chunks chargés = seulement avec un plugin type spark)') : (needSsh ? 'chargement…' : 'nécessite SSH (VPS)')));
  // 4) temps de jeu total
  cards.push(statCard('st-playtotal', 'Temps de jeu total (tous les joueurs)', 'temps de jeu total heures jouées cumulé ensemble', sd ? fmtDurMs(sd.total) : '…', sd ? sd.joins + ' connexions au total' : (needSsh ? 'chargement…' : 'nécessite SSH (VPS)')));
  // 5) morts + top tueur
  cards.push(statCard('st-deaths', 'Morts sur le serveur', 'morts décès tué morts total killed', sd ? sd.deaths : '…', sd && sd.topKiller ? 'top tueur : ' + sd.topKiller : ''));
  // 6) % de joueurs qui reviennent + nouveaux cette semaine
  cards.push(statCard('st-return', 'Joueurs qui reviennent', 'reviennent pourcentage récurrent anciens joueurs nouveaux cette semaine', sd ? sd.revPct + ' %' : '…', sd ? sd.newWeek + ' nouveaux joueurs cette semaine · ' + sd.uniques + ' joueurs uniques' : ''));
  // 7) commandes tapées dans la console du serveur
  cards.push(statCard('st-console', 'Commandes dans la console du serveur', 'commandes console tapées shell historique', sd ? sd.consoleCmds : '…', 'fichier .console_history'));
  // 8) depuis quand les données sont récupérées
  cards.push(statCard('st-span', 'Données collectées par l’appli', 'historique depuis collecte échantillons 15s données récupérées', hist.length ? 'depuis le ' + fmtDate(hist[0].ts) : '—', hist.length + ' échantillons (un toutes les 15 s)'));
  for (const c of cards) statsGrid.appendChild(c);
}

function applyStatsFilter() {
  if (!statsGrid) return;
  const q = (statsSearchInput.value || '').trim().toLowerCase();
  let visible = 0;
  for (const c of statsGrid.children) {
    const show = !q || (c.dataset.kw || '').includes(q);
    c.style.display = show ? '' : 'none';
    if (show) visible++;
  }
  if (q && visible === 0) {
    statsEmpty.hidden = false;
    statsEmpty.textContent = `Aucune statistique pour « ${q} » — essaie : record, monde, morts, jeu, uptime…`;
  } else if (lastHistLen === 0 && !statsLogsData) {
    statsEmpty.hidden = false;
    statsEmpty.textContent = 'Aucune donnée pour l’instant — l’appli enregistre un échantillon toutes les 15 s ; reviens dans quelques minutes.';
  } else {
    statsEmpty.hidden = true;
  }
}

async function loadStatsLogs() {
  if (!currentServer || !currentServer.sshUser) return;
  if (statsLogsData && Date.now() - statsLogsCache < 60000) return;
  statsLogsCache = Date.now();
  const dir = currentServer.serverDir || '~/minecraft';
  const D = `D=${dir}; cd "$D" 2>/dev/null || exit 0`;
  const DEATH = `\\]: [^ ]+ (was slain|was shot|was killed|was blown|was fireballed|was impaled|was poked|was struck|drowned|fell|blew up|starved|withered|suffocated|burned|hit the ground|went up in flames|walked into|tried to swim|discovered the floor|experienced kinetic)`;
  const r1 = await window.api.sshExec(currentServer.id, `${D}
printf '==UP==\\n'; pid=$(pgrep -f java | head -1); if [ -n "$pid" ]; then ps -o etimes= -p "$pid" | tr -d ' '; else head -1 logs/latest.log 2>/dev/null; fi
printf '==MONDE==\\n'; du -sh world 2>/dev/null | cut -f1; ls world/region 2>/dev/null | wc -l
printf '==CONSOLE==\\n'; wc -l < .console_history 2>/dev/null || echo 0
printf '==MORTS==\\n'; { grep -hE "${DEATH}" logs/latest.log 2>/dev/null; for f in logs/*.gz; do [ -e "$f" ] && zcat "$f"; done | grep -hE "${DEATH}"; } | wc -l
printf '==TOPKILL==\\n'; { grep -hE "${DEATH}" logs/latest.log 2>/dev/null; for f in logs/*.gz; do [ -e "$f" ] && zcat "$f"; done | grep -hE "${DEATH}"; } | grep -oE 'by [A-Za-z0-9_]+$' | sort | uniq -c | sort -nr | head -1`).catch(() => null);
  const r3 = await window.api.sshExec(currentServer.id, `${D}; { for f in logs/*.log.gz logs/*.log; do [ -e "$f" ] || continue; b=$(basename "$f"); [ "$b" = "latest.log" ] && continue; d=$(echo "$b" | cut -d- -f1-3); if [[ "$f" == *.gz ]]; then zcat "$f"; else cat "$f"; fi | grep -hE 'joined the game|left the game' | sed -E "s/^\\[([0-9:]{8})\\].*\\]: ([^ ]+) (joined|left) the game/$d \\1 \\2 \\3/"; done; grep -hE 'joined the game|left the game' logs/latest.log 2>/dev/null | sed -E "s/^\\[([0-9:]{8})\\].*\\]: ([^ ]+) (joined|left) the game/$(date +%F) \\1 \\2 \\3/"; } | tail -20000`).catch(() => null);
  if (!r1 || r1.error || !r3 || r3.error) return;
  // parse sections ==XX==
  const out = r1.out || '';
  const sec = {};
  let cur = null;
  for (const line of out.split('\n')) {
    const m = line.match(/^==([A-Z]+)==$/);
    if (m) { cur = m[1]; sec[cur] = []; } else if (cur) sec[cur].push(line);
  }
  const upSec = (sec.UP && sec.UP[0] || '').trim();
  const uptimeSec = /^\d+$/.test(upSec) ? parseInt(upSec, 10) : null;
  const mondeSize = (sec.MONDE && sec.MONDE[0] || '').trim();
  const regions = parseInt((sec.MONDE && sec.MONDE[1]) || '0', 10) || 0;
  const consoleCmds = parseInt((sec.CONSOLE && sec.CONSOLE[0]) || '0', 10) || 0;
  const deaths = parseInt((sec.MORTS && sec.MORTS[0]) || '0', 10) || 0;
  const topKiller = ((sec.TOPKILL && sec.TOPKILL[0]) || '').trim().replace(/^\d+\s+/, '').replace(/^by /, '');
  // sessions depuis joins/leaves
  const evs = (r3.out || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{4}-\d{2}-\d{2}) ([0-9:]{8}) (\S+) (joined|left)$/);
    return m ? { ts: Date.parse(m[1] + 'T' + m[2]), name: m[3], ev: m[4] } : null;
  }).filter(Boolean).sort((a, b) => a.ts - b.ts);
  const play = {}; const joinsByPlayer = {}; const open = {}; let joins = 0;
  const weekAgo = Date.now() - 7 * 86400e3;
  let newWeek = 0;
  for (const e of evs) {
    if (e.ev === 'joined') {
      joins++; joinsByPlayer[e.name] = (joinsByPlayer[e.name] || 0) + 1;
      open[e.name] = e.ts;
      if (e.ts >= weekAgo) newWeek++;
    } else if (open[e.name] != null) {
      play[e.name] = (play[e.name] || 0) + (e.ts - open[e.name]);
      delete open[e.name];
    }
  }
  const names = Object.keys(play);
  const uniques = Object.keys(joinsByPlayer).length;
  const total = names.reduce((s, n) => s + play[n], 0);
  const revenants = names.filter((n) => (joinsByPlayer[n] || 0) >= 2).length;
  statsLogsData = {
    uptimeSec, uptimeLine: uptimeSec == null ? upSec : null,
    mondeSize, regions, consoleCmds, deaths, topKiller,
    total, joins, uniques, revPct: uniques ? Math.round((revenants / uniques) * 100) : 0, newWeek,
  };
  if (currentPage === 'stats') loadStatsLight();
}

let statsSearchTimer = null;
function onStatsSearchInput() {
  applyStatsFilter();
  clearTimeout(statsSearchTimer);
  const q = statsSearchInput.value.trim();
  if (q.length < 2 || !currentServer || !currentServer.sshUser) {
    statsSearchResults.innerHTML = '';
    statsSearchStatus.textContent = q.length >= 2 && currentServer && !currentServer.sshUser ? 'Recherche joueur : nécessite SSH (VPS, pas Aternos gratuit). Le mot-clé filtre quand même les stats ci-dessous.' : '';
    return;
  }
  statsSearchStatus.textContent = 'Recherche du joueur dans les logs…';
  statsSearchTimer = setTimeout(async () => {
    const dir = currentServer.serverDir || '~/minecraft';
    const cmd = `D=${dir}; cd "$D" 2>/dev/null; { grep -h "joined the game" logs/latest.log 2>/dev/null; zcat logs/*.gz 2>/dev/null | grep "joined the game"; } | sed -E 's/.*\\]: *([^ ]+) joined the game.*/\\1/' | sort -u`;
    const res = await window.api.sshExec(currentServer.id, cmd).catch(() => null);
    if (!res || res.error) { statsSearchStatus.textContent = 'Recherche joueur indisponible (SSH).'; return; }
    const all = (res.out || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const found = all.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
    statsSearchStatus.textContent = found.length
      ? `${found.length} joueur(s) trouvé(s) — clique pour les actions (ban, op…) :`
      : 'Aucun joueur trouvé. (Le mot-clé filtre aussi les statistiques ci-dessous.)';
    statsSearchResults.innerHTML = '';
    for (const n of found) {
      const li = document.createElement('li');
      li.className = 'player-action';
      li.textContent = n;
      li.addEventListener('click', () => openModal(n));
      statsSearchResults.appendChild(li);
    }
  }, 450);
}
if (statsSearchInput) statsSearchInput.addEventListener('input', onStatsSearchInput);
if (statsSearchForm) statsSearchForm.addEventListener('submit', (e) => { e.preventDefault(); onStatsSearchInput(); });


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
    resStatusEl.textContent = 'SSH non configuré (voir Mes serveurs)';
    return;
  }
  resLoading = true;
  const dir = currentServer.serverDir || '~/minecraft';
  const eventsCmd = `D=${dir}; cd "$D" 2>/dev/null; { for f in logs/*.log.gz logs/*.log; do [ -e "$f" ] || continue; b=$(basename "$f"); [ "$b" = "latest.log" ] && continue; d=$(echo "$b" | cut -d- -f1-3); if [[ "$f" == *.gz ]]; then zcat "$f"; else cat "$f"; fi | grep -hE 'joined the game|left the game' | sed -E "s/^\\[([0-9:]{8})\\].*\\]: ([^ ]+) (joined|left) the game/$d \\1 \\2 \\3/"; done; grep -hE 'joined the game|left the game' logs/latest.log 2>/dev/null | sed -E "s/^\\[([0-9:]{8})\\].*\\]: ([^ ]+) (joined|left) the game/$(date +%F) \\1 \\2 \\3/"; } | tail -20000`;
  const cmd = [
    "a=$(awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6}' /proc/stat)",
    "sleep 2",
    "b=$(awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6}' /proc/stat)",
    "awk -v a=\"$a\" -v b=\"$b\" 'BEGIN{split(a,A,\" \"); split(b,B,\" \"); d=B[1]-A[1]; if(d>0) printf \"%.1f\\n\", 100*((d-(B[2]-A[2]))/d); else print \"0\"}'",
    "free -m | awk '/^Mem:/ {printf \"%.0f %.0f %.1f\\n\", $3, $2, $3*100/$2}'",
    "df -h / | tail -1 | awk '{gsub(/%/,\"\",$5); print $5, $3, $2}'",
    "echo \"raw:$a|$b\"",
    eventsCmd,
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
  if (window.api.logDebug) window.api.logDebug(`res raw: ${JSON.stringify((res.out || '').slice(0, 200))}`);
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
  await checkAlert('disk', !isNaN(diskPct) && diskPct >= 90, `Disque presque plein : ${isNaN(diskPct) ? '?' : Math.round(diskPct)}%`);
  await checkAlert('ram', !isNaN(ramPct) && ramPct >= 90, `RAM presque pleine : ${isNaN(ramPct) ? '?' : Math.round(ramPct)}%`);
  await checkAlert('cpu', !isNaN(cpu) && cpu >= 95, `CPU très haut : ${isNaN(cpu) ? '?' : Math.round(cpu)}%`);
  if (!isNaN(cpu) || !isNaN(ramPct) || !isNaN(diskPct)) {
    window.api.addHistoryPoint(currentServer.id, {
      ts: Date.now(),
      cpu: isNaN(cpu) ? null : cpu,
      ram: isNaN(ramPct) ? null : ramPct,
      disk: isNaN(diskPct) ? null : diskPct,
    }).catch(() => {});
  }
  if (isNaN(cpu) && isNaN(ramPct) && isNaN(diskPct)) {
    resStatusEl.textContent = `Reçu du serveur : ${JSON.stringify(res.out || '').slice(0, 120)}`;
  }
  const resAvgEl = document.getElementById('stat-avg');
  if (resAvgEl) {
    const perPlayer = new Map();
    const openMap = new Map();
    let sessions = 0;
    for (const l of lines.slice(4)) {
      const m = l.match(/^(\d{4}-\d{2}-\d{2}) ([0-9:]{8}) (\S+) (joined|left)$/);
      if (!m) continue;
      const ts = new Date(`${m[1]}T${m[2]}`).getTime();
      if (m[4] === 'joined') {
        sessions++;
        if (!perPlayer.has(m[3])) perPlayer.set(m[3], 0);
        if (!openMap.has(m[3])) openMap.set(m[3], ts);
      } else {
        const o = openMap.get(m[3]);
        if (o != null) {
          perPlayer.set(m[3], perPlayer.get(m[3]) + (ts - o) / 1000);
          openMap.delete(m[3]);
        }
      }
    }
    for (const [name, openTs] of openMap) {
      perPlayer.set(name, (perPlayer.get(name) || 0) + Math.max(0, (Date.now() - openTs) / 1000));
    }
    let totalSec = 0;
    for (const v of perPlayer.values()) totalSec += v;
    if (perPlayer.size > 0 && sessions > 0) {
      resAvgEl.textContent = `${fmtDur(totalSec / sessions)} · ${sessions} sessions, ${perPlayer.size} joueurs`;
    } else {
      resAvgEl.textContent = '—';
    }
  }
}

async function selectServer(s) {
  if (currentServer && currentServer.id !== s.id) await window.api.stopLogs(currentServer.id);
  currentServer = s;
  setMode('app');
  await window.api.setSetting('lastServerId', s.id);
  const chartSrv = document.getElementById('chart-srv');
  if (chartSrv) chartSrv.textContent = s.name;
  const chartSrv2 = document.getElementById('chart-srv2');
  if (chartSrv2) chartSrv2.textContent = s.name;
  const chartSrv3 = document.getElementById('chart-srv3');
  if (chartSrv3) chartSrv3.textContent = s.name;
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
  const statAvgCell = document.getElementById('stat-avg-cell');
  if (statAvgCell) statAvgCell.hidden = !hasSsh;
  const cardQuick = document.getElementById('card-quick');
  if (cardQuick) cardQuick.hidden = !hasRcon;
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
  document.querySelectorAll('.metric-btn').forEach((b) => {
    if (['cpu', 'ram', 'disk'].includes(b.dataset.metric)) b.hidden = !hasSsh;
  });
  const navServer = document.getElementById('nav-server');
  if (navServer) {
    navServer.hidden = !hasSsh;
    if (navServer.hidden && currentPage === 'server') showPage('overview');
  }
  const navAuto = document.getElementById('nav-auto');
  if (navAuto) {
    navAuto.hidden = !hasSsh;
    if (navAuto.hidden && currentPage === 'automations') showPage('overview');
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
  if (currentPage === 'stats') loadStats();
  if (currentPage === 'plugins') loadInstalledPlugins();
  if (currentPage === 'automations' && window.AutoPage) window.AutoPage.reload();
  clearInterval(statusTimer);
  statusTimer = setInterval(loadStatus, refreshSec * 1000);
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
    const lm = data.line.match(/(\S+) (was banned by|was kicked by|was banned|was kicked)/i);
    if (lm) addNews('joueur', `${lm[1]} ${/banned/i.test(lm[2]) ? 'a été banni' : 'a été expulsé (kick)'}`);
    const line = data.line;
    if (/\b(SEVERE|ERROR)\b/.test(line) || /Exception/.test(line)) {
      const msg = 'Erreur dans les logs : ' + line.replace(/^\[[^\]]*\]\s*/, '').slice(0, 100);
      const key = 'log|' + msg;
      if (!logAlertAt[key] || Date.now() - logAlertAt[key] > 10 * 60000) {
        logAlertAt[key] = Date.now();
        addNews('alerte', msg);
      }
    }
    const pm = line.match(/Plugin (\S+)\S* .*generated an exception/i) || line.match(/Could not load ['"]?plugins\/([\w.-]+)/i);
    if (pm) {
      const pname = pm[1];
      pluginErrCount[pname] = (pluginErrCount[pname] || 0) + 1;
      if (pluginErrCount[pname] >= 3 && !pluginErrCount[pname + '!flag']) {
        pluginErrCount[pname + '!flag'] = true;
        addNews('alerte', `Le plugin ${pname} rencontre des erreurs répétées (${pluginErrCount[pname]} fois)`);
      }
    }
    if (/Starting minecraft server|Done \(/.test(line)) {
      const now = Date.now();
      restartTimes.push(now);
      while (restartTimes.length && now - restartTimes[0] > 3600000) restartTimes.shift();
      if (restartTimes.length >= 2 && !restartAlerted) {
        restartAlerted = true;
        addNews('alerte', `Redémarrages anormaux : ${restartTimes.length} redémarrages détectés dans la dernière heure`);
      } else if (restartTimes.length < 2) {
        restartAlerted = false;
      }
    }
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

function fmtDur(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} j ${h % 24} h`;
  if (h > 0) return `${h} h ${m % 60} min`;
  return `${m} min`;
}

function setProfileCells(cells) {
  if (!modalProfileEl) return;
  modalProfileEl.innerHTML = '';
  for (const c of cells) {
    const div = document.createElement('div');
    div.className = 'profile-cell' + (c.full ? ' full' : '');
    const l = document.createElement('span');
    l.className = 'pl';
    l.textContent = c.label;
    div.appendChild(l);
    if (c.badges) {
      const b = document.createElement('div');
      b.className = 'profile-badges';
      for (const bd of c.badges) {
        const sp = document.createElement('span');
        sp.className = `badge ${bd.cls || ''}`;
        sp.textContent = bd.text;
        b.appendChild(sp);
      }
      div.appendChild(b);
    } else {
      const v = document.createElement('span');
      v.className = 'pv';
      v.textContent = c.value;
      div.appendChild(v);
    }
    modalProfileEl.appendChild(div);
  }
}

async function loadPlayerProfile(name) {
  if (!modalProfileEl) return;
  const hasSsh = Boolean(currentServer && currentServer.sshUser);
  const hasRcon = Boolean(currentServer && currentServer.type !== 'aternos' && currentServer.hasPassword);
  if (!hasSsh && !hasRcon) {
    setProfileCells([{ label: 'Profil', full: true, value: 'Profil détaillé : nécessite SSH et/ou RCON (non dispo sur Aternos gratuit).' }]);
    return;
  }
  setProfileCells([{ label: 'Profil', full: true, value: 'Chargement...' }]);
  const cells = [];
  if (hasSsh) {
    const dir = currentServer.serverDir || '~/minecraft';
    const cmd = `D=${dir}; cd "$D" 2>/dev/null; date +%F; date +%s; { for f in logs/*.log.gz logs/*.log; do [ -e "$f" ] || continue; b=$(basename "$f"); [ "$b" = "latest.log" ] && continue; d=$(echo "$b" | cut -d- -f1-3); if [[ "$f" == *.gz ]]; then zcat "$f"; else cat "$f"; fi | grep -hE 'joined the game|left the game' | sed -E "s/^\\[([0-9:]{8})\\].*\\]: ([^ ]+) (joined|left) the game/$d \\1 \\2 \\3/"; done; grep -hE 'joined the game|left the game' logs/latest.log 2>/dev/null | sed -E "s/^\\[([0-9:]{8})\\].*\\]: ([^ ]+) (joined|left) the game/$(date +%F) \\1 \\2 \\3/"; } | grep -F " ${name} "`;
    try {
      const res = await window.api.sshExec(currentServer.id, cmd);
      if (res.error) {
        cells.push({ label: 'Logs', full: true, value: res.error });
      } else {
        const lines = (res.out || '').split('\n').map((l) => l.trim()).filter(Boolean);
        const now = Number(lines[1]) * 1000;
        let total = 0;
        let lastJoin = null;
        let openTs = null;
        for (const l of lines.slice(2)) {
          const m = l.match(/^(\d{4}-\d{2}-\d{2}) ([0-9:]{8}) (\S+) (joined|left)$/);
          if (!m) continue;
          const ts = new Date(`${m[1]}T${m[2]}`).getTime();
          if (m[4] === 'joined') {
            if (openTs == null) openTs = ts;
            lastJoin = ts;
          } else if (openTs != null) {
            total += (ts - openTs) / 1000;
            openTs = null;
          }
        }
        if (openTs != null && now) total += (now - openTs) / 1000;
        cells.push({ label: 'Temps de jeu total', value: `${fmtDur(total)} (tous les logs)` });
        if (lastJoin) {
          const d = new Date(lastJoin);
          const p = (n) => String(n).padStart(2, '0');
          cells.push({ label: 'Dernière connexion', value: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}` });
        } else {
          cells.push({ label: 'Dernière connexion', value: 'jamais (dans les logs)' });
        }
      }
    } catch (err) {
      cells.push({ label: 'Logs', full: true, value: err.message });
    }
  }
  if (hasRcon) {
    try {
      const bans = parseNames(await runCmd('banlist players'));
      const wl = parseNames(await runCmd('whitelist list'));
      const badges = [];
      const sample = (lastStatus && lastStatus.ping && lastStatus.ping.playersSample) || [];
      if (sample.map((x) => String(x).replace(/^\*+/, '').trim()).includes(name)) badges.push({ text: 'En ligne', cls: 'online' });
      if (bans.includes(name)) badges.push({ text: 'Banni', cls: 'offline' });
      if (wl.includes(name)) badges.push({ text: 'Whitelist', cls: 'info' });
      cells.push(badges.length ? { label: 'Statut', full: true, badges } : { label: 'Statut', full: true, value: 'pas banni' });
    } catch (err) {
      cells.push({ label: 'Statut', full: true, value: `RCON : ${err.message}` });
    }
  }
  setProfileCells(cells);
}

function openModal(name) {
  modalPlayer = name;
  modalPlayerEl.textContent = name;
  modalResult.textContent = '';
  modalExtra.value = '';
  modal.hidden = false;
  const av = document.getElementById('modal-avatar');
  const fb = document.getElementById('modal-avatar-fb');
  if (fb) {
    fb.textContent = (name[0] || '?').toUpperCase();
    fb.style.display = 'none';
  }
  if (av) {
    av.style.display = '';
    av.onerror = () => {
      av.style.display = 'none';
      if (fb) fb.style.display = 'flex';
    };
    av.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/128`;
  }
  loadPlayerProfile(name);
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
      case 'unban': cmds = [`unban ${p}`]; break;
      case 'tell':
        if (!extra) {
          modalResult.textContent = 'Mets le message dans le champ.';
          return;
        }
        cmds = [`tell ${p} ${extra}`];
        break;
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
  const cmd = "p=$(pgrep -f 'java.*\\.jar' | head -1); if [ -z \"$p\" ]; then p=$(pgrep -f 'server\\.jar' | head -1); fi; if [ -n \"$p\" ]; then echo \"PID=$p\"; ps -o etimes= -p \"$p\" | tr -d ' '; else echo STOPPED; fi";
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

const DEFAULT_QUICK = [
  { label: 'Sauvegarder', cmd: 'save-all' },
  { label: 'Jour', cmd: 'time set day' },
  { label: 'Soleil', cmd: 'weather clear' },
  { label: 'Maintenance 5 min', cmd: 'say Maintenance dans 5 minutes' },
];

async function getQuickCmds() {
  try {
    const v = await window.api.getSetting('quickCmds');
    if (Array.isArray(v) && v.length) return v;
  } catch { }
  return DEFAULT_QUICK;
}

async function renderQuickCmds() {
  if (!quickCmdsEl) return;
  const list = await getQuickCmds();
  quickCmdsEl.innerHTML = '';
  for (const q of list) {
    const wrap = document.createElement('span');
    wrap.className = 'quick-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick-btn';
    b.textContent = q.label;
    b.title = q.cmd;
    b.addEventListener('click', async () => {
      if (!currentServer) return;
      const canRcon = currentServer.type !== 'aternos' && currentServer.hasPassword;
      if (!canRcon) {
        addConsoleLine('Pas de RCON sur ce serveur (Aternos gratuit) — commande non envoyée.', 'err', false);
        return;
      }
      try {
        const out = await runCmd(q.cmd);
        addConsoleLine(`> ${q.cmd}`, 'cmd');
        if (out) addConsoleLine(out, 'out');
      } catch (err) {
        addConsoleLine(`Erreur : ${err.message}`, 'err', false);
      }
    });
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'quick-del';
    x.textContent = '✕';
    x.title = 'Supprimer cette commande rapide';
    x.addEventListener('click', async () => {
      const cur = await getQuickCmds();
      await window.api.setSetting('quickCmds', cur.filter((c) => !(c.cmd === q.cmd && c.label === q.label)));
      renderQuickCmds();
    });
    wrap.appendChild(b);
    wrap.appendChild(x);
    quickCmdsEl.appendChild(wrap);
  }
}

if (quickForm) {
  quickForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = qcLabel.value.trim();
    const cmd = qcCmd.value.trim();
    if (!label || !cmd) return;
    const cur = await getQuickCmds();
    await window.api.setSetting('quickCmds', [...cur, { label, cmd }]);
    qcLabel.value = '';
    qcCmd.value = '';
    renderQuickCmds();
  });
}

let settingsStatusTimer = null;

function showSettingsSaved() {
  if (!settingsStatusEl) return;
  settingsStatusEl.textContent = 'Enregistré ✓';
  if (settingsStatusTimer) clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => {
    settingsStatusEl.textContent = '';
    settingsStatusTimer = null;
  }, 3000);
}

function renderSettings() {
  document.querySelectorAll('#refresh-row .set-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.sec) === refreshSec);
  });
}

document.querySelectorAll('#refresh-row .set-btn').forEach((b) => {
  b.addEventListener('click', async () => {
    refreshSec = Number(b.dataset.sec);
    await window.api.setSetting('refreshSec', refreshSec);
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = setInterval(loadStatus, refreshSec * 1000);
    }
    showSettingsSaved();
    renderSettings();
  });
});


// ---------- Page Plugins (recherche Hangar + compatibilite avec MA version) ----------
const PLAT_KEYWORDS = [
  ['neoforge', 'neoforge'], ['forge', 'forge'], ['fabric', 'fabric'], ['quilt', 'quilt'],
  ['purpur', 'purpur'], ['paper', 'paper'], ['folia', 'folia'], ['spigot', 'spigot'],
  ['velocity', 'velocity'], ['bungeecord', 'bungeecord'], ['waterfall', 'waterfall'], ['sponge', 'sponge'],
];
let plugSavedTimer = null;
let pluginsInitDone = false;

function detectPlatform(versionStr) {
  const s = String(versionStr || '').toLowerCase();
  for (const [key, word] of PLAT_KEYWORDS) if (s.includes(word)) return key;
  return null;
}

function detectVersion(versionStr) {
  const m = String(versionStr || '').match(/(\d+\.\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

async function autoFillPlatform(versionStr) {
  const plat = detectPlatform(versionStr);
  const ver = detectVersion(versionStr);
  let changed = false;
  if (plat && !(await window.api.getSetting('plugPlatform'))) {
    await window.api.setSetting('plugPlatform', plat);
    changed = true;
  }
  if (ver && !(await window.api.getSetting('plugVersion'))) {
    await window.api.setSetting('plugVersion', ver);
    changed = true;
  }
  if (changed) await fillPluginFields();
}

async function fillPluginFields() {
  if (!plugPlatformEl || !plugVersionEl) return;
  const p = (await window.api.getSetting('plugPlatform')) || 'paper';
  const v = (await window.api.getSetting('plugVersion')) || '';
  const hasOpt = Array.from(plugPlatformEl.options || []).some((o) => o.value === p);
  plugPlatformEl.value = hasOpt ? p : 'paper';
  plugVersionEl.value = v;
}

function showPlugSaved() {
  if (!plugSavedEl) return;
  plugSavedEl.hidden = false;
  if (plugSavedTimer) clearTimeout(plugSavedTimer);
  plugSavedTimer = setTimeout(() => { plugSavedEl.hidden = true; plugSavedTimer = null; }, 2000);
}

async function initPluginsPage() {
  await fillPluginFields();
  if (!pluginsInitDone) {
    pluginsInitDone = true;
    if (plugPlatformEl) plugPlatformEl.addEventListener('change', async () => {
      await window.api.setSetting('plugPlatform', plugPlatformEl.value);
      showPlugSaved();
      doPluginSearch(plugQEl ? plugQEl.value.trim() : '');
    });
    if (plugVersionEl) plugVersionEl.addEventListener('change', async () => {
      await window.api.setSetting('plugVersion', plugVersionEl.value.trim());
      showPlugSaved();
      doPluginSearch(plugQEl ? plugQEl.value.trim() : '');
    });
    if (plugForm) plugForm.addEventListener('submit', (e) => {
      e.preventDefault();
      doPluginSearch(plugQEl ? plugQEl.value.trim() : '');
    });
  }
  if (plugResultsEl && !plugResultsEl.children.length) doPluginSearch('');
  loadInstalledPlugins();
}

function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' k';
  return String(n);
}

async function doPluginSearch(query) {
  if (!plugResultsEl) return;
  const platform = plugPlatformEl ? plugPlatformEl.value : 'paper';
  const version = plugVersionEl ? plugVersionEl.value.trim() : '';
  plugResultsEl.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = query ? `Recherche de « ${query} » sur Hangar...` : 'Chargement des plugins les plus téléchargés...';
  plugResultsEl.appendChild(loading);
  let res;
  try {
    res = await window.api.pluginsSearch({ query, platform, version });
  } catch (err) {
    plugResultsEl.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `Erreur : ${err.message}`;
    plugResultsEl.appendChild(p);
    return;
  }
  plugResultsEl.innerHTML = '';
  if (!res.ok) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `Hangar injoignable : ${res.error || 'erreur inconnue'} — vérifie ta connexion internet.`;
    plugResultsEl.appendChild(p);
    return;
  }
  if (!res.results || !res.results.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = query ? `Aucun plugin trouvé pour « ${query} » — essaie un autre nom.` : 'Aucun plugin trouvé.';
    plugResultsEl.appendChild(p);
    return;
  }
  for (const pl of res.results) plugResultsEl.appendChild(renderPluginRow(pl, version));
}

function renderPluginRow(pl, version) {
  const row = document.createElement('div');
  row.className = 'plug-row';
  row.title = 'Ouvrir la page Hangar de ce plugin';
  const head = document.createElement('div');
  head.className = 'plug-head';
  const name = document.createElement('span');
  name.className = 'plug-name';
  name.textContent = pl.name;
  head.appendChild(name);
  const badge = document.createElement('span');
  if (pl.compatible === true) {
    badge.className = 'plug-badge ok';
    badge.textContent = version ? `Compatible ${version}` : 'Compatible';
  } else if (pl.compatible === false) {
    badge.className = 'plug-badge bad';
    badge.textContent = version ? `Pas compatible ${version}` : 'Pas compatible';
  } else {
    badge.className = 'plug-badge unk';
    badge.textContent = 'Compatibilité inconnue';
  }
  head.appendChild(badge);
  row.appendChild(head);
  const meta = document.createElement('div');
  meta.className = 'plug-meta';
  meta.textContent = `${pl.author || '?'} · ${fmtCount(pl.downloads)} téléchargements · ★ ${fmtCount(pl.stars)}`;
  row.appendChild(meta);
  if (pl.description) {
    const desc = document.createElement('div');
    desc.className = 'plug-desc';
    desc.textContent = pl.description;
    row.appendChild(desc);
  }
  if (pl.versions && pl.versions.length) {
    const vers = document.createElement('div');
    vers.className = 'plug-vers';
    vers.textContent = 'Versions : ' + pl.versions.join(', ');
    row.appendChild(vers);
  }
  const actions = document.createElement('div');
  actions.className = 'plug-actions';
  const status = document.createElement('div');
  status.className = 'plug-status';
  if (pl.install) {
    const hasSsh = Boolean(currentServer && currentServer.sshUser);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'plug-btn' + (hasSsh ? ' primary' : '');
    b.textContent = hasSsh ? `Installer sur le serveur (v${pl.install.version})` : 'Télécharger le .jar';
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.disabled = true;
      status.className = 'plug-status';
      status.textContent = hasSsh ? 'Installation dans plugins/...' : 'Téléchargement...';
      try {
        if (hasSsh) {
          const r = await window.api.pluginsInstall({ id: currentServer.id, url: pl.install.url, fileName: pl.install.fileName });
          if (r.ok) {
            status.className = 'plug-status ok';
            status.textContent = `Installé : plugins/${r.file} — redémarre le serveur pour charger le plugin.`;
            loadInstalledPlugins();
          } else {
            status.className = 'plug-status err';
            status.textContent = `Erreur : ${r.error}`;
            b.disabled = false;
          }
        } else {
          const r = await window.api.pluginsDownload({ url: pl.install.url, fileName: pl.install.fileName });
          if (r.ok) {
            status.className = 'plug-status ok';
            status.textContent = `Téléchargé : ${r.path}`;
          } else if (r.canceled) {
            status.textContent = '';
            b.disabled = false;
          } else {
            status.className = 'plug-status err';
            status.textContent = `Erreur : ${r.error}`;
            b.disabled = false;
          }
        }
      } catch (err) {
        status.className = 'plug-status err';
        status.textContent = `Erreur : ${err.message}`;
        b.disabled = false;
      }
    });
    actions.appendChild(b);
  } else {
    const span = document.createElement('span');
    span.className = 'plug-vers';
    span.textContent = 'Pas de version téléchargeable trouvée pour cette plateforme.';
    actions.appendChild(span);
  }
  actions.appendChild(status);
  row.appendChild(actions);
  row.addEventListener('click', () => { if (pl.url && window.api.openUrl) window.api.openUrl(pl.url); });
  return row;
}

async function loadInstalledPlugins() {
  if (!plugInstalledEl) return;
  const noSsh = !currentServer || !currentServer.sshUser;
  if (plugInstalledHint) {
    plugInstalledHint.textContent = noSsh
      ? 'Pas de SSH sur ce serveur (Aternos gratuit) : on peut seulement télécharger le .jar sur ton PC, puis l\u2019uploader toi-même (chez Aternos : onglet « Plugins » du panel Aternos).'
      : 'Plugins déjà présents dans le dossier plugins/ du serveur (lus via SSH).';
  }
  plugInstalledEl.innerHTML = '';
  if (noSsh) return;
  let r;
  try { r = await window.api.pluginsInstalled(currentServer.id); } catch (err) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = `Erreur : ${err.message}`;
    plugInstalledEl.appendChild(li);
    return;
  }
  if (!r.ok) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = r.noSsh ? 'Pas de SSH configuré sur ce serveur.' : `Erreur : ${r.error}`;
    plugInstalledEl.appendChild(li);
    return;
  }
  if (!r.files.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Aucun .jar dans plugins/ pour l\u2019instant.';
    plugInstalledEl.appendChild(li);
    return;
  }
  for (const f of r.files) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = f;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost plug-del';
    del.textContent = 'Supprimer';
    del.title = 'Supprimer ce .jar du serveur (retiré au prochain démarrage)';
    del.addEventListener('click', async () => {
      if (!confirm(`Supprimer plugins/${f} du serveur ?`)) return;
      const raw = String(currentServer.serverDir || '~/minecraft').trim();
      const dirE = raw.startsWith('~') ? `"$HOME${raw.slice(1)}"` : `"${raw}"`;
      const r2 = await window.api.sshExec(currentServer.id, `cd ${dirE} && rm -f "plugins/${f}" && echo RMOK`);
      if (r2 && r2.error) { alert('Erreur : ' + r2.error); return; }
      if (!String((r2 && r2.out) || '').includes('RMOK')) { alert('Suppression échouée — dossier du serveur introuvable ?'); return; }
      loadInstalledPlugins();
    });
    li.appendChild(name);
    li.appendChild(del);
    plugInstalledEl.appendChild(li);
  }
}
if (btnPlugInstalled) btnPlugInstalled.addEventListener('click', () => loadInstalledPlugins());

const aboutModal = document.getElementById('about-modal');
const btnAbout = document.getElementById('btn-about');
const ABOUT_FIELDS = [
  ['about-name', 'editorName'],
  ['about-addr', 'editorAddress'],
  ['about-mail', 'editorEmail'],
];
// Infos legales affichees a tous les clients : remplacer par les vraies valeurs avant de generer le .exe
const EDITOR_DEFAULTS = {
  editorName: 'Capt',
  editorAddress: 'Rue de la gare, 1350, Suisse',
  editorEmail: 'leon.capt@eduvd.ch',
};

if (btnAbout) {
  btnAbout.addEventListener('click', async () => {
    const b = document.getElementById('about-build');
    if (b) b.textContent = await window.api.getBuild();
    for (const [id, key] of ABOUT_FIELDS) {
      const el = document.getElementById(id);
      if (el) el.value = (await window.api.getSetting(key)) || EDITOR_DEFAULTS[key] || '';
    }
    if (aboutModal) aboutModal.hidden = false;
  });
}
const aboutClose = document.getElementById('about-close');
if (aboutClose) aboutClose.addEventListener('click', () => { aboutModal.hidden = true; });
if (aboutModal) aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) aboutModal.hidden = true; });
for (const [id, key] of ABOUT_FIELDS) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', async () => { await window.api.setSetting(key, el.value.trim()); });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function addNews(type, msg) {
  try {
    await window.api.newsAdd({ ts: Date.now(), type, msg });
  } catch { }
  updateNewsDot();
  if (currentPage === 'news') renderNews();
}

// Alerte a front montant : on loggue quand le probleme commence, et "— résolu" quand il s'arrete
async function checkAlert(key, condition, msg) {
  if (condition && !activeAlerts[key]) {
    activeAlerts[key] = true;
    await addNews('alerte', msg);
  } else if (!condition && activeAlerts[key]) {
    delete activeAlerts[key];
    await addNews('alerte', msg + ' — résolu');
  }
}

async function renderNews() {
  const el = document.getElementById('news-list');
  if (!el) return;
  let list = [];
  try { list = await window.api.newsList(); } catch { }
  el.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Aucune actualité pour l\u2019instant — les alertes (disque, RAM, CPU, TPS), les passages en ligne/hors ligne et les bans/kicks apparaîtront ici.';
    el.appendChild(li);
    return;
  }
  const p2 = (n) => String(n).padStart(2, '0');
  for (const n of list.slice(0, 100)) {
    const d = new Date(n.ts);
    const li = document.createElement('li');
    const badge = n.type === 'alerte' ? 'offline' : n.type === 'serveur' ? 'info' : 'online';
    li.innerHTML = `<span class="badge ${badge}">${escapeHtml(n.type)}</span> <span class="news-time">${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}h${p2(d.getMinutes())}</span> — ${escapeHtml(n.msg)}`;
    el.appendChild(li);
  }
}

const btnNewsClear = document.getElementById('btn-news-clear');
if (btnNewsClear) {
  btnNewsClear.addEventListener('click', async () => {
    if (!confirm('Supprimer toutes les actualités ?')) return;
    await window.api.newsClear();
    renderNews();
  });
}

async function updateNewsDot() {
  if (!newsDot) return;
  try {
    const list = await window.api.newsList();
    const lastSeen = Number(await window.api.getSetting('newsLastSeen')) || 0;
    newsDot.hidden = !list.some((n) => n.type === 'alerte' && n.ts > lastSeen);
  } catch {
    newsDot.hidden = true;
  }
}

const hmTip = document.getElementById('hm-tip');

function showHmTip(text, e) {
  if (!hmTip) return;
  hmTip.textContent = text;
  hmTip.hidden = false;
  const ww = window.innerWidth || 1200;
  const wh = window.innerHeight || 800;
  const x = Math.min(ww - 280, (e.clientX || 0) + 14);
  const y = Math.min(wh - 50, (e.clientY || 0) + 14);
  hmTip.style.left = x + 'px';
  hmTip.style.top = y + 'px';
}

function hideHmTip() {
  if (hmTip) hmTip.hidden = true;
}

const hmModal = document.getElementById('hm-modal');
const btnHmOpen = document.getElementById('btn-hm-open');
const hmCloseBtn = document.getElementById('hm-close');
if (btnHmOpen) {
  btnHmOpen.addEventListener('click', () => {
    drawHeatmap(lastHistory);
    if (hmModal) hmModal.hidden = false;
  });
}
if (hmCloseBtn) hmCloseBtn.addEventListener('click', () => { if (hmModal) hmModal.hidden = true; });
if (hmModal) hmModal.addEventListener('click', (e) => { if (e.target === hmModal) hmModal.hidden = true; });

btnWelcomeAdd.addEventListener('click', () => setMode('setup'));

window.api.getBuild().then((b) => {
  const tag = document.getElementById('build-tag');
  if (tag) tag.textContent = `build ${b}`;
});

(async () => {
  try {
    // Thème unique : "verre vert futuriste" (v6) — plus de choix Sombre/Clair
    renderSettings();
    const r = await window.api.getSetting('refreshSec');
    if (r === 30 || r === 60) refreshSec = r;
  } catch { }
  updateNewsDot();
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

// Anti-cache : ajoute ?v=<timestamp> au CSS pour forcer le rechargement à chaque lancement
try {
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const h = l.getAttribute('href') || '';
    if (h && h.indexOf('?v=') === -1) l.href = h + '?v=' + Date.now();
  });
} catch { }

// ---------- Licence (écran d'activation) ----------
const licenseOverlay = document.getElementById('license-overlay');
const licenseKeyEl = document.getElementById('license-key');
const btnLicense = document.getElementById('btn-license');
const licenseErr = document.getElementById('license-err');
const licenseBuy = document.getElementById('license-buy');
const licenseState = document.getElementById('license-state');

async function refreshLicense() {
  if (!licenseOverlay || !window.api || !window.api.licenseStatus) return;
  try {
    const st = await window.api.licenseStatus();
    if (st && st.licensed) { licenseOverlay.hidden = true; return; }
    licenseOverlay.hidden = false;
    if (licenseBuy && st && st.buyUrl) licenseBuy.href = st.buyUrl;
    if (licenseState) licenseState.textContent = (st && st.key) ? ('Clé enregistrée : ' + st.key + ' — validation en cours…') : '';
  } catch { }
}

if (btnLicense) {
  btnLicense.addEventListener('click', async () => {
    if (!window.api || !window.api.licenseActivate) return;
    const key = (licenseKeyEl && licenseKeyEl.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (licenseErr) licenseErr.hidden = true;
    if (!/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(key)) {
      if (licenseErr) { licenseErr.textContent = 'Format de clé invalide (ex : XXXX-XXXX-XXXX-XXXX).'; licenseErr.hidden = false; }
      return;
    }
    btnLicense.disabled = true;
    btnLicense.textContent = 'Vérification…';
    try {
      const r = await window.api.licenseActivate(key);
      if (r && r.ok) {
        licenseOverlay.hidden = true;
        if (typeof location !== 'undefined' && location.reload) location.reload();
        return;
      }
      if (licenseErr) { licenseErr.textContent = (r && r.error) || 'Activation refusée.'; licenseErr.hidden = false; }
    } catch (e) {
      if (licenseErr) { licenseErr.textContent = 'Erreur : ' + (e && e.message || e); licenseErr.hidden = false; }
    }
    btnLicense.disabled = false;
    btnLicense.textContent = 'Activer';
  });
}

refreshLicense();
setInterval(() => { refreshLicense(); }, 30000);

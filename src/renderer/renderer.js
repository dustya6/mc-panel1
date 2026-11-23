const listEl = document.getElementById('server-list');
const formEl = document.getElementById('server-form');
const testBtn = document.getElementById('btn-test');
const testResultEl = document.getElementById('test-result');
const headerEl = document.getElementById('server-header');
const pageOverview = document.getElementById('page-overview');
const pageConsole = document.getElementById('page-console');
const nameEl = document.getElementById('srv-name');
const hostEl = document.getElementById('srv-host');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');
const chartEl = document.getElementById('chart');
const consoleForm = document.getElementById('console-form');
const cmdInput = document.getElementById('cmd');
const consoleOut = document.getElementById('console-out');
const refreshBtn = document.getElementById('btn-refresh');
const deleteBtn = document.getElementById('btn-delete');

let currentServer = null;
let statusTimer = null;
let currentPage = 'overview';
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

function showPage(page) {
  currentPage = page;
  for (const b of document.querySelectorAll('.nav-btn')) {
    b.classList.toggle('active', b.dataset.page === page);
  }
  pageOverview.hidden = page !== 'overview';
  pageConsole.hidden = page !== 'console';
}

document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => {
    if (!currentServer) return;
    showPage(b.dataset.page);
  });
});

function field(id) {
  return document.getElementById(id).value.trim();
}

function formData() {
  return {
    id: currentServer ? currentServer.id : undefined,
    name: field('f-name'),
    host: field('f-host'),
    queryPort: field('f-query-port') || '25565',
    rconPort: field('f-rcon-port') || '25575',
    password: document.getElementById('f-password').value,
    sshPort: field('f-ssh-port') || '22',
    sshUser: field('f-ssh-user'),
    sshPassword: document.getElementById('f-ssh-pass').value,
    sshKey: field('f-ssh-key'),
    serverDir: field('f-server-dir') || '~/minecraft',
  };
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

function drawChart(history) {
  chartEl.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  if (!history || history.length < 2) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', '10');
    t.setAttribute('y', '80');
    t.setAttribute('fill', '#8b96a8');
    t.setAttribute('font-size', '12');
    t.textContent = "Pas encore assez de données — attends ~30 s.";
    chartEl.appendChild(t);
    return;
  }
  const w = 600;
  const h = 160;
  const pad = 8;
  const values = history.map((p) => p.players ?? 0);
  const max = Math.max(10, ...values);
  const points = history.map((p, i) => {
    const x = pad + (i / (history.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((p.players ?? 0) / max) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', points.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#3b82f6');
  line.setAttribute('stroke-width', '2');
  chartEl.appendChild(line);
  const label = document.createElementNS(ns, 'text');
  label.setAttribute('x', String(pad));
  label.setAttribute('y', String(h - 2));
  label.setAttribute('fill', '#8b96a8');
  label.setAttribute('font-size', '11');
  label.textContent = `${values[values.length - 1]} joueur(s) maintenant — max ${max}`;
  chartEl.appendChild(label);
}

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
    const nameSpan = document.createElement('span');
    nameSpan.textContent = s.name;
    const hostSpan = document.createElement('span');
    hostSpan.className = 'host';
    hostSpan.textContent = `${s.host}:${s.queryPort}`;
    btn.appendChild(nameSpan);
    btn.appendChild(hostSpan);
    btn.addEventListener('click', () => selectServer(s));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

async function loadStatus() {
  if (!currentServer) return;
  const result = await window.api.getStatus(currentServer.id);
  renderStatus(result);
  drawChart(await window.api.getHistory(currentServer.id));
}

async function selectServer(s) {
  if (currentServer && currentServer.id !== s.id) await window.api.stopLogs(currentServer.id);
  currentServer = s;
  headerEl.hidden = false;
  pageOverview.hidden = currentPage !== 'overview';
  pageConsole.hidden = currentPage !== 'console';
  nameEl.textContent = s.name;
  hostEl.textContent = `${s.host}:${s.queryPort}`;
  document.getElementById('f-name').value = s.name;
  document.getElementById('f-host').value = s.host;
  document.getElementById('f-query-port').value = s.queryPort;
  document.getElementById('f-rcon-port').value = s.rconPort;
  document.getElementById('f-ssh-port').value = s.sshPort || 22;
  document.getElementById('f-ssh-user').value = s.sshUser || '';
  document.getElementById('f-ssh-key').value = s.sshKey || '';
  document.getElementById('f-server-dir').value = s.serverDir || '~/minecraft';
  consoleOut.innerHTML = '';
  loadCmdHistory();
  await refreshList();
  await loadStatus();
  clearInterval(statusTimer);
  statusTimer = setInterval(loadStatus, 15000);
  if (s.sshUser) {
    await window.api.startLogs(s.id);
  } else {
    addConsoleLine('Logs en direct inactifs — remplis la connexion SSH dans le formulaire pour voir le chat et les logs du serveur.', 'ts', false);
  }
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formData();
  if (!data.password && !(currentServer && currentServer.hasPassword)) {
    testResultEl.className = 'err';
    testResultEl.textContent = 'Mets le mot de passe RCON avant d\'enregistrer, sinon la console ne marchera pas.';
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
  if (data.error) addConsoleLine(`[SSH] ${data.error}`, 'err', false);
  else if (data.line) addConsoleLine(data.line, logClass(data.line), false);
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

refreshBtn.addEventListener('click', loadStatus);

deleteBtn.addEventListener('click', async () => {
  if (!currentServer) return;
  await window.api.stopLogs(currentServer.id);
  await window.api.deleteServer(currentServer.id);
  currentServer = null;
  clearInterval(statusTimer);
  headerEl.hidden = true;
  pageOverview.hidden = true;
  pageConsole.hidden = true;
  await refreshList();
});

window.api.getBuild().then((b) => {
  const sub = document.querySelector('.brand-sub');
  if (sub) sub.textContent = `Gérez votre serveur Minecraft — build ${b}`;
});

refreshList();

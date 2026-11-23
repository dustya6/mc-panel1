const listEl = document.getElementById('server-list');
const formEl = document.getElementById('server-form');
const testBtn = document.getElementById('btn-test');
const testResultEl = document.getElementById('test-result');
const placeholderEl = document.getElementById('placeholder');
const viewEl = document.getElementById('server-view');
const nameEl = document.getElementById('srv-name');
const hostEl = document.getElementById('srv-host');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');
const consoleForm = document.getElementById('console-form');
const cmdInput = document.getElementById('cmd');
const consoleOut = document.getElementById('console-out');
const refreshBtn = document.getElementById('btn-refresh');
const deleteBtn = document.getElementById('btn-delete');

let currentServer = null;
let statusTimer = null;
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

function field(id) {
  return document.getElementById(id).value.trim();
}

function formData() {
  return {
    name: field('f-name'),
    host: field('f-host'),
    queryPort: field('f-query-port') || '25565',
    rconPort: field('f-rcon-port') || '25575',
    password: document.getElementById('f-password').value,
    sshPort: field('f-ssh-port') || '22',
    sshUser: field('f-ssh-user'),
    sshPassword: document.getElementById('f-ssh-pass').value,
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
  const names = parseList(result.list);
  if (names.length === 0 && result.ping && result.ping.playersSample) {
    names.push(...result.ping.playersSample);
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
}

async function selectServer(s) {
  if (currentServer && currentServer.id !== s.id) await window.api.stopLogs(currentServer.id);
  currentServer = s;
  placeholderEl.hidden = true;
  viewEl.hidden = false;
  nameEl.textContent = s.name;
  hostEl.textContent = `${s.host}:${s.queryPort}`;
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
  const saved = await window.api.saveServer(formData());
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
  viewEl.hidden = true;
  placeholderEl.hidden = false;
  await refreshList();
});

refreshList();

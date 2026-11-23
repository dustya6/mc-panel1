const listEl = document.getElementById('server-list');
const formEl = document.getElementById('server-form');
const testBtn = document.getElementById('btn-test');
const testResultEl = document.getElementById('test-result');
const placeholderEl = document.getElementById('placeholder');
const viewEl = document.getElementById('server-view');
const nameEl = document.getElementById('srv-name');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');
const consoleForm = document.getElementById('console-form');
const cmdInput = document.getElementById('cmd');
const consoleOut = document.getElementById('console-out');
const refreshBtn = document.getElementById('btn-refresh');
const deleteBtn = document.getElementById('btn-delete');

let currentServer = null;
let statusTimer = null;

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

function renderStatus(result) {
  statusEl.innerHTML = '';
  if (result.error) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = result.error;
    statusEl.appendChild(p);
  }
  if (result.ping) {
    const p = document.createElement('p');
    p.textContent = `En ligne — version ${result.ping.version}, ${result.ping.playersOnline}/${result.ping.playersMax} joueurs, latence ${result.ping.latency} ms`;
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
    li.textContent = 'Aucun joueur en ligne';
    playersEl.appendChild(li);
  } else {
    for (const n of names) {
      const li = document.createElement('li');
      li.textContent = n;
      playersEl.appendChild(li);
    }
  }
}

async function refreshList() {
  const servers = await window.api.listServers();
  listEl.innerHTML = '';
  for (const s of servers) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'server-item';
    if (currentServer && currentServer.id === s.id) btn.classList.add('active');
    btn.textContent = s.name;
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
  currentServer = s;
  placeholderEl.hidden = true;
  viewEl.hidden = false;
  nameEl.textContent = s.name;
  consoleOut.textContent = '';
  await refreshList();
  await loadStatus();
  clearInterval(statusTimer);
  statusTimer = setInterval(loadStatus, 15000);
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saved = await window.api.saveServer(formData());
  formEl.reset();
  await selectServer(saved);
});

testBtn.addEventListener('click', async () => {
  testResultEl.textContent = 'Test en cours...';
  const result = await window.api.testServer(formData());
  if (result.error) {
    testResultEl.textContent = `Échec : ${result.error}`;
  } else {
    const parts = [];
    if (result.ping) parts.push(`${result.ping.playersOnline}/${result.ping.playersMax} joueurs en ligne`);
    if (result.list) parts.push(`RCON OK : ${result.list}`);
    testResultEl.textContent = `OK — ${parts.join(' | ')}`;
  }
});

consoleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentServer) return;
  const cmd = cmdInput.value.trim();
  if (!cmd) return;
  consoleOut.textContent += `> ${cmd}\n`;
  try {
    const out = await window.api.sendCommand(currentServer.id, cmd);
    consoleOut.textContent += `${out}\n\n`;
  } catch (err) {
    consoleOut.textContent += `Erreur : ${err.message}\n\n`;
  }
  cmdInput.value = '';
  consoleOut.scrollTop = consoleOut.scrollHeight;
});

refreshBtn.addEventListener('click', loadStatus);

deleteBtn.addEventListener('click', async () => {
  if (!currentServer) return;
  await window.api.deleteServer(currentServer.id);
  currentServer = null;
  clearInterval(statusTimer);
  viewEl.hidden = true;
  placeholderEl.hidden = false;
  await refreshList();
});

refreshList();

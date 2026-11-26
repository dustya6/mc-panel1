// ---------- Page Automatisations : editeur visuel de blocs (declencheur -> conditions/actions/logique) ----------
// Le compilateur cote main (main.js) transforme ca en script bash + cron/watcher sur le VPS.
(function () {
  const CATS = {
    trigger: { label: 'Déclencheurs', color: '#d29922' },
    cond: { label: 'Conditions', color: '#f0883e' },
    action: { label: 'Actions', color: '#3b82f6' },
    time: { label: 'Gestion du temps', color: '#8957e5' },
    error: { label: 'Gestion des erreurs', color: '#e5534b' },
  };
  const COND_OPTS = [
    ['online', 'serveur en ligne'], ['offline', 'serveur hors ligne'], ['tps15', 'TPS < 15'],
    ['ram90', 'RAM > 90 %'], ['cpu90', 'CPU > 90 %'], ['disk10', 'moins de 10 Go libres sur le disque'],
    ['last', 'condition précédente remplie'],
  ];
  const BLOCKS = [
    { kind: 'tr_daily', cat: 'trigger', label: 'Tous les jours à HH:MM', params: [{ k: 'time', label: 'Heure', type: 'time', def: '03:00' }] },
    { kind: 'tr_at', cat: 'trigger', label: 'À une heure précise (une fois)', params: [{ k: 'time', label: 'Heure', type: 'time', def: '12:00' }] },
    { kind: 'tr_every_min', cat: 'trigger', label: 'Toutes les X minutes', params: [{ k: 'n', label: 'Minutes', type: 'number', min: 1, max: 1440, def: 5 }] },
    { kind: 'tr_every_hour', cat: 'trigger', label: 'Toutes les X heures', params: [{ k: 'n', label: 'Heures', type: 'number', min: 1, max: 24, def: 1 }] },
    { kind: 'tr_weekday', cat: 'trigger', label: 'Un jour de la semaine à HH:MM', params: [{ k: 'day', label: 'Jour', type: 'select', opts: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], def: 'lundi' }, { k: 'time', label: 'Heure', type: 'time', def: '03:00' }] },
    { kind: 'tr_start', cat: 'trigger', label: 'Au démarrage du serveur' },
    { kind: 'tr_stop', cat: 'trigger', label: "À l'arrêt du serveur" },
    { kind: 'tr_crash', cat: 'trigger', label: 'Lorsqu’un crash est détecté' },
    { kind: 'tr_offline', cat: 'trigger', label: 'Quand le serveur devient hors ligne' },
    { kind: 'tr_online', cat: 'trigger', label: 'Quand le serveur revient en ligne' },
    { kind: 'c_online', cat: 'cond', label: 'Si le serveur est en ligne' },
    { kind: 'c_offline', cat: 'cond', label: 'Si le serveur est hors ligne' },
    { kind: 'c_ram', cat: 'cond', label: 'Si la RAM dépasse X %', params: [{ k: 'n', label: '% RAM', type: 'number', min: 1, max: 100, def: 90 }] },
    { kind: 'c_tps', cat: 'cond', label: 'Si le TPS descend sous X', params: [{ k: 'n', label: 'TPS', type: 'number', min: 1, max: 20, def: 15, step: 0.5 }] },
    { kind: 'c_cpu', cat: 'cond', label: 'Si le CPU dépasse X %', params: [{ k: 'n', label: '% CPU', type: 'number', min: 1, max: 100, def: 90 }] },
    { kind: 'c_disk', cat: 'cond', label: 'Si le disque a moins de X Go libres', params: [{ k: 'n', label: 'Go libres', type: 'number', min: 1, max: 1000, def: 10 }] },
    { kind: 'c_backup_ok', cat: 'cond', label: 'Si une sauvegarde a réussi' },
    { kind: 'c_backup_fail', cat: 'cond', label: 'Si une sauvegarde a échoué' },
    { kind: 'c_time', cat: 'cond', label: 'Si une heure précise est atteinte', params: [{ k: 'time', label: 'Heure', type: 'time', def: '00:00' }] },
    { kind: 'c_last', cat: 'cond', label: 'Si la condition précédente est remplie' },
    { kind: 'c_if', cat: 'cond', label: 'SI / SINON', container: 'if', params: [{ k: 'cond', label: 'Condition', type: 'select', opts: COND_OPTS, def: 'online' }] },
    { kind: 'a_start', cat: 'action', label: 'Démarrer le serveur' },
    { kind: 'a_stop', cat: 'action', label: 'Arrêter le serveur' },
    { kind: 'a_restart', cat: 'action', label: 'Redémarrer le serveur' },
    { kind: 'a_save', cat: 'action', label: 'Créer une sauvegarde (save-all)' },
    { kind: 'a_backup', cat: 'action', label: 'Sauvegarde complète (tar du monde)' },
    { kind: 'a_prune', cat: 'action', label: 'Supprimer les anciennes sauvegardes', params: [{ k: 'days', label: 'Garder X jours', type: 'number', min: 1, max: 365, def: 7 }] },
    { kind: 'a_state', cat: 'action', label: "Vérifier l'état du serveur" },
    { kind: 'a_perf', cat: 'action', label: 'Vérifier les performances' },
    { kind: 'a_cmd', cat: 'action', label: 'Exécuter une commande serveur', params: [{ k: 'cmd', label: 'Commande', type: 'text', ph: 'ex : say Bonjour tout le monde', def: 'say Bonjour' }] },
    { kind: 'a_mnt_on', cat: 'action', label: 'Activer le mode maintenance (whitelist on)' },
    { kind: 'a_mnt_off', cat: 'action', label: 'Désactiver le mode maintenance (whitelist off)' },
    { kind: 'a_report', cat: 'action', label: 'Générer un rapport de performances' },
    { kind: 'a_event', cat: 'action', label: "Enregistrer un événement dans l'historique", params: [{ k: 'msg', label: 'Message', type: 'text', ph: 'ex : Backup terminé', def: 'Événement' }] },
    { kind: 't_wait', cat: 'time', label: 'Attendre', params: [{ k: 'n', label: 'Durée', type: 'number', min: 1, max: 86400, def: 10 }, { k: 'unit', label: 'Unité', type: 'select', opts: ['secondes', 'minutes', 'heures'], def: 'secondes' }] },
    { kind: 't_repeat', cat: 'time', label: 'Répéter X fois', container: 'repeat', params: [{ k: 'n', label: 'Fois', type: 'number', min: 1, max: 1000, def: 3 }] },
    { kind: 't_repeat_until', cat: 'time', label: "Répéter jusqu'à ce qu'une condition soit remplie", container: 'repeat_until', params: [{ k: 'cond', label: 'Condition', type: 'select', opts: COND_OPTS, def: 'online' }, { k: 'pause', label: 'Pause entre essais (s)', type: 'number', min: 1, max: 3600, def: 15 }] },
    { kind: 't_stop', cat: 'time', label: "Arrêter l'automatisation" },
    { kind: 't_skip', cat: 'time', label: 'Ignorer cette étape' },
    { kind: 't_redo', cat: 'time', label: 'Recommencer l’étape précédente' },
    { kind: 'e_on_fail', cat: 'error', label: "Si l'action précédente échoue", container: 'body' },
    { kind: 'e_retry', cat: 'error', label: "Réessayer l'action précédente X fois", params: [{ k: 'n', label: 'Fois', type: 'number', min: 1, max: 10, def: 3 }] },
    { kind: 'e_noresp', cat: 'error', label: 'Si le serveur ne répond pas', container: 'body' },
    { kind: 'e_backup_fail', cat: 'error', label: 'Si une sauvegarde échoue', container: 'body' },
    { kind: 'e_stop_err', cat: 'error', label: "Arrêter le scénario en cas d'erreur" },
    { kind: 'e_cont_err', cat: 'error', label: 'Continuer malgré une erreur' },
    { kind: 'e_log_err', cat: 'error', label: "Enregistrer une erreur dans l'historique" },
  ];
  const META = {};
  for (const b of BLOCKS) META[b.kind] = b;
  const DESC = {
    tr_daily: 'Tous les jours à HH:MM (cron)', tr_at: 'Une seule fois à HH:MM', tr_every_min: 'Toutes les X minutes (cron)',
    tr_every_hour: 'Toutes les X heures (cron)', tr_weekday: 'Un jour précis de la semaine (cron)',
    tr_start: 'Quand le serveur démarre (watcher)', tr_stop: 'Quand le serveur s’arrête (watcher)',
    tr_crash: 'Quand un crash est détecté dans les logs (watcher)', tr_offline: 'Quand le serveur passe hors ligne (watcher)',
    tr_online: 'Quand le serveur revient en ligne (watcher)',
    c_online: 'Vrai si le serveur répond (RCON)', c_offline: 'Vrai si le serveur ne répond plus',
    c_ram: 'RAM utilisée > X %', c_tps: 'TPS < X', c_cpu: 'CPU > X %', c_disk: 'Moins de X Go libres sur le disque',
    c_backup_ok: 'La dernière sauvegarde a réussi', c_backup_fail: 'La dernière sauvegarde a échoué',
    c_time: 'Heure actuelle = HH:MM', c_last: 'Résultat de la condition précédente', c_if: 'Branche ALORS / SINON selon une condition',
    a_start: 'Lance le serveur (commande de démarrage)', a_stop: 'Arrêt propre via RCON (stop)', a_restart: 'stop puis relance',
    a_save: 'save-all (sauvegarde rapide)', a_backup: 'save-all + archive tar datée du monde',
    a_prune: 'Supprime les backups de plus de X jours', a_state: 'Écrit l’état (en ligne + joueurs) dans le log',
    a_perf: 'Écrit TPS / RAM / CPU / disque dans le log', a_cmd: 'Envoie une commande au serveur (ex : say Bonjour)',
    a_mnt_on: 'whitelist on (bloque les non-whitelistés)', a_mnt_off: 'whitelist off',
    a_report: 'Génère un fichier rapport de perfs sur le VPS', a_event: 'Ligne EVENT dans le log (vue aussi dans Actualités)',
    t_wait: 'Pause de X secondes / minutes / heures', t_repeat: 'Répète les blocs imbriqués X fois',
    t_repeat_until: 'Répète les blocs imbriqués jusqu’à ce que la condition soit vraie', t_stop: 'Arrête l’automatisation tout de suite',
    t_skip: 'Ne fait rien (étape ignorée)', t_redo: 'Relance l’action précédente une fois',
    e_on_fail: 'Si l’action précédente a échoué → exécute les blocs imbriqués', e_retry: 'Relance l’action précédente jusqu’à X fois',
    e_noresp: 'Si le serveur ne répond pas → blocs imbriqués', e_backup_fail: 'Si la sauvegarde a échoué → blocs imbriqués',
    e_stop_err: 'En cas d’erreur : tout s’arrête', e_cont_err: 'En cas d’erreur : on continue', e_log_err: 'Écrit l’erreur dans le log',
  };
  const PRESET_DESC = {
    'Backup tous les jours à 3h00': 'save-all + archive tar du monde, chaque nuit à 3h00',
    'Redémarrage auto si crash': 'détecte le crash dans les logs, attend 30 s, redémarre',
    'Bonsoir automatique à 20h00': 'envoie « say Bonsoir » à tous les joueurs à 20h00',
  };
  const RCON_ACTIONS = ['a_stop', 'a_restart', 'a_save', 'a_backup', 'a_cmd', 'a_mnt_on', 'a_mnt_off', 'a_state', 'a_perf'];
  const CONTAINER_ZONES = { c_if: ['then', 'else'], t_repeat: ['body'], t_repeat_until: ['body'], e_on_fail: ['body'], e_noresp: ['body'], e_backup_fail: ['body'] };

  const PRESETS = [
    {
      name: 'Backup tous les jours à 3h00',
      trigger: { kind: 'tr_daily', params: { time: '03:00' } },
      blocks: [
        { kind: 'a_save', params: {} },
        { kind: 't_wait', params: { n: 10, unit: 'secondes' } },
        { kind: 'a_backup', params: {} },
      ],
    },
    {
      name: 'Redémarrage auto si crash',
      trigger: { kind: 'tr_crash', params: {} },
      blocks: [
        { kind: 't_wait', params: { n: 30, unit: 'secondes' } },
        { kind: 'a_restart', params: {} },
        { kind: 'a_event', params: { msg: 'Crash détecté : redémarrage automatique' } },
      ],
    },
    {
      name: 'Bonsoir automatique à 20h00',
      trigger: { kind: 'tr_daily', params: { time: '20:00' } },
      blocks: [
        { kind: 'a_cmd', params: { cmd: 'say Bonsoir tout le monde !' } },
      ],
    },
  ];

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const uid = () => 'b' + Math.random().toString(36).slice(2, 10);
  const mkBlock = (kind) => {
    const m = META[kind];
    const params = {};
    for (const p of (m.params || [])) params[p.k] = p.def != null ? p.def : '';
    const b = { uid: uid(), kind, cat: m.cat, label: m.label, params };
    if (CONTAINER_ZONES[kind]) {
      b.children = {};
      for (const z of CONTAINER_ZONES[kind]) b.children[z] = [];
    }
    return b;
  };
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const withUids = (list) => list.map((b) => { const c = deep(b); c.uid = uid(); if (c.children) for (const z of Object.keys(c.children)) c.children[z] = withUids(c.children[z]); return c; });

  const S = {
    serverId: null, server: null, autos: [], selId: null,
    insertList: null, insertLabel: 'racine',
    selBlock: null, selIsTrigger: false,
    saveTimer: null,
  };
  const auto = () => S.autos.find((a) => a.id === S.selId) || null;

  async function loadServer() {
    const id = await window.api.getSetting('lastServerId');
    const servers = await window.api.listServers();
    S.server = servers.find((x) => x.id === id) || servers[0] || null;
    S.serverId = S.server ? S.server.id : null;
  }

  async function init() {
    await loadServer();
    if (!S.serverId) return;
    S.autos = await window.api.autoList(S.serverId);
    if (!S.autos.some((a) => a.id === S.selId)) S.selId = S.autos.length ? S.autos[0].id : null;
    renderList();
    renderEditor();
  }
  async function reload() { await init(); }

  // ---------- liste ----------
  function renderList() {
    const ul = $('auto-list');
    ul.innerHTML = '';
    if (!S.autos.length) {
      const li = el('li', 'muted', 'Aucune automatisation.');
      ul.appendChild(li);
      return;
    }
    for (const a of S.autos) {
      const li = el('li', 'auto-item' + (a.id === S.selId ? ' sel' : ''));
      const trLabel = a.trigger ? (META[a.trigger.kind] ? META[a.trigger.kind].label : a.trigger.kind) : 'sans déclencheur';
      const name = el('span', 'auto-item-name', a.name || '(sans nom)');
      const sub = el('span', 'auto-item-sub', trLabel);
      const badge = el('span', 'badge ' + (a.enabled !== false ? 'online' : 'offline'), a.enabled !== false ? 'activée' : 'désactivée');
      const open = el('button', 'ghost ab-btn', 'Ouvrir');
      open.addEventListener('click', () => { S.selId = a.id; S.selBlock = null; renderList(); renderEditor(); });
      const del = el('button', 'ghost ab-btn', 'Supprimer');
      del.addEventListener('click', async () => {
        if (!confirm(`Supprimer « ${a.name} » ? Le script et la ligne cron seront aussi retirés du VPS.`)) return;
        await window.api.autoClean({ id: S.serverId, autoId: a.id }).catch(() => {});
        S.autos = S.autos.filter((x) => x.id !== a.id);
        await window.api.autoSave({ id: S.serverId, list: S.autos });
        if (S.selId === a.id) S.selId = S.autos.length ? S.autos[0].id : null;
        renderList(); renderEditor();
      });
      li.appendChild(name); li.appendChild(sub); li.appendChild(badge); li.appendChild(open); li.appendChild(del);
      ul.appendChild(li);
    }
  }

  // ---------- éditeur ----------
  function renderEditor() {
    const card = $('auto-editor-card');
    const a = auto();
    if (!a) { card.hidden = true; return; }
    card.hidden = false;
    $('auto-edit-name').value = a.name || '';
    $('auto-edit-enabled').checked = a.enabled !== false;
    S.insertList = a.blocks; S.insertLabel = 'racine';
    S.selBlock = null; S.selIsTrigger = false;
    renderPalette();
    renderCanvas();
    renderParams();
    renderValidation();
  }

  function renderPalette() {
    const pal = $('auto-palette');
    pal.innerHTML = '';
    const target = el('div', 'pal-target', `Zone d'ajout : ${S.insertLabel}`);
    const rootBtn = el('button', 'ghost ab-btn', 'Racine');
    rootBtn.addEventListener('click', () => { const a = auto(); S.insertList = a.blocks; S.insertLabel = 'racine'; renderPalette(); });
    target.appendChild(rootBtn);
    pal.appendChild(target);
    for (const cat of Object.keys(CATS)) {
      const head = el('div', 'pal-cat', CATS[cat].label);
      head.style.borderLeftColor = CATS[cat].color;
      pal.appendChild(head);
      for (const m of BLOCKS.filter((b) => b.cat === cat)) {
        const b = el('button', 'pal-block cat-' + cat);
        b.appendChild(el('span', 'pal-label', m.label));
        b.addEventListener('click', () => {
          const a = auto();
          if (!a) return;
          if (m.cat === 'trigger') {
            a.trigger = mkBlock(m.kind);
            S.selBlock = a.trigger; S.selIsTrigger = true;
          } else {
            (S.insertList || a.blocks).push(mkBlock(m.kind));
          }
          renderCanvas(); renderValidation();
        });
        pal.appendChild(b);
      }
    }
  }

  function paramSummary(b) {
    const m = META[b.kind];
    const parts = [];
    for (const p of (m.params || [])) {
      const v = (b.params || {})[p.k];
      if (v !== '' && v != null) {
        if (p.type === 'select' && Array.isArray(p.opts) && Array.isArray(p.opts[0])) {
          const o = p.opts.find((x) => x[0] === v);
          parts.push(o ? o[1] : v);
        } else parts.push(String(v) + (p.k === 'unit' ? '' : ''));
      }
    }
    return parts.join(' · ');
  }

  function renderCanvas() {
    const cv = $('auto-canvas');
    const a = auto();
    cv.innerHTML = '';
    if (!a) return;
    // zone déclencheur
    const tz = el('div', 'auto-trigger-zone');
    const th = el('div', 'ab-zone-label', 'DÉCLENCHEUR');
    tz.appendChild(th);
    if (a.trigger) tz.appendChild(blockEl(a.trigger, true));
    else {
      const b = el('button', 'auto-trigger-empty', '＋ Déclencheur');
      b.addEventListener('click', () => {
        const pal = $('auto-palette');
        const heads = pal.querySelectorAll('.pal-cat');
        if (heads && heads[0]) { heads[0].classList.add('pal-cat-hot'); heads[0].scrollIntoView({ block: 'center' }); }
      });
      tz.appendChild(b);
    }
    cv.appendChild(tz);
    cv.appendChild(zoneEl(a.blocks, 'racine', a.blocks));
  }

  function zoneEl(list, label, listRef) {
    const active = listRef === S.insertList;
    const z = el('div', 'auto-zone' + (active ? ' insert-here' : ''));
    const head = el('div', 'ab-zone-label', label === 'racine' ? 'BLOCS' : label.toUpperCase());
    z.appendChild(head);
    for (let i = 0; i < list.length; i++) z.appendChild(blockEl(list[i], false, i + 1));
    const add = el('button', 'ab-add', active ? '✓ ici' : '＋ ici');
    add.addEventListener('click', () => { S.insertList = listRef; S.insertLabel = label; renderPalette(); renderCanvas(); });
    z.appendChild(add);
    return z;
  }

  function blockEl(b, isTrigger, num) {
    const m = META[b.kind] || { cat: b.cat, label: b.kind };
    const d = el('div', 'auto-block cat-' + m.cat + (S.selBlock === b && S.selIsTrigger === isTrigger ? ' sel' : ''));
    d.dataset.uid = b.uid;
    const head = el('div', 'ab-head');
    head.appendChild(el('span', 'ab-num' + (isTrigger ? ' ab-num-trig' : ''), isTrigger ? '►' : String(num)));
    head.appendChild(el('span', 'ab-label', m.label));
    const sum = paramSummary(b);
    if (sum) head.appendChild(el('span', 'ab-sum', sum));
    head.addEventListener('click', () => { S.selBlock = b; S.selIsTrigger = isTrigger; renderCanvas(); renderParams(); });
    const btns = el('span', 'ab-btns');
    const up = el('button', 'ghost ab-btn', '↑');
    up.title = 'Monter';
    up.addEventListener('click', (e) => { e.stopPropagation(); moveBlock(b, -1); });
    const dn = el('button', 'ghost ab-btn', '↓');
    dn.title = 'Descendre';
    dn.addEventListener('click', (e) => { e.stopPropagation(); moveBlock(b, 1); });
    const del = el('button', 'ghost ab-btn', '✕');
    del.title = 'Supprimer';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteBlock(b, isTrigger); });
    btns.appendChild(up); btns.appendChild(dn); btns.appendChild(del);
    head.appendChild(btns);
    d.appendChild(head);
    if (CONTAINER_ZONES[b.kind]) {
      const zones = CONTAINER_ZONES[b.kind];
      for (const zname of zones) {
        const zlabel = b.kind === 'c_if' ? (zname === 'then' ? 'alors' : 'sinon') : 'contenu';
        d.appendChild(zoneEl(b.children[zname], zlabel, b.children[zname]));
      }
    }
    return d;
  }

  function findListOf(b) {
    const a = auto();
    const stack = [{ list: a.blocks, ref: a.blocks }];
    const walk = (list) => {
      for (const x of list) {
        if (x === b) return stack[stack.length - 1].ref;
        if (x.children) for (const z of Object.keys(x.children)) { stack.push({ ref: x.children[z] }); const r = walk(x.children[z]); if (r) return r; stack.pop(); }
      }
      return null;
    };
    return walk(a.blocks);
  }

  function moveBlock(b, dir) {
    const list = findListOf(b);
    if (!list) return;
    const i = list.indexOf(b);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(i, 1); list.splice(j, 0, b);
    renderCanvas(); renderValidation();
  }

  function deleteBlock(b, isTrigger) {
    const a = auto();
    if (isTrigger) { a.trigger = null; }
    else {
      const list = findListOf(b);
      if (list) list.splice(list.indexOf(b), 1);
    }
    if (S.selBlock === b) { S.selBlock = null; renderParams(); }
    renderCanvas(); renderValidation();
  }

  function renderParams() {
    const box = $('auto-params');
    box.innerHTML = '';
    const a = auto();
    if (!a) return;
    const b = S.selIsTrigger ? a.trigger : S.selBlock;
    if (!b) return;
    const m = META[b.kind] || {};
    const titleRow = el('div', 'pal-cat');
    const chip = el('span', 'pal-chip');
    chip.style.background = (CATS[m.cat] && CATS[m.cat].color) || '#888';
    titleRow.appendChild(chip);
    titleRow.appendChild(el('span', null, (S.selIsTrigger ? 'Déclencheur : ' : 'Bloc : ') + (m.label || b.kind)));
    box.appendChild(titleRow);

    for (const p of (m.params || [])) {
      const lab = el('label', 'ap-label', p.label);
      let input;
      if (p.type === 'select') {
        input = el('select', 'ap-input');
        for (const o of p.opts) {
          const opt = el('option', '', Array.isArray(o) ? o[1] : o);
          opt.value = Array.isArray(o) ? o[0] : o;
          input.appendChild(opt);
        }
        input.value = b.params[p.k] || (Array.isArray(p.opts) ? p.opts[0][0] : p.opts[0]);
      } else {
        input = el('input', 'ap-input');
        input.type = p.type === 'number' ? 'number' : p.type === 'time' ? 'time' : 'text';
        if (p.min != null) input.min = p.min;
        if (p.max != null) input.max = p.max;
        if (p.step != null) input.step = p.step;
        if (p.ph) input.placeholder = p.ph;
        input.value = b.params[p.k] != null ? b.params[p.k] : '';
      }
      input.addEventListener('change', () => {
        b.params[p.k] = p.type === 'number' ? Number(input.value) : input.value;
        renderCanvas(); renderValidation();
      });
      lab.appendChild(input);
      box.appendChild(lab);
    }
    if (!m.params || !m.params.length) return;
  }

  // ---------- validation ----------
  function validate(a) {
    const errs = [];
    if (!a.trigger) errs.push({ level: 'error', msg: 'Il manque un déclencheur (bloc jaune) en haut de la pile.', uid: null });
    if (!a.name || !a.name.trim()) errs.push({ level: 'error', msg: "Donne un nom à l'automatisation.", uid: null });
    else if (S.autos.some((x) => x.id !== a.id && (x.name || '').trim().toLowerCase() === a.name.trim().toLowerCase())) errs.push({ level: 'error', msg: 'Ce nom est déjà utilisé par une autre automatisation de ce serveur.', uid: null });
    const hasBackup = JSON.stringify(a.blocks).includes('"a_backup"');
    const walk = (list, prevAction) => {
      let prev = prevAction;
      for (const b of list) {
        const m = META[b.kind];
        if (b.kind === 'a_cmd' && !(b.params.cmd || '').trim()) errs.push({ level: 'error', msg: `« ${m.label} » : la commande est vide.`, uid: b.uid });
        if (b.kind === 't_wait' && !(Number(b.params.n) >= 1)) errs.push({ level: 'error', msg: '« Attendre » : la durée doit être au moins 1.', uid: b.uid });
        if (b.kind === 't_repeat' && (Number(b.params.n) < 1 || Number(b.params.n) > 1000)) errs.push({ level: 'error', msg: '« Répéter » : entre 1 et 1000.', uid: b.uid });
        if (b.kind === 't_repeat_until' && !b.params.cond) errs.push({ level: 'error', msg: '« Répéter jusqu’à… » : choisis une condition.', uid: b.uid });
        if (b.kind === 'c_if' && !b.params.cond) errs.push({ level: 'error', msg: '« SI / SINON » : choisis une condition.', uid: b.uid });
        if (RCON_ACTIONS.includes(b.kind) && S.server && !S.server.hasPassword) errs.push({ level: 'error', msg: `« ${m.label} » a besoin du mot de passe RCON — renseigne-le dans Mes serveurs.`, uid: b.uid });
        if ((b.kind === 'a_start' || b.kind === 'a_restart') && S.server && !S.server.startCmd) errs.push({ level: 'error', msg: `« ${m.label} » a besoin de la « commande de démarrage » — renseigne-la dans Mes serveurs (section SSH).`, uid: b.uid });
        if ((b.kind === 'e_retry' || b.kind === 't_redo') && !prev) errs.push({ level: 'warn', msg: `« ${m.label} » : aucune action avant ce bloc dans cette zone.`, uid: b.uid });
        if ((b.kind === 'c_backup_ok' || b.kind === 'c_backup_fail' || b.kind === 'e_backup_fail') && !hasBackup) errs.push({ level: 'warn', msg: `« ${m.label} » : il n’y a aucune sauvegarde (tar) dans cette automatisation.`, uid: b.uid });
        if (b.children) for (const z of Object.keys(b.children)) prev = walk(b.children[z], prev);
        if (b.cat === 'action') prev = b;
      }
      return prev;
    };
    walk(a.blocks || [], null);
    return errs;
  }

  function renderValidation() {
    const box = $('auto-validation');
    box.innerHTML = '';
    const a = auto();
    if (!a) return;
    const errs = validate(a);
    if (!errs.length) {
      box.appendChild(el('div', 'av-ok', '✓ Valide'));
      return;
    }
    for (const e of errs) {
      const d = el('div', 'av-item ' + (e.level === 'error' ? 'av-err' : 'av-warn'), (e.level === 'error' ? '✕ ' : '⚠ ') + e.msg);
      if (e.uid) d.addEventListener('click', () => {
        const n = document.querySelector(`.auto-block[data-uid="${e.uid}"]`);
        if (n) { n.classList.add('flash'); n.scrollIntoView({ block: 'center' }); setTimeout(() => n.classList.remove('flash'), 1600); }
      });
      box.appendChild(d);
    }
  }

  function hasErrors(a) { return validate(a).some((e) => e.level === 'error'); }

  function flashStatus(msg) {
    const s = $('auto-save-status');
    s.textContent = msg;
    if (S.saveTimer) clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => { s.textContent = ''; }, 4000);
  }

  async function persist() {
    await window.api.autoSave({ id: S.serverId, list: S.autos });
  }

  function bindEditor() {
    $('auto-edit-name').addEventListener('change', () => { const a = auto(); if (a) { a.name = $('auto-edit-name').value.trim(); renderList(); renderValidation(); } });
    $('auto-edit-enabled').addEventListener('change', async () => {
      const a = auto(); if (!a) return;
      a.enabled = $('auto-edit-enabled').checked;
      await persist(); renderList();
      const r = await window.api.autoDeploy({ id: S.serverId, auto: a });
      flashStatus(r.ok ? (a.enabled ? 'Activée et déployée ✓' : 'Désactivée sur le VPS ✓') : `Erreur : ${r.error}`);
    });
    $('btn-auto-save').addEventListener('click', async () => {
      const a = auto(); if (!a) return;
      if (hasErrors(a)) { renderValidation(); flashStatus('Corrige les erreurs (✕) avant d’enregistrer.'); return; }
      await persist(); renderList(); renderValidation();
      flashStatus('Enregistré ✓');
    });
    $('btn-auto-deploy').addEventListener('click', async () => {
      const a = auto(); if (!a) return;
      if (hasErrors(a)) { renderValidation(); flashStatus('Corrige les erreurs (✕) avant de déployer.'); return; }
      await persist(); renderList(); renderValidation();
      flashStatus('Déploiement sur le VPS…');
      const r = await window.api.autoDeploy({ id: S.serverId, auto: a });
      if (r.ok) flashStatus(`Déployé ✓ (${r.cron.length} ligne(s) cron${r.watcher ? ' + watcher' : ''})`);
      else flashStatus(`Erreur : ${r.error}`);
    });
    $('btn-auto-test').addEventListener('click', async () => {
      const a = auto(); if (!a) return;
      if (hasErrors(a)) { renderValidation(); flashStatus('Corrige les erreurs (✕) avant de tester.'); return; }
      const out = $('auto-test-out');
      out.hidden = false;
      out.textContent = 'Test en cours sur le VPS…';
      const r = await window.api.autoTest({ id: S.serverId, autoId: a.id });
      out.textContent = r.ok ? r.out : `Erreur : ${r.error}`;
    });
    $('btn-auto-log').addEventListener('click', async () => {
      const a = auto(); if (!a) return;
      const out = $('auto-log-out');
      out.hidden = false;
      out.textContent = 'Chargement du log…';
      const r = await window.api.autoLog({ id: S.serverId, autoId: a.id, n: 80 });
      out.textContent = r.ok ? r.out : `Erreur : ${r.error}`;
      // miroite les EVENT: nouveaux dans Actualités
      if (r.ok) {
        const events = String(r.out).split('\n').filter((l) => l.includes('EVENT:'));
        const seenKey = `autoSeen_${a.id}`;
        const seen = Number(await window.api.getSetting(seenKey)) || 0;
        const fresh = events.slice(seen);
        for (const line of fresh) {
          const msg = line.split('EVENT:')[1].trim();
          if (msg) await window.api.newsAdd({ ts: Date.now(), type: 'serveur', msg: `[auto] ${msg}` }).catch(() => {});
        }
        await window.api.setSetting(seenKey, events.length);
      }
    });
    $('btn-auto-new').addEventListener('click', async () => {
      const n = S.autos.length + 1;
      const a = { id: 'auto' + Date.now(), name: `Automatisation ${n}`, enabled: false, trigger: null, blocks: [] };
      S.autos.push(a);
      S.selId = a.id;
      await persist(); renderList(); renderEditor();
    });
    $('btn-auto-presets').addEventListener('click', () => {
      const box = $('auto-presets');
      if (box.hidden) { renderPresetsPanel(); box.hidden = false; }
      else box.hidden = true;
    });
    $('btn-auto-status').addEventListener('click', async () => {
      const out = $('auto-status-out');
      out.hidden = false;
      out.textContent = 'Lecture du crontab et des watchers sur le VPS…';
      const r = await window.api.autoStatus(S.serverId);
      out.textContent = r.ok ? r.out : (r.noSsh ? 'SSH non configuré sur ce serveur.' : `Erreur : ${r.error}`);
    });
  }

  function renderPresetsPanel() {
    const box = $('auto-presets');
    box.innerHTML = '';
    for (const p of PRESETS) {
      const card = el('button', 'preset-card');
      card.appendChild(el('span', 'preset-name', p.name));
      card.addEventListener('click', async () => {
        const a = { id: 'auto' + Date.now(), name: p.name, enabled: false, trigger: mkBlock(p.trigger.kind), blocks: withUids(p.blocks) };
        a.trigger.params = { ...p.trigger.params };
        S.autos.push(a);
        S.selId = a.id;
        await persist();
        box.hidden = true;
        renderList(); renderEditor();
        flashStatus('Preset créé ✓');
      });
      box.appendChild(card);
    }
  }

  window.AutoPage = { init, reload };
  bindEditor();
})();

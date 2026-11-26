// ---------- Page Automatisations : editeur visuel de blocs (declencheur -> conditions/actions/logique) ----------
// Le compilateur cote main (main.js) transforme ca en script bash + cron/watcher sur le VPS.
(function () {
  const CATS = {
    trigger: { label: 'Déclencheurs', color: '#e0a83c' },
    cond: { label: 'Conditions (bloquent la suite si fausses)', color: '#f08a3c' },
    action: { label: 'Actions', color: '#7cb342' },
    time: { label: 'Gestion du temps', color: '#9b7ede' },
    error: { label: 'Gestion des erreurs', color: '#e5484d' },
  };
  const COND_OPTS = [
    ['online', 'serveur en ligne'], ['offline', 'serveur hors ligne'], ['tps15', 'TPS < 15'],
    ['ram90', 'RAM > 90 %'], ['cpu90', 'CPU > 90 %'], ['disk10', 'moins de 10 Go libres sur le disque'],
    ['last', 'condition précédente remplie'],
  ];
  const BLOCKS = [
    { kind: 'tr_daily', cat: 'trigger', label: 'Tous les jours à HH:MM', params: [{ k: 'time', label: 'Heure', type: 'time', def: '03:00' }] },
    { kind: 'tr_at', cat: 'trigger', label: 'À une heure précise (une fois)', params: [{ k: 'time', label: 'Heure', type: 'time', def: '12:00' }] },
    { kind: 'tr_every_min', cat: 'trigger', label: 'Toutes les X minutes', params: [{ k: 'n', label: 'Minutes', type: 'number', min: 1, max: 59, def: 5 }] },
    { kind: 'tr_every_hour', cat: 'trigger', label: 'Toutes les X heures', params: [{ k: 'n', label: 'Heures', type: 'number', min: 1, max: 23, def: 1 }] },
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
  const RCON_ACTIONS = ['a_stop', 'a_restart', 'a_save', 'a_backup', 'a_cmd', 'a_mnt_on', 'a_mnt_off', 'a_state', 'a_perf'];
  const CONTAINER_ZONES = { c_if: ['then', 'else'], t_repeat: ['body'], t_repeat_until: ['body'], e_on_fail: ['body'], e_noresp: ['body'], e_backup_fail: ['body'] };

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
  const withUids = (list) => list.map((b) => { const c = deep(b); c.uid = uid(); c.cat = (META[c.kind] && META[c.kind].cat) || c.cat; if (c.children) for (const z of Object.keys(c.children)) c.children[z] = withUids(c.children[z]); return c; });

  const S = {
    serverId: null, server: null, autos: [], selId: null,
    insertList: null, insertLabel: 'racine',
    selBlock: null, selIsTrigger: false,
    saveTimer: null, dragUid: null,
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
    if (S.selId && !S.autos.some((a) => a.id === S.selId)) S.selId = null; // on ouvre sur la liste
    renderList();
    renderEditor();
  }
  async function reload() { await init(); }

  // ---------- liste ----------
  function listStatus(msg) {
    const elx = $('auto-list-status');
    if (!elx) return;
    elx.textContent = msg || '';
    clearTimeout(listStatus._t);
    if (msg) listStatus._t = setTimeout(() => { elx.textContent = ''; }, 6000);
  }

  async function toggleAuto(a) {
    if (a.enabled === false && hasErrors(a)) { listStatus('Ouvre l’automatisation et corrige les erreurs avant de l’activer.'); return; }
    a.enabled = a.enabled === false;
    await persist();
    const r = await window.api.autoDeploy({ id: S.serverId, auto: a }).catch((e) => ({ ok: false, error: String(e) }));
    if (r && r.ok) listStatus(a.enabled ? '✓ Activée et déployée sur le VPS' : '✓ Désactivée sur le VPS (cron commenté, watcher arrêté)');
    else listStatus('Erreur : ' + ((r && (r.error || (r.problems || []).join(' | '))) || 'échec du déploiement'));
    renderList();
  }

  async function deleteAuto(a) {
    if (!confirm(`Supprimer « ${a.name || a.id} » ? Le script et la ligne cron seront aussi retirés du VPS.`)) return;
    await window.api.autoClean({ id: S.serverId, autoId: a.id }).catch(() => {});
    S.autos = S.autos.filter((x) => x.id !== a.id);
    if (S.selId === a.id) S.selId = null;
    await persist();
    listStatus('✓ Supprimée');
    renderList(); renderEditor();
  }

  function renderList() {
    $('auto-list-card').hidden = !!S.selId; // en édition : la liste est cachée
    const ul = $('auto-list');
    ul.innerHTML = '';
    $('auto-list-empty').hidden = S.autos.length > 0;
    for (const a of S.autos) {
      const li = el('li', 'auto-item');
      li.title = 'Cliquer pour ouvrir l’éditeur de blocs';
      li.addEventListener('click', () => { S.selId = a.id; S.selBlock = null; S.insertList = null; renderList(); renderEditor(); });
      const trLabel = a.trigger ? (META[a.trigger.kind] ? META[a.trigger.kind].label : a.trigger.kind) : 'sans déclencheur';
      const name = el('span', 'auto-item-name', a.name || '(sans nom)');
      const sub = el('span', 'auto-item-sub', `${trLabel} · ${a.enabled !== false ? 'activée' : 'désactivée'}`);
      const btns = el('span', 'auto-item-btns');
      const tog = el('button', 'auto-toggle' + (a.enabled !== false ? ' active' : ''), a.enabled !== false ? 'Désactiver' : 'Activer');
      tog.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); toggleAuto(a); });
      btns.appendChild(tog);
      if (a.enabled === false) { // on ne peut supprimer que si désactivée
        const del = el('button', 'auto-del', 'Supprimer');
        del.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); deleteAuto(a); });
        btns.appendChild(del);
      }
      li.appendChild(name); li.appendChild(sub); li.appendChild(btns);
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
    S.insertList = a.blocks; S.insertLabel = 'racine';
    S.selBlock = null; S.selIsTrigger = false;
    renderPalette();
    renderCanvas();
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
            const nb = mkBlock(m.kind);
            (S.insertList || a.blocks).push(nb);
            S.selBlock = nb; S.selIsTrigger = false;
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
    // le déclencheur est simplement le premier bloc de la pile (style Scratch)
    if (a.trigger) cv.appendChild(blockEl(a.trigger, true));
    cv.appendChild(zoneEl(a.blocks, 'racine', a.blocks));
  }

  function zoneEl(list, label, listRef) {
    const active = listRef === S.insertList;
    const z = el('div', 'auto-zone' + (active ? ' insert-here' : '') + (label === 'racine' ? ' root-zone' : ''));
    if (label !== 'racine') z.appendChild(el('div', 'ab-zone-label', label.toUpperCase()));
    if (!list.length) z.classList.add('empty');
    for (let i = 0; i < list.length; i++) z.appendChild(blockEl(list[i], false, i + 1));
    z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('drag-over'); });
    z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
    z.addEventListener('drop', (e) => {
      e.preventDefault();
      z.classList.remove('drag-over');
      const uid = S.dragUid || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (!uid) { renderCanvas(); return; }
      const a = auto();
      if (!a) return;
      const b = (a.trigger && a.trigger.uid === uid) ? null : findBlockByUid(uid);
      if (!b) { renderCanvas(); return; }
      removeFromParent(b);
      listRef.push(b);
      S.insertList = listRef; S.insertLabel = label;
      S.selBlock = b; S.selIsTrigger = false;
      renderPalette(); renderCanvas(); renderValidation();
    });
    if (label !== 'racine' || list.length) {
      const add = el('button', 'ab-add', active ? '✓ ici' : '＋ ici');
      add.addEventListener('click', () => { S.insertList = listRef; S.insertLabel = label; renderPalette(); renderCanvas(); });
      z.appendChild(add);
    }
    return z;
  }

  function findBlockByUid(uid) {
    const a = auto();
    let found = null;
    const walk = (list) => {
      for (const x of list) {
        if (x.uid === uid) { found = x; return true; }
        if (x.children) for (const z of Object.keys(x.children)) if (walk(x.children[z])) return true;
      }
      return false;
    };
    if (a) walk(a.blocks);
    return found;
  }

  function removeFromParent(b) {
    const a = auto();
    const walk = (list) => {
      const i = list.indexOf(b);
      if (i >= 0) { list.splice(i, 1); return true; }
      for (const x of list) if (x.children) for (const z of Object.keys(x.children)) if (walk(x.children[z])) return true;
      return false;
    };
    return a && walk(a.blocks);
  }

  function moveBlockToUid(uid, beforeBlock, after) {
    const a = auto();
    if (!a) return;
    if (a.trigger && a.trigger.uid === uid) { renderCanvas(); return; }
    const b = findBlockByUid(uid);
    if (!b || b === beforeBlock) { renderCanvas(); return; }
    removeFromParent(b);
    const list = findListOf(beforeBlock);
    if (list) list.splice(after ? list.indexOf(beforeBlock) + 1 : list.indexOf(beforeBlock), 0, b);
    S.selBlock = b; S.selIsTrigger = false;
    renderCanvas(); renderValidation();
  }

  function blockEl(b, isTrigger, num) {
    const m = META[b.kind] || { cat: b.cat, label: b.kind };
    const selected = S.selBlock === b && S.selIsTrigger === isTrigger;
    const d = el('div', 'auto-block cat-' + m.cat + (selected ? ' sel' : ''));
    d.dataset.uid = b.uid;
    const head = el('div', 'ab-head');
    head.draggable = true;
    head.addEventListener('dragstart', (e) => {
      S.dragUid = b.uid;
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', b.uid); } catch { } }
    });
    head.appendChild(el('span', 'ab-num' + (isTrigger ? ' ab-num-trig' : ''), isTrigger ? '►' : String(num)));
    head.appendChild(el('span', 'ab-label', m.label));
    const sum = paramSummary(b);
    if (sum) head.appendChild(el('span', 'ab-sum', sum));
    head.addEventListener('click', () => {
      if (selected) { S.selBlock = null; S.selIsTrigger = false; }
      else { S.selBlock = b; S.selIsTrigger = isTrigger; }
      renderCanvas(); renderValidation();
    });
    head.addEventListener('dragover', (e) => { e.preventDefault(); });
    head.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      const uid = S.dragUid || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (uid) moveBlockToUid(uid, b, false);
    });
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
    const desc = DESC[b.kind] || '';
    if (desc) {
      const info = el('span', 'info ab-info', 'i');
      info.dataset.tip = desc; // infobulle au survol : à quoi sert ce bloc
      d.appendChild(info);
    }
    if (selected) {
      const pb = el('div', 'ab-params');
      fillParamFields(b, pb);
      d.appendChild(pb);
    }
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
    if (S.selBlock === b) S.selBlock = null;
    renderCanvas(); renderValidation();
  }

  function fillParamFields(b, box) {
    const m = META[b.kind] || {};
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
  }

  // ---------- validation ----------
  function validate(a) {
    const errs = [];
    if (!a.trigger) errs.push({ level: 'error', msg: 'Premier bloc : un déclencheur (jaune).', uid: null });
    if (!a.name || !a.name.trim()) errs.push({ level: 'error', msg: "Donne un nom à l'automatisation.", uid: null });
    else if (S.autos.some((x) => x.id !== a.id && (x.name || '').trim().toLowerCase() === a.name.trim().toLowerCase())) errs.push({ level: 'error', msg: 'Ce nom est déjà utilisé par une autre automatisation de ce serveur.', uid: null });
    // au moins UNE action (bleu) dans toute l'automatisation — le reste est optionnel
    const timeOk = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59; };
    if (a.trigger) {
      const tp = a.trigger.params || {};
      if (a.trigger.kind === 'tr_every_min' && (Number(tp.n) < 1 || Number(tp.n) > 59)) errs.push({ level: 'error', msg: '« Toutes les X minutes » : entre 1 et 59.', uid: a.trigger.uid || null });
      if (a.trigger.kind === 'tr_every_hour' && (Number(tp.n) < 1 || Number(tp.n) > 23)) errs.push({ level: 'error', msg: '« Toutes les X heures » : entre 1 et 23.', uid: a.trigger.uid || null });
      if ((a.trigger.kind === 'tr_daily' || a.trigger.kind === 'tr_at' || a.trigger.kind === 'tr_weekday') && !timeOk(tp.time)) errs.push({ level: 'error', msg: 'Heure invalide (HH:MM, ex 20:30).', uid: a.trigger.uid || null });
    }
    const all = [];
    const collect = (list) => { for (const b of list || []) { all.push(b); if (b.children) for (const z of Object.keys(b.children)) collect(b.children[z]); } };
    collect(a.blocks);
    if (!all.some((b) => b.cat === 'action')) errs.push({ level: 'error', msg: 'Ajoute au moins une action (bloc bleu).', uid: null });
    const hasBackup = all.some((b) => b.kind === 'a_backup');
    const ORDER_KINDS = ['e_on_fail', 'e_noresp', 'e_backup_fail', 'e_log_err', 'e_retry', 't_redo'];
    const walk = (list, prevAction) => {
      let prev = prevAction;
      for (const b of list) {
        const m = META[b.kind];
        if (b.cat === 'trigger') errs.push({ level: 'error', msg: 'Un bloc déclencheur (jaune) ne va que comme premier bloc.', uid: b.uid });
        if (b.kind === 'c_time' && !timeOk(b.params.time)) errs.push({ level: 'error', msg: '« Si une heure précise… » : heure invalide (HH:MM).', uid: b.uid });
        if (b.kind === 'a_cmd' && !(b.params.cmd || '').trim()) errs.push({ level: 'error', msg: `« ${m.label} » : la commande est vide.`, uid: b.uid });
        if (b.kind === 't_wait' && !(Number(b.params.n) >= 1)) errs.push({ level: 'error', msg: '« Attendre » : la durée doit être au moins 1.', uid: b.uid });
        if (b.kind === 't_repeat' && (Number(b.params.n) < 1 || Number(b.params.n) > 1000)) errs.push({ level: 'error', msg: '« Répéter » : entre 1 et 1000.', uid: b.uid });
        if (b.kind === 't_repeat_until' && !b.params.cond) errs.push({ level: 'error', msg: '« Répéter jusqu’à… » : choisis une condition.', uid: b.uid });
        if (b.kind === 'c_if' && !b.params.cond) errs.push({ level: 'error', msg: '« SI / SINON » : choisis une condition.', uid: b.uid });
        if (RCON_ACTIONS.includes(b.kind) && S.server && !S.server.hasPassword) errs.push({ level: 'error', msg: `« ${m.label} » a besoin du mot de passe RCON — renseigne-le dans Mes serveurs.`, uid: b.uid });
        if ((b.kind === 'a_start' || b.kind === 'a_restart') && S.server && !S.server.startCmd) errs.push({ level: 'error', msg: `« ${m.label} » a besoin de la « commande de démarrage » — renseigne-la dans Mes serveurs (section SSH).`, uid: b.uid });
        // mauvais ordre -> erreur : ces blocs doivent suivre un autre bloc dans la meme zone
        if (ORDER_KINDS.includes(b.kind) && !prev) errs.push({ level: 'error', msg: `« ${m.label} » : place ce bloc APRÈS un autre bloc.`, uid: b.uid });
        // conditions de sauvegarde avant toute sauvegarde -> erreur d'ordre
        if ((b.kind === 'c_backup_ok' || b.kind === 'c_backup_fail' || b.kind === 'e_backup_fail') && !hasBackup) errs.push({ level: 'error', msg: `« ${m.label} » : mets d'abord une « Sauvegarde complète » (bleu) avant.`, uid: b.uid });
        if (b.children) for (const z of Object.keys(b.children)) prev = walk(b.children[z], prev);
        if (!CONTAINER_ZONES[b.kind]) prev = b;
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
    $('btn-auto-back').addEventListener('click', () => { S.selId = null; S.selBlock = null; renderList(); renderEditor(); });
    $('btn-auto-new').addEventListener('click', async () => {
      const a = { id: 'auto' + Date.now(), name: '', enabled: false, trigger: null, blocks: [] };
      S.autos.push(a);
      S.selId = a.id;
      await persist(); renderList(); renderEditor();
      const ni = $('auto-edit-name');
      if (ni) { ni.focus(); if (ni.select) ni.select(); }
    });
    $('btn-auto-deploy').addEventListener('click', async () => {
      const a = auto(); if (!a) return;
      if (hasErrors(a)) { renderValidation(); flashStatus('Corrige les erreurs (✕) en dessous avant de déployer.'); return; }
      a.enabled = true; // déployer = activer
      await persist(); renderList(); renderValidation();
      flashStatus('Déploiement sur le VPS…');
      const r = await window.api.autoDeploy({ id: S.serverId, auto: a });
      if (r.ok) flashStatus(`✓ Déployée et activée (${r.cron.length} ligne(s) cron${r.watcher ? ' + watcher' : ''})`);
      else flashStatus(`Erreur : ${r.error || (r.problems || []).join(' | ') || 'échec du déploiement'}`);
    });
  }

  window.AutoPage = { init, reload };
  bindEditor();
})();

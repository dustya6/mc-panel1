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
    // DÉCLENCHEURS (jaune) — quand ça se lance
    tr_daily: 'Tous les jours à l’heure que tu choisis (ex : 03:00).',
    tr_at: 'Une seule fois par jour à l’heure choisie (ex : 20:00).',
    tr_every_min: 'Toutes les X minutes (ex : toutes les 5 minutes).',
    tr_every_hour: 'Toutes les X heures (ex : toutes les 2 heures).',
    tr_weekday: 'Un jour de la semaine précis, à une heure (ex : vendredi à 20:00).',
    tr_start: 'Quand ton serveur démarre.',
    tr_stop: 'Quand ton serveur s’arrête.',
    tr_crash: 'Quand ton serveur plante (grosse erreur dans les logs).',
    tr_offline: 'Quand ton serveur ne répond plus.',
    tr_online: 'Quand ton serveur redevient disponible.',
    // CONDITIONS (orange) — si c’est faux, les blocs après ne se font pas
    c_online: 'Si le serveur répond. Sinon, la suite est bloquée.',
    c_offline: 'Si le serveur ne répond plus. Sinon, la suite est bloquée.',
    c_ram: 'Si la mémoire utilisée dépasse X %. Sinon, la suite est bloquée.',
    c_tps: 'Si le serveur rame (TPS en dessous de X). Sinon, la suite est bloquée.',
    c_cpu: 'Si le processeur dépasse X %. Sinon, la suite est bloquée.',
    c_disk: 'S’il reste moins de X Go sur le disque. Sinon, la suite est bloquée.',
    c_backup_ok: 'Si la dernière sauvegarde a réussi.',
    c_backup_fail: 'Si la dernière sauvegarde a échoué.',
    c_time: 'Si l’heure actuelle est exactement celle indiquée.',
    c_last: 'Si la condition juste avant était vraie.',
    c_if: 'Fait le HAUT (alors) ou le BAS (sinon), selon la condition choisie.',
    // ACTIONS (vert) — ce que ça fait concrètement
    a_start: 'Démarre le serveur (avec la commande de démarrage de Mes serveurs).',
    a_stop: 'Arrête proprement le serveur (il sauvegarde avant de s’arrêter).',
    a_restart: 'Arrête puis redémarre le serveur.',
    a_save: 'Sauvegarde rapide du monde sur le serveur.',
    a_backup: 'Sauvegarde complète : copie du monde (overworld, nether, end) dans un fichier daté dans backups/.',
    a_prune: 'Supprime les sauvegardes de plus de X jours.',
    a_state: 'Écrit dans le journal si le serveur est en ligne et qui est connecté.',
    a_perf: 'Écrit dans le journal : vitesse (TPS), mémoire, CPU, place restante sur le disque.',
    a_cmd: 'Envoie une commande au serveur (ex : say Bonjour tout le monde).',
    a_mnt_on: 'Ferme le serveur à ceux qui ne sont pas sur la whitelist (mode maintenance).',
    a_mnt_off: 'Rouvre le serveur à tout le monde.',
    a_report: 'Crée un fichier avec l’état du serveur (joueurs, vitesse, mémoire, disque).',
    a_event: 'Ajoute un message dans le journal de l’auto (visible aussi dans Actualités).',
    // TEMPS (violet)
    t_wait: 'Attend X secondes / minutes / heures, puis continue.',
    t_repeat: 'Refait les blocs à l’intérieur X fois.',
    t_repeat_until: 'Refait les blocs à l’intérieur jusqu’à ce que la condition soit vraie.',
    t_stop: 'Arrête l’automatisation tout de suite.',
    t_skip: 'Ne fait rien (bloc vide, juste pour la lisibilité).',
    t_redo: 'Refait une fois l’action d’avant.',
    // ERREURS (rouge)
    e_on_fail: 'Si l’action d’avant a échoué, fait les blocs à l’intérieur.',
    e_retry: 'Si l’action d’avant échoue, réessaie automatiquement jusqu’à X fois.',
    e_noresp: 'Si le serveur ne répond plus, fait les blocs à l’intérieur.',
    e_backup_fail: 'Si la sauvegarde a échoué, fait les blocs à l’intérieur.',
    e_stop_err: 'En cas d’erreur : tout s’arrête.',
    e_cont_err: 'En cas d’erreur : on continue quand même (c’est le réglage par défaut).',
    e_log_err: 'Si l’étape d’avant a échoué, écrit « erreur » dans le journal.',
  };
  // infos structurées de l'infobulle "i" (util / ex / io / warn) ; la ligne "ce que ça fait" = DESC
  const INFO = {
    tr_daily: { util: 'Faire quelque chose tous les jours à heure fixe', ex: 'Sauvegarder le serveur tous les jours à 03:00', io: 'Heure choisie (HH:MM)', warn: 'Utilise l’heure du serveur, pas celle de ton PC' },
    tr_at: { util: 'Faire quelque chose une seule fois par jour à une heure précise', ex: 'Envoyer « bonsoir » à 20:00 pile', io: 'Heure (HH:MM)', warn: 'Ne se répète pas dans la même journée' },
    tr_every_min: { util: 'Répéter une action toutes les X minutes', ex: 'Vérifier la vitesse du serveur toutes les 5 minutes', io: 'Nombre de minutes (1 à 59)', warn: 'Pour 60 min et plus, utilise « toutes les X heures »' },
    tr_every_hour: { util: 'Répéter une action toutes les X heures', ex: 'Sauvegarde toutes les 2 heures', io: 'Nombre d’heures (1 à 23)', warn: '' },
    tr_weekday: { util: 'Faire quelque chose un jour précis de la semaine', ex: 'Message « bon week-end » le vendredi à 18:00', io: 'Jour + heure', warn: '' },
    tr_start: { util: 'Réagir au démarrage du serveur', ex: 'Prévenir les joueurs que le serveur est ouvert', io: 'État du serveur', warn: 'Vérifié toutes les 15 secondes' },
    tr_stop: { util: 'Réagir à l’arrêt du serveur', ex: 'Faire une dernière sauvegarde avant l’arrêt', io: 'État du serveur', warn: '' },
    tr_crash: { util: 'Réagir à un plantage du serveur', ex: 'Redémarrer automatiquement après un crash', io: 'Logs du serveur + dossier des rapports de crash', warn: 'Ne voit que les crashs arrivés pendant la surveillance' },
    tr_offline: { util: 'Réagir quand le serveur ne répond plus', ex: 'Prévenir que le serveur est hors ligne', io: 'État du serveur', warn: '' },
    tr_online: { util: 'Réagir quand le serveur revient en ligne', ex: 'Dire « le serveur est de retour »', io: 'État du serveur', warn: '' },
    c_online: { util: 'Vérifier que le serveur répond', ex: 'Ne rien faire si le serveur est éteint', io: 'Réponse du serveur (oui / non)', warn: 'Si faux → bloque TOUS les blocs suivants' },
    c_offline: { util: 'Vérifier que le serveur ne répond plus', ex: 'Alerter quand le serveur tombe', io: 'Réponse du serveur (oui / non)', warn: 'Si faux → bloque la suite' },
    c_ram: { util: 'Vérifier la mémoire utilisée', ex: 'Alerter si la mémoire dépasse 90 %', io: 'Mémoire en % + seuil X', warn: 'Si faux → bloque la suite' },
    c_tps: { util: 'Vérifier si le serveur rame', ex: 'Alerter si la vitesse descend sous 15', io: 'Vitesse actuelle (TPS) + seuil X', warn: 'Si faux → bloque la suite' },
    c_cpu: { util: 'Vérifier la charge du processeur', ex: 'Alerter si le processeur dépasse 90 %', io: 'CPU en % + seuil X', warn: 'Si faux → bloque la suite' },
    c_disk: { util: 'Vérifier la place restante sur le disque', ex: 'Alerter s’il reste moins de 10 Go', io: 'Go libres + seuil X', warn: 'Si faux → bloque la suite' },
    c_backup_ok: { util: 'Savoir si la dernière sauvegarde a réussi', ex: 'Prévenir les joueurs seulement si la sauvegarde a marché', io: 'Résultat de la dernière sauvegarde', warn: 'Mets un bloc « Sauvegarde complète » avant' },
    c_backup_fail: { util: 'Savoir si la dernière sauvegarde a échoué', ex: 'Refaire la sauvegarde si ça a planté', io: 'Résultat de la dernière sauvegarde', warn: 'Mets un bloc « Sauvegarde complète » avant' },
    c_time: { util: 'Vérifier l’heure actuelle', ex: 'Activer un mode le soir à 20:00 pile', io: 'Heure actuelle + heure choisie', warn: 'Heure du serveur, pas de ton PC' },
    c_last: { util: 'Réutiliser le résultat de la condition d’avant', ex: 'Enchaîner deux vérifications', io: 'Résultat de la condition précédente', warn: 'Ne marche que s’il y a une condition avant' },
    c_if: { util: 'Faire deux chemins : ALORS / SINON', ex: 'Si le serveur répond → « en ligne », sinon → « hors ligne »', io: 'La condition choisie', warn: 'Blocs du HAUT = alors, du BAS = sinon' },
    a_start: { util: 'Démarrer le serveur à distance', ex: 'Relancer le serveur automatiquement le matin', io: 'Commande de démarrage (renseignée dans Mes serveurs)', warn: 'Ne marche que si cette commande est renseignée ; ne fait rien si le serveur est déjà en ligne' },
    a_stop: { util: 'Arrêter proprement le serveur', ex: 'Éteindre le serveur à 23:00', io: 'Connexion au serveur (mot de passe RCON)', warn: 'Le serveur sauvegarde avant de s’arrêter' },
    a_restart: { util: 'Redémarrer le serveur', ex: 'Redémarrage chaque nuit à 04:00', io: 'Connexion au serveur + commande de démarrage', warn: 'Les joueurs sont déconnectés pendant le redémarrage' },
    a_save: { util: 'Sauvegarder rapidement le monde', ex: 'Sauvegarde toutes les heures', io: 'Connexion au serveur', warn: 'Écrit sur le disque du serveur (pas une copie externe)' },
    a_backup: { util: 'Faire une copie complète du monde', ex: 'Copie complète tous les jours à 03:00', io: 'Dossier du serveur', warn: 'Prend de la place sur le disque ; fichier dans backups/' },
    a_prune: { util: 'Nettoyer les vieilles sauvegardes', ex: 'Garder seulement les sauvegardes des 7 derniers jours', io: 'Dossier backups/ + nombre de jours', warn: 'Suppression définitive' },
    a_state: { util: 'Savoir si le serveur est en ligne et qui joue', ex: 'Noter la présence toutes les heures dans le journal', io: 'Connexion au serveur', warn: '' },
    a_perf: { util: 'Noter la vitesse et les ressources du serveur', ex: 'Bilan toutes les 30 minutes dans le journal', io: 'Vitesse (TPS), mémoire, CPU, disque', warn: '' },
    a_cmd: { util: 'Envoyer n’importe quelle commande au serveur', ex: 'say Bonjour tout le monde · give @p diamond 64 · time set day', io: 'Ta commande + connexion au serveur', warn: 'La commande doit exister côté serveur' },
    a_mnt_on: { util: 'Fermer le serveur (mode maintenance)', ex: 'Fermer pendant une mise à jour', io: 'Connexion au serveur', warn: 'Ne marche que si la whitelist est activée sur le serveur' },
    a_mnt_off: { util: 'Rouvrir le serveur à tout le monde', ex: 'Rouvrir après la mise à jour', io: 'Connexion au serveur', warn: '' },
    a_report: { util: 'Créer un fichier avec l’état du serveur', ex: 'Un rapport pour toi chaque jour', io: 'Joueurs, vitesse, mémoire, disque', warn: 'Fichier créé dans le dossier de l’appli sur le serveur' },
    a_event: { util: 'Laisser une trace dans le journal', ex: 'Noter « sauvegarde faite » à chaque fois', io: 'Ton message', warn: '' },
    t_wait: { util: 'Faire une pause avant de continuer', ex: 'Attendre 30 secondes après un arrêt avant de relancer', io: 'Durée + unité (secondes / minutes / heures)', warn: '' },
    t_repeat: { util: 'Refaire des blocs X fois', ex: 'Envoyer un rappel 3 fois', io: 'Nombre de fois + blocs placés à l’intérieur', warn: '' },
    t_repeat_until: { util: 'Refaire des blocs jusqu’à ce qu’une condition soit vraie', ex: 'Réessayer jusqu’à ce que le serveur réponde', io: 'Condition + pause entre essais + blocs à l’intérieur', warn: 'Limité à 1000 essais pour éviter une boucle infinie' },
    t_stop: { util: 'Tout arrêter immédiatement', ex: 'Stopper le scénario si une erreur a été vue avant', io: '', warn: '' },
    t_skip: { util: 'Laisser un bloc vide (pour la lisibilité)', ex: 'Séparer deux parties du scénario', io: '', warn: 'Ne fait vraiment rien' },
    t_redo: { util: 'Refair une fois l’action d’avant', ex: 'Réessayer une commande une seule fois', io: 'La dernière action', warn: 'Ne marche que s’il y a une action avant' },
    e_on_fail: { util: 'Réagir si l’action d’avant a échoué', ex: 'Noter dans le journal si la sauvegarde a planté', io: 'Résultat de l’action précédente', warn: 'Se place APRÈS un autre bloc' },
    e_retry: { util: 'Réessayer automatiquement une action qui a échoué', ex: 'Réessayer la sauvegarde jusqu’à 3 fois', io: 'Nombre d’essais + la dernière action', warn: 'Se place APRÈS un autre bloc' },
    e_noresp: { util: 'Réagir si le serveur ne répond plus', ex: 'Noter « serveur hors ligne » dans le journal', io: 'État du serveur + blocs à l’intérieur', warn: 'Se place APRÈS un autre bloc' },
    e_backup_fail: { util: 'Réagir si la sauvegarde a échoué', ex: 'Prévenir si la copie du monde n’a pas marché', io: 'Résultat de la sauvegarde + blocs à l’intérieur', warn: 'Mets d’abord un bloc « Sauvegarde complète »' },
    e_stop_err: { util: 'Arrêter tout le scénario à la moindre erreur', ex: 'Mode strict', io: '', warn: '' },
    e_cont_err: { util: 'Continuer même s’il y a une erreur', ex: 'C’est le réglage par défaut', io: '', warn: '' },
    e_log_err: { util: 'Noter les erreurs dans le journal', ex: 'Tracer ce qui a échoué et quand', io: 'Résultat de l’étape précédente', warn: 'Se place APRÈS un autre bloc' },
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


  // ---------- infobulle "i" des blocs (fixe, opaque, structurée) ----------
  let tipEl = null;
  function blkTipEl() {
    if (!tipEl) { tipEl = el('div', 'blk-tip'); tipEl.id = 'blk-tip'; tipEl.hidden = true; document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showBlkTip(icon, kind) {
    const m = META[kind] || { label: kind };
    const d = DESC[kind] || '';
    const f = INFO[kind] || {};
    const t = blkTipEl();
    t.innerHTML = '';
    t.appendChild(el('div', 'bt-h', m.label));
    const row = (k, v) => { if (!v) return; const r = el('div', 'bt-row'); r.appendChild(el('span', 'bt-k', k)); r.appendChild(el('span', 'bt-v', v)); t.appendChild(r); };
    row('À quoi ça sert ?', f.util);
    row('Ce que ça fait', d);
    row('Exemple', f.ex);
    row('Données', f.io);
    if (f.warn) { const r = el('div', 'bt-row bt-warn'); r.appendChild(el('span', 'bt-k', '⚠ Attention')); r.appendChild(el('span', 'bt-v', f.warn)); t.appendChild(r); }
    t.hidden = false;
    const rc = icon.getBoundingClientRect ? icon.getBoundingClientRect() : { right: 0, left: 0, top: 0 };
    const tw = t.offsetWidth || 300, th = t.offsetHeight || 200;
    const iw = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    const ih = (typeof window !== 'undefined' && window.innerHeight) || 800;
    let x = rc.right + 10, y = rc.top;
    if (x + tw > iw - 8) x = rc.left - tw - 10;
    if (x < 8) x = 8;
    if (y + th > ih - 8) y = ih - th - 8;
    if (y < 8) y = 8;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideBlkTip() { const t = blkTipEl(); t.hidden = true; }
  function bindBlkInfo(info, kind) {
    info.addEventListener('mouseenter', () => showBlkTip(info, kind));
    info.addEventListener('mouseleave', hideBlkTip);
    info.addEventListener('click', (e) => { if (e) { e.stopPropagation(); e.preventDefault(); } showBlkTip(info, kind); });
  }

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
        if (DESC[m.kind]) {
          const info = el('span', 'info pal-info', 'i');
          bindBlkInfo(info, m.kind); // le "i" n'ajoute pas le bloc
          b.appendChild(info);
        }
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
      bindBlkInfo(info, b.kind);
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

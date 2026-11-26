/* MC Panel — site de vente : branche les boutons à la config.
   Aucune donnée n'est envoyée ailleurs : tout reste local au navigateur. */
(function () {
  var cfg = window.MC_SITE_CFG || {};

  // ---- boutons "payer" (index.html) ----
  var url = typeof cfg.WORLDLINE_PAY_URL === 'string' ? cfg.WORLDLINE_PAY_URL : '';
  var isRealUrl = /^https:\/\//.test(url);
  ['btn-payer', 'btn-payer-2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (!b) return;
    if (isRealUrl) {
      b.href = url;
      b.removeAttribute('aria-disabled');
    } else {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var h = document.getElementById('pay-hint');
        if (h) h.hidden = false;
      });
    }
  });

  // ---- page success.html ----
  var zone = document.getElementById('dl-zone');
  var warn = document.getElementById('dl-nonconfirme');
  var key = typeof cfg.SUCCESS_KEY === 'string' ? cfg.SUCCESS_KEY : '';
  var keyActive = key && key.indexOf('REMPLACE') !== 0;
  if (zone && warn && keyActive) {
    // La clé est configurée : on n'affiche le téléchargement que si l'URL
    // de retour de Worldline contient ?k=... (voir README — version simple,
    // à renforcer plus tard avec une vérification côté serveur).
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
    var ok = params && params.get('k') === key;
    if (!ok) { zone.hidden = true; warn.hidden = false; }
  }
  var dl = document.getElementById('btn-dl');
  if (dl && typeof cfg.DOWNLOAD_FILE === 'string' && cfg.DOWNLOAD_FILE) {
    dl.setAttribute('href', cfg.DOWNLOAD_FILE);
  }
})();

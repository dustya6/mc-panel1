/* ============================================================
   MC PANEL — configuration du site de vente
   REMPLACE les valeurs "REMPLACE_MOI" avant de publier.
   Voir site/README.md pour la marche à suivre.
   ============================================================ */
window.MC_SITE_CFG = {
  // URL du lien de paiement créé dans ton back-office marchand Worldline
  // (Payment Link / Hosted Payment Page), ex :
  // 'https://pay.worldline-solutions.com/...' ou ton lien de paiement personnalisé.
  WORLDLINE_PAY_URL: 'REMPLACE_MOI',

  // Clé secrète ajoutée à l'URL de succès, ex. success.html?k=xxxx
  // (configurée comme URL de retour "succès" dans Worldline).
  // Tant que c'est REMPLACE_MOI, la page success.html affiche le téléchargement
  // sans vérifier la clé (mode test). Mets une vraie valeur avant la vente réelle.
  SUCCESS_KEY: 'REMPLACE_MOI',

  // Fichier téléchargé (déposé dans le dossier download/ du site)
  DOWNLOAD_FILE: 'download/MC-Panel-Setup.exe'
};

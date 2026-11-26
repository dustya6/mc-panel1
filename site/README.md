# Site de vente MC Panel

Page de vente statique (aucun serveur requis pour commencer) : une page d'achat
(`index.html`) + une page « paiement réussi » (`success.html`) avec le lien de
téléchargement du `.exe`.

Même look que l'appli : sombre, coins à 90°, logo texte « MC ». Aucun emoji,
aucune dépendance externe (pas de tracker, pas de font externe).

## 1. Page « cachée » sur ton domaine existant

Tous les liens du site sont **relatifs** (`style.css`, `success.html`,
`download/...`) : le dossier `site/` peut être uploadé dans **n'importe quel
sous-dossier** de ton site existant, par exemple :

```
public_html/mcpanel-7f3k/        ← upload le CONTENU du dossier site/ ici
```

La page sera alors à `https://ton-domaine.ch/mcpanel-7f3k/`.
Choisis un nom de dossier difficile à deviner et **ne mets aucun lien** vers
cette page depuis le reste de ton site : seules les personnes qui ont le lien
exact y accéderont.

## 2. Configurer le paiement Worldline

1. Crée un compte marchand chez **Worldline** (worldline-solutions.com).
   Commence par le **mode test** (PSPID de test) pour essayer sans vrai argent.
2. Dans le back-office, crée un **lien de paiement** (ou Hosted Payment Page) :
   - montant en **CHF**
   - URL de retour « succès » : `https://ton-domaine.ch/mcpanel-7f3k/success.html?k=TA_CLE_SECRETE`
   - URL de retour « échec / annulation » : `https://ton-domaine.ch/mcpanel-7f3k/index.html`
3. Copie l'URL du lien de paiement dans `config.js` → `WORLDLINE_PAY_URL`.
4. Mets la même clé secrète dans `config.js` → `SUCCESS_KEY`.
   (Tant que c'est `REMPLACE_MOI`, la page de succès montre le téléchargement
   sans vérification — pratique pour tester, à remplacer avant la vente réelle.)

**Important :** les vraies clés secrètes API de Worldline ne vont **jamais**
dans ce dossier public — elles restent côté serveur Worldline / ton hébergeur.
Ici on utilise seulement un lien de paiement public + une clé dans l'URL.

## 3. Prix et fichier à vendre

- Remplace `XX.XX CHF TTC` dans `index.html` (2 endroits : `#prix` et `#prix-2`)
  par ton prix, **TTC** (obligatoire en Suisse pour les ventes aux consommateurs).
- Quand l'installeur sera compilé (`npm run dist` dans la racine du dépôt),
  copie le `.exe` dans `site/download/MC-Panel-Setup.exe`
  (le nom est dans `config.js` → `DOWNLOAD_FILE`).

## 4. Hébergement

Uploade le contenu de `site/` chez ton hébergeur (Infomaniak, Netlify, ton VPS
avec nginx...). **HTTPS obligatoire** — Worldline refuse les retours sur du
HTTP non sécurisé.

## 5. Test de bout en bout (avant de vendre)

1. Paiement en mode test Worldline → tu dois arriver sur `success.html?k=...`
   → le bouton de téléchargement apparaît.
2. Le fichier téléchargé s'installe et l'appli se lance.
3. Vérifie que `success.html` ouvert directement **sans** `?k=...` n'affiche
   pas le téléchargement (quand `SUCCESS_KEY` est configurée).

## 6. Pour aller plus loin plus tard (optionnel)

La protection par `?k=` dans l'URL est une première version simple. Pour
vraiment empêcher les téléchargements gratuits, il faudra plus tard une petite
vérification **côté serveur** (webhook Worldline qui confirme le paiement avant
de servir le fichier, ou URL de téléchargement signée et temporaire). À faire
quand le site aura un petit backend.

# MC Panel

Application de bureau (Windows, macOS, Linux) pour surveiller et gérer un serveur Minecraft à distance : joueurs en ligne, informations du serveur et console RCON.

## Prérequis

- Node.js 18 ou plus récent

## Lancer l'application en développement

```bash
npm install
npm start
```

## Connecter un serveur Minecraft

Dans le fichier `server.properties` du serveur :

```properties
enable-query=true
query.port=25565
enable-rcon=true
rcon.port=25575
rcon.password=UN_MOT_DE_PASSE_TRES_FORT
```

Puis dans l'application : remplis le formulaire (nom, adresse IP du serveur, ports, mot de passe RCON) et clique sur **Tester la connexion**.

## Sécurité

- Utilise un mot de passe RCON long et unique.
- Ne publie pas l'adresse IP du serveur.
- Si le serveur est sur un VPS, installe [Tailscale](https://tailscale.com) sur ton ordinateur et sur le VPS : le trafic RCON passera par un réseau privé au lieu d'Internet.
- Le mot de passe RCON est chiffré avec `safeStorage` d'Electron avant d'être écrit sur le disque. Sous Linux, un trousseau de clés (gnome-keyring ou KWallet) est nécessaire.

## Structure du projet

- `src/main.js` — processus principal Electron : fenêtre, IPC, query, RCON, stockage local
- `src/preload.js` — pont sécurisé entre l'interface et le processus principal
- `src/renderer/` — interface utilisateur (HTML / CSS / JavaScript)

## Prochaines étapes

- Historique local et graphiques (joueurs, TPS) relevés toutes les 10 secondes
- Clé de licence et page de vente
- Génération d'un installateur téléchargeable (electron-builder)

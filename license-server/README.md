# Serveur de licences MC Panel (v1)

Petit serveur HTTP en Python **sans aucune dépendance** (stdlib uniquement).
Il vérifie les clés de licence et active l'appli sur le PC du client
(2 PC maximum par clé par défaut).

## Installation sur ton VPS (zitsync)

```bash
# 1. envoyer le dossier sur le serveur (depuis ton PC, Git Bash) :
scp -r ~/mc-panel1/license-server leon@62.220.136.19:~/license-server

# 2. sur le serveur :
ssh leon@62.220.136.19
sudo ufw allow 8787/tcp          # ouvre le port du serveur de licences
cd ~/license-server
nohup python3 license_server.py run --port 8787 > lic.log 2>&1 &
sleep 1 && curl -s http://127.0.0.1:8787/health   # doit répondre {"ok": true}
```

L'appli (dans `src/main.js`, constante `LICENSE_API`) pointe pour l'instant sur
`http://62.220.136.19:8787`. **Avant la vraie vente**, passe en HTTPS :
nginx en reverse proxy + certificat Let's Encrypt sur un sous-domaine
(ex: `https://licence.ton-domaine.ch`), puis change `LICENSE_API` dans `main.js`.

## Créer une clé après un paiement (pour l'instant, manuel)

```bash
cd ~/license-server
python3 license_server.py genkey        # affiche ex: K7XD-P3QM-9TZ2-AB4C
# -> envoie cette clé au client par e-mail (réponse au paiement Worldline)
```

Autres commandes :
```bash
python3 license_server.py list                              # voir les clés et leurs PC
python3 license_server.py revoke XXXX-XXXX-XXXX-XXXX        # bloquer une clé (vol/fraude)
```

## Plus tard (automatique)

Quand tu voudras, un **webhook Worldline** pourra appeler `genkey`
automatiquement à chaque paiement et envoyer la clé par e-mail tout seul.
Le client pourra aussi voir sa clé sur la page `success.html?key=...`.

## Sécurité

- `keys.json` (les vraies clés) est dans `.gitignore` : ne le pousse jamais sur GitHub.
- Le port 8787 ne sert que ce serveur ; limite l'accès si besoin (`ufw allow from TON_IP to any port 8787` côté admin, mais l'appli des clients doit pouvoir joindre le port, donc laisse-le ouvert publiquement).
- Ce système arrête le partage « casual ». Un hacker avancé peut toujours patcher
  le client, mais il lui faudra une clé valide, et chaque clé est limitée à 2 PC
  + révocable à distance.

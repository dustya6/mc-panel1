#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MC Panel — serveur de licences (version 1, aucune dépendance externe).

Rôle : vérifier qu'une clé de licence achetée est valide et activer
l'application sur le PC du client (max N PC par clé, 2 par défaut).

Endpoints HTTP :
  GET  /health              -> {"ok": true}
  POST /activate {key,hwid} -> active la clé sur ce PC (crée la clé si elle
                               existe déjà dans keys.json, sinon "inconnue")
  POST /verify   {key,hwid} -> true si la clé est active sur ce PC

Commandes (CLI) :
  python3 license_server.py run [--port 8787] [--host 0.0.0.0]
  python3 license_server.py genkey [--max 2]     -> crée une clé et l'affiche
  python3 license_server.py list                 -> liste les clés
  python3 license_server.py revoke XXXX-XXXX-XXXX-XXXX

Les clés sont stockées dans keys.json (à côté de ce script).
NE JAMAIS pousser keys.json sur GitHub (voir .gitignore).
"""
import json
import os
import re
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS_FILE = os.path.join(HERE, 'keys.json')
KEY_RE = re.compile(r'^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$')
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # sans 0/O/1/I (évite les confusions)
DEFAULT_MAX = 2
_lock = threading.Lock()


def norm_key(k):
    k = (k or '').strip().upper().replace(' ', '')
    return k if KEY_RE.match(k) else None


def load_keys():
    try:
        with open(KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_keys(keys):
    tmp = KEYS_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(keys, f, indent=1, ensure_ascii=False)
    os.replace(tmp, KEYS_FILE)


def gen_key():
    return '-'.join(''.join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(4))


class Handler(BaseHTTPRequestHandler):
    server_version = 'mc-panel-license/1.0'

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(n) if n > 0 else b'{}'
            return json.loads(raw.decode('utf-8') or '{}')
        except Exception:
            return {}

    def log_message(self, fmt, *args):  # log compact
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/health':
            self._send(200, {'ok': True})
        else:
            self._send(404, {'ok': False, 'error': 'inconnu'})

    def do_POST(self):
        route = self.path.split('?')[0]
        data = self._body()
        key = norm_key(data.get('key'))
        hwid = str(data.get('hwid') or '')[:128]
        if route == '/activate':
            if not key:
                return self._send(400, {'ok': False, 'error': 'Format de clé invalide.'})
            if not hwid:
                return self._send(400, {'ok': False, 'error': 'PC non identifié.'})
            with _lock:
                keys = load_keys()
                rec = keys.get(key)
                if not rec:
                    return self._send(404, {'ok': False, 'error': 'Clé inconnue — vérifiez la clé ou contactez le support (leon.capt@eduvd.ch).'})
                if rec.get('revoked'):
                    return self._send(403, {'ok': False, 'error': 'Clé révoquée.'})
                hwids = rec.setdefault('hwids', [])
                if hwid in hwids:
                    rec['lastSeen'] = __import__('time').time()
                    save_keys(keys)
                    return self._send(200, {'ok': True, 'dejà': True})
                mx = int(rec.get('max') or DEFAULT_MAX)
                if len(hwids) >= mx:
                    return self._send(409, {'ok': False, 'error': 'Clé déjà activée sur %d PC (maximum). Révoquez une activation ou contactez le support.' % mx})
                hwids.append(hwid)
                rec['lastSeen'] = __import__('time').time()
                save_keys(keys)
                return self._send(200, {'ok': True})
        elif route == '/verify':
            if not key or not hwid:
                return self._send(400, {'ok': False, 'error': 'Paramètres manquants.'})
            with _lock:
                rec = load_keys().get(key)
            if rec and not rec.get('revoked') and hwid in rec.get('hwids', []):
                return self._send(200, {'ok': True})
            return self._send(200, {'ok': False, 'error': 'Clé non active sur ce PC.'})
        else:
            self._send(404, {'ok': False, 'error': 'inconnu'})


def cmd_run(port, host):
    srv = ThreadingHTTPServer((host, port), Handler)
    sys.stderr.write('license server sur http://%s:%d (clés: %s)\n' % (host, port, KEYS_FILE))
    srv.serve_forever()


def main(argv):
    if not argv or argv[0] == 'run':
        port, host = 8787, '0.0.0.0'
        if '--port' in argv:
            port = int(argv[argv.index('--port') + 1])
        if '--host' in argv:
            host = argv[argv.index('--host') + 1]
        cmd_run(port, host)
        return
    cmd = argv[0]
    if cmd == 'genkey':
        mx = DEFAULT_MAX
        if '--max' in argv:
            mx = int(argv[argv.index('--max') + 1])
        key = gen_key()
        with _lock:
            keys = load_keys()
            keys[key] = {'max': mx, 'hwids': [], 'revoked': False, 'created': __import__('time').time()}
            save_keys(keys)
        print(key)
        return
    if cmd == 'list':
        for k, rec in load_keys().items():
            state = 'RÉVOQUÉE' if rec.get('revoked') else ('%d/%d PC' % (len(rec.get('hwids', [])), rec.get('max', DEFAULT_MAX)))
            print('%s  %s' % (k, state))
        return
    if cmd == 'revoke' and len(argv) > 1:
        key = norm_key(argv[1])
        if not key:
            print('format invalide', file=sys.stderr)
            sys.exit(2)
        with _lock:
            keys = load_keys()
            if key not in keys:
                print('clé inconnue', file=sys.stderr)
                sys.exit(2)
            keys[key]['revoked'] = True
            save_keys(keys)
        print('révoquée:', key)
        return
    print(__doc__)
    sys.exit(2)


if __name__ == '__main__':
    main(sys.argv[1:])

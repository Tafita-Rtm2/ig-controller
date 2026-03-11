# Deploy IGSubBot Server on Render

## Files à uploader sur GitHub
- `server.js`
- `package.json`
- `.env.example` (renommer en `.env` localement)

## Render Setup
1. https://render.com → New → Web Service
2. Connect GitHub repo
3. Build Command: `npm install`
4. Start Command: `node server.js`

## Environment Variables sur Render
| Key | Value |
|-----|-------|
| `ADMIN_TOKEN` | Ton token secret fort |
| `SUB_PASS` | Mot de passe sous-comptes |
| `SUBS_COUNT` | Nombre comptes par appareil |

## Accès Admin Panel
```
https://ton-app.onrender.com/admin
```
→ Entrer ADMIN_TOKEN → accès panel

## Mettre à jour l'URL dans le bot
Dans `igsubbot_final.py` ligne 13:
```python
LICENSE_SERVER = "https://TON-APP.onrender.com"
```

## Sécurité — Hash du bot
Pour empêcher toute modification du bot:
1. Calculer le hash: 
   `python3 -c "import hashlib; f=open('igsubbot_final.py','rb').read(); lines=[l for l in f.split(b'\n') if b'_SELF_HASH' not in l]; print(hashlib.sha256(b'\n'.join(lines)).hexdigest())"`
2. Mettre dans Render → Environment → `BOT_HASHES`
3. Si quelqu'un modifie le bot → autodestruction immédiate

require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ══════════════════════════════════════════════
//  AUTODESTRUCTION — Pastebin master switch
//  Met "false" sur https://pastebin.com/A7PduzRu
//  → tout s'arrête : serveur + tous les bots
// ══════════════════════════════════════════════
const MASTER_SWITCH_URL = process.env.MASTER_SWITCH_URL || 'https://pastebin.com/A7PduzRu';
let _serverActive = true;

function checkMasterSwitch() {
  https.get(MASTER_SWITCH_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
      // Extraire contenu textarea Pastebin
      const lower = html.toLowerCase();
      let text = lower;
      const ta = lower.indexOf('<textarea');
      if (ta >= 0) {
        const s = lower.indexOf('>', ta) + 1;
        const e = lower.indexOf('</textarea>', s);
        text = lower.slice(s, e).trim();
      }
      if (text.includes('false')) {
        console.log('\n🔴 MASTER SWITCH = false → Autodestruction serveur...');
        _serverActive = false;
        // Vider le fichier server.js lui-même
        try {
          fs.writeFileSync(__filename, '// DESTROYED');
          fs.writeFileSync(path.join(__dirname, 'data.json'), '{}');
        } catch(e) {}
        setTimeout(() => process.exit(0), 500);
      } else {
        _serverActive = true;
      }
    });
  }).on('error', (e) => {
    // Erreur réseau → on laisse tourner (pas de connexion)
    console.log('[MasterSwitch] Network error:', e.message);
  });
}

// Vérifier au démarrage et toutes les 60 secondes
checkMasterSwitch();
setInterval(checkMasterSwitch, 60 * 1000);

// Middleware — bloquer toutes les requêtes si désactivé
app.use((req, res, next) => {
  if (!_serverActive) {
    return res.status(503).json({ valid: false, reason: 'Service disabled', autodestruct: true });
  }
  next();
});

// ══════════════════════════════════════════════
//  STORAGE
// ══════════════════════════════════════════════
const DB_FILE = path.join(__dirname, 'data.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { users: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ══════════════════════════════════════════════
//  HASH du bot autorisé (SHA256 du fichier .py)
//  Mettre à jour à chaque nouvelle version
// ══════════════════════════════════════════════
const ALLOWED_HASHES = process.env.BOT_HASHES
  ? process.env.BOT_HASHES.split(',').map(h => h.trim())
  : [];

// ══════════════════════════════════════════════
//  MIDDLEWARE ADMIN AUTH
// ══════════════════════════════════════════════
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === process.env.ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ══════════════════════════════════════════════
//  API — VÉRIFIER KEY + HASH BOT + RÉCUPÉRER CONFIG
// ══════════════════════════════════════════════
app.post('/api/verify', (req, res) => {
  const { key, bot_hash } = req.body;
  if (!key) return res.json({ valid: false, reason: 'No key' });

  const db = loadDB();
  const user = db.users.find(u => u.key === key);
  if (!user) return res.json({ valid: false, reason: 'Key not found', autodestruct: true });
  if (!user.active) return res.json({ valid: false, reason: 'Key disabled', autodestruct: true });

  // Vérifier hash du bot si configuré
  if (ALLOWED_HASHES.length > 0 && bot_hash) {
    if (!ALLOWED_HASHES.includes(bot_hash)) {
      return res.json({ valid: false, reason: 'Bot modified', autodestruct: true });
    }
  }

  // Mettre à jour last_seen + IP
  user.last_seen = new Date().toISOString();
  user.last_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  saveDB(db);

  // Retourner la config complète du bot (stockée sur serveur)
  res.json({
    valid: true,
    name: user.name,
    key: user.key,
    config: getBotConfig()
  });
});

// ══════════════════════════════════════════════
//  CONFIG BOT — tout le flow est sur le serveur
// ══════════════════════════════════════════════
function getBotConfig() {
  return {
    sub_pass: process.env.SUB_PASS || "Azerty12345!",
    subs_count: parseInt(process.env.SUBS_COUNT || "10"),
    ig_pkg: "com.instagram.lite",
    // Coordonnées LDPlayer 720x1280
    coords_ld: {
      nom_champ:   [338, 249],
      nom_next:    [360, 329],
      pass_champ:  [338, 254],
      pass_next:   [360, 400],
      surprise_ok: [360, 1163],
      complete:    [360, 627],
      skip1:       [360, 1154],
      skip2:       [360, 1471],
      next_follow: [360, 1371]
    },
    // Coordonnées Téléphone 1080x2268
    coords_phone: {
      nom_champ:   [500, 470],
      nom_next:    [540, 617],
      pass_champ:  [500, 478],
      pass_next:   [540, 750],
      surprise_ok: [540, 2000],
      complete:    [540, 1182],
      skip1:       [540, 1734],
      skip2:       [540, 2218],
      next_follow: [540, 2067]
    },
    // Signature écran imprévu
    surprise_signature: "[0,1009][720,1033]",
    // Noms pour génération comptes
    first_names: ["emma","lea","jade","manon","lucas","hugo","tom","nina","clara","max",
                  "sarah","marie","paul","anna","lena","alex","mia","eva","leo","zoe"],
    last_names:  ["martin","dubois","leroy","simon","garcia","roux","dupont","bernard","moreau"]
  };
}

// ══════════════════════════════════════════════
//  API ADMIN
// ══════════════════════════════════════════════
app.get('/api/admin/users', adminAuth, (req, res) => {
  res.json(loadDB().users);
});

app.post('/api/admin/users', adminAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = loadDB();
  const newUser = {
    id: uuidv4(),
    name: name.trim(),
    key: 'ig-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
    active: true,
    created: new Date().toISOString(),
    last_seen: null,
    last_ip: null
  };
  db.users.push(newUser);
  saveDB(db);
  res.json(newUser);
});

app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  db.users.splice(idx, 1);
  saveDB(db);
  res.json({ success: true });
});

app.patch('/api/admin/users/:id', adminAuth, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body.active === 'boolean') user.active = req.body.active;
  if (req.body.name) user.name = req.body.name;
  saveDB(db);
  res.json(user);
});

app.post('/api/admin/users/:id/regenerate', adminAuth, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.key = 'ig-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  saveDB(db);
  res.json(user);
});

// ══════════════════════════════════════════════
//  PANEL ADMIN HTML
// ══════════════════════════════════════════════
app.get('/admin', (req, res) => {
  const token = req.query.token;
  if (token !== process.env.ADMIN_TOKEN) {
    return res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>IGSubBot Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#070711;color:#f1f5f9;font-family:'Segoe UI',sans-serif;
     min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:#0f0f1a;border:1px solid #1f1f3a;border-radius:16px;
     padding:40px;width:360px;text-align:center}
.logo{font-size:1.5rem;font-weight:700;
      background:linear-gradient(135deg,#a78bfa,#60a5fa);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.sub{color:#64748b;font-size:.85rem;margin-bottom:28px}
input{width:100%;background:#141428;border:1px solid #1f1f3a;border-radius:8px;
      padding:12px 16px;color:#f1f5f9;font-size:.9rem;outline:none;margin-bottom:14px}
input:focus{border-color:#6d28d9}
button{width:100%;background:linear-gradient(135deg,#6d28d9,#4f46e5);
       border:none;border-radius:8px;padding:13px;color:white;
       font-size:.95rem;font-weight:600;cursor:pointer}
</style>
</head>
<body>
<div class="box">
  <div class="logo">⚡ IGSubBot</div>
  <div class="sub">Admin Panel</div>
  <input type="password" id="tok" placeholder="Admin Token"
         onkeydown="if(event.key==='Enter')login()">
  <button onclick="login()">Login</button>
</div>
<script>
function login(){
  const t=document.getElementById('tok').value.trim();
  if(t) window.location.href='/admin?token='+encodeURIComponent(t);
}
</script>
</body></html>`);
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IGSubBot Admin Server</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#070711;--surface:#0f0f1a;--card:#141428;--border:#1f1f3a;
      --accent:#6d28d9;--accent2:#4f46e5;--green:#059669;--red:#dc2626;
      --text:#f1f5f9;--muted:#64748b}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;min-height:100vh}
.header{background:var(--card);border-bottom:1px solid var(--border);
        padding:16px 28px;display:flex;align-items:center;
        justify-content:space-between;position:sticky;top:0;z-index:100}
.logo{font-size:1.2rem;font-weight:700;
      background:linear-gradient(135deg,#a78bfa,#60a5fa);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.badge{background:rgba(109,40,217,.2);border:1px solid rgba(109,40,217,.4);
       color:#a78bfa;padding:4px 12px;border-radius:20px;font-size:.72rem}
.container{max-width:1000px;margin:0 auto;padding:24px 16px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:10px;
      padding:16px;text-align:center}
.stat-n{font-size:1.8rem;font-weight:700;font-family:monospace;
        background:linear-gradient(135deg,#a78bfa,#60a5fa);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-l{font-size:.68rem;color:var(--muted);text-transform:uppercase;
        letter-spacing:.08em;margin-top:4px}
.section-title{font-size:.7rem;font-weight:700;color:var(--muted);
               text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px}
.create-box{background:var(--card);border:1px solid var(--border);
            border-radius:12px;padding:20px;margin-bottom:24px;
            display:flex;gap:10px;align-items:center}
.create-box input{flex:1;background:var(--surface);border:1px solid var(--border);
                  border-radius:8px;padding:10px 14px;color:var(--text);
                  font-size:.9rem;outline:none}
.create-box input:focus{border-color:var(--accent)}
.btn{background:linear-gradient(135deg,var(--accent),var(--accent2));
     border:none;border-radius:8px;padding:10px 20px;color:white;
     font-weight:600;cursor:pointer;font-size:.85rem;white-space:nowrap}
.btn:hover{opacity:.85}
.btn-sm{padding:5px 12px;font-size:.72rem;border-radius:6px}
.btn-red{background:var(--red)}
.btn-gray{background:#334155}
.btn-yellow{background:#b45309}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{background:var(--surface);color:var(--muted);font-size:.7rem;
   text-transform:uppercase;letter-spacing:.08em;padding:10px 14px;
   text-align:left;border-bottom:1px solid var(--border)}
td{padding:12px 14px;border-bottom:1px solid var(--border);
   font-size:.83rem;vertical-align:middle}
tr:last-child td{border-bottom:none}
.key-badge{background:#1e1b4b;border:1px solid #312e81;color:#a5b4fc;
           padding:4px 10px;border-radius:6px;font-family:monospace;font-size:.78rem}
.status-on{background:rgba(5,150,105,.15);color:#34d399;
           border:1px solid rgba(5,150,105,.3);padding:3px 9px;
           border-radius:20px;font-size:.7rem}
.status-off{background:rgba(220,38,38,.15);color:#f87171;
            border:1px solid rgba(220,38,38,.3);padding:3px 9px;
            border-radius:20px;font-size:.7rem}
.date{color:var(--muted);font-size:.75rem;font-family:monospace}
.actions{display:flex;gap:6px;flex-wrap:wrap}
.empty{text-align:center;padding:40px;color:var(--muted);font-size:.85rem}
.toast{position:fixed;bottom:24px;right:24px;background:#059669;color:white;
       padding:10px 20px;border-radius:8px;font-size:.85rem;
       opacity:0;transition:opacity .3s;pointer-events:none;z-index:999}
.toast.show{opacity:1}
.ip{color:#64748b;font-size:.72rem;font-family:monospace}
</style>
</head>
<body>
<div class="header">
  <div class="logo">⚡ IGSubBot Admin</div>
  <div class="badge">🖥 Server Panel</div>
</div>
<div class="container">

  <div class="stats">
    <div class="stat"><div class="stat-n" id="s-total">0</div><div class="stat-l">Total Users</div></div>
    <div class="stat"><div class="stat-n" id="s-active" style="color:#34d399">0</div><div class="stat-l">Active Keys</div></div>
    <div class="stat"><div class="stat-n" id="s-off" style="color:#f87171">0</div><div class="stat-l">Disabled</div></div>
    <div class="stat"><div class="stat-n" id="s-seen">0</div><div class="stat-l">Seen Today</div></div>
  </div>

  <div class="section-title">➕ Create New User</div>
  <div class="create-box">
    <input type="text" id="newName" placeholder="User name (ex: Tafita)"
           onkeydown="if(event.key==='Enter')createUser()">
    <button class="btn" onclick="createUser()">+ Generate Key</button>
  </div>

  <div class="section-title">👥 All Users</div>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Name</th>
          <th>License Key</th>
          <th>Status</th>
          <th>Last Seen</th>
          <th>Last IP</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="7" class="empty">Loading...</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const TOKEN = new URLSearchParams(location.search).get('token');
const H = {'Content-Type':'application/json','x-admin-token':TOKEN};

function toast(msg, color='#059669'){
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.background = color;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

function fmt(iso){
  if(!iso) return '<span style="color:#334155">—</span>';
  const d = new Date(iso);
  return '<span class="date">'+d.toLocaleDateString()+' '+d.toTimeString().slice(0,5)+'</span>';
}

function isToday(iso){
  if(!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

async function load(){
  try {
    const r = await fetch('/api/admin/users',{headers:H});
    const users = await r.json();
    document.getElementById('s-total').textContent = users.length;
    document.getElementById('s-active').textContent = users.filter(u=>u.active).length;
    document.getElementById('s-off').textContent = users.filter(u=>!u.active).length;
    document.getElementById('s-seen').textContent = users.filter(u=>isToday(u.last_seen)).length;

    const tb = document.getElementById('tbody');
    if(!users.length){
      tb.innerHTML='<tr><td colspan="7" class="empty">No users yet — create one above</td></tr>';
      return;
    }
    tb.innerHTML=[...users].reverse().map(u=>\`
      <tr>
        <td class="date">\${new Date(u.created).toLocaleDateString()}</td>
        <td><strong>\${u.name}</strong></td>
        <td>
          <span class="key-badge">\${u.key}</span>
          <button onclick="copyKey('\${u.key}')" class="btn btn-sm btn-gray" style="margin-left:4px">Copy</button>
        </td>
        <td>\${u.active
          ?'<span class="status-on">● Active</span>'
          :'<span class="status-off">● Disabled</span>'}</td>
        <td>\${fmt(u.last_seen)}</td>
        <td><span class="ip">\${u.last_ip||'—'}</span></td>
        <td>
          <div class="actions">
            \${u.active
              ?\`<button class="btn btn-sm btn-yellow" onclick="toggle('\${u.id}',false)">Disable</button>\`
              :\`<button class="btn btn-sm" onclick="toggle('\${u.id}',true)">Enable</button>\`}
            <button class="btn btn-sm btn-gray" onclick="regen('\${u.id}')">New Key</button>
            <button class="btn btn-sm btn-red" onclick="del('\${u.id}')">Delete</button>
          </div>
        </td>
      </tr>
    \`).join('');
  } catch(e){ console.error(e); }
}

async function createUser(){
  const name = document.getElementById('newName').value.trim();
  if(!name) return;
  const r = await fetch('/api/admin/users',{method:'POST',headers:H,body:JSON.stringify({name})});
  const u = await r.json();
  document.getElementById('newName').value='';
  toast('✅ Key created: '+u.key);
  load();
}

async function toggle(id, active){
  await fetch('/api/admin/users/'+id,{method:'PATCH',headers:H,body:JSON.stringify({active})});
  toast(active?'✅ Key enabled':'🔴 Key disabled', active?'#059669':'#dc2626');
  load();
}

async function regen(id){
  if(!confirm('Generate new key? Old one stops working immediately.')) return;
  const r = await fetch('/api/admin/users/'+id+'/regenerate',{method:'POST',headers:H});
  const u = await r.json();
  toast('🔑 New key: '+u.key);
  load();
}

async function del(id){
  if(!confirm('Delete user? Their key stops working immediately.')) return;
  await fetch('/api/admin/users/'+id,{method:'DELETE',headers:H});
  toast('🗑 User deleted','#dc2626');
  load();
}

function copyKey(key){
  navigator.clipboard.writeText(key);
  toast('📋 Copied: '+key);
}

load();
setInterval(load,4000);
</script>
</body></html>`);
});

app.get('/', (req, res) => res.redirect('/admin'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  ⚡ IGSubBot Server v2               ║');
  console.log(`║  Port: ${PORT}                          ║`);
  console.log('╚══════════════════════════════════════╝');
});

// ОЗУ — портал організованих угруповань (RP). Окрема система, окрема БД, без звʼязку з державними даними.
const express = require('express'), helmet = require('helmet'), cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit'), bcrypt = require('bcryptjs'), crypto = require('crypto'), path = require('path');
const db = require('./db'), nova = require('./nova');
const now = () => Date.now();
const SCHEMA = (pg) => { const id = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT', big = pg ? 'BIGINT' : 'INTEGER'; return [
  `CREATE TABLE IF NOT EXISTS groups(id ${id}, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, color TEXT, motto TEXT, about TEXT, recruiting INTEGER NOT NULL DEFAULT 1, ranks TEXT, demo INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS users(id ${id}, login TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, nick TEXT NOT NULL, group_id INTEGER, rank INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active', demo INTEGER NOT NULL DEFAULT 0, created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS treasury(id ${id}, group_id INTEGER NOT NULL, amount INTEGER NOT NULL, note TEXT, user_id INTEGER, created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS turfs(id ${id}, name TEXT NOT NULL, district TEXT, group_id INTEGER, income INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS wars(id ${id}, attacker INTEGER NOT NULL, defender INTEGER NOT NULL, turf_id INTEGER, reason TEXT, status TEXT NOT NULL DEFAULT 'Оголошено', winner INTEGER, created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contracts(id ${id}, group_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, reward INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Відкрито', taker_id INTEGER, created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS board(id ${id}, group_id INTEGER NOT NULL, user_id INTEGER, body TEXT NOT NULL, created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS applications(id ${id}, group_id INTEGER NOT NULL, nick TEXT NOT NULL, contact TEXT, about TEXT, status TEXT NOT NULL DEFAULT 'Нова', created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS news(id ${id}, title TEXT NOT NULL, body TEXT, author TEXT, demo INTEGER NOT NULL DEFAULT 0, created_at ${big} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit(id ${id}, user_id INTEGER, group_id INTEGER, action TEXT NOT NULL, details TEXT, created_at ${big} NOT NULL)`,
]; };
const DEF_RANKS = ['Шістка', 'Новачок', 'Свій', 'Боєць', 'Бригадир', 'Права рука', 'Бос'];
const app = express(); app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false })); app.use(express.json({ limit: '100kb' })); app.use(cookieParser());
app.get('/healthz', (q, r) => r.send('ok'));
app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: r => r.setHeader('Cache-Control', 'no-cache') }));
const H = fn => (q, r) => Promise.resolve(fn(q, r)).catch(e => { console.error(e); r.status(500).json({ error: 'Помилка сервера' }); });
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const audit = (u, g, a, d) => db.run('INSERT INTO audit(user_id,group_id,action,details,created_at) VALUES(?,?,?,?,?)', [u, g, a, d || '', now()]);
let G = {}; async function loadG() { G = {}; for (const g of await db.all('SELECT * FROM groups ORDER BY id')) { g.ranks = g.ranks ? JSON.parse(g.ranks) : DEF_RANKS; G[g.id] = g; } }
async function auth(q, r, n) { const t = q.cookies.oz; if (t) { const s = await db.get('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?', [sha(t), now()]); if (s) q.u = await db.get("SELECT * FROM users WHERE id=? AND status='active'", [s.user_id]); } n(); }
app.use((q, r, n) => auth(q, r, n).catch(n));
const isAdmin = u => u && u.role === 'admin';
const isLeader = (u, g) => isAdmin(u) || (u && u.group_id === g && (u.role === 'leader' || u.rank >= G[g].ranks.length - 1));
const member = (q, r) => { if (!q.u) { r.status(401).json({ error: 'Потрібен вхід' }); return false; } return true; };
const pub = u => u && ({ id: u.id, login: u.login, nick: u.nick, group_id: u.group_id, rank: u.rank, role: u.role });

const lim = rateLimit({ windowMs: 10 * 60e3, max: 30 });
async function startSession(r, uid) { const t = crypto.randomBytes(32).toString('hex'); await db.run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', [sha(t), uid, now() + 14 * 864e5]);
  r.cookie('oz', t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 14 * 864e5 }); }
app.post('/api/login', lim, H(async (q, r) => {
  const login = String(q.body.login || '').trim().toLowerCase();
  if (!nova.localAllowed() && login !== String(process.env.ADMIN_LOGIN || '').toLowerCase()) return r.status(400).json({ error: 'Увійдіть через ігровий акаунт NovaRP' });
  const u = await db.get("SELECT * FROM users WHERE login=? AND status='active'", [login]);
  if (!u || u.pass_hash === '!nova' || !bcrypt.compareSync(String(q.body.password || ''), u.pass_hash)) return r.status(401).json({ error: 'Невірний логін або пароль' });
  await startSession(r, u.id); r.json({ ok: 1 }); }));
// --- вхід через гру: угруповання гри -> угруповання ОЗУ (GROUP_MAP="lviv:lviv,...") ---
const GAME_GANGS = [['lviv', 'Львівське угруповання', '#2ecc71', 'Пан Господар'], ['kyiv', 'Синдикат', '#f1c40f', 'Пахан'], ['kharkiv', 'Харківське угруповання', '#3498db', 'Голова'], ['dnipro', 'Дніпровське угруповання', '#9b59b6', 'Батя']];
const GMAP = Object.fromEntries((process.env.GROUP_MAP || GAME_GANGS.map(g => g[0] + ':' + g[0]).join(',')).split(',').map(s => s.split(':').map(x => x.trim())));
const gidOf = code => { const c = GMAP[code]; return c ? (Object.values(G).find(g => g.code === c) || {}).id : undefined; };
async function ensureGameGangs() { for (const [code, name, color, boss] of GAME_GANGS) if (!(await db.get('SELECT id FROM groups WHERE code=?', [code])))
  await db.run('INSERT INTO groups(code,name,kind,color,ranks) VALUES(?,?,?,?,?)', [code, name, 'Угруповання', color, JSON.stringify(['Новачок', 'Свій', 'Боєць', 'Бувалий', 'Старший', 'Бригадир', 'Права рука', 'Радник', 'Заступник', boss])]); }
nova.mount(app, lim, H, { deny: 'Доступ лише для членів угруповань. Вступіть до банди чи мафії в грі — і доступ з\'явиться автоматично.',
  eligible: c => c.faction_type === 'gang' && !!gidOf(c.faction), startSession,
  async upsert(acc, c, admin) {
    const login = c ? 'nova#' + c.id : 'nova#a' + acc.id, gid = c ? gidOf(c.faction) : null, top = gid ? G[gid].ranks.length : 7;
    const rank = c ? Math.max(1, Math.min(top, c.rank || 1)) : top, role = admin ? 'admin' : (c && c.rank >= 10 ? 'leader' : 'member'), nick = c ? c.name : acc.login + ' (адмін)';
    const ex = await db.get('SELECT id FROM users WHERE login=?', [login]);
    if (ex) await db.run("UPDATE users SET nick=?,group_id=?,rank=?,role=?,status='active' WHERE id=?", [nick, gid, rank, role, ex.id]);
    const id = ex ? ex.id : (await db.run("INSERT INTO users(login,pass_hash,nick,group_id,rank,role,created_at) VALUES(?,'!nova',?,?,?,?,?)", [login, nick, gid, rank, role, now()])).id;
    await audit(id, gid, 'login.game', `${acc.login} → ${nick}${gid ? ', ' + G[gid].name : ''}, ранг ${rank}${admin ? ', адмін' : ''}`); return id; } });
app.post('/api/logout', H(async (q, r) => { if (q.cookies.oz) await db.run('DELETE FROM sessions WHERE token_hash=?', [sha(q.cookies.oz)]); r.clearCookie('oz'); r.json({ ok: 1 }); }));
app.get('/api/me', (q, r) => r.json({ user: pub(q.u), admin: isAdmin(q.u), leader: !!(q.u && q.u.group_id && isLeader(q.u, q.u.group_id)), groups: Object.values(G).map(g => ({ id: g.id, name: g.name, kind: g.kind, color: g.color, ranks: g.ranks })) }));
// public (guests)
app.get('/api/public', H(async (q, r) => r.json({
  groups: await db.all("SELECT g.id,g.name,g.kind,g.color,g.motto,g.about,g.recruiting,g.demo,(SELECT COUNT(*) FROM users u WHERE u.group_id=g.id AND u.status='active') members,(SELECT COUNT(*) FROM turfs t WHERE t.group_id=g.id) turfs FROM groups g ORDER BY g.id"),
  turfs: await db.all('SELECT id,name,district,group_id FROM turfs ORDER BY district,name'),
  wars: await db.all("SELECT id,attacker,defender,turf_id,status,winner FROM wars ORDER BY id DESC LIMIT 10"),
  news: await db.all('SELECT * FROM news ORDER BY id DESC LIMIT 20') })));
app.post('/api/public/apply', rateLimit({ windowMs: 10 * 60e3, max: 8 }), H(async (q, r) => { const b = q.body, g = G[+b.group_id];
  if (!g || !g.recruiting) return r.status(400).json({ error: 'Набір закрито' }); if (!b.nick) return r.status(400).json({ error: 'Вкажіть нік' });
  await db.run('INSERT INTO applications(group_id,nick,contact,about,created_at) VALUES(?,?,?,?,?)', [g.id, String(b.nick).slice(0, 40), String(b.contact || '').slice(0, 80), String(b.about || '').slice(0, 1500), now()]); r.json({ ok: 1 }); }));
// group cabinet (members)
app.get('/api/group', H(async (q, r) => { if (!member(q, r)) return; const gid = isAdmin(q.u) && q.query.id ? +q.query.id : q.u.group_id; if (!G[gid]) return r.status(404).json({ error: 'Немає угруповання' });
  const lead = isLeader(q.u, gid);
  r.json({ group: G[gid], leader: lead,
    roster: await db.all("SELECT id,login,nick,rank,role FROM users WHERE group_id=? AND status='active' ORDER BY rank DESC", [gid]),
    balance: (await db.get('SELECT COALESCE(SUM(amount),0) s FROM treasury WHERE group_id=?', [gid])).s,
    treasury: await db.all('SELECT t.*,u.nick FROM treasury t LEFT JOIN users u ON u.id=t.user_id WHERE t.group_id=? ORDER BY t.id DESC LIMIT 50', [gid]),
    board: (await db.all('SELECT b.*,u.nick FROM board b LEFT JOIN users u ON u.id=b.user_id WHERE b.group_id=? ORDER BY b.id DESC LIMIT 80', [gid])).reverse(),
    apps: lead ? await db.all('SELECT * FROM applications WHERE group_id=? ORDER BY id DESC LIMIT 50', [gid]) : [],
    log: lead ? await db.all('SELECT a.*,u.nick FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.group_id=? ORDER BY a.id DESC LIMIT 60', [gid]) : [] }); }));
app.post('/api/board', H(async (q, r) => { if (!member(q, r)) return; const t = String(q.body.body || '').trim(); if (!t) return r.status(400).json({ error: 'Порожньо' });
  await db.run('INSERT INTO board(group_id,user_id,body,created_at) VALUES(?,?,?,?)', [q.u.group_id, q.u.id, t.slice(0, 1000), now()]); r.json({ ok: 1 }); }));
app.post('/api/leader/member', H(async (q, r) => { if (!member(q, r)) return; const b = q.body, gid = isAdmin(q.u) && b.group_id ? +b.group_id : q.u.group_id;
  if (!isLeader(q.u, gid)) return r.status(403).json({ error: 'Лише лідер угруповання' }); const top = G[gid].ranks.length;
  if (b.action === 'invite') { const login = String(b.login || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,24}$/.test(login) || !b.nick || String(b.password || '').length < 6) return r.status(400).json({ error: 'Логін (латиниця 3–24), нік і пароль від 6 символів' });
    const ex = await db.get('SELECT * FROM users WHERE login=?', [login]); if (ex && ex.status === 'active') return r.status(400).json({ error: 'Логін зайнятий' });
    if (ex) await db.run("UPDATE users SET pass_hash=?,nick=?,group_id=?,rank=1,role='member',status='active' WHERE id=?", [bcrypt.hashSync(b.password, 10), b.nick, gid, ex.id]);
    else await db.run('INSERT INTO users(login,pass_hash,nick,group_id,created_at) VALUES(?,?,?,?,?)', [login, bcrypt.hashSync(b.password, 10), String(b.nick).slice(0, 40), gid, now()]);
    if (b.app_id) await db.run("UPDATE applications SET status='Прийнято' WHERE id=? AND group_id=?", [+b.app_id, gid]);
    await audit(q.u.id, gid, 'invite', b.nick); return r.json({ ok: 1 }); }
  if (b.action === 'reject') { await db.run("UPDATE applications SET status='Відхилено' WHERE id=? AND group_id=?", [+b.app_id, gid]); return r.json({ ok: 1 }); }
  const m = await db.get("SELECT * FROM users WHERE id=? AND group_id=? AND status='active'", [+b.user_id, gid]);
  if (!m || m.id === q.u.id) return r.status(400).json({ error: 'Не можна' }); if (m.role === 'leader' && !isAdmin(q.u)) return r.status(403).json({ error: 'Лідера знімає лише адмін' });
  if (b.action === 'rank') { const rk = Math.max(1, Math.min(top - 1, +b.rank)); await db.run('UPDATE users SET rank=? WHERE id=?', [rk, m.id]); await audit(q.u.id, gid, 'rank', `${m.nick}: ${m.rank} → ${rk}`); return r.json({ ok: 1 }); }
  if (b.action === 'kick') { await db.run("UPDATE users SET status='kicked' WHERE id=?", [m.id]); await db.run('DELETE FROM sessions WHERE user_id=?', [m.id]); await audit(q.u.id, gid, 'kick', `${m.nick}: ${b.reason || ''}`); return r.json({ ok: 1 }); }
  r.status(400).json({ error: 'Невідома дія' }); }));
app.post('/api/leader/treasury', H(async (q, r) => { if (!member(q, r)) return; const gid = q.u.group_id; if (!isLeader(q.u, gid)) return r.status(403).json({ error: 'Касу веде лідер' });
  const a = Math.trunc(+q.body.amount); if (!a || !q.body.note) return r.status(400).json({ error: 'Сума і коментар' });
  await db.run('INSERT INTO treasury(group_id,amount,note,user_id,created_at) VALUES(?,?,?,?,?)', [gid, a, String(q.body.note).slice(0, 200), q.u.id, now()]); await audit(q.u.id, gid, 'treasury', `${a} ₴ — ${q.body.note}`); r.json({ ok: 1 }); }));
app.post('/api/leader/group', H(async (q, r) => { if (!member(q, r)) return; const gid = q.u.group_id; if (!isLeader(q.u, gid)) return r.status(403).json({ error: 'Лише лідер' }); const b = q.body;
  await db.run('UPDATE groups SET motto=?,about=?,recruiting=? WHERE id=?', [String(b.motto || '').slice(0, 120), String(b.about || '').slice(0, 2000), b.recruiting ? 1 : 0, gid]); await loadG(); r.json({ ok: 1 }); }));
// turf & wars & contracts — shared underground layer
app.get('/api/street', H(async (q, r) => { if (!member(q, r)) return;
  r.json({ turfs: await db.all('SELECT * FROM turfs ORDER BY district,name'), wars: await db.all('SELECT * FROM wars ORDER BY id DESC LIMIT 40'),
    contracts: await db.all('SELECT c.*,u.nick taker FROM contracts c LEFT JOIN users u ON u.id=c.taker_id ORDER BY c.id DESC LIMIT 60') }); }));
app.post('/api/leader/war', H(async (q, r) => { if (!member(q, r)) return; const gid = q.u.group_id, b = q.body; if (!isLeader(q.u, gid)) return r.status(403).json({ error: 'Війну оголошує лідер' });
  if (b.id) { const w = await db.get('SELECT * FROM wars WHERE id=?', [+b.id]); if (!w || (w.attacker !== gid && w.defender !== gid && !isAdmin(q.u))) return r.status(403).json({ error: 'Не ваша війна' });
    if (b.status === 'Завершено' && !isAdmin(q.u)) { // surrender = other side wins
      const win = gid === w.attacker ? w.defender : w.attacker; await db.run("UPDATE wars SET status='Завершено',winner=? WHERE id=?", [win, w.id]);
      if (w.turf_id && win === w.attacker) await db.run('UPDATE turfs SET group_id=? WHERE id=?', [win, w.turf_id]); await audit(q.u.id, gid, 'war.surrender', '#' + w.id); return r.json({ ok: 1 }); }
    if (isAdmin(q.u)) { await db.run('UPDATE wars SET status=?,winner=? WHERE id=?', [b.status, +b.winner || null, w.id]); if (w.turf_id && +b.winner) await db.run('UPDATE turfs SET group_id=? WHERE id=?', [+b.winner, w.turf_id]); }
    return r.json({ ok: 1 }); }
  const t = b.turf_id ? await db.get('SELECT * FROM turfs WHERE id=?', [+b.turf_id]) : null; const def = t ? t.group_id : +b.defender;
  if (!G[def] || def === gid) return r.status(400).json({ error: 'Оберіть суперника або чужу територію' });
  await db.run('INSERT INTO wars(attacker,defender,turf_id,reason,created_at) VALUES(?,?,?,?,?)', [gid, def, t ? t.id : null, String(b.reason || '').slice(0, 300), now()]);
  await audit(q.u.id, gid, 'war.declare', `проти ${G[def].name}${t ? ' за ' + t.name : ''}`); r.json({ ok: 1 }); }));
app.post('/api/leader/turf', H(async (q, r) => { if (!member(q, r)) return; const gid = q.u.group_id; if (!isLeader(q.u, gid)) return r.status(403).json({ error: 'Лише лідер' });
  const t = await db.get('SELECT * FROM turfs WHERE id=?', [+q.body.id]); if (!t || t.group_id) return r.status(400).json({ error: 'Зайняту територію беруть лише через війну' });
  await db.run('UPDATE turfs SET group_id=? WHERE id=?', [gid, t.id]); await audit(q.u.id, gid, 'turf.claim', t.name); r.json({ ok: 1 }); }));
app.post('/api/contract', H(async (q, r) => { if (!member(q, r)) return; const b = q.body, gid = q.u.group_id;
  if (b.id) { const c = await db.get('SELECT * FROM contracts WHERE id=?', [+b.id]); if (!c) return r.status(404).json({ error: 'Немає' });
    if (b.action === 'take' && c.status === 'Відкрито' && c.group_id !== gid) { await db.run("UPDATE contracts SET status='Взято',taker_id=? WHERE id=?", [q.u.id, c.id]); return r.json({ ok: 1 }); }
    if (b.action === 'done' && c.group_id === gid && isLeader(q.u, gid)) { await db.run("UPDATE contracts SET status='Виконано' WHERE id=?", [c.id]); return r.json({ ok: 1 }); }
    return r.status(403).json({ error: 'Дія недоступна' }); }
  if (!isLeader(q.u, gid)) return r.status(403).json({ error: 'Замовлення розміщує лідер' }); if (!b.title) return r.status(400).json({ error: 'Назва' });
  await db.run('INSERT INTO contracts(group_id,title,body,reward,created_at) VALUES(?,?,?,?,?)', [gid, String(b.title).slice(0, 150), String(b.body || '').slice(0, 1500), Math.max(0, Math.trunc(+b.reward || 0)), now()]); r.json({ ok: 1 }); }));
app.post('/api/news', H(async (q, r) => { if (!member(q, r)) return; if (!q.body.title) return r.status(400).json({ error: 'Заголовок' });
  if (q.body.del) { if (!isAdmin(q.u)) return r.status(403).json({ error: 'Лише адмін' }); await db.run('DELETE FROM news WHERE id=?', [+q.body.del]); return r.json({ ok: 1 }); }
  await db.run('INSERT INTO news(title,body,author,created_at) VALUES(?,?,?,?)', [String(q.body.title).slice(0, 150), String(q.body.body || '').slice(0, 2000), q.body.anon ? 'Анонім' : q.u.nick, now()]); r.json({ ok: 1 }); }));
// admin
app.get('/api/admin', H(async (q, r) => { if (!isAdmin(q.u)) return r.status(403).json({ error: 'Лише адмін' });
  r.json({ users: await db.all('SELECT id,login,nick,group_id,rank,role,status FROM users ORDER BY group_id,rank DESC'), audit: await db.all('SELECT a.*,u.nick FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 150') }); }));
app.post('/api/admin/user', H(async (q, r) => { if (!isAdmin(q.u)) return r.status(403).json({ error: 'Лише адмін' }); const b = q.body;
  await db.run('UPDATE users SET group_id=?,rank=?,role=?,status=? WHERE id=?', [G[+b.group_id] ? +b.group_id : null, Math.max(1, +b.rank || 1), ['member', 'leader', 'admin'].includes(b.role) ? b.role : 'member', ['active', 'kicked'].includes(b.status) ? b.status : 'active', +b.id]);
  await audit(q.u.id, null, 'admin.user', JSON.stringify(b)); r.json({ ok: 1 }); }));
app.post('/api/admin/group', H(async (q, r) => { if (!isAdmin(q.u)) return r.status(403).json({ error: 'Лише адмін' }); const b = q.body;
  if (!b.code || !b.name) return r.status(400).json({ error: 'Код і назва' });
  await db.run('INSERT INTO groups(code,name,kind,color,motto) VALUES(?,?,?,?,?)', [b.code, b.name, b.kind || 'Банда', b.color || '#8a2be2', b.motto || '']); await loadG(); r.json({ ok: 1 }); }));
app.post('/api/admin/turf', H(async (q, r) => { if (!isAdmin(q.u)) return r.status(403).json({ error: 'Лише адмін' }); if (!q.body.name) return r.status(400).json({ error: 'Назва' });
  await db.run('INSERT INTO turfs(name,district,income) VALUES(?,?,?)', [q.body.name, q.body.district || '', +q.body.income || 0]); r.json({ ok: 1 }); }));
app.get('*', (q, r) => r.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

async function seed() {
  if (process.env.NOVA_AUTH_URL || process.env.GAME_GANGS === '1') await ensureGameGangs();
  if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD && !(await db.get('SELECT id FROM users WHERE login=?', [process.env.ADMIN_LOGIN])))
    await db.run("INSERT INTO users(login,pass_hash,nick,role,rank,created_at) VALUES(?,?,?,'admin',7,?)", [process.env.ADMIN_LOGIN, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10), 'Адмін', now()]);
  if (process.env.SEED_DEMO === '0' || (await db.get('SELECT id FROM groups WHERE demo=1'))) { await loadG(); return; }
  const g = async (code, name, kind, color, motto, about) => (await db.run('INSERT INTO groups(code,name,kind,color,motto,about,demo) VALUES(?,?,?,?,?,?,1)', [code, name, kind, color, motto, about])).id;
  const A = await g('ballas', '[Приклад] Ballas', 'Банда', '#9b4dff', 'Фіолетовий — колір вулиць', 'Стара банда з півдня Лос-Сантоса.');
  const B = await g('families', '[Приклад] Grove Families', 'Банда', '#2ecc71', 'Grove Street — дім', 'Сімʼя з Grove Street, тримає південь.');
  const C = await g('mafia', '[Приклад] Київський синдикат', 'Мафія', '#d4af37', 'Мовчання — золото', 'Організація старої школи: бізнес, контракти, вплив.');
  const D = await g('vagos', '[Приклад] Los Vagos', 'Угруповання', '#f1c40f', 'Жовтий прапор', 'Угруповання зі Східного Лос-Сантоса.');
  await loadG();
  const pw = bcrypt.hashSync('demo1234', 10), U = {};
  const u = async (login, nick, gid, rank, role = 'member') => { U[login] = (await db.run('INSERT INTO users(login,pass_hash,nick,group_id,rank,role,demo,created_at) VALUES(?,?,?,?,?,?,1,?)', [login, pw, nick, gid, rank, role, now()])).id; };
  await u('demo_admin', '[Приклад] Адмін', null, 7, 'admin'); await u('demo_boss', '[Приклад] Big Smoke', A, 7, 'leader'); await u('demo_ballas', '[Приклад] Kane', A, 3); await u('demo_ballas2', '[Приклад] Shorty', A, 1);
  await u('demo_grove', '[Приклад] Sweet', B, 7, 'leader'); await u('demo_don', '[Приклад] Дон Петро', C, 7, 'leader'); await u('demo_vagos', '[Приклад] Cesar', D, 7, 'leader');
  for (const [n, d, gr, inc] of [['Grove Street', 'Davis', B, 500], ['Ganton', 'Davis', B, 300], ['Chamberlain Hills', 'South LS', A, 400], ['Rancho', 'South LS', D, 350], ['Порт Елізіан', 'Port', null, 800], ['Vespucci Canals', 'Vespucci', C, 600], ['Сенді-Шорс трейлери', 'Blaine County', null, 250]])
    await db.run('INSERT INTO turfs(name,district,group_id,income) VALUES(?,?,?,?)', [n, d, gr, inc]);
  await db.run('INSERT INTO wars(attacker,defender,turf_id,reason,status,created_at) VALUES(?,?,?,?,?,?)', [A, B, 2, '[Приклад] Перестрілка біля магазину', 'Триває', now()]);
  for (const [gr, a, n, by] of [[A, 25000, 'Внески за тиждень', 'demo_boss'], [A, -8000, 'Закупівля зброї', 'demo_boss'], [C, 150000, 'Відкат з бізнесу', 'demo_don']]) await db.run('INSERT INTO treasury(group_id,amount,note,user_id,created_at) VALUES(?,?,?,?,?)', [gr, a, '[Приклад] ' + n, U[by], now()]);
  await db.run('INSERT INTO contracts(group_id,title,body,reward,created_at) VALUES(?,?,?,?,?)', [C, '[Приклад] Доставка вантажу в порт', 'Тихо, без хвоста. Деталі — після взяття.', 20000, now()]);
  await db.run('INSERT INTO contracts(group_id,title,body,reward,created_at) VALUES(?,?,?,?,?)', [A, '[Приклад] Охорона угоди', 'Потрібно 3 бійці на 30 хвилин.', 9000, now()]);
  for (const [who, t] of [['demo_boss', 'Збір о 21:00 біля гаража. Без запізнень.'], ['demo_ballas', 'Прийняв. Беру двох своїх.']]) await db.run('INSERT INTO board(group_id,user_id,body,created_at) VALUES(?,?,?,?)', [A, U[who], '[Приклад] ' + t, now()]);
  await db.run('INSERT INTO applications(group_id,nick,contact,about,created_at) VALUES(?,?,?,?,?)', [A, '[Приклад] NewKid', 'Discord: newkid', 'Хочу до вас, граю 2 місяці.', now()]);
  for (const [t, b, a] of [['[Приклад] На Grove знову гаряче', 'Ballas і Families не поділили Ganton. Мешканцям радять не виходити вночі.', 'Анонім'], ['[Приклад] Синдикат шукає водіїв', 'Кажуть, оплата щедра. Питайте в порту.', 'Дон Петро']])
    await db.run('INSERT INTO news(title,body,author,demo,created_at) VALUES(?,?,?,1,?)', [t, b, a, now()]);
}
(async () => { await db.init(SCHEMA, 'ozu.db'); await seed(); const port = process.env.PORT || 3200; app.listen(port, () => console.log('ОЗУ портал: http://localhost:' + port)); })();

const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = t => new Date(+t).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
const api = async (u, b) => { const r = await fetch(u, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Помилка'); return j; };
const toast = m => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = m; document.body.append(d); setTimeout(() => d.remove(), 2600); };
const form = el => Object.fromEntries(new FormData(el));
const uah = n => `<span class="money ${n < 0 ? 'neg' : ''}">${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('uk-UA')} ₴</span>`;
let ME = {}, GN = {};
const gname = id => GN[id] ? `<span class="dot" style="background:${esc(GN[id].color)}"></span>${esc(GN[id].name)}` : '<span class="meta">Нічия</span>';
const gopts = (excl) => Object.values(GN).filter(g => g.id !== excl).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
const roleTag = u => u.role === 'admin' ? '<span class="tag y">Адмін</span>' : u.role === 'leader' ? '<span class="tag y">Лідер</span>' : '<span class="tag">Учасник</span>';
const rn = (gid, r) => (GN[gid] && GN[gid].ranks[r - 1]) || ('Ранг ' + r);
function chrome() {
  const u = ME.user, h = location.hash || '#/';
  $('#links').innerHTML = `<a href="#/" class="${h === '#/' ? 'on' : ''}">Вулиці</a><a href="#/join" class="${h === '#/join' ? 'on' : ''}">Набір</a>` + (u ? `<a class="acc" href="#/crew">Кабінет</a>` : `<a class="acc" href="#/login">Вхід для своїх</a>`);
  $('#ws').hidden = !u; if (!u) return;
  const L = [['#/crew', 'Моє угруповання'], ['#/street', 'Територія · війни · замовлення']]; if (ME.admin) L.push(['#/admin', 'Адмінпанель']);
  $('#wsin').innerHTML = `<span class="eb">${u.group_id ? esc(GN[u.group_id].name) : 'Адмін'}</span>` + L.map(([a, t]) => `<a href="${a}" class="${h === a ? 'on' : ''}">${t}</a>`).join('') + `<span class="who">${esc(u.nick)} · ${esc(rn(u.group_id, u.rank))} ${roleTag(u)} <button class="btn gh sm" onclick="logout()">Вийти</button></span>`;
}
async function logout() { await api('/api/logout', {}); await boot(); location.hash = '#/'; }
async function pagePublic() {
  const p = await api('/api/public');
  app.innerHTML = `<section class="hero"><div><div class="veb">Вулиці говорять</div><h1 class="vh">Хто тримає місто —<br>знають усі</h1><div class="flag"></div><p class="sub">Публічна сторінка ОЗУ: вуличні новини, хто контролює райони і які угруповання шукають людей. Все інше — тільки для своїх.</p>
   <p><a class="btn" href="#/join">Подати заявку</a> <a class="btn gh" href="#/login">Вхід для своїх</a></p></div>
   <div class="card"><h3>Карта районів</h3>${p.turfs.map(t => `<div class="it turf"><span><b>${esc(t.name)}</b> <span class="meta">${esc(t.district)}</span></span><span>${gname(t.group_id)}</span></div>`).join('')}</div></section>
  <div class="grid g4">${p.groups.map(g => `<div class="card" style="border-top:3px solid ${esc(g.color)}"><span class="tag">${esc(g.kind)}</span><h4 style="margin-top:10px">${esc(g.name)}</h4><div class="meta">«${esc(g.motto)}»</div><p class="sub" style="font-size:13px">${esc(g.about)}</p><div class="meta">${g.members} учасників · ${g.turfs} районів · ${g.recruiting ? '<span class="tag public">Набір відкрито</span>' : '<span class="tag">Набір закрито</span>'}</div></div>`).join('')}</div>
  <div class="grid g2" style="margin-top:18px"><div class="card"><h3>Вуличні новини</h3>${p.news.map(n => `<div class="it"><b>${esc(n.title)}</b><div class="sub">${esc(n.body)}</div><div class="meta">${esc(n.author)} · ${dt(n.created_at)}</div></div>`).join('')}</div>
   <div class="card"><h3>Конфлікти</h3>${p.wars.map(w => `<div class="it">${gname(w.attacker)} <span class="meta">проти</span> ${gname(w.defender)} <span class="tag ${w.status === 'Завершено' ? '' : 'secret'}">${esc(w.status)}</span>${w.winner ? `<div class="meta">Переможець: ${GN[w.winner] ? esc(GN[w.winner].name) : ''}</div>` : ''}</div>`).join('') || '<div class="meta">Тихо... поки що</div>'}</div></div>`;
}
async function pageJoin() {
  const p = await api('/api/public'), open = p.groups.filter(g => g.recruiting);
  app.innerHTML = `<div class="veb">Набір</div><h1 class="vh">Хочеш до своїх?</h1><p class="sub">Обери угруповання з відкритим набором і залиш заявку. Лідер звʼяжеться з тобою в грі.</p>
  <form class="card login" id="jf" style="max-width:560px"><label>Угруповання</label><select name="group_id">${open.map(g => `<option value="${g.id}">${esc(g.name)} · ${esc(g.kind)}</option>`).join('')}</select><label>Нік у грі</label><input name="nick" required><label>Контакт</label><input name="contact" placeholder="Discord"><label>Про себе</label><textarea name="about"></textarea><button class="btn" style="width:100%">Надіслати заявку</button></form>`;
  $('#jf').onsubmit = async e => { e.preventDefault(); try { await api('/api/public/apply', form(e.target)); e.target.reset(); toast('Заявку передано лідеру'); } catch (x) { toast(x.message); } };
}
async function pageLogin() {
  let m = { nova: false, local: true }; try { m = await (await fetch('/api/auth/mode')).json(); } catch {}
  const done = async () => { await boot(); location.hash = ME.user.group_id ? '#/crew' : '#/admin'; };
  const game = `<form class="card login" id="gf"><div class="veb">Тільки для своїх</div><h1 class="vh" style="font-size:28px">Вхід через NovaRP</h1><label>Ігровий логін</label><input name="login" autocomplete="username" required><label>Пароль від гри</label><input name="password" type="password" autocomplete="current-password" required><button class="btn" style="width:100%">Увійти</button><div class="hint">Доступ і ранг підтягуються з гри автоматично при кожному вході.</div></form>`;
  const local = `<form class="card login" id="lf" ${m.nova ? 'style="margin-top:18px"' : ''}><div class="veb">${m.nova ? 'Службовий вхід' : 'Тільки для своїх'}</div><h1 class="vh" style="font-size:${m.nova ? 20 : 28}px">${m.nova ? 'Локальний акаунт' : 'Вхід'}</h1><label>Логін</label><input name="login" autocomplete="username"><label>Пароль</label><input name="password" type="password"><button class="btn ${m.nova ? 'gh' : ''}" style="width:100%">Увійти</button>${m.nova ? '' : '<div class="hint">Демо: demo_boss, demo_ballas, demo_don, demo_admin — пароль demo1234.</div>'}</form>`;
  app.innerHTML = (m.nova ? game : '') + (m.local || !m.nova ? local : `<details style="max-width:420px;margin:14px auto"><summary class="meta">Службовий вхід</summary>${local}</details>`);
  $('#lf').onsubmit = async e => { e.preventDefault(); try { await api('/api/login', form(e.target)); await done(); } catch (x) { toast(x.message); } };
  if (m.nova) $('#gf').onsubmit = async e => { e.preventDefault(); try { const r = await api('/api/login/game', form(e.target));
    if (!r.choose) return await done();
    app.innerHTML = `<div class="card login"><div class="veb">Кілька персонажів</div><h1 class="vh" style="font-size:24px">Оберіть персонажа</h1>${r.choose.map(c => `<button class="btn gh" style="width:100%;margin:6px 0" data-id="${c.id}">${esc(c.name)} · ${esc(c.faction)} · ранг ${c.rank}</button>`).join('')}</div>`;
    app.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => { try { await api('/api/login/char', { ticket: r.ticket, char_id: +b.dataset.id }); await done(); } catch (x) { toast(x.message); pageLogin(); } });
  } catch (x) { toast(x.message); } };
}
async function pageCrew() {
  if (!ME.user.group_id) { app.innerHTML = '<div class="card"><h3>Без угруповання</h3><div class="sub">Адмін без угруповання — відкрийте Адмінпанель.</div></div>'; return; }
  const d = await api('/api/group'), g = d.group, L = d.leader;
  app.innerHTML = `<div class="veb">${esc(g.kind)}</div><h1 class="vh"><span class="dot" style="background:${esc(g.color)};width:16px;height:16px"></span>${esc(g.name)}</h1><p class="sub">«${esc(g.motto)}»</p>
  <div class="grid g3" style="margin-top:20px"><div class="card"><h3>Учасників</h3><div class="big">${d.roster.length}</div></div><div class="card"><h3>Общак</h3><div class="big">${d.balance.toLocaleString('uk-UA')} ₴</div></div><div class="card"><h3>Твій ранг</h3><div class="big">${esc(rn(g.id, ME.user.rank))}</div></div></div>
  <div class="grid g2" style="margin-top:18px"><div class="card"><h3>Канал звʼязку <span class="enc">● E2E · ШИФРОВАНО</span></h3><div class="chat" id="chat">${d.board.map(m => `<div class="m"><b>${esc(m.nick)}</b> <span class="meta">${dt(m.created_at)}</span><br>${esc(m.body)}</div>`).join('')}</div><form id="bf" style="display:flex;gap:8px;margin-top:10px"><input name="body" placeholder="Повідомлення для своїх..." style="margin:0"><button class="btn">→</button></form></div>
   <div class="card"><h3>Склад</h3><table><tr><th>Нік</th><th>Ранг</th><th>Роль</th>${L ? '<th></th>' : ''}</tr>${d.roster.map(m => `<tr><td><b>${esc(m.nick)}</b></td><td>${L && m.role === 'member' ? `<select style="width:auto;margin:0" onchange="lm({action:'rank',user_id:${m.id},rank:this.value})">${g.ranks.slice(0, -1).map((r, i) => `<option value="${i + 1}" ${i + 1 === m.rank ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : esc(rn(g.id, m.rank))}</td><td>${roleTag(m)}</td>${L ? `<td>${m.role === 'member' ? `<button class="btn red sm" onclick="kick(${m.id})">Вигнати</button>` : ''}</td>` : ''}</tr>`).join('')}</table></div>
   <div class="card"><h3>Журнал общаку</h3>${d.treasury.map(t => `<div class="it turf"><span>${esc(t.note)}<div class="meta">${esc(t.nick || '')} · ${dt(t.created_at)}</div></span>${uah(t.amount)}</div>`).join('') || '<div class="meta">Порожньо</div>'}
    ${L ? `<form id="tf" style="margin-top:12px"><div class="grid g2"><div><label>Сума (− витрата)</label><input name="amount" type="number" required></div><div><label>За що</label><input name="note" required></div></div><button class="btn">Записати</button></form>` : ''}</div>
   ${L ? `<div class="card"><h3>Заявки на вступ</h3>${d.apps.map(a => `<div class="it"><b>${esc(a.nick)}</b> <span class="tag y">${esc(a.status)}</span> <span class="meta">${esc(a.contact)}</span><div class="sub">${esc(a.about)}</div>${a.status === 'Нова' ? `<button class="btn sm" onclick="accept(${a.id},'${esc(a.nick).replace(/'/g, '')}')">Прийняти</button> <button class="btn gh sm" onclick="lm({action:'reject',app_id:${a.id}})">Відхилити</button>` : ''}</div>`).join('') || '<div class="meta">Немає</div>'}
    <form id="if" style="margin-top:14px"><h3>Запросити напряму</h3><div class="grid g3"><div><label>Логін</label><input name="login" required></div><div><label>Нік</label><input name="nick" required></div><div><label>Пароль</label><input name="password" required></div></div><button class="btn">Видати доступ</button></form></div>
   <form class="card" id="gf"><h3>Профіль угруповання</h3><label>Девіз</label><input name="motto" value="${esc(g.motto)}"><label>Опис (публічний)</label><textarea name="about">${esc(g.about)}</textarea><label><input type="checkbox" name="recruiting" style="width:auto" ${g.recruiting ? 'checked' : ''}> Набір відкрито</label><br><button class="btn">Зберегти</button></form>
   <div class="card"><h3>Журнал лідера</h3>${d.log.map(a => `<div class="it"><span class="tag">${esc(a.action)}</span> ${esc(a.details)}<div class="meta">${esc(a.nick || '')} · ${dt(a.created_at)}</div></div>`).join('') || '<div class="meta">Порожньо</div>'}</div>` : ''}</div>`;
  const c = $('#chat'); c.scrollTop = c.scrollHeight;
  $('#bf').onsubmit = async e => { e.preventDefault(); try { await api('/api/board', form(e.target)); route(); } catch (x) { toast(x.message); } };
  const on = (id, url, msg, map = x => x) => { const f = $(id); if (f) f.onsubmit = async e => { e.preventDefault(); try { await api(url, map(form(e.target))); toast(msg); route(); } catch (x) { toast(x.message); } }; };
  on('#tf', '/api/leader/treasury', 'Записано'); on('#if', '/api/leader/member', 'Доступ видано', b => ({ action: 'invite', ...b })); on('#gf', '/api/leader/group', 'Збережено', b => ({ ...b, recruiting: !!b.recruiting }));
}
async function lm(b) { try { await api('/api/leader/member', b); toast('Готово'); route(); } catch (x) { toast(x.message); route(); } }
function kick(id) { const reason = prompt('Причина'); if (reason !== null) lm({ action: 'kick', user_id: id, reason }); }
function accept(app_id, nick) { const login = prompt('Логін для ' + nick + ' (латиниця)'); if (!login) return; const password = prompt('Початковий пароль (6+)'); if (password) lm({ action: 'invite', app_id, login, nick, password }); }
async function pageStreet() {
  const d = await api('/api/street'), my = ME.user.group_id, L = ME.leader;
  app.innerHTML = `<div class="veb">Підпільний рівень</div><h1 class="vh">Територія, війни, замовлення</h1><p class="sub">Спільна дошка для всіх угруповань. Вільні райони може зайняти лідер; зайняті — тільки через війну.</p>
  <div class="grid g2" style="margin-top:22px"><div class="card"><h3>Райони</h3>${d.turfs.map(t => `<div class="it turf"><span><b>${esc(t.name)}</b> <span class="meta">${esc(t.district)} · ${t.income.toLocaleString('uk-UA')} ₴/день</span></span><span>${gname(t.group_id)} ${L && my && !t.group_id ? `<button class="btn sm" onclick="act('/api/leader/turf',{id:${t.id}})">Зайняти</button>` : ''}${L && my && t.group_id && t.group_id !== my ? `<button class="btn red sm" onclick="war(${t.id})">Війна</button>` : ''}</span></div>`).join('')}</div>
   <div class="card"><h3>Війни</h3>${d.wars.map(w => `<div class="it">${gname(w.attacker)} <span class="meta">→</span> ${gname(w.defender)} <span class="tag ${w.status === 'Завершено' ? '' : 'secret'}">${esc(w.status)}</span><div class="meta">${esc(w.reason || '')} · ${dt(w.created_at)}${w.winner ? ' · переміг ' + esc(GN[w.winner]?.name || '') : ''}</div>${L && w.status !== 'Завершено' && (w.attacker === my || w.defender === my) ? `<button class="btn gh sm" onclick="if(confirm('Здатися? Перемога суперника.'))act('/api/leader/war',{id:${w.id},status:'Завершено'})">Здатися</button>` : ''}</div>`).join('') || '<div class="meta">Миру немає, але й війн теж</div>'}
    ${L && my ? `<form id="wf" style="margin-top:12px"><h3>Оголосити війну угрупованню</h3><select name="defender">${gopts(my)}</select><input name="reason" placeholder="Причина"><button class="btn red">Оголосити</button></form>` : ''}</div>
   <div class="card"><h3>Дошка замовлень</h3>${d.contracts.map(c => `<div class="it"><span class="tag ${c.status === 'Відкрито' ? 'public' : 'y'}">${esc(c.status)}</span> <b>${esc(c.title)}</b> ${uah(c.reward)}<div class="sub">${esc(c.body)}</div><div class="meta">Замовник: ${gname(c.group_id)}${c.taker ? ' · виконавець ' + esc(c.taker) : ''}</div>${c.status === 'Відкрито' && c.group_id !== my && my ? `<button class="btn sm" onclick="act('/api/contract',{id:${c.id},action:'take'})">Взяти</button>` : ''}${c.status === 'Взято' && c.group_id === my && L ? `<button class="btn gh sm" onclick="act('/api/contract',{id:${c.id},action:'done'})">Виконано</button>` : ''}</div>`).join('')}</div>
   <div>${L && my ? `<form class="card" id="cf"><h3>Розмістити замовлення</h3><label>Що треба</label><input name="title" required><label>Деталі</label><textarea name="body"></textarea><label>Нагорода, ₴</label><input name="reward" type="number"><button class="btn">Розмістити</button></form>` : ''}
    <form class="card" id="nf" style="margin-top:18px"><h3>Вкинути вуличну новину</h3><label>Заголовок</label><input name="title" required><label>Текст</label><textarea name="body"></textarea><label><input type="checkbox" name="anon" style="width:auto" checked> Анонімно</label><br><button class="btn">Опублікувати</button><div class="hint">Новина зʼявиться на публічній сторінці.</div></form></div></div>`;
  const on = (id, url, msg, map = x => x) => { const f = $(id); if (f) f.onsubmit = async e => { e.preventDefault(); try { await api(url, map(form(e.target))); toast(msg); route(); } catch (x) { toast(x.message); } }; };
  on('#wf', '/api/leader/war', 'Війну оголошено'); on('#cf', '/api/contract', 'Розміщено'); on('#nf', '/api/news', 'Опубліковано', b => ({ ...b, anon: !!b.anon }));
}
async function act(u, b) { try { await api(u, b); toast('Готово'); route(); } catch (x) { toast(x.message); } }
function war(turf_id) { const reason = prompt('Причина війни'); if (reason !== null) act('/api/leader/war', { turf_id, reason }); }
async function pageAdmin() {
  const d = await api('/api/admin');
  app.innerHTML = `<div class="veb">Адміністрування</div><h1 class="vh">Адмінпанель ОЗУ</h1>
  <div class="card" style="margin-top:22px"><h3>Користувачі</h3><table><tr><th>Нік</th><th>Угруповання</th><th>Ранг</th><th>Роль</th><th>Статус</th><th></th></tr>${d.users.map(u => `<tr id="u${u.id}"><td><b>${esc(u.nick)}</b><div class="meta">${esc(u.login)}</div></td><td><select name="group_id"><option value="">—</option>${Object.values(GN).map(g => `<option value="${g.id}" ${g.id === u.group_id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td><td><input name="rank" type="number" value="${u.rank}" style="width:70px"></td><td><select name="role">${['member', 'leader', 'admin'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><select name="status">${['active', 'kicked'].map(r => `<option ${r === u.status ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><button class="btn sm" onclick="saveU(${u.id})">Зберегти</button></td></tr>`).join('')}</table></div>
  <div class="grid g3" style="margin-top:18px"><form class="card" id="gf"><h3>Нове угруповання</h3><label>Код</label><input name="code"><label>Назва</label><input name="name"><label>Тип</label><select name="kind"><option>Банда</option><option>Мафія</option><option>Угруповання</option></select><label>Колір</label><input name="color" type="color" value="#c0283c"><label>Девіз</label><input name="motto"><button class="btn">Створити</button></form>
  <form class="card" id="tf"><h3>Новий район</h3><label>Назва</label><input name="name"><label>Округ</label><input name="district"><label>Дохід ₴/день</label><input name="income" type="number"><button class="btn">Додати</button></form>
  <div class="card"><h3>Журнал</h3><div style="max-height:420px;overflow:auto">${d.audit.map(a => `<div class="it"><span class="tag">${esc(a.action)}</span> ${esc(a.details)}<div class="meta">${esc(a.nick || '')} · ${dt(a.created_at)}</div></div>`).join('')}</div></div></div>`;
  for (const [id, url] of [['#gf', '/api/admin/group'], ['#tf', '/api/admin/turf']]) $(id).onsubmit = async e => { e.preventDefault(); try { await api(url, form(e.target)); await boot(); toast('Готово'); route(); } catch (x) { toast(x.message); } };
}
async function saveU(id) { const b = { id }; $('#u' + id).querySelectorAll('[name]').forEach(i => b[i.name] = i.value); try { await api('/api/admin/user', b); toast('Збережено'); } catch (x) { toast(x.message); } }
async function route() {
  const h = location.hash || '#/'; chrome();
  try {
    if (h === '#/login') return pageLogin(); if (h === '#/join') return await pageJoin();
    if (['#/crew', '#/street', '#/admin'].includes(h) && !ME.user) { location.hash = '#/login'; return; }
    if (h === '#/crew') return await pageCrew(); if (h === '#/street') return await pageStreet(); if (h === '#/admin') return await pageAdmin();
    await pagePublic();
  } catch (x) { app.innerHTML = `<div class="card"><h3>Немає доступу</h3><div class="sub">${esc(x.message)}</div></div>`; }
}
async function boot() { ME = await api('/api/me'); GN = Object.fromEntries(ME.groups.map(g => [g.id, g])); }
window.onhashchange = route; boot().then(route);

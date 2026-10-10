import {renderSaplingsAdmin,bindSaplingsAdmin} from './saplings-admin.js';
import { api, esc, safeUrl, safeImageUrl, toast, resolveLinks, staticDemo } from './shared.js';

let host;
const state = {
  user: null, tab: 'overview', content: null, audit: [], users: [], subscribers: [], registrations: [],
  editing: { posts: null, ledger: null, reports: null, users: null }, uploadedPostImage: '', error: '', pending: false
};

const tabs = [
  ['overview', '總覽'], ['posts', '內容管理'], ['settings', '網站設定'],
  ['ledger', '款項流向'], ['reports', '公開報告'], ['users', '操作人員'],
  ['saplings','小樹苗活動'], ['registrations','活動報名'], ['subscribers', '訂閱名單'], ['audit', '修改紀錄']
];
const settingsFields = [
  ['name','協會正式名稱'], ['shortName','網站簡稱'], ['mission','核心宗旨','textarea'],
  ['about','協會介紹','textarea'], ['phone','聯絡電話'], ['address','會址'],
  ['lineUrl','LINE 網址','url'], ['instagramUrl','Instagram 網址','url'],
  ['facebookUrl','Facebook 粉專網址','url'], ['groupUrl','Facebook 社團網址','url'],
  ['heroImage','首頁主圖路徑'], ['heroTitle','首頁主標題'], ['heroText','首頁引言','textarea']
];

const text = value => esc(String(value ?? ''));
const selected = (a, b) => a === b ? ' selected' : '';
const checked = value => value ? ' checked' : '';
const disabled = () => state.pending ? ' disabled' : '';
const field = (name, label, value = '', type = 'text', attrs = '') => `
  <label class="field"><span>${text(label)}</span>
    ${type === 'textarea'
      ? `<textarea name="${text(name)}" ${attrs}>${text(value)}</textarea>`
      : `<input name="${text(name)}" type="${text(type)}" value="${text(value)}" ${attrs}>`}
  </label>`;
const statusBadge = item => `<span class="badge">${item.status === 'published' ? '已發布' : '草稿'}${item.isDemo ? ' · 示範' : ''}</span>`;

function showError(message) {
  const draft = captureForm();
  state.error = message || '操作失敗，請稍後再試。';
  render();
  restoreForm(draft);
}

function captureForm() {
  return [...(host?.querySelectorAll('form input, form select, form textarea') || [])]
    .filter(el => el.name && !['password', 'file'].includes(el.type))
    .map(el => ({name:el.name,value:el.value,checked:el.checked}));
}
function restoreForm(draft) {
  for (const item of draft) {
    const el = [...host.querySelectorAll('form input, form select, form textarea')].find(x => x.name === item.name);
    if (!el) continue;
    el.value = item.name === 'image' && state.uploadedPostImage ? state.uploadedPostImage : item.value;
    if (el.type === 'checkbox') el.checked = item.checked;
  }
}
async function run(task, success, preserve = false) {
  if (state.pending) return;
  const draft = captureForm();
  let failed = false;
  state.pending = true; state.error = ''; render();
  restoreForm(draft);
  try {
    await task();
    if (success) toast(success);
  } catch (error) {
    failed = true;
    state.error = error.message || '操作失敗，請稍後再試。';
  } finally {
    state.pending = false; render();
    if (failed || preserve) restoreForm(draft);
  }
}

async function loadContent() {
  state.content = await api('/api/admin/content');
}

async function loadTabData(tab = state.tab) {
  if (!state.content) await loadContent();
  if (tab === 'saplings' && !staticDemo) [state.saplingEvents,state.saplingRegistrations] = await Promise.all([api('/api/admin/saplings/events'),api('/api/admin/saplings/registrations')]);
  if (tab === 'audit') state.audit = await api('/api/admin/audit');
  if (tab === 'registrations') state.registrations = await api('/api/admin/registrations');
  if (tab === 'subscribers') state.subscribers = await api('/api/admin/subscribers');
  if (tab === 'users' && state.user.role === 'admin') state.users = await api('/api/admin/users');
}

export async function renderAdmin(root) {
  host = root;
  host.innerHTML = '<main class="panel"><p class="muted">正在載入管理後台…</p></main>';
  try {
    const session = await api('/api/admin/me');
    state.user = session.user;
    if (state.user) await loadTabData('overview');
  } catch (error) {
    state.error = error.message;
  }
  render();
}

function render() {
  if (!host) return;
  if (!state.user) return renderLogin();
  host.innerHTML = `
    <main id="main" class="admin-shell">
      <aside class="admin-sidebar" aria-label="後台功能">
        <div><strong>森藏內容後台</strong><p class="muted">${text(state.user.name)} · ${state.user.role === 'admin' ? '管理員' : '編輯者'}</p></div>
        <nav class="admin-tabs">${tabs.filter(([id]) => id !== 'users' || state.user.role === 'admin').map(([id,label]) => `<button class="${state.tab === id ? 'active' : ''}" type="button" data-tab="${id}" aria-current="${state.tab === id ? 'page' : 'false'}">${label}</button>`).join('')}</nav>
        <a href="/" class="text-link">查看公開網站 ↗</a>
        <button class="btn btn-secondary" id="logout" type="button"${disabled()}>登出</button>
      </aside>
      <section class="admin-main">
        ${state.error ? `<div class="error" role="alert">${text(state.error)}</div>` : ''}
        ${state.pending ? '<div class="notice" role="status">資料處理中，請稍候…</div>' : ''}
        ${renderCurrentTab()}
      </section>
    </main>`;
  if (state.pending) host.querySelectorAll('button, input, select, textarea').forEach(element => { element.disabled = true; });
  host.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', async () => {
    state.tab = button.dataset.tab; state.error = '';
    try { await loadTabData(); } catch (error) { state.error = error.message; }
    render();
  }));
  host.querySelector('#logout')?.addEventListener('click', () => run(async () => {
    await api('/api/admin/logout', { method: 'POST' });
    state.user = null; state.content = null;
  }));
  bindCurrentTab();
  resolveLinks(host);
}

function renderLogin() {
  host.innerHTML = `<main id="main" class="admin-login"><img src="/assets/logo.png" alt="森藏 MORILOOP"><section class="panel">
    <p class="muted">協會內容管理</p><h1>登入管理後台</h1>
    ${state.error ? `<div class="error" role="alert">${text(state.error)}</div>` : ''}
    <form id="login-form">
      ${field('email','Email','','email','autocomplete="username" required')}
      ${field('password','密碼','','password','autocomplete="current-password" required')}
      <button class="btn" type="submit"${disabled()}>${state.pending ? '登入中…' : '登入'}</button>
    </form>
    <div class="notice"><strong>${staticDemo ? '瀏覽器測試帳號' : '內容管理帳號'}</strong><p>管理員：admin@mori.local<br>編輯者：editor@mori.local<br>密碼：MoriDemo2026!</p><p class="muted">${staticDemo ? '資料只保存在你的瀏覽器，並非協會正式管理系統。請勿輸入真實密碼或個資。' : '正式上線前請建立實際帳號並更換示範密碼。'}</p></div>
  </section><a class="text-link" href="/">返回公開網站 ↗</a></main>`;
  if (state.pending) host.querySelectorAll('button, input').forEach(element => { element.disabled = true; });
  host.querySelector('#login-form')?.addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    run(async () => {
      const result = await api('/api/admin/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
      state.user = result.user; await loadTabData('overview');
    }, '登入成功');
  });
  resolveLinks(host);
}

function renderCurrentTab() {
  if (!state.content) return '<section class="panel"><p>正在載入…</p></section>';
  return ({
    saplings: () => renderSaplingsAdmin(state), overview: renderOverview, posts: renderPosts, settings: renderSettings,
    ledger: renderLedger, reports: renderReports, users: renderUsers,
    registrations: renderRegistrations, subscribers: renderSubscribers, audit: renderAudit
  }[state.tab] || renderOverview)();
}

function bindCurrentTab() {
  ({
    saplings: () => bindSaplingsAdmin(host,state,async()=>{await loadTabData();render();}), posts: bindPosts, settings: bindSettings, ledger: bindLedger,
    reports: bindReports, users: bindUsers, subscribers: bindSubscribers,
    audit: bindAudit
  }[state.tab] || (() => {}))();
}

function renderOverview() {
  const { posts, ledger, reports } = state.content;
  return `<section><p class="muted">後台總覽</p><h1>你好，${text(state.user.name)}</h1>
    <div class="grid-2">
      <article class="panel"><h2>${posts.length}</h2><p>活動、消息與故事</p><p class="muted">其中 ${posts.filter(x=>x.status==='draft').length} 篇草稿</p></article>
      <article class="panel"><h2>${ledger.length}</h2><p>款項用途紀錄</p><p class="muted">示範資料會在公開頁清楚標記</p></article>
      <article class="panel"><h2>${reports.length}</h2><p>公開報告</p></article>
      <article class="panel"><h2>直接發布</h2><p>所有操作人員都可新增草稿或直接發布。</p></article>
    </div>
    <div class="notice"><strong>捐款功能尚未開放</strong><p>目前後台只管理示範用途與公開報告，沒有真實付款或捐款收款功能。</p></div>
  </section>`;
}

function postEditor(post = {}) {
  const postImage = post.image || state.uploadedPostImage;
  return `<form id="post-form" class="panel"><h2>${post.id ? '編輯內容' : '新增內容'}</h2>
    <div class="grid-2">
      ${field('title','標題',post.title,'text','required')}
      <label class="field"><span>內容類型</span><select name="type"><option value="activity"${selected(post.type,'activity')}>活動</option><option value="story"${selected(post.type,'story')}>成果故事</option><option value="news"${selected(post.type,'news')}>最新消息</option></select></label>
      ${field('category','分類',post.category)} ${field('date','日期',post.date,'date')}
      ${field('location','地點',post.location)} ${field('registrationUrl','報名網址',post.registrationUrl,'url')}
    </div>
    ${field('summary','摘要',post.summary,'textarea','rows="3"')}
    ${field('body','完整內容',post.body,'textarea','rows="8"')}
    <div class="grid-2">${field('image','圖片網址',postImage)}<label class="field"><span>上傳圖片（JPEG／PNG／WebP，5MB 內）</span><input id="post-upload" type="file" accept="image/jpeg,image/png,image/webp"></label></div>
    <div class="grid-2"><label class="field"><span>發布狀態</span><select name="status"><option value="draft"${selected(post.status || 'draft','draft')}>草稿</option><option value="published"${selected(post.status,'published')}>直接發布</option></select></label><label class="field"><span><input name="isDemo" type="checkbox"${checked(post.isDemo)}> 示範資料</span></label></div>
    <button class="btn" type="submit"${disabled()}>儲存內容</button> <button class="btn btn-secondary" id="post-cancel" type="button">清除表單</button>
  </form>`;
}

function renderPosts() {
  const editing = state.content.posts.find(x => x.id === state.editing.posts) || {};
  return `<section><p class="muted">內容管理</p><h1>活動、消息與成果故事</h1>${postEditor(editing)}
    <div class="panel"><h2>全部內容</h2><div class="admin-table" role="region" aria-label="內容列表" tabindex="0"><table><thead><tr><th>標題</th><th>類型</th><th>狀態</th><th>日期</th><th>操作</th></tr></thead><tbody>
      ${state.content.posts.map(p => `<tr><td><strong>${text(p.title)}</strong><br><span class="muted">${text(p.category)}</span></td><td>${text({activity:'活動',story:'故事',news:'消息'}[p.type] || p.type)}</td><td>${statusBadge(p)}</td><td>${text(p.date || '待補')}</td><td><button class="btn btn-secondary" data-edit-post="${text(p.id)}" type="button">編輯</button> <button class="btn btn-secondary" data-delete-post="${text(p.id)}" type="button">刪除</button></td></tr>`).join('') || '<tr><td colspan="5">尚無內容</td></tr>'}
    </tbody></table></div></div></section>`;
}

function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }
function postPayload(form) { const b=formObject(form); b.isDemo=new FormData(form).has('isDemo'); return b; }

function bindPosts() {
  host.querySelector('#post-form')?.addEventListener('submit', event => {
    event.preventDefault(); const body=postPayload(event.currentTarget); const id=state.editing.posts;
    run(async()=>{await api(`/api/admin/posts${id?`/${id}`:''}`,{method:id?'PUT':'POST',body});state.editing.posts=null;state.uploadedPostImage='';await loadContent();},'內容已儲存');
  });
  host.querySelector('#post-cancel')?.addEventListener('click',()=>{state.editing.posts=null;state.uploadedPostImage='';render();});
  host.querySelectorAll('[data-edit-post]').forEach(b=>b.addEventListener('click',()=>{state.editing.posts=b.dataset.editPost;state.uploadedPostImage='';render();host.querySelector('#post-form')?.scrollIntoView({behavior:'smooth'});}));
  host.querySelectorAll('[data-delete-post]').forEach(b=>b.addEventListener('click',()=>{if(!window.confirm('確定刪除這筆內容？'))return;run(async()=>{await api(`/api/admin/posts/${b.dataset.deletePost}`,{method:'DELETE'});await loadContent();},'內容已刪除');}));
  host.querySelector('#post-upload')?.addEventListener('change', async event => {
    const file=event.target.files?.[0]; if(!file)return;
    if(file.size>5*1024*1024){showError('圖片大小不可超過 5MB。');return;}
    const data=await readFile(file);
    run(async()=>{const out=await api('/api/admin/upload',{method:'POST',body:{name:file.name,mime:file.type,data}});state.uploadedPostImage=out.url;const current=state.content.posts.find(x=>x.id===state.editing.posts);if(current)current.image=out.url;},'圖片已上傳，請儲存內容',true);
  });
}

function readFile(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('無法讀取圖片'));reader.readAsDataURL(file);}); }

function renderSettings() {
  const s=state.content.settings;
  return `<section><p class="muted">網站設定</p><h1>協會與聯絡資訊</h1><form id="settings-form" class="panel"><div class="grid-2">${settingsFields.map(([name,label,type])=>field(name,label,s[name],type || 'text',type==='textarea'?'rows="4"':'')).join('')}</div><button class="btn" type="submit"${disabled()}>儲存網站設定</button></form></section>`;
}
function bindSettings() { host.querySelector('#settings-form')?.addEventListener('submit',event=>{event.preventDefault();const body=formObject(event.currentTarget);run(async()=>{state.content.settings=await api('/api/admin/settings',{method:'PUT',body});},'網站設定已更新');}); }

function ledgerEditor(item={}) {
  return `<form id="ledger-form" class="panel"><h2>${item.id?'編輯紀錄':'新增款項用途'}</h2><div class="grid-2">
    ${field('date','日期',item.date,'date','required')}
    <label class="field"><span>類型</span><select name="type"><option value="income"${selected(item.type,'income')}>收入</option><option value="expense"${selected(item.type,'expense')}>支出</option></select></label>
    ${field('category','項目分類',item.category,'text','required')} ${field('amount','金額',item.amount ?? 0,'number','min="0" step="1" required')}
    ${field('note','說明',item.note,'textarea','rows="3"')}
    <label class="field"><span>狀態</span><select name="status"><option value="draft"${selected(item.status || 'draft','draft')}>草稿</option><option value="published"${selected(item.status,'published')}>直接發布</option></select></label>
    <label class="field"><span><input name="isDemo" type="checkbox"${checked(item.isDemo)}> 示範資料</span></label>
  </div><button class="btn" type="submit"${disabled()}>儲存紀錄</button> <button class="btn btn-secondary" id="ledger-cancel" type="button">清除表單</button></form>`;
}
function renderLedger() {
  const current=state.content.ledger.find(x=>x.id===state.editing.ledger)||{};
  return `<section><p class="muted">資訊公開</p><h1>款項流向</h1><div class="notice">請只填寫經確認的正式資料。示範數字必須勾選「示範資料」，避免訪客誤認為實際捐款或支出。</div>${ledgerEditor(current)}<div class="panel"><div class="admin-table" tabindex="0"><table><thead><tr><th>日期</th><th>收支</th><th>項目</th><th>金額</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.content.ledger.map(x=>`<tr><td>${text(x.date)}</td><td>${x.type==='income'?'收入':'支出'}</td><td>${text(x.category)}</td><td>${Number(x.amount).toLocaleString('zh-TW')}</td><td>${statusBadge(x)}</td><td><button class="btn btn-secondary" data-edit-ledger="${text(x.id)}" type="button">編輯</button> <button class="btn btn-secondary" data-delete-ledger="${text(x.id)}" type="button">刪除</button></td></tr>`).join('')}</tbody></table></div></div></section>`;
}
function bindLedger() {
  host.querySelector('#ledger-form')?.addEventListener('submit',e=>{e.preventDefault();const body=formObject(e.currentTarget);body.amount=Number(body.amount);body.isDemo=new FormData(e.currentTarget).has('isDemo');const id=state.editing.ledger;run(async()=>{await api(`/api/admin/ledger${id?`/${id}`:''}`,{method:id?'PUT':'POST',body});state.editing.ledger=null;await loadContent();},'款項紀錄已儲存');});
  host.querySelector('#ledger-cancel')?.addEventListener('click',()=>{state.editing.ledger=null;render();});
  bindEditDelete('ledger');
}

function reportEditor(item={}) {
  return `<form id="reports-form" class="panel"><h2>${item.id?'編輯報告':'新增公開報告'}</h2><div class="grid-2">${field('title','報告名稱',item.title,'text','required')}${field('year','年度',item.year || new Date().getFullYear(),'number','min="1900" max="2200" required')}${field('url','報告連結',item.url,'url')}<label class="field"><span>狀態</span><select name="status"><option value="draft"${selected(item.status||'draft','draft')}>草稿</option><option value="published"${selected(item.status,'published')}>直接發布</option></select></label><label class="field"><span><input name="isDemo" type="checkbox"${checked(item.isDemo)}> 示範資料</span></label></div><button class="btn" type="submit"${disabled()}>儲存報告</button> <button class="btn btn-secondary" id="reports-cancel" type="button">清除表單</button></form>`;
}
function renderReports() {
  const current=state.content.reports.find(x=>x.id===state.editing.reports)||{};
  return `<section><p class="muted">資訊公開</p><h1>年度與成果報告</h1>${reportEditor(current)}<div class="panel"><div class="admin-table" tabindex="0"><table><thead><tr><th>年度</th><th>名稱</th><th>狀態</th><th>連結</th><th>操作</th></tr></thead><tbody>${state.content.reports.map(x=>`<tr><td>${text(x.year)}</td><td>${text(x.title)}</td><td>${statusBadge(x)}</td><td>${x.url?`<a href="${text(safeUrl(x.url))}" target="_blank" rel="noopener">查看</a>`:'待補'}</td><td><button class="btn btn-secondary" data-edit-reports="${text(x.id)}" type="button">編輯</button> <button class="btn btn-secondary" data-delete-reports="${text(x.id)}" type="button">刪除</button></td></tr>`).join('')}</tbody></table></div></div></section>`;
}
function bindReports() {
  host.querySelector('#reports-form')?.addEventListener('submit',e=>{e.preventDefault();const body=formObject(e.currentTarget);body.year=Number(body.year);body.isDemo=new FormData(e.currentTarget).has('isDemo');const id=state.editing.reports;run(async()=>{await api(`/api/admin/reports${id?`/${id}`:''}`,{method:id?'PUT':'POST',body});state.editing.reports=null;await loadContent();},'報告已儲存');});
  host.querySelector('#reports-cancel')?.addEventListener('click',()=>{state.editing.reports=null;render();}); bindEditDelete('reports');
}

function bindEditDelete(kind) {
  host.querySelectorAll(`[data-edit-${kind}]`).forEach(b=>b.addEventListener('click',()=>{state.editing[kind]=b.dataset[`edit${kind[0].toUpperCase()}${kind.slice(1)}`];render();}));
  host.querySelectorAll(`[data-delete-${kind}]`).forEach(b=>b.addEventListener('click',()=>{const id=b.dataset[`delete${kind[0].toUpperCase()}${kind.slice(1)}`];if(!window.confirm('確定刪除這筆資料？'))return;run(async()=>{await api(`/api/admin/${kind}/${id}`,{method:'DELETE'});await loadContent();},'資料已刪除');}));
}

function renderUsers() {
  if(state.user.role!=='admin') return '<section><p class="muted">操作人員</p><h1>帳號管理</h1><div class="notice">只有管理員可以查看及管理操作人員帳號。</div></section>';
  const current=state.users.find(x=>x.id===state.editing.users);
  return `<section><p class="muted">權限管理</p><h1>操作人員</h1><form id="users-form" class="panel"><h2>${current?'編輯帳號':'新增帳號'}</h2><div class="grid-2">${current?`<p class="field"><span>Email</span><strong>${text(current.email)}</strong></p>`:field('email','Email','','email','required')}${field('name','姓名',current?.name,'text','required')}<label class="field"><span>角色</span><select name="role"><option value="editor"${selected(current?.role,'editor')}>編輯者</option><option value="admin"${selected(current?.role,'admin')}>管理員</option></select></label>${field('password',current?'新密碼（留白則不變）':'密碼（至少 10 個字元）','','password',current?'autocomplete="new-password"':'autocomplete="new-password" minlength="10" required')}${current?`<label class="field"><span><input name="active" type="checkbox"${checked(current.active)}> 啟用帳號</span></label>`:''}</div><button class="btn" type="submit"${disabled()}>儲存帳號</button> <button class="btn btn-secondary" id="users-cancel" type="button">清除表單</button></form><div class="panel"><div class="admin-table" tabindex="0"><table><thead><tr><th>姓名</th><th>Email</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.users.map(x=>`<tr><td>${text(x.name)}</td><td>${text(x.email)}</td><td>${x.role==='admin'?'管理員':'編輯者'}</td><td><span class="badge">${x.active?'啟用':'停用'}</span></td><td><button class="btn btn-secondary" data-edit-users="${text(x.id)}" type="button">編輯</button></td></tr>`).join('')}</tbody></table></div></div></section>`;
}
function bindUsers() {
  if(state.user.role!=='admin')return;
  host.querySelector('#users-form')?.addEventListener('submit',e=>{e.preventDefault();const body=formObject(e.currentTarget);const id=state.editing.users;if(id){body.active=new FormData(e.currentTarget).has('active');if(!body.password)delete body.password;}run(async()=>{await api(`/api/admin/users${id?`/${id}`:''}`,{method:id?'PUT':'POST',body});state.editing.users=null;state.users=await api('/api/admin/users');},'帳號已儲存');});
  host.querySelector('#users-cancel')?.addEventListener('click',()=>{state.editing.users=null;render();});
  host.querySelectorAll('[data-edit-users]').forEach(b=>b.addEventListener('click',()=>{state.editing.users=b.dataset.editUsers;render();}));
}

function renderRegistrations(){return `<section><h1>活動報名名單</h1><p class="notice">目前僅接受示範活動。${staticDemo?'名單僅存在這個瀏覽器，不會跨裝置同步。':'未開放正式活動報名。'}</p><div class="admin-table"><table><thead><tr><th>活動</th><th>姓名</th><th>Email</th><th>人數</th><th>登記時間</th></tr></thead><tbody>${state.registrations.map(x=>`<tr><td>${text(x.eventTitle)}</td><td>${text(x.name)}</td><td>${text(x.email)}</td><td>${x.count}</td><td>${text(formatTime(x.createdAt))}</td></tr>`).join('')||'<tr><td colspan="5">尚無報名資料</td></tr>'}</tbody></table></div></section>`;}
function renderSubscribers() {
  return `<section><p class="muted">消息訂閱</p><h1>訂閱名單</h1><div class="panel"><button class="btn" id="export-subscribers" type="button">匯出 CSV</button><p class="muted">網站只保存訂閱同意與取消狀態，不會自動寄信。</p><div class="admin-table" tabindex="0"><table><thead><tr><th>Email</th><th>同意時間</th><th>狀態</th></tr></thead><tbody>${state.subscribers.map(x=>`<tr><td>${text(x.email)}</td><td>${text(formatTime(x.consentedAt))}</td><td><span class="badge">${x.active?'訂閱中':'已取消'}</span></td></tr>`).join('')||'<tr><td colspan="3">尚無訂閱資料</td></tr>'}</tbody></table></div></div></section>`;
}
function bindSubscribers() { host.querySelector('#export-subscribers')?.addEventListener('click',exportSubscribers); }
function csvCell(value) { let s=String(value??''); if(/^[\t\r ]*[=+\-@]/.test(s))s=`'${s}`; return `"${s.replaceAll('"','""')}"`; }
function exportSubscribers() { const rows=[['Email','同意時間','狀態'],...state.subscribers.map(x=>[x.email,x.consentedAt,x.active?'訂閱中':'已取消'])];const blob=new Blob([`\uFEFF${rows.map(r=>r.map(csvCell).join(',')).join('\n')}`],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mori-subscribers-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);toast('訂閱名單已匯出'); }

function renderAudit() {
  return `<section><p class="muted">稽核紀錄</p><h1>修改與修訂版本</h1><div class="panel"><div class="admin-table" tabindex="0"><table><thead><tr><th>時間</th><th>操作人員</th><th>動作</th><th>項目</th><th>修訂</th></tr></thead><tbody>${state.audit.map(x=>`<tr><td>${text(formatTime(x.time))}</td><td>${text(x.actor)}</td><td>${text(actionName(x.action))}</td><td>${text(x.kind||'—')} ${text(x.targetId||'')}</td><td>${x.kind==='posts'&&x.snapshot?`<details><summary>查看快照</summary><pre>${text(JSON.stringify(x.snapshot,null,2))}</pre><button class="btn btn-secondary" data-restore="${text(x.id)}" data-target="${text(x.targetId)}" type="button">還原此版本</button></details>`:'—'}</td></tr>`).join('')||'<tr><td colspan="5">尚無紀錄</td></tr>'}</tbody></table></div></div></section>`;
}
function bindAudit() { host.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',()=>{if(!window.confirm('確定將這篇內容還原為此版本？目前內容會保留在修改紀錄中。'))return;run(async()=>{await api(`/api/admin/posts/${b.dataset.target}/restore`,{method:'POST',body:{revisionId:b.dataset.restore}});await Promise.all([loadContent(),loadTabData('audit')]);},'內容已還原');})); }
function formatTime(value) { if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?String(value):new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short'}).format(d); }
function actionName(value) { return ({create:'新增',update:'更新',delete:'刪除',restore:'還原',login:'登入',logout:'登出',upload:'上傳'}[value]||value); }

import {api,esc,routeUrl,routeSearch,resolveLinks} from './shared.js';

const leaf='<svg viewBox="0 0 120 150" aria-hidden="true"><path d="M60 143V58M60 95C12 99 8 55 13 39c39 0 49 23 47 56ZM60 71c-3-39 21-57 48-59 4 31-11 58-48 59Z" fill="#73966a" stroke="#355b3c" stroke-width="4"/></svg>';

const posterPages=()=>`<section class="sapling-poster-pages" aria-label="小樹苗活動海報">
  <figure class="sapling-poster-page"><div class="sapling-poster-crop"><img src="/assets/sapling-poster.png" alt="森藏小樹苗活動海報第一頁：領一株小樹，種下希望" fetchpriority="high"></div><figcaption>小樹苗活動・領一株小樹，種下希望</figcaption></figure>
  <figure class="sapling-poster-page"><div class="sapling-poster-crop is-second"><img src="/assets/sapling-poster.png" alt="森藏小樹苗活動海報第二頁：羅漢松介紹、照顧指南與小樹苗的未來" loading="eager"></div><figcaption>羅漢松介紹・照顧指南・小樹苗的未來</figcaption></figure>
</section>`;

export async function saplingsPage(path){
  if(path==='/saplings/unsubscribe')return `<main id="main" class="sapling-page"><section class="sapling-section"><h1>取消小樹苗活動通知</h1><p>取消後，這筆登記不會列入後續邀請名單。</p><button class="btn" id="sapling-unsubscribe">確認取消通知</button><p role="status" id="sapling-unsubscribe-status"></p></section></main>`;

  let rows;try{rows=await api('/api/saplings/events');}catch{ return `<main id="main" class="sapling-page sapling-event-page">${posterPages()}<section class="sapling-section"><h1>小樹苗活動</h1><p>登記服務暫時忙碌，請稍候重新整理。你也可以先向現場工作人員了解活動與領取方式。</p><button class="btn" id="sapling-retry">重新載入活動資訊</button></section></main>`; }
  const event=path==='/saplings'?null:rows.find(x=>x.id===decodeURIComponent(path.slice('/saplings/'.length)));
  if(path!=='/saplings'&&!event)return '<main class="page-heading"><h1>找不到這場樹苗活動</h1><a href="/saplings">查看樹苗活動</a></main>';

  if(!event)return `<main id="main" class="sapling-page">
    <section class="sapling-hero"><div><span class="eyebrow">GROW A LITTLE HOPE</span><h1>領一株小樹，<br>種下希望。</h1><p>從家裡的一點綠，開始陪伴生命長大。和森藏一起種樹、種森林，為野生動物留下可以生活的棲地。</p><a class="btn" href="#sapling-events">找到這次活動 ↓</a></div><div class="sapling-art"><img src="/assets/forest-invitation.jpg" alt="森藏植樹活動紀錄" loading="eager">${leaf}<span>一棵小樹<br>一個更好的明天</span></div></section>
    <section class="sapling-section" id="sapling-events"><span class="eyebrow">MEET YOUR LITTLE TREE</span><h2>這一次，帶一棵小樹回家</h2><div class="sapling-events">${rows.map(e=>`<a class="sapling-event-card" href="/saplings/${esc(e.id)}"><span class="badge">樹苗活動</span><h3>${esc(e.title)}</h3><p>${esc(e.date)} · ${esc(e.time)}</p><p>${esc(e.location)}</p><span>${esc(e.species.join('、'))} · 查看活動與領取登記 ↗</span></a>`).join('')||'<p>新場次籌備中，歡迎透過 LINE 詢問。</p>'}</div></section>
    ${mission()}
    <section class="sapling-section sapling-qr"><h2>凹子底場次 QR Code</h2><p>掃描後可直接查看活動海報、活動資訊並完成領取登記。</p><img src="/assets/sapling-qr.svg" width="220" height="220" alt="凹子底小樹苗活動頁 QR Code"><a class="text-link" href="/assets/sapling-qr.svg" download="凹子底小樹苗活動QR.svg">下載 QR Code</a></section>
  </main>`;

  const closed=!event.registrationOpen||Date.now()>new Date(`${event.endDate||event.date}T${event.time?.match(/(?:–|-)\s*(\d{2}:\d{2})$/)?.[1]||'23:59'}:59+08:00`).getTime();
  return `<main id="main" class="sapling-page sapling-event-page">
    ${posterPages()}
    <section class="sapling-event-intro"><a href="/saplings" class="text-link">← 小樹苗活動</a><span class="eyebrow">EVENT INFORMATION</span><h1>${esc(event.title)}</h1><p>把一點綠帶回家，陪它慢慢長大。</p><a class="btn" href="#sapling-register">${closed?'查看登記狀態':'我要登記領樹苗'} ↓</a></section>
    <section class="sapling-section"><div class="sapling-facts"><div><span>活動日期</span><strong>${esc(event.date)}</strong><p>${esc(event.time)}</p></div><div><span>活動地點</span><strong>${esc(event.location)}</strong></div><div><span>本次小樹苗</span><strong>${esc(event.species.join('、'))}</strong><p>每筆登記一株，實際供應依現場公告</p></div></div><h2>從一棵小樹，開始改變世界</h2><p>${esc(event.description||'在森藏市集，把一株小樹帶回家。你可以留在身邊照顧，也可以自由參加未來的植樹與小樹苗回娘家活動，讓這段陪伴繼續生長。')}</p><div class="sapling-support"><h3>自由支持，讓更多小樹長大</h3><p>支持完全自由，不設定金額，也不是登記或領取的必要條件。本頁不提供線上付款；現場支持方式及核准資訊請洽工作人員。</p>${event.solicitationNumber?`<p>勸募字號：${esc(event.solicitationNumber)}<br>期間：${esc(event.solicitationPeriod)}</p>`:''}</div></section>
    <section class="sapling-section sapling-care"><span class="eyebrow">A LITTLE CARE, EVERY DAY</span><h2>一點陽光、一點水，<br>一起練習照顧生命。</h2><div class="sapling-care-grid">${[['01','光線','放在明亮、通風的地方，先避開強烈日曬，讓小苗適應新環境。'],['02','澆水','觀察土壤濕度，保持適度濕潤。盆底要能排水，避免長時間積水。'],['03','土壤','使用排水良好的介質。若領取紙盆，請先確認材質與現場換盆建議。'],['04','換盆','等根系長大，再換到合適的盆器。照顧方式依實際樹種與苗況調整。']].map(([n,t,d])=>`<article><span>${n}</span><h3>${t}</h3><p>${d}</p></article>`).join('')}</div>${event.care?`<p>${esc(event.care)}</p>`:''}<a class="text-link small" href="https://kmweb.moa.gov.tw/knowledge_view.php?id=18192" target="_blank" rel="noopener noreferrer">羅漢松照顧參考：農業知識入口網 ↗</a></section>
    <section class="sapling-section sapling-registration" id="sapling-register"><div><span class="eyebrow">LET’S GROW TOGETHER</span><h2>認識你，也記住<br>這棵小樹的開始。</h2><p>填寫約一分鐘。合照與未來通知都可以自由選擇。</p><p>登記不代表已完成現場領取，請向工作人員確認樹苗供應。</p></div><div>${closed?'<p class="notice">這場活動目前未開放登記。</p>':registrationForm(event)}</div></section>
    ${mission()}
    <a class="sapling-sticky btn" href="#sapling-register">${closed?'查看登記狀態':'登記領一株小樹'} ↓</a>
  </main>`;
}

function registrationForm(event){return `<form id="sapling-form" data-event="${esc(event.id)}"><label class="field">你的名字<input name="name" autocomplete="name" maxlength="100" required></label><label class="field">Email<input name="email" type="email" autocomplete="email" maxlength="254" required><small>用於辨識本次登記，以及你同意接收的後續活動聯繫</small></label><label class="field">手機（選填）<input name="phone" type="tel" autocomplete="tel" maxlength="30"></label><label class="field">這次領取的小樹苗<select name="species">${event.species.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><label class="field">和小樹的合照（選填）<input type="file" id="sapling-photo" accept="image/jpeg,image/png,image/webp"><small>JPEG、PNG 或 WebP。照片會縮小並移除原始定位資訊，只供協會內部活動紀錄，未經同意不會公開。</small></label><div id="sapling-photo-preview"></div><label class="check"><input name="privacyConsent" type="checkbox" required>我同意協會為本次樹苗活動處理上述資料；詳見<a href="/privacy">隱私說明</a>。</label><label class="check"><input name="notificationConsent" type="checkbox">我願意收到植樹、市集與「小樹苗回娘家」活動邀請，可隨時取消。</label><p class="small muted">未勾選活動通知也可以完成登記。</p><button class="btn" type="submit">送出登記 ↗</button><p class="form-feedback" role="status" aria-live="polite"></p></form>`;}

function mission(){return `<section class="sapling-section sapling-mission"><span class="eyebrow">A HOME FOR EVERY LIFE</span><h2>小樹的未來，<br>由你決定。</h2><div class="sapling-care-grid"><article><h3>留在身邊，陪伴長大</h3><p>在家或庭院照顧，享受與一棵小樹一起成長的日常。</p></article><article><h3>回娘家，一起種森林</h3><p>未來有合適場域與植樹計畫時，我們會邀請願意收到通知的朋友再聚。參與完全自由。</p></article></div><p>我們希望讓森林成為野生動物安心生活的家。選對樹、種對地方，並持續照顧，是每場植樹活動的重要工作。</p></section>`;}

const canvasBlob=(canvas,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('照片處理失敗，請重新選擇照片。')),'image/jpeg',quality));
const blobDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('照片讀取失敗，請重新選擇照片。'));reader.readAsDataURL(blob);});
async function preparePhoto(file){
  const bitmap=await createImageBitmap(file);
  try{
    for(const size of [960,760,600]){
      const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.78,.65,.52]){const blob=await canvasBlob(canvas,quality);if(blob.size<=300*1024){const data=await blobDataUrl(blob);return {photo:{mime:'image/jpeg',data:data.split(',')[1]},preview:data};}}
    }
    throw new Error('照片壓縮後仍超過 300KB，請改選較小的照片。');
  }finally{bitmap.close();}
}

export function bindSaplings(root){
  root.querySelector('#sapling-retry')?.addEventListener('click',()=>location.reload());
  root.querySelector('#sapling-unsubscribe')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;const out=root.querySelector('#sapling-unsubscribe-status');try{await api('/api/saplings/unsubscribe',{method:'POST',body:{token:new URLSearchParams(routeSearch()).get('token')}});out.textContent='已取消後續活動通知。';}catch(err){out.textContent=err.message;e.currentTarget.disabled=false;}});
  const form=root.querySelector('#sapling-form');if(!form)return;let photo=null,processing=false;
  const output=form.querySelector('.form-feedback'),submit=form.querySelector('button[type=submit]');
  form.querySelector('#sapling-photo').addEventListener('change',async e=>{photo=null;const preview=form.querySelector('#sapling-photo-preview');preview.innerHTML='';const file=e.target.files[0];if(!file)return;processing=true;submit.disabled=true;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('請選擇 15MB 以內的 JPEG、PNG 或 WebP。');const prepared=await preparePhoto(file);photo=prepared.photo;preview.innerHTML=`<img src="${prepared.preview}" alt="待上傳的小樹合照"><button type="button" class="btn-secondary">移除照片</button>`;preview.querySelector('button').onclick=()=>{photo=null;e.target.value='';preview.innerHTML='';};output.textContent='照片已準備好。';}catch(err){photo=null;preview.innerHTML='';output.textContent=err.message;e.target.value='';}finally{processing=false;submit.disabled=false;}});
  form.addEventListener('submit',async e=>{e.preventDefault();if(processing)return;submit.disabled=true;output.textContent='正在保存登記…';try{const res=await api('/api/saplings/registrations',{method:'POST',body:{eventId:form.dataset.event,name:form.elements.name.value,email:form.elements.email.value,phone:form.elements.phone.value,species:form.elements.species.value,quantity:1,privacyConsent:form.elements.privacyConsent.checked,notificationConsent:form.elements.notificationConsent.checked,photo}});const cancel=routeUrl(`/saplings/unsubscribe?token=${encodeURIComponent(res.unsubscribeToken)}`);form.innerHTML=`<div class="sapling-receipt" role="status"><span class="eyebrow">${res.duplicate?'ALREADY REGISTERED':'THANK YOU FOR CARING'}</span><h3>${res.duplicate?'這個 Email 已完成本場登記':'登記完成'}</h3><p>${res.duplicate?'請出示原登記資訊，向現場工作人員確認。':'請出示此畫面，向現場工作人員確認領取。'}</p><p class="small">登記編號：${esc(res.id)}</p><p>本次登記不會產生線上付款。</p>${res.unsubscribeToken?`<a href="${esc(cancel)}">保存此連結，可取消未來活動通知</a>`:'如需調整通知意願，請透過 LINE 聯絡協會。'}</div>`;resolveLinks(form);}catch(err){output.textContent=err.message;submit.disabled=false;}});
}

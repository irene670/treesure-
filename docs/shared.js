export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const staticDemo = document.documentElement.dataset.staticDemo === 'true';
export const basePath = document.documentElement.dataset.basePath || '';
export function routePath() {
  if (!staticDemo) return location.pathname;
  const route = new URLSearchParams(location.search).get('page') || '/';
  return new URL(route.startsWith('/') ? route : '/', location.origin).pathname;
}
export function routeSearch() {
  if (!staticDemo) return location.search;
  return new URL(new URLSearchParams(location.search).get('page') || '/', location.origin).search;
}
export function routeUrl(path) {
  return staticDemo ? `${basePath}/${path === '/' ? '' : `?page=${encodeURIComponent(path)}`}` : path;
}
export function resolveLinks(element) {
  if (!staticDemo) return;
  element.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith(`${basePath}/`)) link.href = routeUrl(href);
  });
  element.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (src.startsWith('/') && !src.startsWith('//') && !src.startsWith(`${basePath}/`)) img.src = `${basePath}${src}`;
  });
}
export function safeUrl(value, fallback = '#') {
  try { const input = String(value); const url = new URL(basePath && input.startsWith('/') && !input.startsWith('//') ? `${basePath}${input}` : input, location.origin); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : fallback; } catch { return fallback; }
}
export function safeImageUrl(value) {
  return staticDemo && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) ? value : safeUrl(value);
}
export async function api(path, options = {}) {
  if (staticDemo) return (await import('./pages-demo.js?v=baa6bb9d4fc4')).demoApi(path, options);
  const init = {...options, headers:{...options.headers}};
  if (init.body && typeof init.body !== 'string') { init.body=JSON.stringify(init.body); init.headers['Content-Type']='application/json'; }
  const res=await fetch(path, init); const data=await res.json();
  if (!res.ok) throw new Error(data.error || '操作未完成，請稍後再試');
  return data;
}
let timer;
export function toast(message) { const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('visible'); clearTimeout(timer); timer=setTimeout(()=>el.classList.remove('visible'),4000); }

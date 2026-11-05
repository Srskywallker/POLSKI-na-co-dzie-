// Service worker do PWA: o app abre sem internet.
// Página, CSS e JS vêm da rede quando há conexão (para pegar atualizações) e do cache quando não há.
// O áudio (audio/*.json) e os ícones vêm do cache depois do primeiro download.
// A versão abaixo é gravada por ferramentas/montar.py a partir do áudio: áudio novo troca o cache de todos.
const CACHE = "polski-ae13d96a4e";
const BASE = ["./", "estilo.css", "dados.js", "app.js", "manifest.json", "icones/icone-192.png", "icones/icone-512.png", "icones/icone-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const guardar = (chave, r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(chave, copia)); } return r; };

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (/\/(audio|icones)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(salvo => salvo || fetch(req).then(r => guardar(req, r))));
    return;
  }
  const chave = req.mode === "navigate" ? "./" : req;
  e.respondWith(fetch(req).then(r => guardar(chave, r)).catch(() => caches.match(chave)));
});

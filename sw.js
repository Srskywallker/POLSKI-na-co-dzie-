// Service worker do PWA: o app abre sem internet.
// O index vem da rede quando há conexão (para pegar atualizações) e do cache quando não há.
// O áudio das lições (audio/*.json) e os ícones vêm do cache depois do primeiro download.
// Ao mudar o áudio de uma lição já publicada, troque a versão abaixo para quem já baixou receber o novo.
const CACHE = "polski-v1";
const BASE = ["./", "manifest.json", "icones/icone-192.png", "icones/icone-512.png", "icones/icone-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req)
      .then(r => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put("./", copia)); } return r; })
      .catch(() => caches.match("./")));
    return;
  }
  e.respondWith(caches.match(req).then(salvo => salvo || fetch(req).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return r;
  })));
});

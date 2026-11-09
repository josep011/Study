// Study: funciona sem internet e mostra as notificações de revisão.
// Ao publicar uma versão nova, mude o número abaixo.
const CACHE = "study-6";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./favicon-32.png", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("./index.html"))));
});

// ---------- dados que o app deixa guardados para cá (nomes e datas das revisões) ----------
const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const days = (a, b) => { const u = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((u(b) - u(a)) / 864e5); };
function db(fn) {
  return new Promise(res => {
    const rq = indexedDB.open("revisoes", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
    rq.onsuccess = () => fn(rq.result, res);
    rq.onerror = () => res(null);
  });
}
const getState = () => db((d, res) => { const g = d.transaction("kv").objectStore("kv").get("state"); g.onsuccess = () => res(g.result); g.onerror = () => res(null); });
const putState = st => db((d, res) => { const tx = d.transaction("kv", "readwrite"); tx.objectStore("kv").put(st, "state"); tx.oncomplete = () => res(); tx.onerror = () => res(); });

// Monta a mensagem: quantas revisões e por onde começar (o assunto mais perto de ser esquecido).
async function message() {
  const st = await getState(), T = today();
  const items = ((st && st.items) || []).filter(i => i && i.next && i.next <= T);
  if (!items.length) return null;
  const chance = i => Math.pow(1 + 19 / 81 * Math.max(0, days(i.last || T, T)) / (i.s || 1), -0.5);
  items.sort((a, b) => chance(a) - chance(b));
  const n = items.length;
  return { title: "Hora de revisar", body: `Você tem ${n} ${n === 1 ? "revisão" : "revisões"} hoje. Comece por: ${items[0].n}` };
}
const show = (title, body) => self.registration.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag: "study-dia", renotify: true, data: { url: "./" } });

// Tocar na notificação abre o app (ou traz para frente se já estiver aberto).
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});

// Chrome/Edge com o app instalado acordam o app em segundo plano (mais ou menos uma vez por dia).
// Ele confere: avisa uma vez por dia, entre 8h e 22h, se houver revisão.
self.addEventListener("periodicsync", e => {
  if (e.tag !== "revisoes-lembrete") return;
  e.waitUntil((async () => {
    const st = await getState();
    if (!st || !st.remind || !st.remind.on || st.remind.last === today()) return;
    const hr = new Date().getHours(); if (hr < 8 || hr >= 22) return;
    const m = await message(); if (!m) return;
    await show(m.title, m.body);
    st.remind.last = today(); await putState(st);
  })());
});

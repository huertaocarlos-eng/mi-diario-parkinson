/* Mi Diario Parkinson — backend de hosting + notificaciones push.
   - Sirve la PWA (carpeta ./public) por el mismo origen (sin mixed-content).
   - Web Push con claves VAPID (se generan solas la primera vez).
   - Cada cliente manda su "agenda" del día (tomas/ejercicio/dormir) y el
     servidor envía la notificación a la hora exacta, aunque la app esté cerrada.
   Sin base de datos: persiste en data.json y vapid.json. Todo local. */
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

const DIR = __dirname;
const PORT = process.env.PORT || 8080;
const VAPID_FILE = path.join(DIR, 'vapid.json');
const DATA_FILE = path.join(DIR, 'data.json');

/* ---- VAPID (identidad del servidor para push) ---- */
let vapid;
if (fs.existsSync(VAPID_FILE)) {
  vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
} else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid, null, 2));
  console.log('VAPID keys generadas en', VAPID_FILE);
}
webpush.setVapidDetails('mailto:huerta.o.carlos@gmail.com', vapid.publicKey, vapid.privateKey);

/* ---- almacenamiento simple en archivo ---- */
function cargarData() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { return { subs: {} }; } }
function guardarData(d) { try { fs.writeFileSync(DATA_FILE, JSON.stringify(d)); } catch (e) { console.error('no pude guardar data', e.message); } }
let data = cargarData();

/* ---- app ---- */
const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(DIR, 'public')));

app.get('/api/vapidPublicKey', (req, res) => res.json({ key: vapid.publicKey }));

app.post('/api/subscribe', (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'sin subscription' });
  data.subs[sub.endpoint] = data.subs[sub.endpoint] || { sub, events: [] };
  data.subs[sub.endpoint].sub = sub;
  guardarData(data);
  res.json({ ok: true });
});

/* Reemplaza la agenda del día para esa suscripcion.
   events: [{ ts:<ms epoch>, title, body }] */
app.post('/api/schedule', (req, res) => {
  const { subscription, events } = req.body || {};
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'sin subscription' });
  if (!Array.isArray(events)) return res.status(400).json({ error: 'events debe ser lista' });
  data.subs[subscription.endpoint] = {
    sub: subscription,
    events: events.map((e, i) => ({ id: String(e.ts) + '-' + i, ts: +e.ts, title: e.title || 'Mi Diario Parkinson', body: e.body || '', sent: false }))
  };
  guardarData(data);
  res.json({ ok: true, programadas: events.length });
});

app.post('/api/test', async (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub) return res.status(400).json({ error: 'sin subscription' });
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title: 'Mi Diario Parkinson', body: '✅ Notificaciones funcionando' }));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, subs: Object.keys(data.subs).length }));

/* ---- programador: revisa cada 20s y envía lo vencido ---- */
async function tick() {
  const ahora = Date.now();
  let cambio = false;
  for (const ep of Object.keys(data.subs)) {
    const entry = data.subs[ep];
    for (const ev of entry.events) {
      if (!ev.sent && ev.ts <= ahora && ahora - ev.ts < 6 * 3600 * 1000) {
        try {
          await webpush.sendNotification(entry.sub, JSON.stringify({ title: ev.title, body: ev.body }));
          ev.sent = true; cambio = true;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) { delete data.subs[ep]; cambio = true; break; }
        }
      }
    }
    if (entry.events) {
      const antes = entry.events.length;
      entry.events = entry.events.filter(ev => ahora - ev.ts < 24 * 3600 * 1000); // poda > 24h
      if (entry.events.length !== antes) cambio = true;
    }
  }
  if (cambio) guardarData(data);
}
setInterval(tick, 20000);

app.listen(PORT, '0.0.0.0', () => console.log('Diario push escuchando en :' + PORT));

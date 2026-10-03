const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { TikTokLiveClient, EventType, GiftStreakTracker } = require('piratetok-live-js');

const PORT = Number(process.env.PORT || 8081);
const HOST = '0.0.0.0';
const USERNAME = (process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim();
const ROSE_ID = 5655;

if (!USERNAME) console.error('ERRO: defina TIKTOK_USERNAME nas Environment Variables.');

const publicDir = __dirname;
const clients = new Set();
let tiktokClient = null;
let reconnectTimer = null;
let connected = false;
const streaks = new GiftStreakTracker();

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function logGift(data) {
  const gift = data.gift || {};
  const user = data.user || {};
  const name = String(gift.name || '').trim();
  const id = Number(gift.id ?? gift.giftId ?? 0);
  const diamonds = Number(gift.diamondCount ?? 0);
  const repeat = Math.max(1, Number(data.repeatCount ?? data.repeat_count ?? 1));

  console.log(`🎁 PRESENTE | ${user.uniqueId || user.nickname || '?'} | ${name} | ID=${id} | moedas=${diamonds} | x${repeat}`);

  // Rose = Lula. Rosa (10 moedas) = Flávio.
  let candidate = null;
  if (id === ROSE_ID || name.toLowerCase() === 'rose') candidate = 'lula';
  else if (name.toLowerCase() === 'rosa') candidate = 'flavio';
  if (!candidate) return;

  // Prevent double-counting streak updates when the helper provides a final delta.
  let votes = Math.max(1, diamonds) * repeat;
  try {
    const s = streaks.process(data);
    if (s && Number.isFinite(s.eventGiftCount)) votes = Math.max(1, diamonds) * Math.max(1, Number(s.eventGiftCount));
    if (s && s.isFinal === false && repeat > 1) return;
  } catch (_) {}

  broadcast({
    type: 'gift', candidate, votes,
    giftName: name, giftId: id, coins: diamonds,
    repeatCount: repeat,
    user: user.uniqueId || user.nickname || '?',
    icon: gift.pictureUrl || gift.iconUrl || gift.picture || null
  });
}

async function connectTikTok() {
  if (!USERNAME) return;
  if (tiktokClient) {
    try { tiktokClient.disconnect?.(); } catch (_) {}
  }
  console.log(`Tentando conectar ao TikTok LIVE de @${USERNAME} usando PirateTok...`);
  try {
    tiktokClient = new TikTokLiveClient(USERNAME);
    tiktokClient.on(EventType.connected, (data) => {
      connected = true;
      console.log(`🟢 TIKTOK CONECTADO | @${USERNAME} | room=${data?.roomId || data?.room_id || '?'}`);
      broadcast({ type: 'status', connected: true });
    });
    tiktokClient.on(EventType.gift, logGift);
    tiktokClient.on(EventType.liveEnded, () => {
      connected = false;
      console.log('🔴 LIVE encerrada. Tentando novamente em 15 segundos...');
      broadcast({ type: 'status', connected: false });
      scheduleReconnect(15000);
    });
    tiktokClient.on(EventType.error, (err) => console.error('Erro PirateTok:', err));
    tiktokClient.on(EventType.reconnecting, (data) => console.log('Reconectando TikTok:', data));
    await tiktokClient.connect();
  } catch (err) {
    connected = false;
    console.error('❌ Falha ao conectar ao TikTok:', err?.message || err);
    broadcast({ type: 'status', connected: false, error: String(err?.message || err) });
    scheduleReconnect(30000);
  }
}

function scheduleReconnect(ms) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectTikTok(); }, ms);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const safe = path.normalize(file).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(publicDir, safe);
  if (!filePath.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'});
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Overlay conectado.');
  ws.send(JSON.stringify({ type: 'status', connected }));
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em ${HOST}:${PORT}`);
  if (USERNAME) connectTikTok();
});

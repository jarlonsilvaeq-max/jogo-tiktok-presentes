import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TikTokLiveClient, EventType } from 'piratetok-live-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 10000);
const username = (process.env.TIKTOK_USERNAME || '085gameplayers').replace(/^@/, '');

const gifts = {
  5655: { candidate: 'lula', votes: 1, name: 'Rose' },
  6064: { candidate: 'flavio', votes: 1, name: 'GG' },
  5780: { candidate: 'lula', votes: 20, name: 'Bouquet Flower' },
  5879: { candidate: 'flavio', votes: 20, name: 'Doughnut' }
};

const server = http.createServer((req, res) => {
  let requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';
  const filePath = path.join(publicDir, requestPath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(err.code === 'ENOENT' ? 'Arquivo não encontrado' : 'Erro interno');
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'status', connected: true }));
});

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(message);
  }
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor web ativo na porta ${port}`);
  console.log(`TikTok: @${username}`);
});

const client = new TikTokLiveClient(username);

client.on(EventType.gift, (data) => {
  const gift = data?.gift || {};
  const id = Number(gift.id);
  const rule = gifts[id];
  if (!rule) return;

  const repeat = Math.max(1, Number(data?.repeatCount || 1));
  const user = data?.user?.uniqueId || data?.user?.nickname || 'usuário';
  const icon = gift.icon?.url || gift.image?.url || '';

  broadcast({
    type: 'gift',
    giftId: id,
    giftName: rule.name,
    candidate: rule.candidate,
    votes: rule.votes * repeat,
    coins: Number(gift.diamondCount || gift.diamond_count || 0) * repeat,
    user,
    icon
  });

  console.log(`${user}: ${rule.name} x${repeat} -> ${rule.votes * repeat} voto(s)`);
});

async function connectTikTok() {
  try {
    console.log(`Conectando ao TikTok @${username}...`);
    await client.connect();
    console.log('Conectado ao TikTok LIVE.');
  } catch (err) {
    console.error('Erro ao conectar ao TikTok:', err?.stack || err);
    setTimeout(connectTikTok, 5000);
  }
}

connectTikTok();

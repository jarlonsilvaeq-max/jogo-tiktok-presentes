const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} = require('tiktok-live-connector');

const PORT = Number(process.env.PORT || 8081);
const HOST = '0.0.0.0';
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || '').trim().replace(/^@/, '');
const ROSE_ID = 5655;

if (!TIKTOK_USERNAME) {
  console.error('ERRO: defina TIKTOK_USERNAME nas Environment Variables do Render.');
  process.exit(1);
}

const publicDir = __dirname;
const clients = new Set();

const server = http.createServer((req, res) => {
  let pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/') pathname = '/index.html';

  const file = path.join(publicDir, pathname);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  const ext = path.extname(file);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  clients.add(ws);
  console.log('Overlay conectado.');
  ws.send(JSON.stringify({ type: 'status', status: 'server_online', username: TIKTOK_USERNAME }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em ${HOST}:${PORT}`);
  console.log(`TikTok configurado: @${TIKTOK_USERNAME}`);
  connectTikTok();
});

let connection = null;
let connecting = false;

async function connectTikTok() {
  if (connecting) return;
  connecting = true;

  try {
    if (connection) {
      try { await connection.disconnect(); } catch (_) {}
    }

    console.log(`Tentando localizar a LIVE de @${TIKTOK_USERNAME}...`);
    connection = new TikTokLiveConnection(TIKTOK_USERNAME, {
      processInitialData: false,
      enableExtendedGiftInfo: true,
      fetchRoomInfoOnConnect: true,
      connectWithUniqueId: true,
      requestPollingIntervalMs: 2000
    });

    connection.on(ControlEvent.CONNECTED, state => {
      console.log(`TIKTOK CONECTADO! roomId=${state.roomId}`);
      broadcast({ type: 'status', status: 'tiktok_connected', roomId: state.roomId });
    });

    connection.on(ControlEvent.DISCONNECTED, () => {
      console.log('TikTok desconectado.');
      broadcast({ type: 'status', status: 'tiktok_disconnected' });
    });

    connection.on(ControlEvent.ERROR, err => {
      console.error('Erro do TikTok:', err?.message || err);
    });

    connection.on(WebcastEvent.CHAT, data => {
      const user = data.user?.uniqueId || data.user?.nickname || 'usuario';
      console.log(`Comentário de @${user}: ${data.comment || ''}`);
    });

    connection.on(WebcastEvent.GIFT, data => {
      const giftId = Number(data.giftId || data.extendedGiftInfo?.giftId || 0);
      const giftName = String(
        data.giftDetails?.giftName ||
        data.extendedGiftInfo?.name ||
        data.giftName ||
        ''
      ).trim();
      const lowerName = giftName.toLowerCase();
      const coins = Number(
        data.giftDetails?.diamondCount ??
        data.extendedGiftInfo?.diamondCount ??
        data.diamondCount ??
        0
      );
      const repeat = Math.max(1, Number(data.repeatCount || 1));
      const repeatEnd = data.repeatEnd;
      const user = data.user?.uniqueId || data.user?.nickname || 'usuario';
      const icon = data.extendedGiftInfo?.image?.url || data.giftPictureUrl || '';

      console.log(`PRESENTE: @${user} | id=${giftId} | nome=${giftName || '(sem nome)'} | moedas=${coins} | repeticoes=${repeat} | repeatEnd=${repeatEnd}`);

      // Gifts streakáveis emitem eventos intermediários. Só processamos o final.
      if (data.giftDetails?.giftType === 1 && repeatEnd === false) return;

      let candidate = null;
      if (giftId === ROSE_ID || lowerName === 'rose') {
        candidate = 'lula';
      } else if (lowerName === 'rosa') {
        candidate = 'flavio';
      }

      if (!candidate) return;

      const votes = Math.max(1, coins) * repeat;
      console.log(`VOTO: ${candidate} +${votes} | presente=${giftName || giftId}`);

      broadcast({
        type: 'gift',
        candidate,
        votes,
        giftId,
        giftName: giftName || String(giftId),
        coins,
        repeatCount: repeat,
        user,
        icon
      });
    });

    // Primeiro diagnóstico explícito.
    try {
      const live = await connection.fetchIsLive();
      console.log(`TikTok fetchIsLive(): ${live}`);
    } catch (err) {
      console.error('Não foi possível consultar o status da LIVE:', err?.message || err);
    }

    const state = await connection.connect();
    console.log(`Conexão estabelecida com @${TIKTOK_USERNAME}. roomId=${state.roomId}`);
    broadcast({ type: 'status', status: 'tiktok_connected', roomId: state.roomId });
  } catch (err) {
    console.error(`Falha ao conectar @${TIKTOK_USERNAME}:`, err?.message || err);
    broadcast({ type: 'status', status: 'tiktok_offline', message: err?.message || String(err) });
    console.log('Nova tentativa em 30 segundos...');
    setTimeout(connectTikTok, 30000);
  } finally {
    connecting = false;
  }
}

const http=require('http'),fs=require('fs'),WebSocket=require('ws');
const {TikTokLiveConnection,WebcastEvent}=require('tiktok-live-connector');
const PORT=Number(process.env.PORT||8081); const USER=(process.env.TIKTOK_USERNAME||'SEU_USUARIO').replace(/^@/,'');
// Presentes comuns e espelhados por valor:
// Lula: Rose (1) + Rosa (10)
// Flávio Bolsonaro: GG (1) + Friendship Necklace (10)
const GIFT_IDS={ROSE:5655,GG:8286,ROSA:8913,FRIENDSHIP:9947};
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
const server=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync('./index.html'))}else{res.writeHead(404);res.end('404')}});
const wss=new WebSocket.Server({server});
function send(x){const m=JSON.stringify(x);wss.clients.forEach(c=>{if(c.readyState===1)c.send(m)})}
wss.on('connection',()=>console.log('Overlay conectado.'));
server.listen(PORT,'0.0.0.0',()=>console.log('Servidor rodando na porta '+PORT));
async function main(){if(USER==='SEU_USUARIO'){console.log('Defina TIKTOK_USERNAME antes de iniciar.');return}
 const c=new TikTokLiveConnection(USER,{processInitialData:false});
 c.on(WebcastEvent.GIFT,d=>{
   const id=Number(d.giftId||d.gift?.gift_id||d.extendedGiftInfo?.id||0); const name=norm(d.giftName||d.extendedGiftInfo?.name||d.describe);
   const coins=Number(d.diamondCount||d.extendedGiftInfo?.diamond_count||0); const repeat=Number(d.repeatCount||d.gift?.repeat_count||1); const repeatEnd=Boolean(d.repeatEnd ?? d.gift?.repeat_end ?? true);
   if(d.giftType===1 && !repeatEnd) return;
   const pretty=d.giftName||d.extendedGiftInfo?.name||name;
   console.log(`PRESENTE | id=${id} | nome=${pretty} | moedas=${coins} | x${repeat}`);
   let candidate=null;
   if(id===GIFT_IDS.ROSE || id===GIFT_IDS.ROSA || name==='rose' || name==='rosa') candidate='lula';
   else if(id===GIFT_IDS.GG || id===GIFT_IDS.FRIENDSHIP || name==='gg' || name==='friendship necklace' || name==='colar da amizade') candidate='flavio';
   if(!candidate) return;
   const votes=Math.max(1,coins)*Math.max(1,repeat);
   send({type:'gift',candidate,votes,giftName:pretty,coins:coins*repeat,user:d.user?.uniqueId||'usuário',icon:d.giftPictureUrl||d.extendedGiftInfo?.icon?.url_list?.[0]||d.extendedGiftInfo?.image?.url_list?.[0]||''});
 });
 try{await c.connect();console.log('TikTok LIVE conectado: @'+USER)}catch(e){console.error('Falha ao conectar:',e.message)}
} main();

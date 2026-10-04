import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

import {
  TikTokLiveClient,
  EventType,
  GiftStreakTracker
} from "piratetok-live-js";


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const PORT = Number(process.env.PORT || 10000);

/*
   No Render, coloque no Environment:
   TIKTOK_USERNAME=085.game.players

   Se não existir, usamos este valor.
*/
const TIKTOK_USERNAME =
  process.env.TIKTOK_USERNAME ||
  "085.game.players";


/* =========================================================
   CAMINHO DA PÁGINA
========================================================= */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const PUBLIC_DIR =
  path.join(__dirname, "public");


/* =========================================================
   SERVIDOR HTTP
========================================================= */

const server =
  http.createServer((req, res) => {

    let requestPath =
      req.url?.split("?")[0] || "/";


    if(requestPath === "/"){
      requestPath = "/index.html";
    }


    const filePath =
      path.normalize(
        path.join(
          PUBLIC_DIR,
          requestPath
        )
      );


    /*
       Impede acesso fora da pasta public.
    */

    if(
      !filePath.startsWith(
        PUBLIC_DIR
      )
    ){

      res.writeHead(403);
      res.end("Forbidden");
      return;

    }


    fs.readFile(
      filePath,
      (error, data) => {

        if(error){

          res.writeHead(404, {
            "Content-Type":
              "text/plain; charset=utf-8"
          });

          res.end("Arquivo não encontrado.");
          return;

        }


        const ext =
          path.extname(filePath)
            .toLowerCase();


        const types = {

          ".html":
            "text/html; charset=utf-8",

          ".css":
            "text/css; charset=utf-8",

          ".js":
            "application/javascript; charset=utf-8",

          ".json":
            "application/json; charset=utf-8",

          ".png":
            "image/png",

          ".jpg":
            "image/jpeg",

          ".jpeg":
            "image/jpeg",

          ".webp":
            "image/webp",

          ".svg":
            "image/svg+xml"

        };


        res.writeHead(200, {
          "Content-Type":
            types[ext] ||
            "application/octet-stream"
        });


        res.end(data);

      }
    );

  });


/* =========================================================
   WEBSOCKET
========================================================= */

const wss =
  new WebSocketServer({
    server
  });


const clients =
  new Set();


wss.on(
  "connection",
  (socket) => {

    clients.add(socket);


    console.log(
      "[WS] Jogo conectado. Total:",
      clients.size
    );


    socket.send(
      JSON.stringify({
        type:"status",
        connected:true
      })
    );


    socket.on(
      "close",
      () => {

        clients.delete(socket);

        console.log(
          "[WS] Jogo desconectado. Total:",
          clients.size
        );

      }
    );

  }
);


/* =========================================================
   ENVIAR PARA O JOGO
========================================================= */

function broadcast(data){

  const message =
    JSON.stringify(data);


  for(
    const socket of clients
  ){

    if(
      socket.readyState === 1
    ){

      try{

        socket.send(message);

      }catch(error){

        console.error(
          "[WS] Erro ao enviar:",
          error
        );

      }

    }

  }

}


/* =========================================================
   PRESENTES
========================================================= */

const GIFTS = {

  rose:{

    ids:[
      5655
    ],

    names:[
      "rose"
    ],

    candidate:
      "lula",

    votes:
      1,

    label:
      "Rose"

  },


  gg:{

    ids:[
      6064
    ],

    names:[
      "gg"
    ],

    candidate:
      "flavio",

    votes:
      1,

    label:
      "GG"

  },


  bouquet:{

    ids:[
      5780
    ],

    names:[
      "bouquet flower",
      "bouquetflower",
      "bouquet"
    ],

    candidate:
      "lula",

    votes:
      20,

    label:
      "Bouquet Flower"

  },


  doughnut:{

    ids:[
      5879
    ],

    names:[
      "doughnut",
      "donut"
    ],

    candidate:
      "flavio",

    votes:
      20,

    label:
      "Doughnut"

  }

};


/* =========================================================
   NORMALIZAR TEXTO
========================================================= */

function normalize(value){

  if(
    value === undefined ||
    value === null
  ){

    return "";

  }


  return String(value)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );

}


/* =========================================================
   IDENTIFICAR PRESENTE
========================================================= */

function identifyGift(data){

  const gift =
    data?.gift || {};


  /*
     PirateTok normalmente coloca
     as informações do presente
     dentro de data.gift.
  */

  const idValues = [

    gift.id,
    gift.giftId,

    data?.giftId,
    data?.gift_id,
    data?.id

  ];


  let id = 0;


  for(
    const value of idValues
  ){

    const number =
      Number(value);


    if(
      Number.isFinite(number) &&
      number > 0
    ){

      id = number;
      break;

    }

  }


  const nameValues = [

    gift.name,
    gift.giftName,

    data?.giftName,
    data?.gift_name,
    data?.name

  ];


  let name = "";


  for(
    const value of nameValues
  ){

    const normalized =
      normalize(value);


    if(normalized){

      name = normalized;
      break;

    }

  }


  console.log(
    "[GIFT] Identificação:",
    {
      id,
      name
    }
  );


  /*
     PRIMEIRO ID
  */

  if(id){

    for(
      const key of Object.keys(GIFTS)
    ){

      const item =
        GIFTS[key];


      if(
        item.ids.includes(id)
      ){

        return item;

      }

    }

  }


  /*
     DEPOIS NOME
  */

  if(name){

    for(
      const key of Object.keys(GIFTS)
    ){

      const item =
        GIFTS[key];


      if(
        item.names.includes(name)
      ){

        return item;

      }

    }

  }


  return null;

}


/* =========================================================
   USUÁRIO
========================================================= */

function getUsername(data){

  return (

    data?.user?.uniqueId ||

    data?.user?.unique_id ||

    data?.user?.nickname ||

    data?.username ||

    data?.uniqueId ||

    data?.nickname ||

    "Usuário"

  );

}


/* =========================================================
   GIFT STREAK TRACKER
========================================================= */

const giftTracker =
  new GiftStreakTracker();


/* =========================================================
   EVENTO DE PRESENTE
========================================================= */

async function handleGift(data){

  try{

    console.log(
      "[GIFT RAW]",
      JSON.stringify(data)
    );


    /*
       O PirateTok fornece o tracker
       para transformar repeatCount
       cumulativo em quantidade real
       recebida naquele evento.
    */

    let streak;


    try{

      streak =
        giftTracker.process(data);

    }catch(error){

      console.log(
        "[GIFT] Tracker não processou:",
        error.message
      );

    }


    /*
       Quantidade real do evento.

       Se o tracker funcionar,
       usamos eventGiftCount.

       Caso contrário, usamos repeatCount.
    */

    let quantity =
      Number(
        streak?.eventGiftCount
      );


    if(
      !Number.isFinite(quantity) ||
      quantity <= 0
    ){

      quantity =
        Number(
          data?.repeatCount ||
          data?.repeat_count ||
          1
        );

    }


    const gift =
      identifyGift(data);


    if(!gift){

      console.log(
        "[GIFT] Não reconhecido."
      );

      broadcast({

        type:
          "gift_unknown",

        giftId:
          data?.gift?.id ||
          data?.giftId ||
          null,

        giftName:
          data?.gift?.name ||
          data?.giftName ||
          null,

        repeatCount:
          quantity,

        user:
          getUsername(data)

      });

      return;

    }


    /*
       Para o nosso jogo:
       cada unidade do presente
       gera os votos correspondentes.
    */

    const votes =
      gift.votes * quantity;


    const user =
      getUsername(data);


    console.log(
      `[GIFT] ${user} -> ${gift.label} x${quantity} = +${votes}`
    );


    broadcast({

      type:
        "gift",

      giftId:
        gift.ids[0],

      giftName:
        gift.label,

      candidate:
        gift.candidate,

      votes:
        votes,

      quantity:
        quantity,

      user:
        user,

      label:
        gift.label

    });

  }catch(error){

    console.error(
      "[GIFT] Erro:",
      error
    );

  }

}


/* =========================================================
   CLIENTE PIRATETOK
========================================================= */

let tiktokClient = null;

let connecting = false;


/* =========================================================
   CONECTAR AO TIKTOK
========================================================= */

async function connectTikTok(){

  if(connecting){
    return;
  }


  connecting = true;


  console.log(
    "================================="
  );

  console.log(
    "[PIRATETOK] Conectando..."
  );

  console.log(
    "[PIRATETOK] Usuário:",
    TIKTOK_USERNAME
  );

  console.log(
    "================================="
  );


  try{

    tiktokClient =
      new TikTokLiveClient(
        TIKTOK_USERNAME
      );


    /*
       PRESENTES
    */

    tiktokClient.on(
      EventType.gift,
      handleGift
    );


    /*
       CHAT
    */

    tiktokClient.on(
      EventType.chat,
      (data) => {

        console.log(
          `[CHAT] ${
            data?.user?.nickname ||
            data?.user?.uniqueId ||
            "?"
          }: ${
            data?.content ||
            ""
          }`
        );

      }
    );


    /*
       LIKES
    */

    tiktokClient.on(
      EventType.like,
      (data) => {

        console.log(
          "[LIKE]",
          data?.user?.nickname,
          data?.total
        );

      }
    );


    /*
       CONECTAR
    */

    await tiktokClient.connect();


    console.log(
      "[PIRATETOK] CONECTADO COM SUCESSO!"
    );


    broadcast({

      type:
        "tiktok_status",

      connected:
        true,

      username:
        TIKTOK_USERNAME

    });


  }catch(error){

    console.error(
      "[PIRATETOK] ERRO:",
      error
    );


    broadcast({

      type:
        "tiktok_status",

      connected:
        false,

      error:
        error?.message ||
        String(error)

    });


    /*
       Tenta novamente.
    */

    setTimeout(
      () => {

        connecting =
          false;

        connectTikTok();

      },
      10000
    );


    return;

  }


  connecting = false;

}


/* =========================================================
   INICIAR SERVIDOR
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      `Servidor HTTP: porta ${PORT}`
    );

    console.log(
      `TikTok: @${TIKTOK_USERNAME}`
    );

    console.log(
      "WebSocket: ativo"
    );

    console.log(
      "================================="
    );


    connectTikTok();

  }
);


/* =========================================================
   ENCERRAMENTO
========================================================= */

process.on(
  "SIGTERM",
  () => {

    console.log(
      "[SERVER] Encerrando..."
    );


    try{

      tiktokClient?.disconnect?.();

    }catch{}


    server.close(
      () => process.exit(0)
    );

  }
);
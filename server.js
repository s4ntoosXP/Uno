const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createDeck() {
  const colors = ["red","blue","green","yellow"];
  const values = ["0","1","2","3","4","5","6","7","8","9","+2","skip","reverse"];
  let deck = [];
  colors.forEach(color => {
    values.forEach(v => deck.push(color + " " + v));
  });
  deck.push("wild");
  deck.push("+4");
  return deck;
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      host: socket.id,
      players: [],
      deck: createDeck(),
      discard: [],
      turnIndex: 0,
      started: false
    };
    rooms[roomCode].players.push({ id: socket.id, nickname, hand: [] });
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode });
  });

  socket.on('joinRoom', ({ roomCode, nickname }) => {
    if (!rooms[roomCode]) return;
    rooms[roomCode].players.push({ id: socket.id, nickname, hand: [] });
    socket.join(roomCode);
    io.to(roomCode).emit("roomJoined", { roomCode, players: rooms[roomCode].players.map(p => ({nickname:p.nickname, handCount:p.hand.length})) });
  });

  socket.on('startGame', ({ roomCode, startCards }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.started = true;
    room.players.forEach(p => {
      for (let i=0;i<startCards;i++) {
        p.hand.push(room.deck[Math.floor(Math.random()*room.deck.length)]);
      }
    });
    room.discard.push(room.deck[Math.floor(Math.random()*room.deck.length)]);
    room.currentCard = room.discard[room.discard.length-1];
    room.players.forEach(p => {
      io.to(p.id).emit("gameStarted", { currentCard: room.currentCard, hand: p.hand });
    });
  });

  socket.on('playCard', ({ roomCode, cardIndex }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const card = player.hand[cardIndex];
    if (!card) return;
    player.hand.splice(cardIndex,1);
    room.discard.push(card);
    room.currentCard = card;
    if (card === "wild" || card === "+4") {
      io.to(socket.id).emit("chooseColor");
    }
    updateRoom(roomCode);
  });

  socket.on('chooseColor', ({ roomCode, color }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentCard = color + " wild";
    updateRoom(roomCode);
  });

  socket.on('drawCard', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    player.hand.push(room.deck[Math.floor(Math.random()*room.deck.length)]);
    updateRoom(roomCode);
  });

  socket.on('passTurn', ({ roomCode }) => {
    updateRoom(roomCode);
  });

  socket.on('chat', ({ roomCode, nickname, msg }) => {
    io.to(roomCode).emit("chat", { nickname, msg });
  });
});

function updateRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players.forEach(p => {
    io.to(p.id).emit("updateState", { 
      players: room.players.map(pl => ({nickname:pl.nickname, handCount:pl.hand.length})),
      currentCard: room.currentCard,
      hand: p.hand,
      turn: room.turnIndex
    });
  });
}

server.listen(3000, () => console.log("Server running on http://localhost:3000"));

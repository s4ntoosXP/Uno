const socket = io();
let nickname = "";
let roomCode = "";
let isHost = false;

document.getElementById("createRoom").onclick = () => {
  nickname = document.getElementById("nickname").value || "Jogador";
  socket.emit("createRoom", { nickname });
};

document.getElementById("joinRoom").onclick = () => {
  nickname = document.getElementById("nickname").value || "Jogador";
  roomCode = document.getElementById("roomCode").value;
  socket.emit("joinRoom", { roomCode, nickname });
};

document.getElementById("startGame").onclick = () => {
  const startCards = document.getElementById("startCards").value;
  socket.emit("startGame", { roomCode, startCards });
};

document.getElementById("drawCard").onclick = () => {
  socket.emit("drawCard", { roomCode });
};

document.getElementById("passTurn").onclick = () => {
  socket.emit("passTurn", { roomCode });
};

document.getElementById("sendChat").onclick = () => {
  const msg = document.getElementById("chatInput").value;
  socket.emit("chat", { roomCode, nickname, msg });
  document.getElementById("chatInput").value = "";
};

document.querySelectorAll(".colorBtn").forEach(btn => {
  btn.onclick = () => {
    socket.emit("chooseColor", { roomCode, color: btn.dataset.color });
    document.getElementById("colorPicker").style.display = "none";
  };
});

socket.on("roomCreated", ({ roomCode: code }) => {
  roomCode = code;
  isHost = true;
  document.getElementById("roomInfo").innerText = "Sala criada: " + code;
  document.getElementById("hostOptions").style.display = "block";
});

socket.on("roomJoined", ({ roomCode: code, players }) => {
  roomCode = code;
  document.getElementById("roomInfo").innerText = "Entrou na sala: " + code;
  updatePlayers(players);
});

socket.on("gameStarted", ({ currentCard, hand }) => {
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
  document.getElementById("roomDisplay").innerText = roomCode;
  document.getElementById("currentCard").innerText = currentCard;
  updateHand(hand);
});

socket.on("updateState", ({ players, currentCard, hand, turn }) => {
  updatePlayers(players);
  document.getElementById("currentCard").innerText = currentCard;
  updateHand(hand);
});

socket.on("chat", ({ nickname, msg }) => {
  const div = document.createElement("div");
  div.innerText = nickname + ": " + msg;
  document.getElementById("messages").appendChild(div);
});

socket.on("chooseColor", () => {
  document.getElementById("colorPicker").style.display = "block";
});

function updatePlayers(players) {
  const div = document.getElementById("players");
  div.innerHTML = "<h3>Jogadores</h3>";
  players.forEach(p => {
    div.innerHTML += `<p>${p.nickname} - Cartas: ${p.handCount}</p>`;
  });
}

function updateHand(hand) {
  const div = document.getElementById("hand");
  div.innerHTML = "";
  hand.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.innerText = card;
    btn.onclick = () => {
      socket.emit("playCard", { roomCode, cardIndex: idx });
    };
    div.appendChild(btn);
  });
}

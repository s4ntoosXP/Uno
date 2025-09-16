const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos
app.use(express.static('public'));

// Estrutura de dados do servidor
const salas = {}; // { salaId: { jogadores: [], estado: 'esperando' | 'jogando', baralho, descarte, turno, corAtual, ... } }

io.on('connection', (socket) => {
    console.log('🟢 Novo jogador conectado:', socket.id);

    // Criar sala
    socket.on('criar-sala', ({ nick }, callback) => {
        const codigo = gerarCodigo();
        salas[codigo] = {
            codigo,
            criador: socket.id,
            jogadores: [{ id: socket.id, nome: nick, cartas: [] }],
            estado: 'esperando', // 'esperando' | 'jogando'
            baralho: [],
            descarte: [],
            turno: 0,
            corAtual: null,
            chat: []
        };

        socket.join(codigo);
        socket.data.sala = codigo;
        socket.data.nick = nick;

        console.log(` Sala ${codigo} criada por ${nick}`);
        callback({ success: true, codigo });
    });

    // Entrar em sala
    socket.on('entrar-sala', ({ codigo, nick }, callback) => {
        const sala = salas[codigo];
        if (!sala) return callback({ success: false, message: 'Sala não encontrada!' });

        if (sala.estado === 'jogando') return callback({ success: false, message: 'Jogo já iniciado!' });

        if (sala.jogadores.some(j => j.nome === nick)) {
            return callback({ success: false, message: 'Nick já está na sala!' });
        }

        sala.jogadores.push({ id: socket.id, nome: nick, cartas: [] });
        socket.join(codigo);
        socket.data.sala = codigo;
        socket.data.nick = nick;

        // Notifica todos da sala
        io.to(codigo).emit('atualizar-jogadores', sala.jogadores.map(j => j.nome));

        console.log(`${nick} entrou na sala ${codigo}`);
        callback({ success: true });
    });

    // Iniciar jogo
    socket.on('iniciar-jogo', () => {
        const salaId = socket.data.sala;
        const sala = salas[salaId];

        if (!sala || sala.criador !== socket.id) return;
        if (sala.jogadores.length < 2) return;

        sala.estado = 'jogando';
        sala.baralho = criarBaralho();
        embaralhar(sala.baralho);

        // Distribui cartas
        sala.jogadores.forEach(jogador => {
            jogador.cartas = [];
            for (let i = 0; i < 7; i++) {
                jogador.cartas.push(sala.baralho.pop());
            }
        });

        // Define primeira carta
        let primeiraCarta = sala.baralho.pop();
        while (['coringa', '+4'].includes(primeiraCarta.tipo)) {
            sala.baralho.unshift(primeiraCarta);
            primeiraCarta = sala.baralho.pop();
        }
        sala.descarte = [primeiraCarta];
        sala.corAtual = primeiraCarta.cor;
        sala.turno = 0;

        // Envia estado inicial para todos
        io.to(salaId).emit('jogo-iniciado', {
            jogadores: sala.jogadores.map(j => ({ nome: j.nome, totalCartas: j.cartas.length })),
            cartaAtual: primeiraCarta,
            corAtual: sala.corAtual,
            turno: sala.jogadores[0].nome
        });

        // Envia cartas privadas para cada jogador
        sala.jogadores.forEach(jogador => {
            socket.to(jogador.id).emit('suas-cartas', jogador.cartas);
        });
    });

    // Jogar carta
    socket.on('jogar-carta', ({ index, corEscolhida }) => {
        const salaId = socket.data.sala;
        const sala = salas[salaId];
        if (!sala) return;

        const jogadorIndex = sala.jogadores.findIndex(j => j.id === socket.id);
        if (jogadorIndex !== sala.turno) return; // Não é a vez dele

        const jogador = sala.jogadores[jogadorIndex];
        const carta = jogador.cartas.splice(index, 1)[0];
        sala.descarte.push(carta);

        // Define cor se for coringa
        if (carta.cor === 'preta') {
            sala.corAtual = corEscolhida;
        } else {
            sala.corAtual = carta.cor;
        }

        // Processa efeitos
        processarEfeitoCarta(carta, sala);

        // Verifica vitória
        if (jogador.cartas.length === 0) {
            io.to(salaId).emit('fim-de-jogo', { vencedor: jogador.nome });
            delete salas[salaId]; // Limpa sala
            return;
        }

        // Passa turno
        passarTurno(sala);

        // Atualiza todos
        const proximoJogador = sala.jogadores[sala.turno];
        io.to(salaId).emit('atualizar-jogo', {
            cartaAtual: carta,
            corAtual: sala.corAtual,
            turno: proximoJogador.nome,
            jogadores: sala.jogadores.map(j => ({ nome: j.nome, totalCartas: j.cartas.length }))
        });

        // Atualiza cartas de cada jogador (privado)
        sala.jogadores.forEach(j => {
            io.to(j.id).emit('suas-cartas', j.cartas);
        });
    });

    // Comprar carta
    socket.on('comprar-carta', () => {
        const salaId = socket.data.sala;
        const sala = salas[salaId];
        if (!sala) return;

        const jogadorIndex = sala.jogadores.findIndex(j => j.id === socket.id);
        if (jogadorIndex !== sala.turno) return;

        if (sala.baralho.length === 0) reabastecerBaralho(sala);

        const jogador = sala.jogadores[jogadorIndex];
        jogador.cartas.push(sala.baralho.pop());

        // Passa a vez após comprar (regra padrão)
        passarTurno(sala);

        const proximoJogador = sala.jogadores[sala.turno];
        io.to(salaId).emit('atualizar-jogo', {
            cartaAtual: sala.descarte[sala.descarte.length - 1],
            corAtual: sala.corAtual,
            turno: proximoJogador.nome,
            jogadores: sala.jogadores.map(j => ({ nome: j.nome, totalCartas: j.cartas.length }))
        });

        // Atualiza cartas do jogador atual
        socket.emit('suas-cartas', jogador.cartas);
    });

    // Enviar mensagem no chat
    socket.on('enviar-mensagem', (texto) => {
        const salaId = socket.data.sala;
        const sala = salas[salaId];
        if (!sala) return;

        const mensagem = {
            nick: socket.data.nick,
            texto: texto,
            timestamp: new Date().toLocaleTimeString()
        };

        sala.chat.push(mensagem);
        io.to(salaId).emit('nova-mensagem', mensagem);
    });

    // Desconexão
    socket.on('disconnect', () => {
        const salaId = socket.data?.sala;
        if (!salaId) return;

        const sala = salas[salaId];
        if (!sala) return;

        const jogadorIndex = sala.jogadores.findIndex(j => j.id === socket.id);
        if (jogadorIndex === -1) return;

        const jogador = sala.jogadores[jogadorIndex];
        console.log(`🔴 ${jogador.nome} saiu da sala ${salaId}`);

        sala.jogadores.splice(jogadorIndex, 1);

        if (sala.jogadores.length === 0) {
            delete salas[salaId];
            console.log(`❌ Sala ${salaId} deletada (sem jogadores)`);
        } else {
            // Se o jogo já começou, ajusta turno
            if (sala.estado === 'jogando') {
                if (sala.turno >= sala.jogadores.length) {
                    sala.turno = 0;
                }
                const proximo = sala.jogadores[sala.turno];
                io.to(salaId).emit('atualizar-jogo', {
                    turno: proximo.nome,
                    jogadores: sala.jogadores.map(j => ({ nome: j.nome, totalCartas: j.cartas.length }))
                });
            } else {
                io.to(salaId).emit('atualizar-jogadores', sala.jogadores.map(j => j.nome));
            }
        }
    });
});

// Funções auxiliares
function gerarCodigo() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function criarBaralho() {
    const cores = ['vermelha', 'verde', 'azul', 'amarela'];
    let baralho = [];

    for (let cor of cores) {
        for (let i = 0; i <= 9; i++) {
            baralho.push({ tipo: i.toString(), cor });
            if (i !== 0) baralho.push({ tipo: i.toString(), cor });
        }
        for (let i = 0; i < 2; i++) {
            baralho.push({ tipo: '+2', cor });
            baralho.push({ tipo: 'bloqueio', cor });
            baralho.push({ tipo: 'inverter', cor });
        }
    }

    for (let i = 0; i < 4; i++) {
        baralho.push({ tipo: 'coringa', cor: 'preta' });
        baralho.push({ tipo: '+4', cor: 'preta' });
    }

    return baralho;
}

function embaralhar(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function processarEfeitoCarta(carta, sala) {
    if (carta.tipo === 'bloqueio') {
        passarTurno(sala);
    } else if (carta.tipo === 'inverter') {
        sala.jogadores.reverse();
        sala.turno = sala.jogadores.length - 1 - sala.turno;
    } else if (carta.tipo === '+2') {
        passarTurno(sala);
        const proximo = sala.jogadores[sala.turno];
        for (let i = 0; i < 2; i++) {
            if (sala.baralho.length === 0) reabastecerBaralho(sala);
            proximo.cartas.push(sala.baralho.pop());
        }
    } else if (carta.tipo === '+4') {
        passarTurno(sala);
        const proximo = sala.jogadores[sala.turno];
        for (let i = 0; i < 4; i++) {
            if (sala.baralho.length === 0) reabastecerBaralho(sala);
            proximo.cartas.push(sala.baralho.pop());
        }
    }
}

function passarTurno(sala) {
    sala.turno = (sala.turno + 1) % sala.jogadores.length;
}

function reabastecerBaralho(sala) {
    if (sala.descarte.length <= 1) return;
    const topo = sala.descarte.pop();
    sala.baralho = [...sala.descarte];
    embaralhar(sala.baralho);
    sala.descarte = [topo];
}

// Inicia servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

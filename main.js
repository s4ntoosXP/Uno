const socket = io();

let salaAtual = null;
let jogadorAtual = null;
let corEscolhidaTemp = null;

// Telas
const inicio = document.getElementById('inicio');
const sala = document.getElementById('sala');
const jogo = document.getElementById('jogo');

// Funções de navegação
function mostrarAba(aba) {
    document.getElementById('criar-sala').style.display = 'none';
    document.getElementById('entrar-sala').style.display = 'none';
    document.getElementById(aba + '-sala').style.display = 'block';
}

// Criar sala
function criarSala() {
    const nick = document.getElementById('nick').value.trim();
    if (!nick) return alert("Digite seu nick!");

    socket.emit('criar-sala', { nick }, (res) => {
        if (res.success) {
            document.getElementById('codigo-sala').innerText = `Código: ${res.codigo}`;
            document.getElementById('btn-iniciar').style.display = 'inline-block';
            entrarNaSala(res.codigo, nick);
        } else {
            alert("Erro ao criar sala!");
        }
    });
}

// Entrar em sala
function entrarSala() {
    const codigo = document.getElementById('codigo-input').value.trim().toUpperCase();
    const nick = document.getElementById('nick').value.trim();
    if (!codigo || !nick) return alert("Preencha todos os campos!");

    socket.emit('entrar-sala', { codigo, nick }, (res) => {
        if (res.success) {
            entrarNaSala(codigo, nick);
        } else {
            alert(res.message);
        }
    });
}

function entrarNaSala(codigo, nick) {
    jogadorAtual = nick;
    salaAtual = codigo;

    inicio.style.display = 'none';
    sala.style.display = 'block';
    document.getElementById('sala-codigo').innerText = codigo;
    document.getElementById('jogador-nick').innerText = nick;
}

// Atualizar lista de jogadores
socket.on('atualizar-jogadores', (nomes) => {
    const lista = document.getElementById('lista-jogadores');
    lista.innerHTML = '<h3>Jogadores:</h3>';
    nomes.forEach(nome => {
        const div = document.createElement('div');
        div.innerText = nome;
        lista.appendChild(div);
    });
});

// Iniciar jogo
function iniciarJogo() {
    socket.emit('iniciar-jogo');
}

// Jogo iniciado
socket.on('jogo-iniciado', (data) => {
    sala.style.display = 'none';
    jogo.style.display = 'block';
    document.getElementById('jogo-sala-codigo').innerText = salaAtual;
    document.getElementById('turno-jogador').innerText = data.turno;
    document.getElementById('carta-atual').innerText = `${data.cartaAtual.tipo} (${data.corAtual})`;

    atualizarListaJogadoresNoJogo(data.jogadores);
});

// Atualizar jogo
socket.on('atualizar-jogo', (data) => {
    document.getElementById('turno-jogador').innerText = data.turno;
    const carta = data.cartaAtual;
    document.getElementById('carta-atual').innerText = `${carta.tipo} (${data.corAtual})`;
    atualizarListaJogadoresNoJogo(data.jogadores);
});

function atualizarListaJogadoresNoJogo(jogadores) {
    const lista = document.getElementById('lista-jogadores-no-jogo') || criarListaJogadores();
    lista.innerHTML = '<h3>Jogadores:</h3>';
    jogadores.forEach(j => {
        const div = document.createElement('div');
        div.innerText = `${j.nome}: ${j.totalCartas} cartas`;
        if (j.totalCartas === 1) div.innerText += " → UNO!";
        lista.appendChild(div);
    });
}

function criarListaJogadores() {
    const div = document.createElement('div');
    div.id = 'lista-jogadores-no-jogo';
    div.style.cssText = 'position:absolute; top:10px; right:10px; background:#222; padding:10px; border-radius:5px;';
    document.body.appendChild(div);
    return div;
}

// Receber cartas
socket.on('suas-cartas', (cartas) => {
    const areaCartas = document.getElementById('cartas-jogador');
    areaCartas.innerHTML = '';
    cartas.forEach((carta, index) => {
        const div = document.createElement('div');
        div.className = `carta ${carta.cor}`;
        div.innerText = carta.tipo;
        div.onclick = () => tentarJogarCarta(index, carta);
        areaCartas.appendChild(div);
    });
});

function tentarJogarCarta(index, carta) {
    const topo = descarte[descarte.length - 1]; // Simulação local para validação visual
    const pode = carta.cor === corAtual || carta.tipo === topo?.tipo || carta.cor === 'preta';

    if (!pode) return;

    if (carta.cor === 'preta') {
        escolherCor((cor) => {
            socket.emit('jogar-carta', { index, corEscolhida: cor });
        });
    } else {
        socket.emit('jogar-carta', { index });
    }
}

function escolherCor(callback) {
    const modal = document.createElement('div');
    modal.id = 'modal-cor';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:1000;';
    modal.innerHTML = `
        <div style="background:#333; padding:20px; border-radius:10px; text-align:center;">
            <h3>Escolha uma cor:</h3>
            <div>
                <div class="carta vermelha" style="margin:5px; width:60px; height:40px;" onclick="escolher('vermelha')"></div>
                <div class="carta verde" style="margin:5px; width:60px; height:40px;" onclick="escolher('verde')"></div>
                <div class="carta azul" style="margin:5px; width:60px; height:40px;" onclick="escolher('azul')"></div>
                <div class="carta amarela" style="margin:5px; width:60px; height:40px;" onclick="escolher('amarela')"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    window.escolher = function(cor) {
        document.body.removeChild(modal);
        callback(cor);
    };
}

// Comprar carta
document.getElementById('comprar').onclick = () => {
    socket.emit('comprar-carta');
};

// Chat
socket.on('nova-mensagem', (msg) => {
    const mensagens = document.getElementById('mensagens');
    const div = document.createElement('div');
    div.className = 'mensagem';
    div.innerHTML = `<span>[${msg.timestamp}] <strong>${msg.nick}:</strong></span> ${msg.texto}`;
    mensagens.appendChild(div);
    mensagens.scrollTop = mensagens.scrollHeight;
});

function enviarMensagem() {
    const input = document.getElementById('input-chat');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('enviar-mensagem', msg);
    input.value = '';
}

// Fim de jogo
socket.on('fim-de-jogo', (data) => {
    setTimeout(() => {
        alert(`🎉 ${data.vencedor} venceu o jogo!`);
        location.reload();
    }, 100);
});

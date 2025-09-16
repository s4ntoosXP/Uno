let salaAtual = null;
let jogadorAtual = null;
let jogadores = [];
let baralho = [];
let descarte = [];
let turno = 0;
let corAtual = null;

// Funções de navegação
function mostrarAba(aba) {
    document.getElementById('criar-sala').style.display = 'none';
    document.getElementById('entrar-sala').style.display = 'none';
    document.getElementById(aba + '-sala').style.display = 'block';
}

function criarSala() {
    const nick = document.getElementById('nick').value.trim();
    if (!nick) return alert("Digite seu nick!");

    const codigo = gerarCodigo();
    salaAtual = {
        codigo,
        criador: nick,
        jogadores: [nick]
    };

    localStorage.setItem('sala-' + codigo, JSON.stringify(salaAtual));
    document.getElementById('codigo-sala').innerText = `Código: ${codigo}`;
    document.getElementById('btn-iniciar').style.display = 'inline-block';

    entrarNaSala(codigo, nick);
}

function entrarSala() {
    const codigo = document.getElementById('codigo-input').value.trim().toUpperCase();
    const nick = document.getElementById('nick').value.trim();
    if (!codigo || !nick) return alert("Preencha todos os campos!");

    const salaData = localStorage.getItem('sala-' + codigo);
    if (!salaData) return alert("Sala não encontrada!");

    const sala = JSON.parse(salaData);
    if (sala.jogadores.includes(nick)) return alert("Nick já está na sala!");

    sala.jogadores.push(nick);
    localStorage.setItem('sala-' + codigo, JSON.stringify(sala));

    entrarNaSala(codigo, nick);
}

function entrarNaSala(codigo, nick) {
    jogadorAtual = nick;
    salaAtual = JSON.parse(localStorage.getItem('sala-' + codigo));

    document.getElementById('inicio').style.display = 'none';
    document.getElementById('sala').style.display = 'block';
    document.getElementById('sala-codigo').innerText = codigo;
    document.getElementById('jogador-nick').innerText = nick;

    atualizarListaJogadores();
}

function atualizarListaJogadores() {
    const lista = document.getElementById('lista-jogadores');
    lista.innerHTML = '<h3>Jogadores:</h3>';
    salaAtual.jogadores.forEach(jogador => {
        const div = document.createElement('div');
        div.innerText = jogador;
        lista.appendChild(div);
    });
}

function iniciarJogo() {
    if (salaAtual.jogadores.length < 2) {
        return alert("É necessário pelo menos 2 jogadores!");
    }

    // Inicializa jogo
    jogadores = salaAtual.jogadores.map(nome => ({
        nome,
        cartas: []
    }));

    baralho = criarBaralho();
    embaralhar(baralho);

    // Distribui 7 cartas para cada
    jogadores.forEach(jogador => {
        for (let i = 0; i < 7; i++) {
            jogador.cartas.push(baralho.pop());
        }
    });

    // Primeira carta do descarte
    let primeiraCarta = baralho.pop();
    while (primeiraCarta.tipo === 'coringa' || primeiraCarta.tipo === '+4') {
        baralho.unshift(primeiraCarta);
        primeiraCarta = baralho.pop();
    }
    descarte.push(primeiraCarta);
    corAtual = primeiraCarta.cor;

    document.getElementById('sala').style.display = 'none';
    document.getElementById('jogo').style.display = 'block';
    document.getElementById('jogo-sala-codigo').innerText = salaAtual.codigo;

    atualizarInterface();
}

function criarBaralho() {
    const cores = ['vermelha', 'verde', 'azul', 'amarela'];
    let baralho = [];

    // Cartas numéricas (0 a 9, 2x exceto 0)
    for (let cor of cores) {
        for (let i = 0; i <= 9; i++) {
            baralho.push({ tipo: i.toString(), cor });
            if (i !== 0) baralho.push({ tipo: i.toString(), cor });
        }
        // Cartas especiais (2x cada)
        for (let i = 0; i < 2; i++) {
            baralho.push({ tipo: '+2', cor });
            baralho.push({ tipo: 'bloqueio', cor });
            baralho.push({ tipo: 'inverter', cor });
        }
    }

    // Coringas (4x cada)
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

function atualizarInterface() {
    const jogador = jogadores[turno];
    document.getElementById('turno-jogador').innerText = jogador.nome;

    const cartaTopo = descarte[descarte.length - 1];
    let textoCarta = cartaTopo.tipo;
    if (cartaTopo.cor) textoCarta += ' (' + cartaTopo.cor + ')';
    document.getElementById('carta-atual').innerText = textoCarta;

    // Mostra cartas do jogador atual
    const areaCartas = document.getElementById('cartas-jogador');
    areaCartas.innerHTML = '';
    jogador.cartas.forEach((carta, index) => {
        if (podeJogar(carta)) {
            const div = document.createElement('div');
            div.className = `carta ${carta.cor}`;
            div.innerText = carta.tipo;
            div.onclick = () => jogarCarta(index);
            areaCartas.appendChild(div);
        } else {
            const div = document.createElement('div');
            div.className = `carta ${carta.cor}`;
            div.innerText = carta.tipo;
            div.style.opacity = '0.5';
            areaCartas.appendChild(div);
        }
    });

    // Evento de comprar carta
    document.getElementById('comprar').onclick = comprarCarta;
}

function podeJogar(carta) {
    const topo = descarte[descarte.length - 1];
    return (
        carta.cor === topo.cor ||
        carta.tipo === topo.tipo ||
        carta.cor === 'preta' ||
        topo.cor === 'preta' && carta.cor === corAtual
    );
}

function jogarCarta(index) {
    const jogador = jogadores[turno];
    const carta = jogador.cartas.splice(index, 1)[0];
    descarte.push(carta);

    // Efeitos especiais
    if (carta.cor === 'preta') {
        escolherCor(() => {
            processarEfeitoCarta(carta);
            passarTurno();
            atualizarInterface();
        });
        return;
    } else {
        corAtual = carta.cor;
    }

    processarEfeitoCarta(carta);
    passarTurno();

    // Verifica vitória
    if (jogador.cartas.length === 0) {
        setTimeout(() => {
            alert(`🎉 ${jogador.nome} venceu o jogo!`);
            location.reload();
        }, 500);
        return;
    }

    atualizarInterface();
}

function processarEfeitoCarta(carta) {
    if (carta.tipo === 'bloqueio') {
        passarTurno(); // Pula o próximo
    } else if (carta.tipo === 'inverter') {
        jogadores.reverse();
        turno = jogadores.length - 1 - turno;
    } else if (carta.tipo === '+2') {
        passarTurno();
        const proximo = jogadores[turno];
        for (let i = 0; i < 2; i++) {
            if (baralho.length === 0) reabastecerBaralho();
            proximo.cartas.push(baralho.pop());
        }
    } else if (carta.tipo === '+4') {
        passarTurno();
        const proximo = jogadores[turno];
        for (let i = 0; i < 4; i++) {
            if (baralho.length === 0) reabastecerBaralho();
            proximo.cartas.push(baralho.pop());
        }
    }
}

function escolherCor(callback) {
    const cores = ['vermelha', 'verde', 'azul', 'amarela'];
    let html = '<h3>Escolha uma cor:</h3><div>';
    cores.forEach(cor => {
        html += `<div class="carta ${cor}" style="margin:5px; width:60px; height:40px;" onclick="definirCor('${cor}', ${callback})"></div>`;
    });
    html += '</div>';

    const modal = document.createElement('div');
    modal.id = 'modal-cor';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    window.definirCor = function(cor, cb) {
        corAtual = cor;
        document.body.removeChild(modal);
        cb();
    };
}

function passarTurno() {
    turno = (turno + 1) % jogadores.length;
}

function comprarCarta() {
    if (baralho.length === 0) reabastecerBaralho();
    const jogador = jogadores[turno];
    jogador.cartas.push(baralho.pop());

    // Após comprar, passa a vez (regra opcional — pode-se permitir jogar após comprar)
    passarTurno();
    atualizarInterface();
}

function reabastecerBaralho() {
    if (descarte.length <= 1) return; // Jogo travado
    const topo = descarte.pop();
    baralho = [...descarte];
    embaralhar(baralho);
    descarte = [topo];
}

function enviarMensagem() {
    const input = document.getElementById('input-chat');
    const msg = input.value.trim();
    if (!msg) return;

    const mensagensDiv = document.getElementById('mensagens');
    const div = document.createElement('div');
    div.className = 'mensagem';
    div.innerHTML = `<span>${jogadorAtual}:</span> ${msg}`;
    mensagensDiv.appendChild(div);
    mensagensDiv.scrollTop = mensagensDiv.scrollHeight;

    input.value = '';
}

function gerarCodigo() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
      }

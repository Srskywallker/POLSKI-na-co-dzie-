/* ===================== ESTADO ===================== */
const INTERVALOS = [0, 1, 3, 7, 14, 30, 60];
const NOVOS_POR_DIA = 6, REVISOES_POR_DIA = 12;
const LS = "polski-na-co-dzien-v1";
let E = { cards:{}, dias:{}, sit:{}, ent:{}, ultimoDia:null, sequencia:0 };
let fonte = "local", dbRef = null, salvarTimer = null;

const hoje = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const somaDias = (iso, n) => { const d = new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const todosCards = [];
// id estável (tema + polonês): inserir ou reordenar cartões não embaralha o progresso salvo
const idCard = (deck, pl) => deck + ":" + normCursoPl(pl);
DECKS.forEach(d => d.cards.forEach((c,i) => todosCards.push({id:idCard(d.id, c[0]), velho:d.id+"-"+i, deck:d.id, pl:c[0], pt:c[1], pron:c[2], nota:c[3]||"", icone:c[4]||""})));
const cardPorId = Object.fromEntries(todosCards.map(c => [c.id, c]));
console.assert(Object.keys(cardPorId).length === todosCards.length, "cartões com o mesmo id (mesmo polonês repetido num tema)");

// antes da v1.1 o id era "tema-posição": converte uma vez, usando as posições de hoje
function migrarCards() {
  if (E.idsV >= 2) return;
  const novo = Object.fromEntries(todosCards.map(c => [c.velho, c.id]));
  E.cards = Object.fromEntries(Object.entries(E.cards || {}).map(([k, v]) => [novo[k] || k, v]));
  (E.avaliacoes || []).forEach(a => { a.id = novo[a.id] || a.id; });
  E.idsV = 2;
  try { localStorage.setItem(LS, JSON.stringify(E)); } catch(e) {} // grava já: uma versão futura pode mudar as posições
}
function carregarLocal() { try { const s = localStorage.getItem(LS); if (s) E = Object.assign(E, JSON.parse(s)); } catch(e) {} migrarCards(); migrarJornada(); }
function salvar() {
  try { localStorage.setItem(LS, JSON.stringify(E)); } catch(e) {}
  if (dbRef) { clearTimeout(salvarTimer); salvarTimer = setTimeout(() => { dbRef.set({estado: JSON.stringify(E), atualizado: Date.now()}).catch(()=>{}); }, 1200); }
}
async function conectarNuvem() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    dbRef = db.collection("data/users/" + id).doc("progresso");
    const snap = await dbRef.get();
    if (snap.exists) {
      const remoto = JSON.parse(snap.data().estado || "{}");
      const nRem = Object.keys(remoto.cards||{}).length, nLoc = Object.keys(E.cards).length;
      if (nRem >= nLoc) { E = Object.assign({cards:{}, dias:{}, sit:{}, ent:{}, ultimoDia:null, sequencia:0}, remoto); migrarCards(); migrarJornada(); try { localStorage.setItem(LS, JSON.stringify(E)); } catch(e){} }
      else salvar();
    } else if (Object.keys(E.cards).length) salvar();
    fonte = "nuvem"; render();
  } catch(e) {}
}

const diasEntre = (a, b) => Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00")) / 864e5);
function marcarEstudo() {
  const h = hoje();
  E.dias[h] = (E.dias[h]||0) + 1;
  if (E.ultimoDia !== h) {
    const perdidos = E.ultimoDia ? diasEntre(E.ultimoDia, h) - 1 : -1;
    if (perdidos === 0) E.sequencia = (E.sequencia||0) + 1;
    else if (perdidos > 0 && perdidos <= (E.bloqueios||0) && E.sequencia) {
      // bloqueios cobrem os dias sem estudo: a sequência continua, mas esses dias não somam
      E.bloqueios -= perdidos; if (!E.diasBloqueados) E.diasBloqueados = {};
      for (let i = 1; i <= perdidos; i++) E.diasBloqueados[somaDias(E.ultimoDia, i)] = 1;
      E.sequencia = (E.sequencia||0) + 1;
      avisar(`🧊 ${perdidos === 1 ? "Um bloqueio salvou" : perdidos + " bloqueios salvaram"} sua sequência!`);
    } else E.sequencia = 1;
    E.ultimoDia = h;
    E.melhorSeq = Math.max(E.melhorSeq||0, E.sequencia);
    if (!E.marcosVistos) E.marcosVistos = [];
    if (MARCOS[E.sequencia] && !E.marcosVistos.includes(E.sequencia)) E.marcoPendente = E.sequencia;
  }
  const seg = semanaDe(h);
  if (!E.semBonus) E.semBonus = {};
  if (!E.semBonus[seg] && diasNaSemana(seg) >= META_SEMANA) { E.semBonus[seg] = 1; ganharXP(100);
    let extra = ""; if ((E.bloqueios||0) < MAX_BLOQUEIOS) { E.bloqueios = (E.bloqueios||0) + 1; extra = " e um bloqueio 🧊"; }
    const it = itemColecao(semanasComMedalha().total - 1); avisar(`Medalha da semana: ${it.ic} ${it.nome}! +100 XP${extra}`); }
}
// a sequência continua viva enquanto os dias sem estudo couberem nos bloqueios guardados
function sequenciaAtual() { if (!E.ultimoDia) return 0; return diasEntre(E.ultimoDia, hoje()) - 1 <= (E.bloqueios||0) ? (E.sequencia||0) : 0; }

/* ===================== JORNADA (níveis, semana, conquistas) ===================== */
const META_SEMANA = 5; // dias de estudo na semana para ganhar a medalha
const MAX_BLOQUEIOS = 2; // como no Duolingo: até 2 bloqueios guardados; cada medalha da semana dá 1
const URL_APP = "https://srskywallker.github.io/POLSKI-na-co-dzie-/";
const MARCOS = { // marcos da sequência comemorados com tela própria
  7: ["Tydzień!", "Uma semana"], 14: ["Dwa tygodnie!", "Duas semanas"], 30: ["Miesiąc!", "Um mês"],
  50: ["Pięćdziesiąt dni!", "Cinquenta dias"], 100: ["Sto dni!", "Cem dias"], 200: ["Dwieście dni!", "Duzentos dias"], 365: ["Rok!", "Um ano"]
};
const ETAPAS = [
  {xp:0,     cidade:"Wieliczka", desc:"A mina de sal, com uma capela inteira esculpida no sal. A viagem começa aqui.", pl:"sól", pt:"o sal"},
  {xp:300,   cidade:"Sopot",    desc:"O molo, o píer de madeira mais longo da Europa.", pl:"molo", pt:"o píer"},
  {xp:800,   cidade:"Zakopane", desc:"Aos pés dos montes Tatra.", pl:"góry", pt:"as montanhas"},
  {xp:1500,  cidade:"Toruń",    desc:"Terra de Mikołaj Kopernik e dos pierniki, o pão de mel.", pl:"pierniki", pt:"pães de mel"},
  {xp:2400,  cidade:"Lublin",   desc:"A cidade velha que abre caminho para o leste.", pl:"stare miasto", pt:"a cidade velha"},
  {xp:3500,  cidade:"Gdańsk",   desc:"Porto no Mar Báltico, onde nasceu o Solidarność.", pl:"morze", pt:"o mar"},
  {xp:4800,  cidade:"Poznań",   desc:"Ao meio-dia, dois cabritinhos se batem no relógio da prefeitura.", pl:"koziołki", pt:"cabritinhos"},
  {xp:6300,  cidade:"Łódź",     desc:"A rua Piotrkowska, uma das mais longas da Europa.", pl:"ulica", pt:"a rua"},
  {xp:8000,  cidade:"Wrocław",  desc:"Centenas de anõezinhos de bronze espalhados pela cidade.", pl:"krasnale", pt:"anõezinhos"},
  {xp:10000, cidade:"Kraków",   desc:"A antiga capital, com o castelo de Wawel.", pl:"zamek", pt:"o castelo"},
  {xp:12500, cidade:"Warszawa", desc:"A capital, com a cidade velha reconstruída depois da guerra. Fim da jornada!", pl:"stolica", pt:"a capital"}
];
// desenho da cidade (ICONES), achado pelo nome sem acentos: Łódź → lodz
const iconeCidade = (cidade, cls = "") => { const k = cidade.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return ICONES[k] ? `<span class="ic-cidade ${cls}" aria-hidden="true">${ICONES[k]}</span>` : ""; };
const XP_MESTRE = 3000; // depois de Varsóvia, cada 3000 XP vale uma estrela
function infoNivel(xp) {
  xp = xp ?? (E.xp||0);
  let i = 0; while (i+1 < ETAPAS.length && xp >= ETAPAS[i+1].xp) i++;
  const ult = i === ETAPAS.length-1, extra = ult ? Math.floor((xp - ETAPAS[i].xp) / XP_MESTRE) : 0;
  const base = ult ? ETAPAS[i].xp + extra*XP_MESTRE : ETAPAS[i].xp;
  const prox = ult ? base + XP_MESTRE : ETAPAS[i+1].xp;
  return { n: i+1+extra, i, extra, xp, base, prox, etapa: ETAPAS[i],
    titulo: extra ? "Mistrz " + "★".repeat(Math.min(extra,5)) : ETAPAS[i].cidade,
    proxNome: ult ? "a próxima estrela" : ETAPAS[i+1].cidade,
    pct: Math.round((xp - base) / (prox - base) * 100) };
}
function semanaDe(iso) { const d = new Date(iso+"T12:00:00"); return somaDias(iso, -((d.getDay()+6) % 7)); } // segunda-feira
function diasNaSemana(seg) { let n = 0; for (let i = 0; i < 7; i++) if ((E.dias[somaDias(seg,i)]||0) > 0) n++; return n; }
function semanasComMedalha() {
  const ds = Object.keys(E.dias).filter(d => E.dias[d] > 0).sort(); if (!ds.length) return {total:0, seguidas:0, lista:[]};
  const atual = semanaDe(hoje()), lista = [];
  let k0 = 0; // índice da medalha, para saber qual item da coleção cada semana deu
  for (let s = semanaDe(ds[0]); s <= atual; s = somaDias(s,7)) { const dias = diasNaSemana(s), ok = dias >= META_SEMANA; lista.push({seg:s, dias, ok, k: ok ? k0++ : -1}); }
  let seguidas = 0, k = lista.length-1;
  if (k >= 0 && !lista[k].ok) k--; // a semana atual ainda está em andamento
  while (k >= 0 && lista[k].ok) { seguidas++; k--; }
  return {total: lista.filter(x => x.ok).length, seguidas, lista};
}
function xpDaSemana() { const seg = semanaDe(hoje()); let t = 0; for (let i = 0; i < 7; i++) t += (E.xpDias||{})[somaDias(seg,i)]||0; return t; }

/* a medalha de cada semana é o próximo item desta coleção */
const COLECAO = [
  {ic:"🥟", nome:"Pierogi", desc:"Os pastéis cozidos, de batata com queijo, carne ou frutas."},
  {ic:"🍩", nome:"Pączek", desc:"O sonho recheado, comido aos montes na Tłusty czwartek."},
  {ic:"🧀", nome:"Oscypek", desc:"O queijo defumado de ovelha dos montanheses dos Tatra."},
  {ic:"🍬", nome:"Krówki", desc:"As balas de leite caramelizado, com a vaquinha no papel."},
  {ic:"🍫", nome:"Ptasie mleczko", desc:"O doce de espuma coberto de chocolate da Wedel."},
  {ic:"🥨", nome:"Obwarzanek krakowski", desc:"A rosca vendida nos carrinhos de rua de Cracóvia."},
  {ic:"🍲", nome:"Bigos", desc:"O ensopado do caçador, de repolho com carnes."},
  {ic:"🥣", nome:"Żurek", desc:"A sopa azeda de centeio, com ovo e linguiça."},
  {ic:"🍰", nome:"Sernik", desc:"A torta de queijo branco que toda avó polonesa faz."},
  {ic:"🚗", nome:"Maluch", desc:"O Fiat 126p, o carrinho que motorizou a Polônia."},
  {ic:"🦬", nome:"Żubr", desc:"O bisão europeu da floresta de Białowieża."},
  {ic:"🟠", nome:"Bursztyn", desc:"O âmbar do Báltico, o ouro da costa polonesa."}
];
const itemColecao = k => COLECAO[k % COLECAO.length]; // k = 0 para a 1ª medalha
const CONQUISTAS = [
  {id:"inicio",  ic:"🐶", nome:"Reksio", quem:"O cachorrinho do desenho clássico", desc:"Estudou pela primeira vez", ok:() => Object.keys(E.dias).length >= 1},
  {id:"seq7",    ic:"🎿", nome:"Adam Małysz", quem:"O herói do salto de esqui", desc:"7 dias seguidos", ok:() => (E.melhorSeq||0) >= 7},
  {id:"seq30",   ic:"🎾", nome:"Iga Świątek", quem:"A campeã de Roland Garros", desc:"30 dias seguidos", ok:() => (E.melhorSeq||0) >= 30},
  {id:"sem1",    ic:"👦", nome:"Bolek i Lolek", quem:"Os irmãos do desenho mais famoso do país", desc:"Primeira medalha da semana", ok:() => semanasComMedalha().total >= 1},
  {id:"sem4",    ic:"🪖", nome:"Czterej pancerni i pies", quem:"Os quatro tanquistas e o cão Szarik", desc:"4 medalhas da semana", ok:() => semanasComMedalha().total >= 4},
  {id:"sem12",   ic:"🐉", nome:"Smok Wawelski", quem:"O dragão da lenda de Cracóvia", desc:"12 medalhas: coleção completa", ok:() => semanasComMedalha().total >= 12},
  {id:"dias50",  ic:"💦", nome:"Śmigus-dyngus", quem:"A guerra de água da segunda-feira de Páscoa", desc:"50 dias de estudo no total", ok:() => Object.keys(E.dias).filter(d => E.dias[d] > 0).length >= 50},
  {id:"card50",  ic:"⚽", nome:"Lewandowski", quem:"O maior artilheiro da seleção", desc:"50 cartões aprendidos", ok:() => aprendidos() >= 50},
  {id:"card150", ic:"🎤", nome:"Sanah", quem:"A cantora pop da nova geração", desc:"150 cartões aprendidos", ok:() => aprendidos() >= 150},
  {id:"sit5",    ic:"🧸", nome:"Miś", quem:"A comédia de Bareja cheia de falas famosas", desc:"5 situações sem nenhum erro", ok:() => SITUACOES.filter(s => E.sit[s.id] === s.passos.length).length >= 5},
  {id:"ent10",   ic:"🐺", nome:"Wiedźmin", quem:"Geralt, o bruxo dos livros de Sapkowski", desc:"10 perguntas do cônsul dominadas", ok:() => Object.values(E.ent).filter(x => x === 2).length >= 10},
  {id:"sim",     ic:"🎬", nome:"Kiler", quem:"A comédia de Machulski que todo polonês cita", desc:"Passou numa parte do simulado A2", ok:() => Object.values((E.nivel||{}).sim||{}).some(r => r.pontos/r.max >= 0.5)},
  {id:"krakow",  ic:"🐴", nome:"Lajkonik", quem:"O cavaleiro do desfile de Cracóvia", desc:"Chegou a Cracóvia (nível 10)", ok:() => infoNivel().n >= 10},
  {id:"warszawa",ic:"🧜‍♀️", nome:"Syrenka", quem:"A sereia, símbolo de Varsóvia", desc:"Chegou à capital (nível 11)", ok:() => infoNivel().n >= 11}
];
/* galeria histórica: um personagem por marco de dias de estudo, em ordem cronológica */
const GALERIA = [
  {dias:1,   ic:"⛪", nome:"Mieszko I", anos:"c. 960–992", desc:"O primeiro governante: com o batismo dele, em 966, nasce o Estado polonês."},
  {dias:3,   ic:"👑", nome:"Bolesław Chrobry", anos:"992–1025", desc:"O Valente, primeiro rei coroado da Polônia."},
  {dias:5,   ic:"🏰", nome:"Kazimierz Wielki", anos:"1333–1370", desc:"O Grande: recebeu uma Polônia de madeira e deixou uma de pedra. Fundou a universidade de Cracóvia."},
  {dias:7,   ic:"👑", nome:"Jadwiga", anos:"1384–1399", desc:"Coroada «rei» da Polônia ainda menina. Hoje é santa."},
  {dias:10,  ic:"⚔️", nome:"Władysław Jagiełło", anos:"1386–1434", desc:"Venceu os Cavaleiros Teutônicos na batalha de Grunwald, em 1410."},
  {dias:14,  ic:"🌍", nome:"Mikołaj Kopernik", anos:"1473–1543", desc:"Tirou a Terra do centro do universo e pôs o Sol no lugar."},
  {dias:20,  ic:"🐎", nome:"Jan III Sobieski", anos:"1674–1696", desc:"Comandou os hussardos alados que salvaram Viena em 1683."},
  {dias:25,  ic:"🎖️", nome:"Tadeusz Kościuszko", anos:"1746–1817", desc:"Herói da independência americana e líder da insurreição polonesa de 1794."},
  {dias:30,  ic:"🎹", nome:"Fryderyk Chopin", anos:"1810–1849", desc:"O gênio do piano que levou as mazurcas e polonaises ao mundo."},
  {dias:40,  ic:"⚛️", nome:"Maria Skłodowska-Curie", anos:"1867–1934", desc:"A primeira pessoa a ganhar dois prêmios Nobel, em física e química."},
  {dias:50,  ic:"🇵🇱", nome:"Józef Piłsudski", anos:"1867–1935", desc:"Símbolo da independência recuperada em 11 de novembro de 1918."},
  {dias:65,  ic:"✝️", nome:"Jan Paweł II", anos:"1920–2005", desc:"Karol Wojtyła, o primeiro papa polonês."},
  {dias:80,  ic:"✊", nome:"Lech Wałęsa", anos:"nascido em 1943", desc:"Eletricista de Gdańsk, líder do Solidarność, Nobel da Paz e presidente."},
  {dias:100, ic:"📖", nome:"Olga Tokarczuk", anos:"nascida em 1962", desc:"Escritora, Prêmio Nobel de Literatura de 2018."}
];
const diasEstudados = () => Object.keys(E.dias).filter(d => E.dias[d] > 0).length;
const galeriaAberta = () => GALERIA.filter(g => diasEstudados() >= g.dias);
function checarConquistas(silencioso) {
  if (!E.conq) E.conq = {};
  CONQUISTAS.forEach(c => { if (!E.conq[c.id] && c.ok()) { E.conq[c.id] = hoje(); if (!silencioso) avisar(`${c.ic} Conquista desbloqueada: ${c.nome}`); } });
  const g = galeriaAberta();
  if (g.length > (E.galVista||0)) { if (!silencioso) { const p = g[g.length-1]; avisar(`${p.ic} Galeria histórica: ${p.nome}`); } E.galVista = g.length; }
}
function ganharXP(n) {
  if (!n) return; const h = hoje();
  E.xp = (E.xp||0) + n; if (!E.xpDias) E.xpDias = {}; E.xpDias[h] = (E.xpDias[h]||0) + n;
  checarConquistas();
}
// cada atividade (fora os cartões) rende pontos só uma vez por dia
function primeiraVezHoje(k) { const h = hoje(); if (!E.feitos || E.feitos.dia !== h) E.feitos = {dia:h, k:{}}; if (E.feitos.k[k]) return false; E.feitos.k[k] = 1; return true; }

/* quem já usava o app começa com os pontos do que já estudou, sem festa retroativa */
function migrarJornada() {
  if (E.galVista === undefined) E.galVista = galeriaAberta().length; // sem aviso pelo que já estava aberto
  if (E.bloqueios === undefined) E.bloqueios = 1; // todo mundo começa com um bloqueio guardado
  if (!E.marcosVistos) E.marcosVistos = Object.keys(MARCOS).map(Number).filter(n => n <= (E.sequencia||0));
  if (!E.recursosVistos) E.recursosVistos = Object.keys(RECURSOS).filter(jaUsou); // o que já usava não aparece como novidade
  if (E.xp !== undefined) return;
  let xp = 0;
  Object.values(E.cards).forEach(s => { xp += (s.acertos||0)*10 + (s.erros||0)*4; });
  SITUACOES.forEach(s => { if (E.sit[s.id] !== undefined) xp += 10 + E.sit[s.id]*5; });
  Object.values(E.ent).forEach(n => { xp += [5,8,12][n]||0; });
  E.semBonus = {}; semanasComMedalha().lista.forEach(w => { if (w.ok) { E.semBonus[w.seg] = 1; xp += 100; } });
  E.xp = xp; E.melhorSeq = Math.max(E.melhorSeq||0, E.sequencia||0);
  checarConquistas(true);
  E.nivelVisto = infoNivel().n;
}

let toastTimer = null;
function avisar(txt) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role","status"); document.body.appendChild(t); }
  t.textContent = txt; t.style.opacity = "1"; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = "0"; setTimeout(() => { t.hidden = true; }, 300); }, 3200);
}
function renderFesta() {
  const f = document.getElementById("festa"), L = infoNivel();
  if (L.n <= (E.nivelVisto||1)) { renderMarco(f); return; }
  f.dataset.tipo = "nivel";
  const e = L.etapa;
  f.innerHTML = `<div class="caixa" role="dialog" aria-modal="true" aria-labelledby="festa-t">
    <span class="eyebrow">Nowy poziom! Novo nível!</span>
    ${L.extra ? `<div class="selo">${L.n}</div>` : iconeCidade(e.cidade)}
    <h1 id="festa-t">${esc(L.titulo)}</h1>
    <p class="sub">${L.extra ? "Você completou a jornada e segue ganhando estrelas." : esc(e.desc)}</p>
    ${liberadosNoNivel(L.n).map(id => `<div class="feedback ok" style="width:100%;text-align:left"><b>Desbloqueado: ${RECURSOS[id].ic} ${esc(RECURSOS[id].nome)}</b><br>${esc(RECURSOS[id].desc)}</div>`).join("")}
    ${L.extra ? "" : `<div class="nota" style="display:flex;gap:10px;align-items:center;justify-content:space-between;width:100%;text-align:left"><div><b class="pl">${esc(e.pl)}</b><br><span style="font-size:13px">${esc(e.pt)}</span></div>${btnAudio(e.pl)}</div>`}
    <button class="btn" data-festa-ok>Dalej! Continuar</button></div>`;
  f.hidden = false;
}
// marco da sequência: aparece depois de uma subida de nível, se as duas acontecerem juntas
function renderMarco(f) {
  const m = E.marcoPendente;
  if (!m || !MARCOS[m]) { f.hidden = true; return; }
  const [pl, pt] = MARCOS[m];
  f.dataset.tipo = "marco";
  f.innerHTML = `<div class="caixa" role="dialog" aria-modal="true" aria-labelledby="festa-t">
    <span class="eyebrow">Marco da sequência</span>
    <div class="selo" aria-hidden="true">🔥</div>
    <h1 id="festa-t">${m} dias seguidos!</h1>
    <div class="nota" style="display:flex;gap:10px;align-items:center;justify-content:space-between;width:100%;text-align:left"><div><b class="pl">${esc(pl)}</b><br><span style="font-size:13px">${esc(pt)} estudando polonês.</span></div>${btnAudio(pl)}</div>
    <p class="sub">${m === 7 ? "O hábito está se formando. Uma semana inteira!" : "Continue amanhã para manter a sequência."}</p>
    <div class="linha-btn" style="width:100%"><button class="btn sec" data-festa-share>Compartilhar</button><button class="btn" data-festa-ok>Dalej! Continuar</button></div></div>`;
  f.hidden = false;
}
function compartilharMarco() {
  const texto = `🔥 ${E.marcoPendente} dias seguidos estudando polonês no POLSKI na co dzień! ${URL_APP}`;
  const copiar = () => { try { navigator.clipboard.writeText(texto).then(() => avisar("Texto copiado. É só colar onde quiser."), () => avisar("Não consegui copiar aqui.")); } catch(e) { avisar("Não consegui copiar aqui."); } };
  if (navigator.share) navigator.share({text: texto}).catch(e => { if (e && e.name !== "AbortError") copiar(); });
  else copiar();
}
document.getElementById("festa").addEventListener("click", e => {
  const lento = e.target.closest("[data-falar-lento]"); if (lento) { falar(lento.dataset.falarLento, true); return; }
  const a = e.target.closest("[data-falar]"); if (a) { falar(a.dataset.falar); return; }
  const f = document.getElementById("festa");
  if (e.target.closest("[data-festa-share]")) { compartilharMarco(); return; }
  if (e.target.closest("[data-festa-ok]")) {
    if (f.dataset.tipo === "marco") { if (!E.marcosVistos) E.marcosVistos = []; E.marcosVistos.push(E.marcoPendente); delete E.marcoPendente; }
    else E.nivelVisto = infoNivel().n;
    salvar(); renderFesta();
  }
});

function cartaoJornada() {
  const L = infoNivel(), seg = semanaDe(hoje()), n = diasNaSemana(seg);
  const letras = ["S","T","Q","Q","S","S","D"];
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="eyebrow">Jornada pela Polônia</span><span class="pill">${L.xp.toLocaleString("pt-BR")} XP</span></div>
    <div style="display:flex;gap:12px;align-items:center">${L.extra ? `<div class="selo">${L.n}</div>` : iconeCidade(L.etapa.cidade, "jornada")}
      <div style="display:grid;gap:2px;min-width:0"><b style="font-size:18px">${esc(L.titulo)}</b><span class="sub" style="font-size:12.5px">Nível ${L.n} · faltam ${(L.prox - L.xp).toLocaleString("pt-BR")} XP para ${esc(L.proxNome)}</span></div></div>
    <div class="barra"><i style="width:${L.pct}%"></i></div>
    <div class="semana" aria-label="Dias estudados nesta semana">${letras.map((l,i) => { const d = somaDias(seg,i), on = (E.dias[d]||0) > 0;
      return `<div><i class="${on?"on":""} ${d===hoje()?"hoje":""}">${on?"✓":(E.diasBloqueados||{})[d]?"🧊":""}</i>${l}</div>`; }).join("")}</div>
    ${(() => { const M = semanasComMedalha(), ganhou = n >= META_SEMANA, it = itemColecao(ganhou ? M.total - 1 : M.total);
      return `<div style="display:flex;gap:10px;align-items:center"><span style="font-size:26px;line-height:1;${ganhou?"":"filter:grayscale(1);opacity:.45"}" aria-hidden="true">${it.ic}</span>
      <span class="sub" style="font-size:12.5px">${ganhou ? `Medalha da semana conquistada: <b>${esc(it.nome)}</b> entrou na sua coleção.` : `${n} de ${META_SEMANA} dias nesta semana. Chegando a ${META_SEMANA}, você ganha <b>${esc(it.nome)}</b> para a coleção e +100 XP.`}</span></div>`; })()}
    <div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px;line-height:1" aria-hidden="true">🧊</span>
      <span class="sub" style="font-size:12.5px"><b>${E.bloqueios||0} de ${MAX_BLOQUEIOS} bloqueios.</b> Cada bloqueio salva a sequência num dia sem estudo. A medalha da semana dá mais um.</span></div>
  </div>`;
}

function vencidos() { const h = hoje(); return todosCards.filter(c => E.cards[c.id] && E.cards[c.id].due <= h); }
// os cartões novos chegam primeiro dos temas que mais importam para o objetivo escolhido
const ORDEM_DECKS = {
  karta: ["consul", "apres", "cump", "ajuda", "familia", "religiao", "urzad", "tempo", "num"],
  familia: ["cump", "apres", "familia", "ajuda", "sent", "religiao", "swieta", "casa", "cozinha"],
  viagem: ["cump", "ajuda", "rest", "comp", "rua", "num", "transp", "comida", "horas"],
  cultura: ["cump", "apres", "swieta", "religiao", "comida", "cidade", "clima"],
  depois: ["cump", "apres", "ajuda", "rest", "comp", "rua"]
};
const ordemDecks = () => ORDEM_DECKS[E.objetivo] || ORDEM_DECKS.depois;
function rankDeck(id) { const i = ordemDecks().indexOf(id); return i >= 0 ? i : 100 + DECKS.findIndex(d => d.id === id); }
function novos() { return todosCards.filter(c => !E.cards[c.id]).sort((a, b) => rankDeck(a.deck) - rankDeck(b.deck)); }
function aprendidos() { return todosCards.filter(c => E.cards[c.id] && E.cards[c.id].box >= 2).length; }
function novosHoje() { return E["novos_"+hoje()] || 0; }

function avaliar(card, acertou) {
  const h = hoje(); const s = E.cards[card.id] || {box:0, due:h, vistos:0, erros:0, acertos:0};
  if (!E.cards[card.id]) E["novos_"+h] = novosHoje() + 1;
  s.erros = s.erros || 0; s.acertos = s.acertos || 0;
  if (acertou) { s.acertos++; s.box = Math.min(s.box + 1, INTERVALOS.length - 1); }
  else { s.erros++; s.box = 0; }
  // quanto mais erros no histórico, menor o intervalo
  const taxa = s.erros / (s.erros + s.acertos);
  const fator = taxa > 0.5 ? 0.4 : taxa > 0.25 ? 0.7 : 1;
  s.due = acertou ? somaDias(h, Math.max(1, Math.round(INTERVALOS[s.box] * fator))) : h;
  s.vistos = (s.vistos||0) + 1;
  const jaHoje = s.dia === h; s.dia = h; // o mesmo cartão só rende pontos uma vez por dia
  E.cards[card.id] = s; marcarEstudo(); if (!jaHoje) ganharXP(acertou ? 10 : 4); salvar();
}
function dificuldade(id) { const s = E.cards[id]; if (!s || !(s.erros||0) && !(s.acertos||0)) return null; return s.erros / (s.erros + s.acertos); }
function rotuloDif(id) { const d = dificuldade(id); if (d === null) return ""; return d >= 0.5 ? "difícil" : d >= 0.25 ? "médio" : "fácil"; }

/* comparação de respostas digitadas: ignora maiúsculas, pontuação e, com aviso, os sinais poloneses */
const SEM_SINAIS = {"ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z"};
const limpa = s => s.toLowerCase().replace(/[…!?.,;:„”"«»()–—-]/g," ").replace(/\s+/g," ").trim();
const tiraSinais = s => s.replace(/[ąćęłńóśźż]/g, ch => SEM_SINAIS[ch]);
function distancia(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({length:n+1}, (_,j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1]?0:1)); prev = cur; }
  return prev[n]; }
function conferir(resposta, esperado) {
  const r = limpa(resposta); if (!r) return {ok:false};
  const alternativas = esperado.split(" / ").map(limpa).concat([limpa(esperado)]);
  for (const alt of alternativas) {
    if (r === alt) return {ok:true};
    if (tiraSinais(r) === tiraSinais(alt)) return {ok:true, aviso:"Certo! Só faltaram os sinais poloneses: " + esperado};
    if (alt.length >= 6 && distancia(tiraSinais(r), tiraSinais(alt)) <= 1) return {ok:true, aviso:"Quase perfeito. A grafia certa é: " + esperado};
  }
  return {ok:false};
}
function opcoesPara(card, campo) {
  const mesmoDeck = todosCards.filter(c => c.deck === card.deck && c.id !== card.id);
  const outros = todosCards.filter(c => c.deck !== card.deck);
  const distr = embaralhar(mesmoDeck).slice(0,3);
  while (distr.length < 3) distr.push(embaralhar(outros)[0]);
  return embaralhar([card, ...distr]).map(c => ({id:c.id, txt:c[campo]}));
}

/* ===================== ÁUDIO ===================== */
let vozPL = null;
function acharVoz() { try { const vs = speechSynthesis.getVoices(); vozPL = vs.find(v => /^pl/i.test(v.lang)) || null; } catch(e) { vozPL = null; } }
try { acharVoz(); speechSynthesis.onvoiceschanged = () => { acharVoz(); render(); }; } catch(e) {}
function chaveAudio(t){ if (AUDIOS[t]) return t; const n=t.trim(); return AUDIOS[n] ? n : null; }
let tocando = null;
const audioCarregando = {};
function carregarAudio(id) {
  if (!audioCarregando[id]) audioCarregando[id] = fetch("audio/" + id + ".json").then(r => r.ok ? r.json() : {}).then(m => { Object.assign(AUDIOS, m); }).catch(() => {});
  return audioCarregando[id];
}
function falar(txt, lento) {
  if (!chaveAudio(txt) && idxAudio(txt)) { carregarAudio(idxAudio(txt)).then(() => { if (chaveAudio(txt)) falar(txt, lento); else falarSintetico(txt, lento); }); return; }
  const k = chaveAudio(txt);
  if (k) { try { speechSynthesis.cancel(); } catch(e) {} try { if (tocando) tocando.pause(); tocando = new Audio("data:audio/mpeg;base64," + AUDIOS[k]); tocando.playbackRate = lento ? 0.7 : 1; tocando.play().catch(()=>{}); return; } catch(e) {} }
  falarSintetico(txt, lento);
}
function falarSintetico(txt, lento) {
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt.replace(/…/g,"")); u.lang = "pl-PL"; if (vozPL) u.voice = vozPL; u.rate = lento ? 0.55 : 0.85; speechSynthesis.speak(u); } catch(e) {}
}
const ICONE_AUDIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
const btnAudio = txt => (chaveAudio(txt) || idxAudio(txt) || vozPL) ? `<button class="audio" data-falar="${esc(txt)}" aria-label="Ouvir em polonês">${ICONE_AUDIO}</button>` : "";
const ICONE_LENTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15c0-4 3.6-7 8-7s8 3 8 7z"/><path d="M19 13h1.5a1.5 1.5 0 0 0 0-3H19"/><path d="M6 15v3M16 15v3M9 8.5 11 15M13 8.5 11 15"/></svg>';
const btnLento = txt => (chaveAudio(txt) || vozPL) ? `<button class="audio" data-falar-lento="${esc(txt)}" aria-label="Ouvir devagar" title="Ouvir devagar">${ICONE_LENTO}</button>` : "";
const btnsAudio = txt => `<span class="par-audio">${btnAudio(txt)}${btnLento(txt)}</span>`;

/* ===================== VOZ (reconhecimento de fala do navegador) ===================== */
const Reconhecedor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
// dentro do claude.ai a página roda num quadro que bloqueia o microfone; o Chrome deixa perguntar isso antes
const MIC_BLOQUEADO = (() => { try { const p = document.permissionsPolicy || document.featurePolicy; return !!p && !p.allowsFeature("microphone"); } catch(e) { return false; } })();
const VOZ_OK = !!Reconhecedor && !MIC_BLOQUEADO;
const ICONE_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>';
const ERROS_VOZ = {
  "not-allowed": "O microfone foi bloqueado. Se o app está aberto dentro do claude.ai, o microfone fica bloqueado por segurança: a fala funciona com o app aberto fora dele. Fora do claude.ai, libere o microfone nas configurações do navegador.",
  "service-not-allowed": "O navegador não permitiu o reconhecimento de voz aqui. Tente abrir o app no Chrome ou no Safari.",
  "audio-capture": "Não encontrei um microfone neste aparelho.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale perto do aparelho.",
  "network": "O reconhecimento de voz precisa de internet. Verifique a conexão.",
  "language-not-supported": "Este navegador não reconhece polonês. Tente o Chrome."
};
const voz = { k: null, rec: null, parcial: "", res: {}, erro: null, erroK: null };
const palavrasDe = s => tiraSinais(limpa(s)).split(" ").filter(Boolean);
// compara o que foi dito com o esperado, palavra por palavra (maior subsequência comum, tolerando 1 letra)
function compararFala(dito, esperado) {
  const d = palavrasDe(dito), e = palavrasDe(esperado), orig = limpa(esperado).split(" ").filter(Boolean);
  const igual = (a, b) => a === b || (b.length >= 4 && distancia(a, b) <= 1);
  const m = e.length, n = d.length, L = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i = m-1; i >= 0; i--) for (let j = n-1; j >= 0; j--) L[i][j] = igual(e[i], d[j]) ? L[i+1][j+1] + 1 : Math.max(L[i+1][j], L[i][j+1]);
  const ok = new Array(m).fill(false); let i = 0, j = 0;
  while (i < m && j < n) { if (igual(e[i], d[j])) { ok[i] = true; i++; j++; } else if (L[i+1][j] >= L[i][j+1]) i++; else j++; }
  return { score: m ? Math.round(ok.filter(Boolean).length / m * 100) : 0, marcas: orig.map((w, k) => ({w, ok: ok[k]})) };
}
function renderMantendo() { const y = main.scrollTop; render(); main.scrollTop = y; }
function irAba(a) {
  pararVoz(); aba = a; sessao = null; dialogo = null; entrev = null; simul = null; nvTela = null;
  try { localStorage.setItem(LS+"-aba", aba); } catch(e) {}
  render(); main.scrollTop = 0;
}
function pararVoz() { try { if (voz.rec) voz.rec.stop(); } catch(e) {} }
function iniciarVoz(k, esperado, aoTerminar) {
  if (!Reconhecedor) return;
  if (voz.rec) { const mesmo = voz.k === k; pararVoz(); if (mesmo) return; }
  try { speechSynthesis.cancel(); if (tocando) tocando.pause(); } catch(e) {}
  const rec = new Reconhecedor();
  rec.lang = "pl-PL"; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = false;
  let finais = [];
  voz.k = k; voz.rec = rec; voz.parcial = ""; voz.erro = null; voz.erroK = null;
  rec.onresult = ev => {
    let parcial = ""; finais = [];
    for (const r of ev.results) { if (r.isFinal) finais.push(Array.from(r).map(a => a.transcript.trim())); else parcial += r[0].transcript; }
    voz.parcial = (finais.map(f => f[0]).join(" ") + " " + parcial).trim();
    const el = main.querySelector(`[data-voz-parcial="${k}"]`); if (el) el.textContent = voz.parcial || "Fale em polonês…";
  };
  rec.onerror = ev => { voz.erro = ERROS_VOZ[ev.error] || (ev.error === "aborted" ? null : "Não consegui ouvir. Tente de novo."); voz.erroK = k; };
  rec.onend = () => {
    // entre as alternativas do reconhecedor, fica a que mais se parece com o esperado
    const cands = finais.length ? finais[0].map(a => [a, ...finais.slice(1).map(f => f[0])].join(" ")) : (voz.parcial ? [voz.parcial] : []);
    if (cands.length) {
      const avaliados = cands.map(t => Object.assign({texto: t}, compararFala(t, esperado)));
      voz.res[k] = avaliados.reduce((a, b) => b.score > a.score ? b : a);
      voz.erro = null; voz.erroK = null;
      if (aoTerminar) aoTerminar(voz.res[k]);
    } else if (!voz.erro) { voz.erro = ERROS_VOZ["no-speech"]; voz.erroK = k; }
    voz.rec = null; voz.k = null; renderMantendo();
  };
  try { rec.start(); } catch(e) { voz.rec = null; voz.k = null; voz.erro = "Não consegui ligar o microfone. Tente de novo."; voz.erroK = k; }
  renderMantendo();
}
const SEM_VOZ = MIC_BLOQUEADO
  ? "Aqui dentro do claude.ai o microfone fica bloqueado por segurança, então o app não consegue ouvir você. A fala funciona com o app aberto fora do claude.ai, no Chrome ou no Safari. Enquanto isso, ouça o modelo e repita em voz alta."
  : "Este navegador não tem reconhecimento de voz. Abra o app no Chrome (computador ou Android) ou no Safari (iPhone). No Firefox não funciona.";
const marcasVoz = r => `<div class="marcas" aria-label="Palavras do modelo: verdes você disse, sublinhadas faltaram">${r.marcas.map(m => `<span class="${m.ok ? "m-ok" : "m-no"}">${esc(m.w)}</span>`).join("")}</div>`;
const entendeuVoz = r => `<div style="margin-top:4px;font-size:13px">O app entendeu: «${esc(r.texto)}» · ${r.score}%</div>${marcasVoz(r)}`;
function blocoVoz(k, esperado, rotulo, acao) {
  const ouvindo = voz.k === k, r = voz.res[k], erro = voz.erroK === k ? voz.erro : null;
  let resultado = "";
  if (r && !ouvindo) {
    const nivel = r.score >= 85 ? ["ok", "Excelente! Deu para entender tudo."] : r.score >= 60 ? ["ok", "Bom! Quase tudo certo."] : ["no", "Ainda não. Ouça o modelo e tente de novo."];
    resultado = `<div class="feedback ${nivel[0]}"><b>${r.score}%</b> · ${nivel[1]}${entendeuVoz(r)}</div>`;
  }
  return `<div class="voz">
    <button class="btn-voz ${ouvindo ? "on" : ""}" data-acao="${VOZ_OK ? (acao || "voz") : "vozIndisponivel"}" data-k="${k}" data-esp="${esc(esperado)}" aria-pressed="${ouvindo}">${ICONE_MIC}${ouvindo ? "Ouvindo… toque para parar" : (r ? "Tentar de novo" : rotulo)}</button>
    ${ouvindo ? `<span class="voz-parcial" data-voz-parcial="${k}" aria-live="polite">${esc(voz.parcial || "Fale em polonês…")}</span>` : ""}
    ${erro ? `<div class="feedback no">${esc(erro)}</div>` : ""}
    ${resultado}
  </div>`;
}

/* ===================== UTIL ===================== */
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const embaralhar = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const semente = s => { let h = 0; for (const ch of s) h = (h*31 + ch.charCodeAt(0)) >>> 0; return h; };
// item do dia: embaralha a lista uma vez por ciclo e anda um item por dia,
// então dias seguidos não caem em itens vizinhos e nada se repete antes de passar por todos
function doDia(lista, sal) {
  const n = lista.length, dia = diasEntre("2026-01-01", hoje()), ciclo = Math.floor(dia / n);
  let s = semente(sal + ciclo) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const ordem = lista.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  return lista[ordem[((dia % n) + n) % n]];
}
const main = document.getElementById("main");

/* ===================== NAVEGAÇÃO ===================== */
let aba = "hoje";
try { const a = localStorage.getItem(LS+"-aba"); if (a) aba = a; } catch(e) {}
let sessao = null;  // sessão de cartões em andamento
let dialogo = null; // situação em andamento
let entrev = null;  // treino de entrevista em andamento

document.querySelector("nav.abas").addEventListener("click", e => {
  const b = e.target.closest("button[data-aba]"); if (!b) return;
  aba = b.dataset.aba; sessao = null; dialogo = null; entrev = null; simul = null; licao = null; nvTela = null; nvModeloId = null; pararVoz();
  try { localStorage.setItem(LS+"-aba", aba); } catch(e) {}
  render(); main.scrollTop = 0;
});
main.addEventListener("click", e => {
  const fl = e.target.closest("[data-falar-lento]"); if (fl) { falar(fl.dataset.falarLento, true); return; }
  const f = e.target.closest("[data-falar]"); if (f) { falar(f.dataset.falar); return; }
  const a = e.target.closest("[data-acao]"); if (a) acoes[a.dataset.acao](a.dataset);
});

function render() {
  // a aba salva pode ainda não estar liberada (ex.: objetivo mudou); o treino de fala abre por atalho mesmo antes do Exame
  if (!liberado(aba) && !(aba === "nivel" && nvTela === "fala" && liberado("fala"))) aba = "hoje";
  const atual = aba === "nivel" && nvTela === "fala" ? "fala" : aba;
  if (RECURSOS[atual] && !(E.recursosVistos || []).includes(atual)) { (E.recursosVistos = E.recursosVistos || []).push(atual); salvar(); }
  let visiveis = 0;
  document.querySelectorAll("nav.abas button").forEach(b => {
    const ok = liberado(b.dataset.aba); b.hidden = !ok; if (ok) visiveis++;
    b.classList.toggle("novo", ok && !!RECURSOS[b.dataset.aba] && !(E.recursosVistos || []).includes(b.dataset.aba));
    b.setAttribute("aria-current", b.dataset.aba === aba ? "page" : "false");
  });
  document.querySelector("nav.abas").style.gridTemplateColumns = `repeat(${visiveis}, 1fr)`;
  document.getElementById("chama-n").textContent = sequenciaAtual();
  document.getElementById("nivel-n").textContent = infoNivel().n;
  document.getElementById("chama").title = `Dias seguidos estudando · ${E.bloqueios||0} de ${MAX_BLOQUEIOS} bloqueios guardados`;
  renderFesta();
  if (sessao) return renderSessao();
  if (dialogo) return renderDialogo();
  if (entrev) return renderEntrevista();
  if (aba === "curso") { if (simul) return renderSimul(); if (licao) return renderLicao(); }
  if (aba === "nivel") { if (simul) return renderSimul(); if (nvTela === "escrita") return renderEscrita(); if (nvTela === "fala") return renderFala(); }
  ({hoje:renderHoje, cartoes:renderCartoes, situacoes:renderSituacoes, entrevista:renderEntrevistaInicio, progresso:renderProgresso, nivel:renderNivel, curso:renderCurso})[aba]();
}

/* ===================== HOJE ===================== */
function fraseDoDia() {
  const pool = todosCards.filter(c => ["consul","apres","ajuda","cump"].includes(c.deck));
  return doDia(pool, "frase");
}
/* objetivo escolhido na primeira vez: define a meta (nível do Quadro Europeu) e o próximo passo sugerido */
const OBJETIVOS = [
  {id:"karta", ic:"🏛️", nome:"Entrevista da Karta Polaka", meta:"A2", desc:"Responder ao cônsul sobre você, sua família e a cultura polonesa.", foco:"Treinar a entrevista", acao:"irEntrevista"},
  {id:"familia", ic:"👨‍👩‍👧", nome:"Falar com a família", meta:"A2", desc:"Conversar com parentes e entender a história da família.", foco:"Praticar uma situação", acao:"irSituacoes"},
  {id:"viagem", ic:"✈️", nome:"Viajar para a Polônia", meta:"A2", desc:"Pedir comida, comprar, pegar transporte e pedir ajuda. Com B1 você se vira com folga.", foco:"Praticar uma situação", acao:"irSituacoes"},
  {id:"cultura", ic:"📚", nome:"Curiosidade e cultura", meta:"A1", desc:"Entender o básico e conhecer a cultura polonesa.", foco:"Fazer a lição do dia", acao:"licao"}
];
function renderObjetivo() {
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Witaj! Bem-vindo</span><h1>Por que você quer aprender polonês?</h1>
    <p class="sub">Com isso o app mostra a meta certa para você. Dá para mudar depois, na aba Progresso.</p></div>
    <div class="lista">${OBJETIVOS.map(o => `<button class="item objetivo" data-acao="objetivo" data-id="${o.id}">
      <span class="ic" aria-hidden="true">${o.ic}</span>
      <div class="txt"><b>${esc(o.nome)}</b><small>${esc(o.desc)}</small></div><span class="pill">Meta ${o.meta}</span></button>`).join("")}</div>
    <button class="btn sec" data-acao="objetivo" data-id="depois">Escolher depois</button>
  </div>`;
}
function cartaoObjetivo() {
  const o = OBJETIVOS.find(x => x.id === E.objetivo); if (!o) return "";
  const apr = aprendidos(), pct = Math.round(apr / todosCards.length * 100);
  const sims = Object.values(nvEstado().sim), passou = sims.filter(r => r.pontos/r.max >= 0.5).length;
  const especifico = o.id === "karta" ? `${Object.values(E.ent).filter(x => x === 2).length} de ${ENTREVISTA.length} perguntas do cônsul dominadas`
    : o.id === "cultura" ? `${Object.keys(E.dias).filter(d => E.dias[d] > 0).length} dias de estudo`
    : `${SITUACOES.filter(s => E.sit[s.id] === s.passos.length).length} de ${SITUACOES.length} situações sem erro`;
  return `<div class="card plano">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="eyebrow">Seu objetivo</span><span class="pill">Meta ${o.meta}</span></div>
    <div class="objetivo"><span class="ic" aria-hidden="true">${o.ic}</span><b style="font-size:16px">${esc(o.nome)}</b></div>
    <div class="mini-barra"><i style="width:${pct}%"></i></div>
    <span class="sub" style="font-size:12.5px">${apr} de ${todosCards.length} cartões aprendidos (${pct}%) · ${especifico}${o.meta === "A2" ? ` · simulado A2: ${sims.length ? `passou em ${passou} de 2 partes` : "ainda não feito"}` : ""}</span>
    ${(() => { // se a seção do objetivo ainda está bloqueada, o botão leva à lição e diz quando ela chega
      const rec = {irEntrevista:"entrevista", irSituacoes:"situacoes", irExame:"nivel"}[o.acao];
      if (!rec || liberado(rec)) return `<button class="btn sec" data-acao="${o.acao}">${esc(o.foco)}</button>`;
      const nv = nivelDoRecurso(rec), falta = Math.max(0, ETAPAS[nv-1].xp - (E.xp||0));
      return `<span class="sub" style="font-size:12.5px">${RECURSOS[rec].ic} <b>${esc(RECURSOS[rec].nome)}</b> chega no nível ${nv} (${esc(ETAPAS[nv-1].cidade)}): faltam ${falta.toLocaleString("pt-BR")} XP.</span>
        <button class="btn sec" data-acao="licao">Fazer a lição do dia</button>`; })()}
  </div>`;
}
function renderHoje() {
  if (!E.objetivo) return renderObjetivo();
  const v = vencidos().length, n = Math.max(0, Math.min(NOVOS_POR_DIA - novosHoje(), novos().length));
  const totalLicao = Math.min(v, REVISOES_POR_DIA) + n;
  const f = fraseDoDia();
  const sit = doDia(SITUACOES, "situacao");
  const perg = doDia(ENTREVISTA, "consul");
  const estudouHoje = (E.dias[hoje()]||0) > 0;
  // uma ação principal; o resto só aparece se já estiver liberado, e no máximo dois extras
  const p = proximoPasso(totalLicao, v, n, sit);
  const nov = novidade(), rn = nov && RECURSOS[nov];
  const extras = [];
  const ordem = E.objetivo === "karta" ? ["consul", "fala", "sit"] : ["sit", "fala", "consul"];
  ordem.forEach(x => {
    if (x === "sit" && liberado("situacoes") && p.acao !== "abrirSit") extras.push(`<button class="item" data-acao="abrirSit" data-id="${sit.id}">
      <span class="ic-item" aria-hidden="true">💬</span><div class="txt"><small>Situação do dia</small><b>${esc(sit.titulo)}</b><small>${esc(sit.pl)} · ${sit.passos.length} falas</small></div>
      ${E.sit[sit.id] !== undefined ? `<span class="pill ${E.sit[sit.id]===sit.passos.length?"ok":""}">${E.sit[sit.id]}/${sit.passos.length}</span>` : `<span class="pill">Novo</span>`}</button>`);
    if (x === "consul" && liberado("entrevista") && p.acao !== "entrev3") extras.push(`<button class="item" data-acao="entrevUma" data-i="${ENTREVISTA.indexOf(perg)}">
      <span class="ic-item" aria-hidden="true">🏛️</span><div class="txt"><small>Pergunta do cônsul</small><b class="pl">${esc(perg[0])}</b><small>${esc(perg[1])}</small></div></button>`);
    if (x === "fala" && liberado("fala")) extras.push(`<button class="item" data-acao="irFala">
      <span class="ic-item" aria-hidden="true">🎤</span><div class="txt"><small>Treino de fala</small><b>Fale em polonês com o microfone</b><small>O app ouve, mostra o que entendeu e corrige</small></div></button>`);
  });
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">${new Date().toLocaleDateString("pt-BR",{weekday:"long", day:"numeric", month:"long"})}</span>
    <h1>${estudouHoje ? "Bom trabalho hoje!" : "Dzień dobry!"}</h1></div>
    ${rn ? `<div class="card novidade"><span class="eyebrow">Novo no seu app</span>
      <div class="objetivo"><span class="ic" aria-hidden="true">${rn.ic}</span><div style="display:grid;gap:2px"><b style="font-size:16px">${esc(rn.nome)}</b><span class="sub" style="font-size:13px">${esc(rn.desc)}</span></div></div>
      <button class="btn sec" data-acao="${rn.acao}">Experimentar</button></div>` : ""}
    <div class="destaque">
      <span class="eyebrow">${esc(p.eyebrow)}</span>
      <div class="pl">${esc(p.titulo)}</div>
      <div class="pt">${esc(p.sub)}</div>
      <button class="btn branco" data-acao="${p.acao}"${p.id ? ` data-id="${p.id}"` : ""}>${esc(p.botao)}</button>
    </div>
    ${cartaoResumo()}
    <div class="card plano">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><span class="eyebrow">Frase do dia</span>${btnsAudio(f.pl)}</div>
      <div class="pl" style="font-size:18px">${esc(f.pl)}</div>
      <span class="sub">${esc(f.pt)} · <i>${esc(f.pron)}</i></span>
      ${blocoVoz("dia-"+f.id, f.pl, "Repetir falando")}
    </div>
    ${extras.length ? `<h2 class="sub-grupo">Também hoje</h2><div class="lista">${extras.slice(0, 2).join("")}</div>` : ""}
    <p class="aviso-salvo">${fonte === "nuvem" ? "Progresso salvo na sua conta." : "Progresso salvo neste aparelho."}</p>
  </div>`;
}
function proximoPasso(totalLicao, v, n, sit) {
  if (totalLicao) return {eyebrow: "Lição do dia", titulo: `${totalLicao} cartões · cerca de ${Math.max(3, Math.round(totalLicao*0.5))} min`,
    sub: `${Math.min(v, REVISOES_POR_DIA)} para revisar e ${n} novos. O que você erra volta mais vezes.`, botao: "Começar", acao: "licao"};
  if (E.objetivo === "karta" && liberado("entrevista") && !fezHoje("ent-"))
    return {eyebrow: "Próximo passo", titulo: "Responder 3 perguntas do cônsul", sub: "Treine em voz alta as perguntas que você menos domina.", botao: "Começar", acao: "entrev3"};
  if (liberado("situacoes") && !fezHoje("sit-"))
    return {eyebrow: "Próximo passo", titulo: sit.titulo, sub: `${sit.pl} · ${sit.passos.length} falas para treinar`, botao: "Começar", acao: "abrirSit", id: sit.id};
  return {eyebrow: "Meta de hoje cumprida", titulo: "Muito bem! 🎉", sub: "Você já fez o principal de hoje. Volte amanhã para manter a sequência.", botao: "Estudar mais 5 cartões", acao: "extra"};
}
function fezHoje(prefixo) { const f = E.feitos; return !!f && f.dia === hoje() && Object.keys(f.k).some(k => k.startsWith(prefixo)); }
// resumo compacto da jornada e da semana; o detalhe fica na aba Progresso
function cartaoResumo() {
  const L = infoNivel(), seg = semanaDe(hoje()), n = diasNaSemana(seg), M = semanasComMedalha();
  const ganhou = n >= META_SEMANA, it = itemColecao(ganhou ? M.total - 1 : M.total), letras = ["S","T","Q","Q","S","S","D"];
  return `<div class="card plano clicavel" data-acao="irProgresso" role="button" tabindex="0" aria-label="Ver detalhes do seu progresso">
    <div style="display:flex;gap:10px;align-items:center">${L.extra ? `<div class="selo pequeno">${L.n}</div>` : iconeCidade(L.etapa.cidade, "resumo")}
      <div style="flex:1;min-width:0;display:grid;gap:5px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>${esc(L.titulo)} <span class="sub" style="font-size:12px;font-weight:400">· nível ${L.n}</span></b><span class="sub" style="font-size:12px;white-space:nowrap">faltam ${(L.prox - L.xp).toLocaleString("pt-BR")} XP</span></div>
      <div class="barra"><i style="width:${L.pct}%"></i></div></div></div>
    <div class="semana" aria-label="Dias estudados nesta semana">${letras.map((l,i) => { const d = somaDias(seg,i), on = (E.dias[d]||0) > 0;
      return `<div><i class="${on?"on":""} ${d===hoje()?"hoje":""}">${on?"✓":(E.diasBloqueados||{})[d]?"🧊":""}</i>${l}</div>`; }).join("")}</div>
    <span class="sub" style="font-size:12px">${ganhou ? `Medalha da semana: ${it.ic} ${esc(it.nome)}` : `${n} de ${META_SEMANA} dias para ganhar ${it.ic} ${esc(it.nome)}`} · 🧊 ${E.bloqueios||0} ${(E.bloqueios||0) === 1 ? "bloqueio" : "bloqueios"} · Ver progresso ›</span>
  </div>`;
}

/* ===================== DESBLOQUEIO PROGRESSIVO ===================== */
// cada recurso aparece num nível da jornada; o objetivo antecipa o que mais importa para ele
const RECURSOS = {
  // a prática principal do objetivo fica aberta desde o nível 1; o que é mais avançado chega depois
  entrevista: {nome: "Entrevista com o cônsul", ic: "🏛️", desc: "As perguntas da entrevista da Karta Polaka, com resposta modelo.", acao: "irEntrevista", nivel: {karta: 1, familia: 4, viagem: 5, cultura: 5, depois: 4}},
  situacoes: {nome: "Situações", ic: "💬", desc: "Conversas do dia a dia: você escolhe o que dizer e repete em voz alta.", acao: "irSituacoes", nivel: {karta: 3, familia: 1, viagem: 1, cultura: 3, depois: 3}},
  fala: {nome: "Treino de fala", ic: "🎤", desc: "Fale em polonês: o app ouve, mostra o que entendeu e corrige.", acao: "irFala", nivel: {karta: 3, familia: 3, viagem: 3, cultura: 4, depois: 3}},
  nivel: {nome: "Exame A2", ic: "🎓", desc: "Simulado da prova oficial, escrita e fala, para medir o seu nível.", acao: "irExame", nivel: {karta: 4, familia: 5, viagem: 5, cultura: 6, depois: 5}}
};
const nivelDoRecurso = id => RECURSOS[id].nivel[E.objetivo] || RECURSOS[id].nivel.depois;
// quem já usou um recurso antes desta versão continua com ele aberto
function jaUsou(id) {
  const N = E.nivel || {};
  if (id === "situacoes") return Object.keys(E.sit).length > 0;
  if (id === "entrevista") return Object.keys(E.ent).length > 0;
  if (id === "fala") return Object.keys(N.fala || {}).length > 0;
  if (id === "nivel") return Object.keys(N.sim || {}).length > 0 || Object.keys(N.textos || {}).length > 0;
  return false;
}
function liberado(id) { if (!RECURSOS[id]) return true; return !!E.mostrarTudo || jaUsou(id) || infoNivel().n >= nivelDoRecurso(id); }
function novidade() { return Object.keys(RECURSOS).find(id => liberado(id) && !(E.recursosVistos || []).includes(id)); }
function liberadosNoNivel(n) { return E.mostrarTudo ? [] : Object.keys(RECURSOS).filter(id => nivelDoRecurso(id) === n && !jaUsou(id)); }

/* ===================== CARTÕES ===================== */
// palavras de uma frase, sem pontuação: viram os blocos dos exercícios de montar e de ouvir
const blocosDe = t => t.replace(/[.,!?…;:„”"()]/g, " ").split(/\s+/).filter(Boolean);
const podeMontar = c => !c.pl.includes("/") && blocosDe(c.pl).length >= 2 && blocosDe(c.pl).length <= 10;
const temAudio = t => !!(chaveAudio(t) || idxAudio(t) || vozPL);
const semEscuta = () => (E.semEscutaAte || 0) > Date.now(); // "não posso ouvir agora" vale por 15 minutos
function tipoPergunta(c) {
  const box = (E.cards[c.id] || {}).box || 0;
  if (box === 0) return "escolhaPt";      // 1 ler: vê o polonês, escolhe o significado
  if (box === 1) return "escolhaPl";      // 2 entender: vê o português, escolhe o polonês
  const frase = podeMontar(c);
  // 3 montar: frases passam antes pelos blocos, a partir do português ou do áudio
  if (box === 2 && frase) return !semEscuta() && temAudio(c.pl) && semente(c.id + hoje()) % 2 ? "ouvir" : "montar";
  if (!VOZ_OK) return "digitar";          // 3 escrever: vê o português, escreve em polonês
  const k = frase ? box - 1 : box;        // quem passou pelos blocos chega um passo depois a escrever e falar
  return k === 2 ? "digitar" : k % 2 ? "falar" : "digitar"; // 4 falar; daí em diante alterna falar e escrever
}
const ETAPA = {escolhaPt: "1 · Ler", escolhaPl: "2 · Entender", montar: "3 · Montar", ouvir: "3 · Ouvir", digitar: "3 · Escrever", falar: "4 · Falar"};
// blocos: as palavras da frase mais algumas do mesmo tema, para confundir
function prepararBlocos(item) {
  if (item.blocos) return;
  const certas = blocosDe(item.card.pl), ja = new Set(certas.map(w => w.toLowerCase()));
  const doTema = todosCards.filter(c => c.deck === item.card.deck && c.id !== item.card.id).flatMap(c => blocosDe(c.pl));
  const extras = embaralhar([...new Set(doTema.filter(w => !ja.has(w.toLowerCase())))]).slice(0, Math.min(3, Math.max(2, Math.ceil(certas.length / 2))));
  item.blocos = embaralhar(certas.concat(extras)).map((w, i) => ({i, w}));
  item.escolhidos = [];
}
const blocosCertos = item => item.escolhidos.map(i => item.blocos[i].w.toLowerCase()).join(" ") === blocosDe(item.card.pl).map(w => w.toLowerCase()).join(" ");
// dica ao tocar numa palavra polonesa: palavras curtas mais comuns, mais os cartões de uma palavra só
const DICAS_EXTRA = {"nazywam":"chamo (nazywam się = eu me chamo)", "się":"se (reflexivo)", "jest":"é / está", "jestem":"sou / estou", "nie":"não", "i":"e", "a":"e / mas", "ale":"mas", "w":"em", "we":"em", "z":"de / com", "ze":"de / com", "na":"em / sobre", "do":"para / até", "dla":"para", "o":"sobre / às", "to":"isto / é", "czy":"(abre pergunta de sim ou não)", "mam":"tenho", "ma":"tem", "pan":"o senhor", "pani":"a senhora", "proszę":"por favor", "jak":"como", "co":"o quê", "gdzie":"onde", "ja":"eu", "ty":"você", "on":"ele", "ona":"ela", "my":"nós", "mój":"meu", "moja":"minha", "moje":"meu / minha (neutro)", "jego":"dele", "jej":"dela", "bardzo":"muito", "tak":"sim", "już":"já", "jeszcze":"ainda", "tu":"aqui", "tutaj":"aqui", "tam":"lá", "teraz":"agora", "lubię":"gosto", "chcę":"quero", "mogę":"posso", "może":"pode / talvez", "polsku":"polonês (po polsku = em polonês)", "rodzina":"família", "dobrze":"bem"};
let DICAS = null;
function dicaDe(w) {
  if (!DICAS) { DICAS = new Map(); todosCards.forEach(c => { if (!c.pl.includes("/") && blocosDe(c.pl).length === 1) DICAS.set(blocosDe(c.pl)[0].toLowerCase(), c.pt.split(" / ")[0]); });
    Object.entries(DICAS_EXTRA).forEach(([k, v]) => DICAS.set(k, v)); }
  return DICAS.get(w.toLowerCase());
}
function comDicas(txt) {
  if (blocosDe(txt).length < 2) return esc(txt); // numa palavra só, a dica entregaria a resposta
  return txt.split(/(\s+)/).map(t => { const g = dicaDe(t.replace(/[.,!?…;:„”"()]/g, ""));
    return g ? `<span class="gl" tabindex="0" data-gl="${esc(g)}">${esc(t)}</span>` : esc(t); }).join("");
}
function montarFila(cards) { return cards.map(c => ({card:c, tipo: tipoPergunta(c)})); }
function iniciarSessao(cards, titulo) {
  if (!cards.length) return;
  sessao = {fila: montarFila(cards), pos: 0, virado: false, titulo, acertos: 0, total: cards.length, refeitos: 0, xp0: E.xp||0, errados: [], combo: 0, melhorCombo: 0};
  voz.res = {};
  render(); main.scrollTop = 0;
}
function renderSessao() {
  const s = sessao;
  if (s.pos >= s.fila.length) {
    main.innerHTML = `<div class="tela"><div class="vazio" style="padding-top:40px">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#DC143C" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
      <h1>Gotowe! Pronto!</h1>
      <p>${s.total} cartões revisados, ${s.acertos} de primeira.</p>
      <div class="resumo" style="width:100%"><div><b>${Math.round(s.acertos / s.total * 100)}%</b><span>de acerto</span></div><div><b>${s.melhorCombo || 0}</b><span>melhor sequência</span></div><div><b>+${Math.max(0, E.xp - s.xp0)}</b><span>XP</span></div></div>
      <p class="sub">Sequência: ${sequenciaAtual()} ${sequenciaAtual()===1?"dia":"dias"} seguidos.</p>
      ${s.errados.length ? `<h2 style="margin-top:8px">Para revisar: ${s.errados.length} ${s.errados.length === 1 ? "cartão" : "cartões"}</h2>
        <div class="lista-erros">${s.errados.map(c => `<div><span><b>${esc(c.pl)}</b><small>${esc(c.pt)}</small></span>${btnsAudio(c.pl)}</div>`).join("")}</div>
        <button class="btn sec" data-acao="treinarErrados" style="width:100%">Treinar estes agora</button>`
      : `<p class="sub">Nenhum erro nesta sessão. Ótimo!</p>`}
      <button class="btn" data-acao="sair" style="width:100%">Voltar</button></div></div>`;
    return;
  }
  const item = s.fila[s.pos], {card, tipo} = item;
  if ((tipo === "escolhaPt" || tipo === "escolhaPl") && !item.ops) item.ops = opcoesPara(card, tipo === "escolhaPt" ? "pt" : "pl");
  const pct = Math.round(s.pos / s.fila.length * 100);
  const mostraPl = tipo === "escolhaPt";
  const r = s.resultado; // null enquanto não respondeu
  const dif = rotuloDif(card.id);
  let corpo = "";
  if (tipo === "digitar") {
    corpo = `<label class="sub" for="dig-${s.pos}">Escreva em polonês</label>
      <input id="dig-${s.pos}" class="campo" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Np. Dzień dobry" value="${esc(s.digitado||"")}" ${r?"disabled":""}>
      ${r ? "" : `<div class="teclas">${"ąćęłńóśźż".split("").map(l => `<button class="tecla" data-acao="tecla" data-l="${l}" aria-label="Inserir ${l}">${l}</button>`).join("")}</div>
      <div class="linha-btn"><button class="btn sec" data-acao="naoSei">Não sei</button><button class="btn" data-acao="conferir">Conferir</button></div>`}`;
  } else if (tipo === "falar") {
    corpo = r ? "" : `${blocoVoz("card-"+s.pos, card.pl, "Falar em polonês", "vozCard")}
      <div class="linha-btn"><button class="btn sec" data-acao="falarPular">Agora não dá: escrever</button><button class="btn sec" data-acao="naoSei">Não sei</button></div>`;
  } else if (tipo === "montar" || tipo === "ouvir") {
    prepararBlocos(item);
    const usados = new Set(item.escolhidos);
    corpo = `<div class="resposta-blocos" aria-label="Sua resposta">${item.escolhidos.map(i => `<button class="bloco" data-acao="tirarBloco" data-i="${i}" ${r?"disabled":""}>${esc(item.blocos[i].w)}</button>`).join("") || `<span class="sub">Toque nas palavras na ordem certa</span>`}</div>
      ${r ? "" : `<div class="banco-blocos">${item.blocos.map(b => `<button class="bloco ${usados.has(b.i)?"usado":""}" data-acao="porBloco" data-i="${b.i}" ${usados.has(b.i)?"disabled":""}>${esc(b.w)}</button>`).join("")}</div>
      <div class="linha-btn">${tipo === "ouvir" ? `<button class="btn sec" data-acao="semEscuta">Não posso ouvir agora</button>` : ""}<button class="btn sec" data-acao="naoSei">Não sei</button><button class="btn" data-acao="conferirBlocos" ${item.escolhidos.length ? "" : "disabled"}>Conferir</button></div>`}`;
  } else {
    corpo = `<div class="opcoes">${item.ops.map(o => {
      const cls = !r ? "" : (o.id === card.id ? "certa" : (o.id === r.escolha ? "errada" : ""));
      return `<button class="opcao ${cls} ${tipo==="escolhaPl"?"opc-pl":""}" data-acao="responder" data-id="${o.id}" ${r?"disabled":""}>${esc(o.txt)}</button>`;
    }).join("")}</div>${r ? "" : `<button class="btn sec" data-acao="naoSei">Não sei</button>`}`;
  }
  main.innerHTML = `<div class="tela">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="eyebrow">${esc(s.titulo)}</span><span style="display:flex;gap:8px;align-items:center">${s.combo >= 3 ? `<span class="combo">🔥 ${s.combo} seguidos</span>` : ""}<span class="pill">${s.pos+1} / ${s.fila.length}</span></span></div>
    <div class="barra ${s.combo >= 5 ? "ouro" : ""}"><i style="width:${pct}%"></i></div>
    ${item.refeito && item.primeiroRefeito ? `<div class="aviso-revisao">Vamos revisar o que você errou. Agora vai!</div>` : ""}
    <div class="flash">
      <div class="dica">${item.refeito ? `<span class="tag-erro">Erro anterior</span>` : item.desafio ? `<span class="tag-desafio">Desafio</span>` : ""}<b style="color:var(--vermelho)">${ETAPA[tipo]}</b> · ${mostraPl ? "O que significa?" : tipo === "falar" ? "Diga em polonês" : tipo === "montar" ? "Monte em polonês" : tipo === "ouvir" ? "Toque no que você ouvir" : "Como se diz em polonês?"}${dif ? ` · <span class="dif dif-${dif}">${dif}</span>` : ""}</div>
      ${card.icone && ICONES[card.icone] && (tipo !== "ouvir" || r) ? `<div class="icone-card">${ICONES[card.icone]}</div>` : ""}
      ${tipo === "ouvir" ? (r ? "" : `<div class="ouvir-grande">${btnsAudio(card.pl)}</div>`) : `<div class="frente ${mostraPl?"pl":""}">${mostraPl ? comDicas(card.pl) : esc(card.pt)}</div>`}
      ${mostraPl ? `<div style="display:flex;justify-content:center">${btnsAudio(card.pl)}</div>` : ""}
    </div>
    ${corpo}
    ${r ? `<div class="feedback ${r.ok?"ok":"no"}">${r.ok ? (r.aviso ? esc(r.aviso) : "Certo!") : "Resposta certa:"}${r.voz ? entendeuVoz(r.voz) : ""}
        <div style="margin-top:6px;display:flex;gap:10px;align-items:center;justify-content:space-between">
          <div><b class="pl">${comDicas(card.pl)}</b><br><span class="pron">${esc(card.pron)}</span> · <span>${esc(card.pt)}</span></div>${btnsAudio(card.pl)}
        </div>
        ${card.nota ? `<div class="nota" style="margin-top:8px">${esc(card.nota)}</div>` : ""}
        <div class="fb-links">${item.fb ? `<span class="feito">${esc(item.fb)}</span>` : `<button data-acao="fbFacil">Fácil demais</button><button data-acao="fbDificil">Difícil demais</button>`}<button data-acao="reportar">Reportar erro no cartão</button></div>
      </div>
      ${tipo !== "falar" || !r.ok ? blocoVoz("rep-"+card.id, card.pl, "Repetir falando") : ""}
      <button class="btn" data-acao="proximo">${r.ok ? "Próximo" : "Entendi, próximo"}</button>` : ""}
    ${s.confirmarSaida ? `<div class="conf"><b>Não desista! Faltam ${s.fila.length - s.pos} cartões.</b>
        <span class="sub">Se sair agora, o que você já respondeu fica salvo.</span>
        <div class="linha-btn"><button class="btn sec" data-acao="sair">Sair mesmo assim</button><button class="btn" data-acao="ficar">Continuar</button></div></div>`
      : `<button class="btn sec" data-acao="sairSessao">Sair</button>`}
  </div>`;
  const campo = main.querySelector("input.campo");
  if (campo && !r) {
    campo.addEventListener("input", () => { s.digitado = campo.value; });
    campo.addEventListener("keydown", e => { if (e.key === "Enter") acoes.conferir(); });
    setTimeout(() => campo.focus(), 30);
  }
  if (tipo === "ouvir" && !r && !item.ouviu) { item.ouviu = true; falar(card.pl); } // o exercício de ouvir já abre tocando
  if (r && !item.audioTocado) { item.audioTocado = true; falar(card.pl); } // só uma vez: senão o microfone ouve o próprio app
}
function registrar(acertou, extra) {
  const s = sessao, item = s.fila[s.pos];
  s.resultado = Object.assign({ok: acertou}, extra||{});
  if (!item.contou) { // só a primeira tentativa de cada cartão conta para o histórico
    item.contou = true; avaliar(item.card, acertou);
    if (acertou && !item.refeito) s.acertos++;
  }
  if (!item.refeito) { // acertos seguidos; a cada 5, o próximo cartão já visto vira desafio (escrever)
    s.combo = acertou ? s.combo + 1 : 0; s.melhorCombo = Math.max(s.melhorCombo, s.combo);
    if (acertou && s.combo % 5 === 0) {
      const prox = s.fila.find((it, j) => j > s.pos && !it.refeito && !it.desafio && ["escolhaPt", "escolhaPl", "montar", "ouvir"].includes(it.tipo) && ((E.cards[it.card.id] || {}).box || 0) >= 1);
      if (prox) { prox.tipo = "digitar"; prox.desafio = true; avisar(`🔥 ${s.combo} seguidos! Vamos deixar um pouco mais difícil…`); }
    }
  }
  if (!acertou && !item.refeito) { // o erro volta no fim da mesma sessão, no mesmo tipo de exercício
    s.fila.push({card:item.card, tipo:item.tipo, refeito:true, contou:true, primeiroRefeito: !s.fila.some(it => it.refeito)});
    if (!s.errados.includes(item.card)) s.errados.push(item.card); // resumo do fim da sessão
  }
  render();
}

function itemDeck(d) {
      const tot = d.cards.length, apr = d.cards.filter((c,i) => (E.cards[idCard(d.id, c[0])]||{}).box >= 2).length, vistos = d.cards.filter((c,i) => E.cards[idCard(d.id, c[0])]).length;
      const errosDeck = d.cards.reduce((a,c,i) => a + ((E.cards[idCard(d.id, c[0])]||{}).erros||0), 0);
      return `<button class="item" data-acao="deck" data-id="${d.id}">
        <div class="txt"><b>${esc(d.nome)}</b><small>${tot} cartões · ${vistos ? `${apr} aprendidos · ${errosDeck} ${errosDeck===1?"erro":"erros"}` : "não começado"}</small>
        <div class="mini-barra"><i style="width:${Math.round(apr/tot*100)}%"></i></div></div>
        <span class="pill ${apr===tot?"ok":""}">${apr}/${tot}</span></button>`;
    }
function renderCartoes() {
  const v = vencidos().length;
  const nDificeis = todosCards.filter(c => (E.cards[c.id]||{}).erros > 0).length;
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Fiszki</span><h1>Cartões por tema</h1>
    <p class="sub">Escolha um tema para estudar. ${v ? `Você tem ${v} revisões pendentes.` : ""}</p></div>
    ${v ? `<button class="btn" data-acao="revisar">Revisar ${Math.min(v, 20)} cartões pendentes</button>` : ""}
    ${nDificeis ? `<button class="btn sec" data-acao="dificeis">Treinar os ${Math.min(nDificeis,12)} que você mais erra</button>` : ""}
    <h2 class="sub-grupo">Recomendados para você</h2>
    <div class="lista">${ordemDecks().slice(0, 4).map(id => DECKS.find(d => d.id === id)).filter(Boolean).map(itemDeck).join("")}</div>
    <details class="todos"><summary>Todos os temas (${DECKS.length})</summary>
      <p class="sub" style="font-size:12.5px">Cada cartão passa por 4 etapas: <b>1 Ler</b> (escolhe o significado) → <b>2 Entender</b> (escolhe o polonês) → <b>3 Escrever</b> → <b>4 Falar</b> no microfone. Depois disso, alterna escrever e falar. Cada erro faz o cartão voltar mais cedo.</p>
      <h2 class="sub-grupo">Frases para usar</h2>
      <div class="lista">${DECKS.filter(d => !d.grupo).map(itemDeck).join("")}</div>
      <h2 class="sub-grupo">Tempo, datas e números</h2>
      <div class="lista">${DECKS.filter(d => d.grupo === "tempo").map(itemDeck).join("")}</div>
      <h2 class="sub-grupo">Vocabulário por tema</h2>
      <p class="sub" style="font-size:12.5px">Quando a palavra aparece no dicionário de expressões do Pleciński, a dica do cartão traz a expressão com ela.</p>
      <div class="lista">${DECKS.filter(d => d.grupo === "vocab").map(itemDeck).join("")}</div>
    </details>
  </div>`;
}

/* ===================== SITUAÇÕES ===================== */
function renderSituacoes() {
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Sytuacje</span><h1>Situações do dia a dia</h1>
    <p class="sub">Converse escolhendo a resposta certa. Toque no alto-falante para ouvir cada fala.</p></div>
    <div class="lista">${SITUACOES.map(s => `<button class="item" data-acao="abrirSit" data-id="${s.id}">
      <div class="txt"><b>${esc(s.titulo)}</b><small>${esc(s.pl)} · ${s.passos.length} falas</small></div>
      ${E.sit[s.id]!==undefined ? `<span class="pill ${E.sit[s.id]===s.passos.length?"ok":""}">${E.sit[s.id]}/${s.passos.length}</span>` : `<span class="pill">Novo</span>`}
    </button>`).join("")}</div>
  </div>`;
}
function renderDialogo() {
  const d = dialogo, s = d.sit;
  let html = `<div class="tela"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><span class="eyebrow">${esc(s.pl)}</span><h1 style="font-size:20px">${esc(s.titulo)}</h1></div><span class="pill">${Math.min(d.passo+1, s.passos.length)}/${s.passos.length}</span></div><div class="chat">`;
  d.historico.forEach(h => {
    if (h.ctx) html += `<div class="contexto">${esc(h.ctx)}</div>`;
    if (h.npc) html += `<div class="bolha eles"><div class="topo-b"><b class="pl">${esc(h.npc[0])}</b>${btnsAudio(h.npc[0])}</div><span class="pt-b">${esc(h.npc[1])}</span></div>`;
    if (h.eu) html += `<div class="bolha eu"><b>${esc(h.eu[0])}</b><span class="pt-b">${esc(h.eu[1])}</span></div>`;
  });
  html += `</div>`;
  if (d.passo < s.passos.length) {
    const p = s.passos[d.passo];
    html += `<div class="opcoes">${d.ops.map((o,i) => {
      const cls = d.escolhida === null ? "" : (o[2] ? "certa" : (d.escolhida === i ? "errada" : ""));
      return `<button class="opcao ${cls}" data-acao="escolher" data-i="${i}" ${d.escolhida!==null?"disabled":""}>${esc(o[0])}${d.escolhida!==null ? `<small>${esc(o[1])}</small>` : ""}</button>`;
    }).join("")}</div>`;
    if (d.escolhida !== null) {
      const o = d.ops[d.escolhida];
      html += `<div class="feedback ${o[2]?"ok":"no"}">${o[2] ? "Isso! " : "Quase. "}${esc(o[3])}</div>
      ${o[2] ? blocoVoz(`sit-${s.id}-${d.passo}`, o[0], "Agora diga em voz alta") : ""}
      <button class="btn" data-acao="proxPasso">${d.passo+1 < s.passos.length ? "Continuar" : "Ver resultado"}</button>`;
    } else {
      html += `<p class="sub" style="text-align:center">Escolha o que você diria.</p>`;
    }
  } else {
    html += `<div class="card"><h2>${d.acertos} de ${s.passos.length} de primeira</h2>${E.xp - d.xp0 > 0 ? `<span class="pill xp-ganho" style="justify-self:start">+${E.xp - d.xp0} XP</span>` : ""}<p class="sub">${d.acertos===s.passos.length ? "Conversa perfeita. Tente falar as frases em voz alta antes de tocar." : "Repita a situação até acertar tudo de primeira."}</p>
      <div class="linha-btn"><button class="btn sec" data-acao="abrirSit" data-id="${s.id}">Repetir</button><button class="btn" data-acao="sair">Voltar</button></div></div>`;
  }
  html += `</div>`;
  main.innerHTML = html;
}
function prepararPasso() {
  const p = dialogo.sit.passos[dialogo.passo];
  dialogo.historico.push(p.ctx ? {ctx:p.ctx} : {npc:p.npc});
  dialogo.ops = embaralhar(p.op); dialogo.escolhida = null;
  if (p.npc) falar(p.npc[0]);
}

/* ===================== ENTREVISTA ===================== */
function renderEntrevistaInicio() {
  const feitas = Object.keys(E.ent).length, boas = Object.values(E.ent).filter(x => x === 2).length;
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Rozmowa z konsulem</span><h1>Treino da entrevista</h1>
    <p class="sub">O cônsul pergunta, você responde em voz alta ou por escrito e depois compara com a resposta modelo. Use sempre Pan / Pani.</p></div>
    <div class="resumo"><div><b>${ENTREVISTA.length}</b><span>perguntas</span></div><div><b>${feitas}</b><span>treinadas</span></div><div><b>${boas}</b><span>dominadas</span></div></div>
    <button class="btn" data-acao="entrevTodas">Simular entrevista (8 perguntas)</button>
    <button class="btn sec" data-acao="entrevFracas">Treinar as mais difíceis</button>
    <div class="card plano"><span class="eyebrow">Se não entender</span>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><b class="pl">Przepraszam, czy może Pan powtórzyć?</b>${btnAudio("Przepraszam, czy może Pan powtórzyć?")}</div>
      <span class="sub">Desculpe, o senhor pode repetir?</span>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><b class="pl">Proszę mówić wolniej.</b>${btnAudio("Proszę mówić wolniej.")}</div>
      <span class="sub">Por favor, fale mais devagar.</span></div>
  </div>`;
}
function iniciarEntrevista(indices) {
  entrev = {fila: indices, pos: 0, revelado: false, notas: [], xp0: E.xp||0}; voz.res = {}; render(); main.scrollTop = 0;
  const q = ENTREVISTA[indices[0]]; falar(q[0]);
}
function renderEntrevista() {
  const t = entrev;
  if (t.pos >= t.fila.length) {
    const boas = t.notas.filter(n => n === 2).length;
    main.innerHTML = `<div class="tela"><div class="vazio" style="padding-top:30px"><h1>Dziękuję, to wszystko.</h1>
      <p>Você se saiu bem em ${boas} de ${t.fila.length} perguntas.</p>
      ${E.xp - t.xp0 > 0 ? `<span class="pill xp-ganho">+${E.xp - t.xp0} XP</span>` : ""}
      <p class="sub">As que ficaram difíceis aparecem em "Treinar as mais difíceis".</p>
      <button class="btn" data-acao="sair" style="width:100%">Voltar</button></div></div>`;
    return;
  }
  const q = ENTREVISTA[t.fila[t.pos]];
  main.innerHTML = `<div class="tela">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Pergunta ${t.pos+1} de ${t.fila.length}</span><button class="btn sec" style="min-height:0;padding:6px 12px;font-size:13px" data-acao="sair">Sair</button></div>
    <div class="destaque">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><span class="eyebrow">Konsul</span>${btnsAudio(q[0])}</div>
      <div class="pl">${esc(q[0])}</div>
      <div class="pt">${t.mostrarPt ? esc(q[1]) : `<button class="btn claro" style="min-height:0;padding:5px 10px;font-size:12px" data-acao="verPt">Ver tradução</button>`}</div>
    </div>
    <label class="sub" for="resp-${t.pos}">Sua resposta (opcional: fale em voz alta e escreva o que disse)</label>
    <textarea id="resp-${t.pos}" placeholder="Np. Nazywam się…" autocapitalize="sentences">${esc(t.rascunho||"")}</textarea>
    ${t.revelado ? "" : blocoVoz(`ent-${t.fila[t.pos]}-${t.pos}`, "", (t.rascunho||"").trim() ? "Falar mais" : "Responder falando", "vozDitar")}
    ${t.revelado ? `<div class="card">
        <span class="eyebrow">Resposta modelo</span>
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><b class="pl">${esc(q[2])}</b>${btnAudio(q[2])}</div>
        <span class="sub">${esc(q[3])}</span>
        ${(t.rascunho||"").trim() ? (() => { const c = compararFala(t.rascunho, q[2]);
          return `<div class="nota"><b>Sua resposta × modelo: ${c.score}%</b><br><span style="font-size:12.5px">Sua resposta pode ser diferente e estar certa. Use as marcas para ver o que faltou.</span>${marcasVoz(c)}</div>`; })() : ""}
        ${blocoVoz(`entm-${t.fila[t.pos]}`, q[2], "Repetir o modelo falando")}
      </div>
      <p class="sub" style="text-align:center">Como foi?</p>
      <div class="linha-btn notas-btn">
        <button class="btn errei" data-acao="notaEnt" data-n="0">Travei</button>
        <button class="btn dificil" data-acao="notaEnt" data-n="1">Mais ou menos</button>
        <button class="btn" data-acao="notaEnt" data-n="2">Consegui</button>
      </div>` : `<button class="btn" data-acao="revelar">Ver resposta modelo</button>`}
  </div>`;
  const ta = main.querySelector("textarea"); ta.addEventListener("input", () => { t.rascunho = ta.value; });
}

/* ===================== PROGRESSO ===================== */
let progSec = "resumo";
try { progSec = localStorage.getItem(LS+"-progSec") || "resumo"; } catch(e) {}
const SECOES_PROG = [["resumo", "Resumo"], ["jornada", "Jornada"], ["colecao", "Coleção"], ["conquistas", "Conquistas"], ["galeria", "Galeria"]];
function renderProgresso() {
  if (!SECOES_PROG.some(s => s[0] === progSec)) progSec = "resumo";
  const totalDias = Object.keys(E.dias).length;
  const conteudo = progSec === "resumo" ? secResumo(totalDias) : secRecompensas(progSec);
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Postępy</span><h1>Seu progresso</h1></div>
    <div class="seg seg-prog" role="group" aria-label="Seções do progresso">${SECOES_PROG.map(([id, nome]) => `<button data-acao="progSec" data-id="${id}" aria-pressed="${progSec === id}">${nome}</button>`).join("")}</div>
    ${conteudo}
  </div>`;
}
function secRecompensas(sec) {
    return `${(() => { const L = infoNivel(), M = semanasComMedalha(), ult8 = M.lista.slice(-8);
      return `${sec !== "jornada" ? "" : `${cartaoJornada()}<div class="card plano"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Jornada pela Polônia</span><span class="pill">${L.xp.toLocaleString("pt-BR")} XP</span></div>
      <div class="trilha">${ETAPAS.map((e,i) => { const feita = L.xp >= e.xp, atual = i === L.i;
        const ic = iconeCidade(e.cidade);
        return `<div class="parada ${ic?"com-ic":""} ${feita?"feita":"bloq"} ${atual?"atual":""}"><span class="pto">${feita && !atual ? "✓" : i+1}</span>
          ${ic}<div><b>${esc(e.cidade)}</b>${atual || feita ? `<small>${esc(e.desc)}</small>` : ""}${atual && !L.extra ? `<div class="mini-barra" style="margin-top:6px"><i style="width:${L.pct}%"></i></div>` : ""}</div>
          <span class="sub" style="font-size:12px;font-variant-numeric:tabular-nums">${e.xp.toLocaleString("pt-BR")} XP</span></div>`; }).join("")}</div>
      ${L.extra ? `<span class="sub" style="font-size:12.5px">Jornada completa! ${esc(L.titulo)}. Próxima estrela em ${(L.prox - L.xp).toLocaleString("pt-BR")} XP.</span>` : ""}
      </div>`}
      ${sec !== "colecao" ? "" : `<div class="card plano"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Coleção polonesa</span><span class="pill">${Math.min(M.total, COLECAO.length)}/${COLECAO.length}</span></div>
        <span class="sub" style="font-size:12.5px">Cada semana com ${META_SEMANA} dias de estudo (de segunda a domingo) vale uma medalha: o próximo item da coleção e +100 XP.</span>
        <div class="resumo"><div><b>${M.total}</b><span>medalhas</span></div><div><b>${M.seguidas}</b><span>semanas seguidas</span></div><div><b>${xpDaSemana()}</b><span>XP nesta semana</span></div></div>
        <div class="conqs">${COLECAO.map((it,k) => { const tem = M.total > k;
          return `<div class="conq ${tem?"":"bloq"}"><span class="ic" aria-hidden="true">${it.ic}</span><b>${esc(it.nome)}</b><small>${tem ? esc(it.desc) : `Semana com medalha nº ${k+1}`}</small></div>`; }).join("")}</div>
        ${M.total > COLECAO.length ? `<span class="sub" style="font-size:12px">Coleção completa! As próximas medalhas repetem os itens: você já tem ${M.total}.</span>` : ""}
        ${ult8.length ? `<span class="eyebrow" style="margin-top:4px">Últimas semanas</span><div style="display:grid;grid-template-columns:repeat(8,1fr);gap:5px">${ult8.map(w => `<div title="Semana de ${w.seg}: ${w.dias} dias" style="aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:${w.ok?16:12}px;font-weight:700;background:${w.ok?"var(--rosa)":"#ecdfe2"};color:var(--texto-2)">${w.ok ? itemColecao(w.k).ic : w.dias}</div>`).join("")}</div>
        <span class="sub" style="font-size:12px">O número mostra quantos dias você estudou nas semanas sem medalha.</span>` : ""}
      </div>`}
      ${sec !== "conquistas" ? "" : `<div class="card plano"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Conquistas</span><span class="pill">${CONQUISTAS.filter(c => (E.conq||{})[c.id]).length}/${CONQUISTAS.length}</span></div>
        <span class="sub" style="font-size:12.5px">Cada conquista leva o nome de um ícone da cultura pop polonesa.</span>
        <div class="conqs">${CONQUISTAS.map(c => { const d = (E.conq||{})[c.id];
          return `<div class="conq ${d?"":"bloq"}"><span class="ic" aria-hidden="true">${c.ic}</span><b>${esc(c.nome)}</b><small style="font-style:italic">${esc(c.quem)}</small><small>${esc(c.desc)}</small></div>`; }).join("")}</div>
      </div>`}
      ${sec !== "galeria" ? "" : (() => { const nd = diasEstudados(), aberta = galeriaAberta().length;
        return `<div class="card plano"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Galeria histórica</span><span class="pill">${aberta}/${GALERIA.length}</span></div>
        <span class="sub" style="font-size:12.5px">Dos reis medievais aos dias de hoje. Cada personagem se revela com um número de dias de estudo. Você já tem ${nd} ${nd===1?"dia":"dias"}.</span>
        <div class="trilha">${GALERIA.map((g,i) => { const ok = nd >= g.dias;
          return `<div class="parada ${ok?"feita":"bloq"} ${ok && i === aberta-1 ? "atual" : ""}"><span class="pto" aria-hidden="true">${ok ? g.ic : "?"}</span>
            <div><b>${esc(g.nome)}</b><small>${esc(g.anos)}</small>${ok ? `<small>${esc(g.desc)}</small>` : ""}</div>
            <span class="sub" style="font-size:12px;font-variant-numeric:tabular-nums">${ok ? "✓" : `${g.dias} dias`}</span></div>`; }).join("")}</div>
      </div>`; })()}
      ${sec !== "jornada" ? "" : `<div class="card plano"><span class="eyebrow">Como ganhar XP</span>
        <span class="sub" style="font-size:13px">Cartão certo: 10 · cartão errado: 4 (cada cartão conta uma vez por dia) · situação: 10 + 5 por fala certa de primeira, +10 se perfeita · pergunta do cônsul: 5 a 12 · tarefa do simulado: 15, +30 se passar · tarefa de fala: 15 · texto escrito completo: 25 · semana com ${META_SEMANA} dias de estudo: 100.</span>
      </div>`}`; })()}`;
}
function secResumo(totalDias) {
  const dias = []; for (let i = 27; i >= 0; i--) dias.push(somaDias(hoje(), -i));
  return `<div class="resumo">
      <div><b>${sequenciaAtual()}</b><span>dias seguidos</span></div>
      <div><b>${aprendidos()}</b><span>cartões aprendidos</span></div>
      <div><b>${totalDias}</b><span>dias estudados</span></div>
    </div>
    ${cartaoObjetivo()}
    <div class="card plano"><span class="eyebrow">Últimas 4 semanas</span>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${dias.map(d => {
        const n = E.dias[d]||0; const a = n === 0 ? "#ecdfe2" : n < 8 ? "#f3a3b3" : n < 20 ? "#E8384F" : "#DC143C";
        return `<div title="${d}: ${n}" style="aspect-ratio:1;border-radius:4px;background:${a};${d===hoje()?"outline:2px solid #2c2c2c;outline-offset:1px":""}"></div>`;
      }).join("")}</div>
      <span class="sub" style="font-size:12px">Cada quadrado é um dia; quanto mais escuro, mais você estudou.</span>
    </div>
    <details class="card plano todos"><summary>Progresso por tema (${DECKS.length})</summary>
      ${DECKS.map(d => { const tot=d.cards.length, apr=d.cards.filter((c,i)=>(E.cards[idCard(d.id, c[0])]||{}).box>=2).length;
        return `<div><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>${esc(d.nome)}</span><span class="sub" style="font-variant-numeric:tabular-nums">${apr}/${tot}</span></div><div class="mini-barra"><i style="width:${Math.round(apr/tot*100)}%"></i></div></div>`; }).join("")}
    </details>
    ${liberado("situacoes") ? `<details class="card plano todos"><summary>Situações (${SITUACOES.length})</summary>
      ${SITUACOES.map(s => `<div style="display:flex;justify-content:space-between;font-size:13.5px"><span>${esc(s.titulo)}</span><span class="pill ${E.sit[s.id]===s.passos.length?"ok":""}">${E.sit[s.id]!==undefined?E.sit[s.id]+"/"+s.passos.length:"—"}</span></div>`).join("")}
    </details>` : ""}
    <div class="card plano"><span class="eyebrow">Ajustes</span>
      <button class="btn sec" data-acao="mudarObjetivo">${OBJETIVOS.some(x => x.id === E.objetivo) ? "Mudar objetivo" : "Escolher objetivo"}</button>
      <span class="sub" style="font-size:12.5px">${E.mostrarTudo ? "Todas as seções do app estão abertas." : "As seções do app vão aparecendo conforme você avança na jornada, para não distrair no começo."}</span>
      <button class="btn sec" data-acao="mostrarTudo">${E.mostrarTudo ? "Voltar a liberar aos poucos" : "Mostrar todas as seções agora"}</button></div>
    <p class="aviso-salvo">${fonte === "nuvem" ? "Progresso salvo na sua conta: aparece em qualquer aparelho." : "Progresso salvo neste aparelho."}</p>
    ${E._confirmarReset ? `<div class="conf"><b>Apagar todo o progresso?</b><span class="sub">Isso não pode ser desfeito.</span>
      <div class="linha-btn"><button class="btn sec" data-acao="cancelarReset">Cancelar</button><button class="btn" data-acao="reset">Apagar</button></div></div>`
      : `<button class="btn sec" data-acao="pedirReset">Recomeçar do zero</button>`}`;
}

/* ===================== AÇÕES ===================== */
const acoes = {
  licao() {
    const rev = embaralhar(vencidos()).slice(0, REVISOES_POR_DIA);
    const nv = novos().slice(0, Math.max(0, NOVOS_POR_DIA - novosHoje()));
    iniciarSessao(embaralhar(rev).concat(nv), "Lição do dia");
  },
  extra() { iniciarSessao(novos().slice(0,5).length ? novos().slice(0,5) : embaralhar(todosCards).slice(0,5), "Estudo extra"); },
  revisar() { iniciarSessao(embaralhar(vencidos()).slice(0,20), "Revisão"); },
  deck(ds) { const d = DECKS.find(x => x.id === ds.id); const cs = todosCards.filter(c => c.deck === d.id);
    const pend = cs.filter(c => !E.cards[c.id] || E.cards[c.id].due <= hoje());
    iniciarSessao(pend.length ? pend : embaralhar(cs), d.nome); },
  responder(ds) { const card = sessao.fila[sessao.pos].card; registrar(ds.id === card.id, {escolha: ds.id}); },
  conferir() { const card = sessao.fila[sessao.pos].card; const c = conferir(sessao.digitado||"", card.pl); if (!(sessao.digitado||"").trim()) return; registrar(c.ok, {aviso: c.aviso}); },
  naoSei() { registrar(false); },
  porBloco(ds) { const it = sessao.fila[sessao.pos]; if (sessao.resultado || it.escolhidos.includes(+ds.i)) return; it.escolhidos.push(+ds.i); renderMantendo(); },
  tirarBloco(ds) { const it = sessao.fila[sessao.pos]; if (sessao.resultado) return; it.escolhidos = it.escolhidos.filter(i => i !== +ds.i); renderMantendo(); },
  conferirBlocos() { const it = sessao.fila[sessao.pos]; if (sessao.resultado || !it.escolhidos.length) return; registrar(blocosCertos(it)); },
  semEscuta() { E.semEscutaAte = Date.now() + 15*60*1000; salvar(); pararVoz();
    sessao.fila.forEach((it, j) => { if (j >= sessao.pos && it.tipo === "ouvir") it.tipo = "montar"; });
    avisar("Sem exercícios de ouvir pelos próximos 15 minutos."); renderMantendo(); },
  // avaliação do exercício: ajusta quando o cartão volta
  fbFacil() { const it = sessao.fila[sessao.pos], st = E.cards[it.card.id];
    if (st) { st.box = Math.min(st.box + 1, INTERVALOS.length - 1); st.due = somaDias(hoje(), INTERVALOS[st.box]); }
    (E.avaliacoes = E.avaliacoes || []).push({id: it.card.id, v: "facil", dia: hoje()}); salvar();
    it.fb = "Anotado: este cartão vai demorar mais para voltar."; renderMantendo(); },
  fbDificil() { const it = sessao.fila[sessao.pos], st = E.cards[it.card.id];
    if (st) { st.box = Math.max(0, st.box - 1); st.due = somaDias(hoje(), 1); }
    (E.avaliacoes = E.avaliacoes || []).push({id: it.card.id, v: "dificil", dia: hoje()}); salvar();
    it.fb = "Anotado: este cartão volta amanhã, um passo mais fácil."; renderMantendo(); },
  // abre uma issue no GitHub já preenchida com o cartão (só o conteúdo do app, nenhum dado pessoal)
  reportar() { const it = sessao.fila[sessao.pos], c = it.card, deck = DECKS.find(d => d.id === c.deck);
    const corpo = `**Cartão:** ${c.pl}\n**Tradução:** ${c.pt}\n**Pronúncia:** ${c.pron}${c.nota ? `\n**Nota:** ${c.nota}` : ""}\n**Tema:** ${deck ? deck.nome : c.deck} (${c.id})\n**Exercício:** ${ETAPA[it.tipo]}\n\n**O que está errado?**\n`;
    const url = "https://github.com/Srskywallker/POLSKI-na-co-dzie-/issues/new?title=" + encodeURIComponent("Erro no cartão: " + c.pl) + "&body=" + encodeURIComponent(corpo);
    try { window.open(url, "_blank", "noopener"); } catch(e) {}
    avisar("Obrigado! Descreva o problema na página que abriu."); },
  tecla(ds) { const campo = main.querySelector("input.campo"); if (!campo) return;
    const ini = campo.selectionStart ?? campo.value.length, fim = campo.selectionEnd ?? ini;
    campo.value = campo.value.slice(0, ini) + ds.l + campo.value.slice(fim); sessao.digitado = campo.value;
    campo.focus(); campo.setSelectionRange(ini+1, ini+1); },
  proximo() { pararVoz(); voz.res = {}; sessao.pos++; sessao.resultado = null; sessao.digitado = "";
    const s = sessao; // incentivo no meio do caminho, como o mascote do Duolingo
    if (!s.avisouMeio && s.fila.length >= 8 && s.pos === Math.floor(s.fila.length / 2)) { s.avisouMeio = true; avisar(s.combo >= 3 ? "Metade do caminho, e você está mandando bem!" : "Metade do caminho! Continue assim."); }
    render(); main.scrollTop = 0; },
  dificeis() {
    const lista = todosCards.filter(c => (E.cards[c.id]||{}).erros > 0).sort((a,b) => dificuldade(b.id) - dificuldade(a.id) || (E.cards[b.id].erros - E.cards[a.id].erros));
    iniciarSessao(lista.slice(0, 12), "Os que você mais erra");
  },
  sair() { pararVoz(); sessao = null; dialogo = null; entrev = null; render(); main.scrollTop = 0; },
  // no meio da sessão, pede confirmação com incentivo antes de sair
  sairSessao() { if (sessao && sessao.pos > 0 && sessao.pos < sessao.fila.length) { sessao.confirmarSaida = true; renderMantendo(); main.scrollTop = main.scrollHeight; } else acoes.sair(); },
  ficar() { sessao.confirmarSaida = false; renderMantendo(); },
  treinarErrados() { iniciarSessao(sessao.errados.slice(), "Os que você errou agora"); },
  objetivo(ds) { E.objetivo = ds.id;
    // o que o objetivo já traz aberto no nível 1 faz parte do app desde o começo: não vira "novidade"
    if (infoNivel().n === 1) Object.keys(RECURSOS).filter(liberado).forEach(id => { if (!(E.recursosVistos = E.recursosVistos || []).includes(id)) E.recursosVistos.push(id); });
    salvar(); render(); main.scrollTop = 0; },
  mudarObjetivo() { delete E.objetivo; irAba("hoje"); },
  irEntrevista() { irAba("entrevista"); },
  irSituacoes() { irAba("situacoes"); },
  irExame() { irAba("nivel"); },
  irProgresso() { progSec = "jornada"; irAba("progresso"); },
  progSec(ds) { progSec = ds.id; try { localStorage.setItem(LS+"-progSec", progSec); } catch(e) {} render(); main.scrollTop = 0; },
  mostrarTudo() { E.mostrarTudo = !E.mostrarTudo; if (E.mostrarTudo) E.recursosVistos = Object.keys(RECURSOS); salvar(); renderMantendo(); },
  // as 3 perguntas menos dominadas (as nunca treinadas primeiro)
  entrev3() { aba = "entrevista"; iniciarEntrevista(ENTREVISTA.map((q, i) => i).sort((a, b) => (E.ent[a] ?? -1) - (E.ent[b] ?? -1)).slice(0, 3)); },
  abrirSit(ds) { voz.res = {}; const s = SITUACOES.find(x => x.id === ds.id); dialogo = {sit:s, passo:0, historico:[], acertos:0, erros:{}, xp0: E.xp||0}; aba = "situacoes"; prepararPasso(); render(); main.scrollTop = 0; },
  escolher(ds) {
    const i = +ds.i; dialogo.escolhida = i; const o = dialogo.ops[i];
    if (o[2] && !dialogo.erros[dialogo.passo]) dialogo.acertos++;
    if (!o[2]) dialogo.erros[dialogo.passo] = true;
    if (o[2]) { dialogo.historico.push({eu:[o[0],o[1]]}); falar(o[0]); }
    render(); main.scrollTop = main.scrollHeight;
  },
  proxPasso() {
    const o = dialogo.ops[dialogo.escolhida];
    if (!o[2]) { dialogo.escolhida = null; dialogo.ops = embaralhar(dialogo.ops); render(); return; } // tenta de novo
    dialogo.passo++;
    if (dialogo.passo < dialogo.sit.passos.length) prepararPasso();
    else { const ant = E.sit[dialogo.sit.id]; E.sit[dialogo.sit.id] = Math.max(ant||0, dialogo.acertos); marcarEstudo();
      if (primeiraVezHoje("sit-"+dialogo.sit.id)) ganharXP(10 + dialogo.acertos*5 + (dialogo.acertos === dialogo.sit.passos.length ? 10 : 0));
      salvar(); }
    render(); main.scrollTop = main.scrollHeight;
  },
  entrevTodas() { iniciarEntrevista(embaralhar(ENTREVISTA.map((q,i)=>i)).slice(0,8)); },
  entrevFracas() {
    const idx = ENTREVISTA.map((q,i)=>i).sort((a,b) => (E.ent[a] ?? -1) - (E.ent[b] ?? -1));
    iniciarEntrevista(idx.slice(0,5));
  },
  entrevUma(ds) { aba = "entrevista"; iniciarEntrevista([+ds.i]); },
  verPt() { entrev.mostrarPt = true; render(); },
  revelar() { entrev.revelado = true; render(); main.scrollTop = main.scrollHeight; },
  notaEnt(ds) { const n = +ds.n; E.ent[entrev.fila[entrev.pos]] = n; entrev.notas.push(n); marcarEstudo();
    if (primeiraVezHoje("ent-"+entrev.fila[entrev.pos])) ganharXP([5,8,12][n]); salvar();
    entrev.pos++; entrev.revelado = false; entrev.mostrarPt = false; entrev.rascunho = "";
    render(); main.scrollTop = 0;
    if (entrev.pos < entrev.fila.length) falar(ENTREVISTA[entrev.fila[entrev.pos]][0]); },
  pedirReset() { E._confirmarReset = true; render(); },
  cancelarReset() { delete E._confirmarReset; render(); },
  reset() { E = { cards:{}, dias:{}, sit:{}, ent:{}, ultimoDia:null, sequencia:0 }; migrarJornada(); salvar(); render(); }
};

/* ===================== NÍVEL (certificação oficial) ===================== */
const AUTOAVAL = {
 A1: [
  ["Ouvir","Entendo palavras conhecidas e expressões bem básicas sobre mim, minha família e o que está ao meu redor, quando falam devagar e com clareza."],
  ["Ler","Entendo nomes, palavras e frases muito simples, por exemplo em placas, cartazes e catálogos."],
  ["Conversar","Consigo conversar se a pessoa repetir, falar devagar e me ajudar a dizer o que quero. Faço e respondo perguntas simples sobre temas muito conhecidos."],
  ["Falar","Uso expressões e frases simples para descrever onde moro e as pessoas que conheço."],
  ["Escrever","Escrevo um cartão-postal curto e preencho formulários com meus dados: nome, endereço, nacionalidade."]],
 A2: [
  ["Ouvir","Entendo palavras e expressões frequentes sobre o que é importante para mim: minha família, compras, onde moro, trabalho. Entendo o sentido de avisos e mensagens curtas."],
  ["Ler","Leio textos curtos e simples. Acho informações em anúncios, folhetos, cardápios e horários. Entendo cartas pessoais curtas."],
  ["Conversar","Participo de conversas simples do dia a dia, com troca direta de informações sobre temas conhecidos. Me viro em conversas sociais bem curtas."],
  ["Falar","Uso várias frases para descrever de forma simples minha família, outras pessoas, como vivo, minha formação e meu trabalho."],
  ["Escrever","Escrevo bilhetes e mensagens curtas. Escrevo uma carta pessoal muito simples, por exemplo para agradecer algo."]],
 B1: [
  ["Ouvir","Entendo as ideias principais de uma fala clara sobre temas conhecidos. Entendo o essencial de programas de rádio e TV quando falam devagar."],
  ["Ler","Entendo textos com palavras do dia a dia ou do trabalho e descrições de fatos, sentimentos e desejos em cartas pessoais."],
  ["Conversar","Me viro na maioria das situações de uma viagem à Polônia. Entro sem preparo em conversas sobre família, interesses, trabalho e viagens."],
  ["Falar","Conto experiências, fatos, sonhos e planos. Explico brevemente minhas opiniões. Conto a história de um filme ou livro."],
  ["Escrever","Escrevo textos simples sobre temas conhecidos e cartas pessoais contando experiências e impressões."]]
};

const ESTRUTURA = [
 ["A1","até 120 min: ouvir, ler, escrever","até 10 min","50% na escrita e 50% na oral"],
 ["A2","até 160 min: ouvir, ler com gramática, escrever","até 10 min","50% na escrita e 50% na oral"],
 ["B1","até 190 min: ouvir, ler, gramática, escrever","até 15 min","50% em cada parte"],
 ["B2","até 250 min: ouvir, ler, gramática, escrever","até 15 min","60% em cada parte"]
];

const SIMULADO = {
 ouvir: {nome:"Compreensão oral", pl:"Rozumienie ze słuchu", tarefas:[
  {titulo:"Quem fala? Onde estão?", instrPl:"Proszę słuchać i zaznaczać poprawne odpowiedzi.", instrPt:"Ouça cada frase e marque a resposta certa. Na prova, cada gravação toca duas vezes.", itens:[
   {enun:"Kto to mówi? (Quem diz isso?)", audio:"Co podać?", ops:["kelner (garçom)","fryzjer (cabeleireiro)","ojciec (pai)"], ok:0, expl:"«Co podać?» = O que vai ser? É o garçom."},
   {enun:"Kto to mówi?", audio:"Dokumenty proszę!", ops:["student","policjant (policial)","inżynier"], ok:1, expl:"«Dokumenty proszę!» = Documentos, por favor! É o policial."},
   {enun:"Kto to mówi?", audio:"Czy ma pan drobne?", ops:["sprzedawczyni (vendedora)","sekretarka (secretária)","kucharka (cozinheira)"], ok:0, expl:"«Czy ma pan drobne?» = O senhor tem trocado? É a vendedora."},
   {enun:"Kto to mówi?", audio:"Proszę się rozebrać do pasa.", ops:["pacjent (paciente)","nauczyciel (professor)","lekarz (médico)"], ok:2, expl:"«Proszę się rozebrać do pasa» = Tire a roupa da cintura para cima. É o médico."},
   {enun:"Gdzie oni to mówią? (Onde estão?)", audio:"O której godzinie jest pociąg do Torunia?", ops:["na dworcu (na estação)","w autobusie (no ônibus)","na lotnisku (no aeroporto)"], ok:0, expl:"«A que horas é o trem para Toruń?» Na estação."},
   {enun:"Gdzie oni to mówią?", audio:"Proszę bilet do kontroli!", ops:["w kinie (no cinema)","w operze (na ópera)","w tramwaju (no bonde)"], ok:2, expl:"«Bilhete para controle!» É o fiscal no bonde."},
   {enun:"Gdzie oni to mówią?", audio:"Chciałbym zrobić rezerwację dla dwóch osób.", ops:["u lekarza (no médico)","w hotelu (no hotel)","w taksówce (no táxi)"], ok:1, expl:"«Gostaria de fazer uma reserva para duas pessoas.» No hotel."},
   {enun:"Gdzie oni to mówią?", audio:"Czy ma pani inny rozmiar?", ops:["na dworcu (na estação)","na poczcie (no correio)","w sklepie (na loja)"], ok:2, expl:"«A senhora tem outro tamanho?» Na loja."},
   {enun:"Gdzie oni to mówią?", audio:"Czy są dania wegetariańskie?", ops:["w restauracji (no restaurante)","w kawiarni (no café)","w piekarni (na padaria)"], ok:0, expl:"«Tem pratos vegetarianos?» No restaurante."},
   {enun:"Gdzie oni to mówią?", audio:"Niestety, już zamykamy. Zapraszamy jutro od dziewiątej.", ops:["w szkole (na escola)","w bibliotece (na biblioteca)","w autobusie (no ônibus)"], ok:1, expl:"«Infelizmente já vamos fechar. Venha amanhã a partir das nove.» Na biblioteca."}]},
  {titulo:"Informação no rádio: verdadeiro ou falso", audio:"§A2-tramwaj", instrPl:"Proszę słuchać informacji radiowej i zaznaczać, czy zdania są prawdziwe – P, czy fałszywe – F.", instrPt:"Ouça a notícia sobre o bonde turístico de Varsóvia e diga se cada frase é verdadeira (P) ou falsa (F).", itens:[
   {enun:"Turystyczna linia tramwajowa działa jesienią. (Funciona no outono.)", ops:["P (verdadeiro)","F (falso)"], ok:1, expl:"Funciona no verão, de julho a agosto (w sezonie letnim)."},
   {enun:"Tramwaj kursuje od poniedziałku do piątku. (Circula de segunda a sexta.)", ops:["P (verdadeiro)","F (falso)"], ok:1, expl:"Circula aos sábados, domingos e feriados (w soboty, niedziele i dni wolne od pracy)."},
   {enun:"Początek trasy jest na placu Narutowicza. (O trajeto começa na praça Narutowicz.)", ops:["P (verdadeiro)","F (falso)"], ok:0, expl:"«na trasie z placu Narutowicza do pętli przy ZOO»."},
   {enun:"Tramwaj linii turystycznej jest bardzo nowoczesny. (O bonde é muito moderno.)", ops:["P (verdadeiro)","F (falso)"], ok:1, expl:"É um bonde histórico (zabytkowy tramwaj)."},
   {enun:"Tramwaj jeździ między jedenastą a siódmą wieczorem. (Circula entre as 11h e as 19h.)", ops:["P (verdadeiro)","F (falso)"], ok:0, expl:"Primeira saída às 11h, última às 19h."}]},
  {titulo:"Que esporte cada um praticou?", audio:"§A2-weekend", instrPl:"Piotr i Ewa rozmawiają o ostatnim weekendzie. Proszę słuchać i wybrać sport.", instrPt:"Piotr e Ewa conversam sobre o último fim de semana. Escolha o esporte de cada pessoa. (Na prova são ilustrações; Piotr aprendeu a nadar.)", itens:[
   {enun:"Ewa", ops:["tenis","koszykówka (basquete)","szachy (xadrez)","golf"], ok:0, expl:"«Byłam na kolejnej lekcji gry w tenisa.»"},
   {enun:"Grzesiek", ops:["koszykówka (basquete)","łowienie ryb (pesca)","bieganie (corrida)","aerobik"], ok:1, expl:"Queria jogar basquete, mas acabou indo pescar (poszedł łowić ryby)."},
   {enun:"Magda", ops:["aerobik","pływanie (natação)","golf","tenis"], ok:2, expl:"«Magda poszła na lekcje sama» — as aulas de golfe."},
   {enun:"Anka", ops:["golf","aerobik","szachy (xadrez)","bieganie (corrida)"], ok:1, expl:"«Anka jednak zdecydowała się na aerobik.»"},
   {enun:"Darek", ops:["bieganie (corrida)","łowienie ryb (pesca)","szachy (xadrez)","koszykówka (basquete)"], ok:2, expl:"Estava com dor na perna e jogou xadrez com os vizinhos (grał w szachy)."}]},
  {titulo:"Recados na secretária eletrônica", instrPl:"Proszę słuchać nagranych wiadomości i połączyć informacje.", instrPt:"A Kasia recebeu recados. Ouça cada um e diga o que a pessoa quer.", itens:[
   {enun:"Adam", audio:"Cześć, Kasiu! Tu Adam. Idziemy dzisiaj wszyscy na film. Spotykamy się przed kinem o osiemnastej trzydzieści. Film zaczyna się o dziewiętnastej. Potem idziemy do klubu. Idziesz z nami? Zadzwoń!", ops:["chce kupić bilety na mecz","chce porozmawiać o spotkaniu dla pracowników","mówi o prezentach","chce się spotkać o 18.30","chce obejrzeć film"], ok:3, expl:"«Spotykamy się przed kinem o 18.30» = Nos encontramos na frente do cinema às 18h30."},
   {enun:"Mama", audio:"Kasiu, tu mama. Pamiętasz, że twój brat ma trzydzieste urodziny? Tata ma dla niego dwa bilety na mecz, ja robię tort, a ty masz coś dla niego? Dzisiaj wieczorem organizujemy imprezę, będą znajomi Marka, czekamy na ciebie!", ops:["chce kupić bilety na mecz","chce porozmawiać o spotkaniu dla pracowników","mówi o prezentach","chce się spotkać o 18.30","chce obejrzeć film"], ok:2, expl:"Fala dos presentes para o irmão: ingressos, bolo… «a ty masz coś dla niego?»"},
   {enun:"Ola", audio:"Kasia, to ja, Ola. Chciałam na wieczór pożyczyć ten nowy film. Wiesz, ten który razem ostatnio oglądałyśmy. Jeszcze zadzwonię. No to pa!", ops:["chce kupić bilety na mecz","chce porozmawiać o spotkaniu dla pracowników","mówi o prezentach","chce się spotkać o 18.30","chce obejrzeć film"], ok:4, expl:"Quer pegar o filme emprestado para assistir à noite."},
   {enun:"Marek", audio:"Kaśka! Tu Marek. Nie wiesz, czy są jeszcze bilety na dzisiejszy mecz? Chcę iść z moją dziewczyną. Czekam na informację!", ops:["chce kupić bilety na mecz","chce porozmawiać o spotkaniu dla pracowników","mówi o prezentach","chce się spotkać o 18.30","chce obejrzeć film"], ok:0, expl:"Pergunta se ainda há ingressos para o jogo (bilety na mecz)."},
   {enun:"Zofia Malinowska", audio:"Dzień dobry, pani Katarzyno! Zofia Malinowska. Chcielibyśmy porozmawiać o dzisiejszej imprezie firmowej. Prosimy o jak najszybszy kontakt telefoniczny. Do widzenia!", ops:["chce kupić bilety na mecz","chce porozmawiać o spotkaniu dla pracowników","mówi o prezentach","chce się spotkać o 18.30","chce obejrzeć film"], ok:1, expl:"«impreza firmowa» = festa da empresa, um encontro para os funcionários. Repare no tratamento formal: pani Katarzyno."}]},
  {titulo:"Noite dos Museus: escreva os números", audio:"§A2-noc", instrPl:"Proszę słuchać informacji o Nocy Muzeów i wpisywać liczby.", instrPt:"Ouça a notícia sobre a Noite dos Museus e escreva os números em algarismos.", itens:[
   {enun:"W tym roku Noc Muzeów zaczyna się w sobotę, ___ maja. (dia de maio)", tipo:"txt", aceitas:["16"], resp:"16", expl:"«w sobotę 16 maja» (szesnastego maja)."},
   {enun:"W Nocy Muzeów weźmie udział ___ instytucji. (quantas instituições)", tipo:"txt", aceitas:["146"], resp:"146", expl:"«aż 146 muzeów, galerii i instytutów kultury»."},
   {enun:"Niektóre muzea będą otwarte nawet do ___ w nocy. (até que horas)", tipo:"txt", aceitas:["1","100","1.00","1:00","01:00"], resp:"1.00", expl:"«do godz. 1.00» (do pierwszej)."},
   {enun:"Zajęcia na Zamku Królewskim są dla dzieci, które mają już ___ lat. (idade)", tipo:"txt", aceitas:["13"], resp:"13", expl:"«dla dzieci, które skończyły już 13 lat»."},
   {enun:"Pierwsza w Europie Noc Muzeów była w Berlinie w ___ roku. (ano)", tipo:"txt", aceitas:["1997"], resp:"1997", expl:"«w 1997 roku w Berlinie»."}]}
 ]},
 ler: {nome:"Leitura e gramática", pl:"Rozumienie tekstów pisanych", tarefas:[
  {titulo:"Escolha a forma certa", instrPl:"Proszę podkreślić poprawną formę.", instrPt:"Texto sobre o Spodek, a arena de Katowice. Escolha a forma gramatical certa de cada lacuna.", texto:"Spodek to nie tylko symbol Katowic, ale także jeden z najbardziej (1) budynków na (2). Jest prawdziwym (3) dla (4) sportowych. (5) tu obejrzeć mistrzostwa świata i Europy w siatkówce, koszykówce czy grach komputerowych. Przez 45 lat (6) się tu nie tylko spotkania sportowe, ale też koncerty (7) światowej muzyki. Ludzie ważni dla kultury, historii i polityki również tu (8). W 2001 roku na jedną z (9) do katowickiej hali przyszło prawie 50 tysięcy osób. To wydarzenie organizatorzy wspominają (10).", p:0.5, itens:[
   {enun:"(1) jeden z najbardziej ___ budynków", ops:["charakterystycznymi","charakterystyczne","charakterystycznych"], ok:2, expl:"Depois de «jeden z» vem o genitivo plural: jeden z budynków → charakterystycznych budynków."},
   {enun:"(2) na ___", ops:["Śląsku","Śląska","Śląsk"], ok:0, expl:"«na» indicando lugar pede locativo: na Śląsku (na Silésia)."},
   {enun:"(3) Jest prawdziwym ___", ops:["domem","domu","dom"], ok:0, expl:"Depois de «być» o substantivo vai para o instrumental: jest domem."},
   {enun:"(4) dla ___ sportowych", ops:["kibice","kibicach","kibiców"], ok:2, expl:"«dla» pede genitivo: dla kibiców (para os torcedores)."},
   {enun:"(5) ___ tu obejrzeć mistrzostwa", ops:["Można","Mogła","Może"], ok:0, expl:"«Można» + infinitivo = é possível, dá para (sem sujeito)."},
   {enun:"(6) Przez 45 lat ___ się tu spotkania", ops:["odbywały","odbywa","odbędą"], ok:0, expl:"Passado, plural, sujeito não masculino-pessoal (spotkania, koncerty): odbywały się."},
   {enun:"(7) koncerty ___ światowej muzyki", ops:["gwiazdom","gwieździe","gwiazd"], ok:2, expl:"Concertos de quem? Genitivo plural: koncerty gwiazd."},
   {enun:"(8) Ludzie ważni również tu ___", ops:["występowały","występowali","występuje"], ok:1, expl:"«Ludzie» é masculino-pessoal: no passado plural a terminação é -li (występowali)."},
   {enun:"(9) na jedną z ___", ops:["imprezie","imprezami","imprez"], ok:2, expl:"«jedną z» + genitivo plural: jedną z imprez."},
   {enun:"(10) wspominają ___", ops:["najlepszy","lepiej","najlepiej"], ok:2, expl:"Modifica o verbo, então é advérbio no superlativo: najlepiej (da melhor forma)."}]},
  {titulo:"Complete com as palavras do quadro", instrPl:"Proszę uzupełnić zdania wyrazami z ramki.", instrPt:"Annette está de férias em Lublin. Complete cada frase com uma palavra do quadro.", p:0.5, itens:[
   {enun:"Mieszka u ___ koleżanki niedaleko centrum miasta.", ops:["rodziców","nowych","mieście","duże"], ok:0, expl:"«u» pede genitivo: u rodziców koleżanki = na casa dos pais da amiga."},
   {enun:"Poznała kilka sympatycznych osób. Jest ___!", ops:["stare","fantastycznie","rowerem","niedzielę"], ok:1, expl:"Jest fantastycznie! = Está ótimo!"},
   {enun:"Cały czas rozmawia po polsku i uczy się ___ słów.", ops:["duże","nowych","stare","astronomią"], ok:1, expl:"«uczyć się» pede genitivo: uczy się nowych słów."},
   {enun:"Codziennie chodzi na basen albo jeździ ___ po lesie.", ops:["rowerem","mieście","matematykę","rodziców"], ok:0, expl:"Meio de transporte no instrumental: jeździ rowerem (anda de bicicleta)."},
   {enun:"Wieczorem ogląda w domu ___ polskie komedie.", ops:["nowych","stare","duże","fantastycznie"], ok:1, expl:"stare polskie komedie = comédias polonesas antigas (acusativo plural)."},
   {enun:"…albo spędza czas w ___.", ops:["mieście","niedzielę","rowerem","astronomią"], ok:0, expl:"«w» + locativo: w mieście (na cidade)."},
   {enun:"On ma 21 lat i studiuje ___ w Poznaniu.", ops:["astronomią","matematykę","rodziców","stare"], ok:1, expl:"«studiować» + acusativo: studiuje matematykę."},
   {enun:"Jest bardzo miły, ma jasne włosy i ___ oczy.", ops:["nowych","duże","stare","fantastycznie"], ok:1, expl:"duże oczy = olhos grandes."},
   {enun:"Marek, tak jak Annette, interesuje się ___.", ops:["matematykę","astronomią","mieście","niedzielę"], ok:1, expl:"«interesować się» + instrumental: interesuje się astronomią."},
   {enun:"W ___ wybierają się razem do planetarium.", ops:["mieście","niedzielę","rowerem","stare"], ok:1, expl:"Dia da semana: w + acusativo: w niedzielę (no domingo)."}]},
  {titulo:"Placas e avisos", instrPl:"Proszę przeczytać napisy i podkreślić poprawną odpowiedź.", instrPt:"Leia cada aviso e escolha a resposta certa.", itens:[
   {enun:"«Toaleta tylko dla klientów restauracji» — Ten napis oznacza, że…", ops:["każdy może skorzystać z toalety (qualquer um pode usar)","to jest toaleta dla gości (é o banheiro dos clientes)","toaleta jest zamknięta (está fechado)"], ok:1, expl:"Banheiro só para clientes do restaurante."},
   {enun:"«Proszę nie wchodzić» — Ten napis oznacza, że…", ops:["każdy może wejść (todos podem entrar)","nie ma tu nikogo (não há ninguém)","nie wolno wejść (é proibido entrar)"], ok:2, expl:"Por favor, não entre."},
   {enun:"«Nieczynne» — Ten napis można przeczytać…", ops:["w muzeum (no museu)","na przystanku (no ponto de ônibus)","na pomniku (num monumento)"], ok:0, expl:"«Nieczynne» = fechado, fora de funcionamento. Aparece em museus, lojas e guichês."},
   {enun:"«Szatnia» — Ten napis można przeczytać…", ops:["w banku","w teatrze (no teatro)","na poczcie"], ok:1, expl:"Szatnia = guarda-volumes, onde se deixa o casaco. Comum em teatros."},
   {enun:"«Punkt obsługi klienta» — Ten napis można przeczytać…", ops:["w przedszkolu (na creche)","w restauracji","w centrum handlowym (no shopping)"], ok:2, expl:"Punkt obsługi klienta = atendimento ao cliente."}]},
  {titulo:"Textos curtos", instrPl:"Proszę przeczytać teksty i zaznaczyć poprawną odpowiedź.", instrPt:"Leia cada texto e escolha a resposta certa.", itens:[
   {enun:"Kawiarnia „Mała czarna” zaprasza codziennie od 10.00 do 22.00. Dzisiaj ciastka w promocyjnej cenie. Do ciastek herbata gratis. — Dziś w tej kawiarni…", ops:["nie płaci się za kawę (o café é grátis)","ciastka kosztują mniej (os doces custam menos)","nie będzie herbaty (não terá chá)"], ok:1, expl:"«ciastka w promocyjnej cenie» = doces em promoção. O chá é que é grátis."},
   {enun:"Ola i Ula są od tygodnia nad morzem. Pogoda jest wspaniała. Codziennie spędzają kilka godzin w wodzie, opalają się i grają w piłkę. — Dziewczyny…", ops:["każdego dnia są na plaży (estão na praia todo dia)","będą tu jeszcze siedem dni (ficam mais 7 dias)","nie lubią się kąpać (não gostam de nadar)"], ok:0, expl:"«od tygodnia» = há uma semana (não daqui a uma semana). Codziennie = todo dia."},
   {enun:"Muzeum Fryderyka Chopina można zwiedzać od wtorku do niedzieli. W piątki wstęp wolny. W niedziele koncerty chopinowskie. — Turyści…", ops:["w piątki mogą bezpłatnie posłuchać koncertu (ouvem concerto grátis às sextas)","zawsze płacą za bilet (sempre pagam)","mogą zwiedzać muzeum w soboty (podem visitar aos sábados)"], ok:2, expl:"Abre de terça a domingo, então inclui sábado. Os concertos são aos domingos."},
   {enun:"Dwie książki w cenie jednej! Kup dwie książki, a zapłacisz tylko za tę, która kosztuje więcej. — Klient płaci…", ops:["tylko za droższą (só pelo mais caro)","za tańszą tylko połowę ceny (metade pelo mais barato)","mniej za tę droższą (menos pelo mais caro)"], ok:0, expl:"droższy = mais caro; tańszy = mais barato."},
   {enun:"W naszym hotelu każdy pokój ma łazienkę. W pokojach klasy LUX – sauna. W cenie pokoju jest śniadanie. — W tym hotelu wszyscy goście…", ops:["mają pokoje z sauną (têm sauna)","płacą za śniadanie dodatkowo (pagam café à parte)","mają pokoje z łazienkami (têm banheiro no quarto)"], ok:2, expl:"Todo quarto tem banheiro; sauna só nos LUX; café está incluído."}]},
  {titulo:"Preencha a ficha", instrPl:"Proszę na podstawie tekstu wypełnić ankietę.", instrPt:"Leia o texto de Jerzy e preencha a ficha do programa de TV «Gotuj z nami». Escreva em polonês.", texto:"Nazywam się Jerzy Sosnowski. Mam 30 lat. Urodziłem się w Poznaniu i tam chodziłem do szkoły. Skończyłem studia na Politechnice Wrocławskiej. Jestem inżynierem w fabryce mebli biurowych. Moja żona uczy fizyki w liceum. Nasza córka ma 6 lat i już uczy się w szkole muzycznej. Teraz mieszkamy w Elblągu. Czytam dużo książek podróżniczych. Codziennie chodzę na basen. Lubimy domowe jedzenie. Kiedy pracujemy, żona gotuje tylko zupy. W soboty i niedziele sam z przyjemnością gotuję dla całej rodziny. Najczęściej jemy wtedy kotlety z warzyw. Chcę pokazać innym, jak szybko można je zrobić. Zapraszam ekipę telewizyjną do mnie w każdą letnią sobotę.", p:0.5, itens:[
   {enun:"miejsce urodzenia (local de nascimento)", tipo:"txt", aceitas:["poznan"], resp:"Poznań"},
   {enun:"miejsce zamieszkania (onde mora)", tipo:"txt", aceitas:["elblag"], resp:"Elbląg"},
   {enun:"miejsce studiów (onde estudou)", tipo:"txt", aceitas:["wroclaw","politechnik"], resp:"Wrocław / Politechnika Wrocławska"},
   {enun:"wykształcenie (formação)", tipo:"txt", aceitas:["wyzsze","inzynier","politechnik"], resp:"wyższe / inżynier"},
   {enun:"miejsce pracy (onde trabalha)", tipo:"txt", aceitas:["fabryk","mebl"], resp:"fabryka mebli biurowych"},
   {enun:"stan cywilny (estado civil)", tipo:"txt", aceitas:["zonaty","ma zone"], resp:"żonaty"},
   {enun:"zawód żony (profissão da esposa)", tipo:"txt", aceitas:["fizyk","nauczyciel"], resp:"nauczycielka fizyki"},
   {enun:"sport (esporte)", tipo:"txt", aceitas:["basen","plywa"], resp:"basen / pływanie"},
   {enun:"ulubione danie (prato favorito)", tipo:"txt", aceitas:["kotlet"], resp:"kotlety z warzyw"},
   {enun:"termin wizyty (quando visitar)", tipo:"txt", aceitas:["sobot","lato","latem","letni"], resp:"każda letnia sobota"}]}
 ]}
};

const ESCRITA = [
 {id:"e1a", grupo:"Conjunto I", pl:"Proszę napisać życzenia do koleżanki lub kolegi z okazji urodzin. (20 słów)", pt:"Escreva votos de aniversário a um colega (20 palavras). Na prova, uma foto mostra a ocasião.", meta:20,
  modelo:"Kochana Aniu! Z okazji urodzin życzę Ci dużo zdrowia, szczęścia i radości. Spełnienia wszystkich marzeń! Sto lat! Ściskam, Lucas", modeloPt:"Querida Ania! Pelo seu aniversário desejo muita saúde, felicidade e alegria. Que todos os seus sonhos se realizem! Parabéns! Um abraço, Lucas"},
 {id:"e1b", grupo:"Conjunto I", pl:"Proszę opisać osobę ze swojej rodziny (np. siostrę, ojca lub brata). (80 słów)", pt:"Descreva uma pessoa da sua família (80 palavras).", meta:80,
  modelo:"Chcę opisać mojego tatę. Ma na imię Paulo i urodził się w tysiąc dziewięćset siedemdziesiątym pierwszym roku w Brazylii. Jest średniego wzrostu, ma krótkie ciemne włosy i brązowe oczy. Jest spokojny, cierpliwy i bardzo pracowity. Lubi rozmawiać o historii naszej rodziny. Jego pradziadek Franciszek przypłynął z Polski do Brazylii w tysiąc osiemset dziewięćdziesiątym roku. W weekendy tata odpoczywa w domu, czyta i ogląda mecze. Bardzo go kocham i często rozmawiamy przez telefon.", modeloPt:"Quero descrever meu pai. Ele se chama Paulo e nasceu em 1971 no Brasil. Tem altura média, cabelo curto e escuro e olhos castanhos. É calmo, paciente e muito trabalhador. Gosta de falar da história da nossa família. O bisavô dele, Franciszek, veio da Polônia para o Brasil de navio em 1890. Nos fins de semana meu pai descansa em casa, lê e assiste aos jogos. Eu o amo muito e conversamos sempre por telefone.", aviso:"Aparência, jeito e hábitos são exemplos: troque pelo que for verdade."},
 {id:"e2a", grupo:"Conjunto II", pl:"Chce Pan spotkać się z koleżanką lub kolegą. Proszę do niej/do niego napisać SMS. (10 słów)", pt:"Você quer se encontrar com um colega. Escreva um SMS (10 palavras).", meta:10,
  modelo:"Cześć Marek! Spotkajmy się jutro o osiemnastej w kawiarni. Pasuje Ci?", modeloPt:"Oi, Marek! Vamos nos encontrar amanhã às 18h no café. Pode ser?"},
 {id:"e2b", grupo:"Conjunto II", pl:"Proszę opisać swoje ostatnie wakacje (gdzie Pan był, z kim, co Pan robił, gdzie Pan mieszkał, jaka była pogoda). (90 słów)", pt:"Descreva suas últimas férias: onde, com quem, o que fez, onde ficou, como estava o tempo (90 palavras).", meta:90,
  modelo:"W zeszłym roku byłem na wakacjach w Florianópolis z rodziną. Pojechaliśmy samochodem, bo to tylko pięć godzin od Kurytyby. Mieszkaliśmy w małym hotelu blisko plaży. Pogoda była wspaniała: świeciło słońce i było bardzo gorąco. Codziennie rano pływałem w morzu, a po południu graliśmy w siatkówkę na plaży. Wieczorem jedliśmy ryby i owoce morza w restauracji. Raz pojechaliśmy na wycieczkę łodzią. Było fantastycznie i wróciłem do domu wypoczęty. Następne wakacje chcę spędzić w Polsce i zobaczyć Ciechanów.", modeloPt:"No ano passado passei férias em Florianópolis com a família. Fomos de carro, porque fica a só cinco horas de Curitiba. Ficamos num hotel pequeno perto da praia. O tempo estava ótimo: fazia sol e muito calor. Todo dia de manhã eu nadava no mar e à tarde jogávamos vôlei na praia. À noite comíamos peixe e frutos do mar num restaurante. Uma vez fizemos um passeio de barco. Foi fantástico e voltei para casa descansado. Quero passar as próximas férias na Polônia e conhecer Ciechanów.", aviso:"Os detalhes da viagem são exemplos: troque pelos reais."}
];

const FALA = [
 {id:"f1", titulo:"Tarefa 1: apresentar-se", pl:"Proszę odpowiadać na pytania egzaminatora (na temat Pana, Pana rodziny, zainteresowań, pracy).", pt:"Responda às perguntas do examinador sobre você, sua família, interesses e trabalho.",
  pares:[["Jak się Pan nazywa?","Nazywam się Lucas Openchoski."],["Skąd Pan jest?","Jestem z Brazylii."],["Gdzie Pan mieszka?","Mieszkam w Kurytybie, w stanie Parana."],["Czym się Pan zajmuje?","Mam własną firmę."],["Jakie ma Pan zainteresowania?","Lubię grać w siatkówkę i interesuję się historią mojej rodziny."],["Dlaczego uczy się Pan polskiego?","Moja rodzina pochodzi z Polski i chcę mówić w języku moich przodków."]]},
 {id:"f2", titulo:"Tarefa 2: descrever uma pessoa da foto", pl:"Na podstawie ilustracji proszę scharakteryzować osobę z fotografii.", pt:"Descreva a pessoa de uma foto: aparência, roupa, o que faz, como parece estar.",
  pares:[["Kto jest na zdjęciu?","Na zdjęciu jest młoda kobieta. Ma około trzydziestu lat."],["Jak wygląda?","Jest wysoka i szczupła. Ma długie jasne włosy i niebieskie oczy."],["W co jest ubrana?","Ma na sobie białą koszulę, niebieskie spodnie i czarne buty."],["Co robi?","Siedzi w kawiarni, pije kawę i czyta książkę."],["Jaka jest?","Wygląda na zadowoloną i spokojną. Myślę, że jest miła."]]},
 {id:"f3", titulo:"Tarefa 3: convidar para o cinema", pl:"Proszę zaprosić koleżankę lub kolegę do kina, zaproponować film, datę, godzinę i miejsce spotkania.", pt:"Convide um colega ao cinema: proponha filme, dia, hora e lugar do encontro.",
  pares:[["(Você começa)","Cześć Ania! Masz czas w sobotę? Może pójdziemy razem do kina?"],["Na jaki film?","Na nową polską komedię. Podobno jest bardzo śmieszna."],["O której?","Seans zaczyna się o dziewiętnastej."],["Gdzie się spotkamy?","Spotkajmy się o wpół do siódmej przed kinem, dobrze?"],["Dobrze, do zobaczenia!","Super! Do zobaczenia w sobotę!"]]}
];

let simul = null; // simulado em andamento
function nvEstado() { if (!E.nivel) E.nivel = {auto:{}, sim:{}, textos:{}, fala:{}}; ["auto","sim","textos","fala"].forEach(k => { if (!E.nivel[k]) E.nivel[k] = {}; }); return E.nivel; }
const normNv = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ł/g,"l").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const contaPalavras = s => (String(s||"").trim().match(/\S+/g)||[]).length;

function renderNivel() {
  const N = nvEstado();
  const pct = lv => Math.round(AUTOAVAL[lv].filter((x,i) => N.auto[lv+"-"+i]).length / AUTOAVAL[lv].length * 100);
  const nota = id => { const r = N.sim[id]; return r ? `${Math.round(r.pontos/r.max*100)}%` : "—"; };
  const ok = id => { const r = N.sim[id]; return r && r.pontos/r.max >= 0.5; };
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Poziom</span><h1>Seu caminho até o A2</h1>
    <p class="sub">Baseado no exame oficial de polonês como língua estrangeira (Państwowa Komisja, certyfikatpolski.pl). Para a Karta Polaka não é preciso certificado, mas o cônsul espera um polonês básico, entre A1 e A2.</p></div>

    <h2 class="sub-grupo">Simulado A2</h2>
    <p class="sub" style="font-size:12.5px">Adaptado da prova de exemplo oficial do nível A2. Para passar é preciso 50% de cada parte.</p>
    <div class="lista">
      ${Object.entries(SIMULADO).filter(([id,s]) => !s.curso).map(([id,s]) => `<button class="item" data-acao="nvSim" data-id="${id}">
        <div class="txt"><b>${esc(s.nome)}</b><small>${esc(s.pl)} · ${s.tarefas.length} tarefas</small></div>
        <span class="pill ${ok(id)?"ok":""}">${nota(id)}</span></button>`).join("")}
      <button class="item" data-acao="nvEscrita"><div class="txt"><b>Escrita</b><small>Pisanie · escolha um conjunto com 2 textos</small></div><span class="pill">${ESCRITA.filter(t => contaPalavras(N.textos[t.id]) >= t.meta*0.8).length}/4</span></button>
      <button class="item" data-acao="nvFala"><div class="txt"><b>🎤 Fala com microfone</b><small>Mówienie · 3 tarefas · o app ouve e corrige</small></div><span class="pill">${FALA.filter(t => N.fala[t.id]).length}/3</span></button>
    </div>

    <h2 class="sub-grupo">Como é o exame</h2>
    <div class="card plano" style="display:grid;gap:10px">${ESTRUTURA.map(r => `<div><b>${r[0]}</b> · <span class="sub">Prova escrita ${esc(r[1])}. Prova oral ${esc(r[2])}. Mínimo: ${esc(r[3])}.</span></div>`).join("")}
      <span class="sub" style="font-size:12px">A prova de exemplo, o áudio original e outras provas (B1 a C2) estão grátis em certyfikatpolski.pl.</span></div>

    <h2 class="sub-grupo">Autoavaliação</h2>
    <p class="sub" style="font-size:12.5px">Escala oficial do Quadro Europeu (ESOKJ). Toque no que você já consegue fazer.</p>
    ${Object.keys(AUTOAVAL).map(lv => `<div class="card plano">
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">${lv}</b><span class="pill ${pct(lv)===100?"ok":""}">${pct(lv)}%</span></div>
      <div class="mini-barra"><i style="width:${pct(lv)}%"></i></div>
      <div class="lista" style="margin-top:8px">${AUTOAVAL[lv].map((x,i) => { const on = !!N.auto[lv+"-"+i];
        return `<button class="opcao ${on?"certa":""}" data-acao="nvAuto" data-id="${lv}-${i}" aria-pressed="${on}">${on?"✓ ":""}${esc(x[0])}<small>${esc(x[1])}</small></button>`; }).join("")}</div>
    </div>`).join("")}
  </div>`;
}

function iniciarSimul(id) { simul = {id, t:0, resp:{}, conferido:false, pontos:0, max:0}; render(); main.scrollTop = 0; }
function renderSimul() {
  const S = SIMULADO[simul.id];
  if (simul.t >= S.tarefas.length) {
    const p = Math.round(simul.pontos/simul.max*100);
    main.innerHTML = `<div class="tela"><span class="eyebrow">${esc(S.pl)}</span><h1>Resultado: ${p}%</h1>
      <div class="feedback ${p>=50?"ok":"no"}">${simul.pontos.toLocaleString("pt-BR")} de ${simul.max.toLocaleString("pt-BR")} pontos. ${S.curso ? (p>=70?"Lição concluída. Siga para a próxima!":"Revise a gramática e as palavras da lição e tente de novo.") : p>=50?"Você passaria nesta parte do exame A2.":"Para passar é preciso 50%. Revise as explicações e tente de novo."}</div>
      <div class="linha-btn"><button class="btn" data-acao="nvSim" data-id="${simul.id}">Fazer de novo</button><button class="btn sec" data-acao="nvSair">Voltar</button></div></div>`;
    return;
  }
  const T = S.tarefas[simul.t], peso = T.p || 1;
  const itens = T.itens.map((it,i) => {
    const r = simul.resp[i];
    let corpo;
    if (it.tipo === "txt") {
      const certo = simul.conferido && corrigeTxt(it, r);
      corpo = `<input class="nv-in" data-nv-in="${i}" value="${esc(r||"")}" ${simul.conferido?"disabled":""} autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #d7c7cb;border-radius:8px">
        ${simul.conferido ? `<div class="feedback ${certo?"ok":"no"}">${certo?"Certo.":"Resposta esperada: "+esc(it.resp)}${it.expl?" "+esc(it.expl):""}</div>` : ""}`;
    } else {
      corpo = `<div class="opcoes">${it.ops.map((o,j) => {
        let cls = ""; if (simul.conferido) { if (j===it.ok) cls="certa"; else if (j===r) cls="errada"; } else if (j===r) cls="certa";
        return `<button class="opcao ${cls}" data-acao="nvEsc" data-i="${i}" data-j="${j}" ${simul.conferido?"disabled":""}>${esc(o)}</button>`; }).join("")}</div>
        ${simul.conferido && it.expl ? `<div class="feedback ${r===it.ok?"ok":"no"}">${r===it.ok?"Certo. ":"Errado. "}${esc(it.expl)}</div>` : ""}`;
    }
    return `<div class="card plano" style="display:grid;gap:8px">
      <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between"><b style="font-size:14.5px">${i+1}. ${esc(it.enun)}</b>${it.audio ? btnAudio(it.audio) : ""}</div>${corpo}</div>`;
  }).join("");
  main.innerHTML = `<div class="tela">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">${esc(S.nome)}</span><span class="pill">${simul.t+1}/${S.tarefas.length}</span></div>
    <h1 style="font-size:21px">${esc(T.titulo)}</h1>
    <div class="nota"><span class="pl" style="font-size:13.5px">${esc(T.instrPl)}</span><br>${esc(T.instrPt)}</div>
    ${T.audio ? `<div class="card plano" style="display:flex;align-items:center;gap:12px">${btnAudio(T.audio)}<span class="sub">Ouça a gravação. Pode repetir quantas vezes quiser (na prova, duas vezes).</span></div>` : ""}
    ${T.texto ? `<div class="card plano" style="font-size:15px;line-height:1.55">${esc(T.texto)}</div>` : ""}
    ${itens}
    ${simul.conferido
      ? `<button class="btn" data-acao="nvProx">${simul.t+1 < S.tarefas.length ? "Próxima tarefa" : "Ver resultado"}</button>`
      : `<button class="btn" data-acao="nvConf">Conferir respostas</button>`}
    <button class="btn sec" data-acao="nvSair">${S.curso ? "Voltar à lição" : "Sair do simulado"}</button>
  </div>`;
}
function corrigeTxt(it, r) { const n = normNv(r); if (!n) return false; return it.aceitas.some(a => { const x = normNv(a); return /^\d/.test(x) ? n.replace(/\s/g,"") === x.replace(/\s/g,"") || n.replace(/\D/g,"") === x.replace(/\D/g,"") : n.includes(x); }); }

function renderEscrita() {
  const N = nvEstado();
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Pisanie</span><h1>Escrita</h1>
    <p class="sub">Na prova você escolhe um conjunto e escreve os dois textos em 45 minutos. Contam a tarefa cumprida, a riqueza do vocabulário e a correção. Seu texto fica salvo.</p></div>
    ${ESCRITA.map(t => { const n = contaPalavras(N.textos[t.id]); const aberto = nvModeloId === t.id;
      return `<div class="card plano" style="display:grid;gap:8px">
      <span class="eyebrow">${esc(t.grupo)}</span>
      <b class="pl" style="font-size:14.5px">${esc(t.pl)}</b><span class="sub">${esc(t.pt)}</span>
      <textarea data-nv-txt="${t.id}" placeholder="Escreva em polonês…" spellcheck="false">${esc(N.textos[t.id]||"")}</textarea>
      <span class="sub" style="font-size:12px" data-nv-cont="${t.id}">${n} de ~${t.meta} palavras</span>
      ${aberto ? `<div class="nota"><span class="pl">${esc(t.modelo)}</span><br><span style="font-size:13px">${esc(t.modeloPt)}</span>${t.aviso?`<br><i style="font-size:12.5px">${esc(t.aviso)}</i>`:""}</div>
        <button class="btn sec" data-acao="nvModelo" data-id="">Esconder modelo</button>`
      : `<button class="btn sec" data-acao="nvModelo" data-id="${t.id}">Ver texto modelo</button>`}
    </div>`; }).join("")}
    <button class="btn" data-acao="nvSair">Voltar</button>
  </div>`;
}

function renderFala() {
  const N = nvEstado();
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Mówienie</span><h1>Fala</h1>
    <p class="sub">Responda em voz alta antes de ver o modelo. Na prova são 5 minutos de preparo e até 10 minutos de conversa. Contam a tarefa (24 pontos), o vocabulário, a gramática e a pronúncia (16 pontos).</p></div>
    <div class="card plano" style="display:grid;gap:8px">
      <span class="eyebrow">Treino com microfone</span>
      <span class="sub" style="font-size:13px">Toque em <b>Falar</b> e diga a resposta em polonês. O app mostra o que entendeu e marca as palavras do modelo: em verde as que você disse, sublinhadas as que faltaram. Cada fala com 60% ou mais vale +5 XP por dia.</span>
      ${VOZ_OK ? "" : `<div class="feedback no">${esc(SEM_VOZ)}</div>`}
      <div class="seg" role="group" aria-label="Modo de treino">
        <button data-acao="falaModo" data-m="repetir" aria-pressed="${falaModo === "repetir"}">Repetir o modelo</button>
        <button data-acao="falaModo" data-m="desafio" aria-pressed="${falaModo === "desafio"}">Desafio: sem ver</button>
      </div></div>
    ${FALA.map(t => `<div class="card plano" style="display:grid;gap:10px">
      <b style="font-size:16px">${esc(t.titulo)}</b>
      <div class="nota"><span class="pl" style="font-size:13.5px">${esc(t.pl)}</span><br>${esc(t.pt)}</div>
      ${t.pares.map((p,i) => { const k = `f-${t.id}-${i}`, esconde = falaModo === "desafio" && !voz.res[k] && !falaVistos[k];
        return `<div style="display:grid;gap:6px;border-top:1px solid var(--borda);padding-top:8px">
        <span class="sub" style="font-size:13px">${esc(p[0])}</span>
        ${esconde ? `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span class="oculto">Resposta escondida</span><button class="btn sec" style="min-height:0;padding:5px 10px;font-size:12px" data-acao="falaVer" data-k="${k}">Ver modelo</button></div>`
          : `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span class="pl" style="font-size:15px">${esc(p[1])}</span>${btnAudio(p[1])}</div>`}
        ${blocoVoz(k, p[1], esconde ? "Responder falando" : "Repetir falando")}</div>`; }).join("")}
      <button class="btn ${N.fala[t.id]?"sec":""}" data-acao="nvFeito" data-id="${t.id}">${N.fala[t.id]?"✓ Treinada":"Marcar como treinada"}</button>
    </div>`).join("")}
    <button class="btn" data-acao="nvSair">Voltar</button>
  </div>`;
}

let nvTela = null; // "escrita" | "fala"
let nvModeloId = null;
let falaModo = "repetir", falaVistos = {};
try { falaModo = localStorage.getItem(LS+"-falaModo") || "repetir"; } catch(e) {}
Object.assign(acoes, {
  voz(ds) {
    iniciarVoz(ds.k, ds.esp, r => {
      if (r.score >= 60 && primeiraVezHoje("voz-"+ds.k)) { marcarEstudo(); ganharXP(ds.k.startsWith("f-") ? 5 : 3); salvar(); }
    });
  },
  // etapa 4 do cartão: a fala decide o acerto (60% ou mais)
  vozCard() {
    const s = sessao, k = "card-"+s.pos, card = s.fila[s.pos].card;
    iniciarVoz(k, card.pl, r => { if (sessao === s && !s.resultado) registrar(r.score >= 60, {voz: r}); });
  },
  falarPular() { pararVoz(); sessao.fila[sessao.pos].tipo = "digitar"; render(); },
  // entrevista: o que a pessoa fala vai para a caixa de texto
  vozDitar(ds) {
    iniciarVoz(ds.k, "", r => { if (entrev) entrev.rascunho = ((entrev.rascunho||"").trim() + " " + r.texto).trim(); delete voz.res[ds.k]; });
  },
  falaModo(ds) { falaModo = ds.m; falaVistos = {}; try { localStorage.setItem(LS+"-falaModo", falaModo); } catch(e) {} renderMantendo(); },
  falaVer(ds) { falaVistos[ds.k] = true; renderMantendo(); },
  vozIndisponivel(ds) { voz.erro = SEM_VOZ; voz.erroK = ds.k; renderMantendo(); },
  irFala() { aba = "nivel"; nvTela = "fala"; simul = null; try { localStorage.setItem(LS+"-aba", aba); } catch(e) {} render(); main.scrollTop = 0; }
});
Object.assign(acoes, {
  nvAuto(ds) { const N = nvEstado(); N.auto[ds.id] = !N.auto[ds.id]; salvar(); const y = main.scrollTop; render(); main.scrollTop = y; },
  nvSim(ds) { iniciarSimul(ds.id); },
  nvEsc(ds) { if (simul.conferido) return; simul.resp[+ds.i] = +ds.j; const y = main.scrollTop; render(); main.scrollTop = y; },
  nvConf() {
    const T = SIMULADO[simul.id].tarefas[simul.t], peso = T.p || 1;
    T.itens.forEach((it,i) => { simul.max += peso; if (it.tipo === "txt" ? corrigeTxt(it, simul.resp[i]) : simul.resp[i] === it.ok) simul.pontos += peso; });
    simul.conferido = true; marcarEstudo();
    if (primeiraVezHoje("sim-"+simul.id+"-"+simul.t)) ganharXP(15); salvar();
    const y = main.scrollTop; render(); main.scrollTop = y;
  },
  nvProx() {
    simul.t++; simul.resp = {}; simul.conferido = false;
    if (simul.t >= SIMULADO[simul.id].tarefas.length) { const N = nvEstado(); (SIMULADO[simul.id].curso ? (E.curso = E.curso || {}) : N.sim)[simul.id] = {pontos: simul.pontos, max: simul.max, data: hoje()};
      if (simul.pontos/simul.max >= 0.5 && primeiraVezHoje("simok-"+simul.id)) ganharXP(30); else checarConquistas(); salvar(); }
    render(); main.scrollTop = 0;
  },
  nvSair() { simul = null; nvTela = null; nvModeloId = null; render(); main.scrollTop = 0; },
  nvEscrita() { nvTela = "escrita"; simul = null; render(); main.scrollTop = 0; },
  nvFala() { nvTela = "fala"; render(); main.scrollTop = 0; },
  nvModelo(ds) { nvModeloId = ds.id || null; const y = main.scrollTop; render(); main.scrollTop = y; },
  nvFeito(ds) { const N = nvEstado(); N.fala[ds.id] = !N.fala[ds.id]; if (N.fala[ds.id]) { marcarEstudo(); if (primeiraVezHoje("fala-"+ds.id)) ganharXP(15); } salvar(); const y = main.scrollTop; render(); main.scrollTop = y; }
});
// atalhos de teclado nos cartões: 1 a 9 escolhem a opção ou o bloco, Enter confere ou passa para o próximo
if (document.addEventListener) document.addEventListener("keydown", e => {
  if (!sessao || aba === "progresso" || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest("input, textarea"))) return;
  if (/^[1-9]$/.test(e.key)) {
    const b = main.querySelectorAll(".opcoes .opcao, .banco-blocos .bloco")[+e.key - 1];
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  } else if (e.key === "Enter" && !(e.target.closest && e.target.closest("button"))) { // num botão focado, o Enter já clica sozinho
    const b = main.querySelector('[data-acao="proximo"], [data-acao="conferirBlocos"]:not([disabled])');
    if (b) { e.preventDefault(); b.click(); }
  }
});
main.addEventListener("input", e => {
  const a = e.target.closest("[data-nv-in]"); if (a && simul) { simul.resp[+a.dataset.nvIn] = a.value; return; }
  const t = e.target.closest("[data-nv-txt]"); if (t) { const N = nvEstado(); N.textos[t.dataset.nvTxt] = t.value;
    const c = main.querySelector(`[data-nv-cont="${t.dataset.nvTxt}"]`); const m = ESCRITA.find(x => x.id === t.dataset.nvTxt);
    if (!E.escritaXp) E.escritaXp = {};
    if (!E.escritaXp[m.id] && contaPalavras(t.value) >= m.meta*0.8) { E.escritaXp[m.id] = hoje(); marcarEstudo(); ganharXP(25); avisar("Texto completo! +25 XP"); }
    salvar();
    if (c) c.textContent = `${contaPalavras(t.value)} de ~${m.meta} palavras`; }
});

/* ===================== CURSO (aba) ===================== */
let licao = null; // id da lição aberta
const normCurso = normCursoPl;
function cartoesDaLicao(l) {
  if (!l.ids) l.ids = l.pal.map(p => (todosCards.find(c => normCurso(c.pl) === normCurso(p[0])) || {}).id).filter(Boolean);
  return l.ids.map(id => cardPorId[id]).filter(Boolean);
}
CURSO.forEach(l => { SIMULADO[l.id] = {nome: l.pt, pl: l.pl, curso: true,
  tarefas: [{titulo: "Exercícios da lição", instrPl: "Proszę zaznaczyć poprawną odpowiedź lub wpisać odpowiedź.", instrPt: l.obj, texto: l.texto,
    // embaralha as opções (o conteúdo costuma trazer a certa em primeiro)
    itens: l.ex.map(it => { if (it.tipo === "txt") return it; const o = embaralhar(it.ops.map((t, j) => [t, j])); return {...it, ops: o.map(x => x[0]), ok: o.findIndex(x => x[1] === it.ok)}; })}]}; });
function notaLicao(l) { const r = (E.curso || {})[l.id]; return r ? Math.round(r.pontos / r.max * 100) : null; }
const licoesDo = nv => CURSO.filter(l => l.nivel === nv);
function feitasDo(nv) { return licoesDo(nv).filter(l => notaLicao(l) !== null && notaLicao(l) >= 70).length; }
// um nível abre quando 70% das lições do anterior estão concluídas (nota de 70% ou mais), ou quando o aluno decide pular
function nivelAberto(i) {
  if (i === 0 || E.mostrarTudo || (E.niveisAbertos || []).includes(NIVEIS[i].id)) return true;
  const ant = NIVEIS[i - 1].id, tot = licoesDo(ant).length;
  return tot > 0 && feitasDo(ant) / tot >= 0.7 && nivelAberto(i - 1);
}
function partesDo(nv) { const ps = []; licoesDo(nv).forEach(l => { let p = ps.find(x => x.nome === l.parte); if (!p) ps.push(p = {nome: l.parte, fonte: l.fonte, ls: []}); p.ls.push(l); }); return ps; }

function renderCurso() {
  const proxima = CURSO.find((l, i) => nivelAberto(NIVEIS.findIndex(n => n.id === l.nivel)) && (notaLicao(l) === null || notaLicao(l) < 70));
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Kurs · A1 → B2</span><h1>Curso completo</h1>
    <p class="sub">${CURSO.length} lições, do zero ao nível B2, montadas a partir dos livros oficiais de polonês como língua estrangeira. Cada lição tem gramática explicada em português, palavras com áudio, diálogo ou leitura e exercícios. O próximo nível abre quando você conclui 70% das lições do nível atual.</p></div>
    ${proxima ? `<button class="btn" data-acao="abrirLicao" data-id="${proxima.id}">Continuar: ${esc(proxima.pt)} (${proxima.nivel})</button>` : ""}
    ${NIVEIS.map((nv, i) => { const ls = licoesDo(nv.id); if (!ls.length) return ""; const f = feitasDo(nv.id), ab = nivelAberto(i);
      return `<div class="card plano" style="display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="font-size:18px">${nv.id}</b> · <span>${esc(nv.nome)}</span></div><span class="pill ${f === ls.length ? "ok" : ""}">${f}/${ls.length}</span></div>
        <div class="mini-barra"><i style="width:${Math.round(f / ls.length * 100)}%"></i></div>
        <span class="sub" style="font-size:13px">${esc(nv.desc)}</span>
        ${ab ? partesDo(nv.id).map(p => `<details class="todos" ${p.ls.some(l => l === proxima) ? "open" : ""}><summary>${esc(p.nome)} <span class="sub" style="font-weight:400">(${p.ls.filter(l => notaLicao(l) !== null && notaLicao(l) >= 70).length}/${p.ls.length})</span></summary>
            ${p.fonte ? `<span class="sub" style="font-size:12px">Base: ${esc(p.fonte)}</span>` : ""}
            <div class="lista">${p.ls.map(l => { const q = notaLicao(l);
              return `<button class="item" data-acao="abrirLicao" data-id="${l.id}"><div class="txt"><b>${esc(l.pt)}</b><small>${esc(l.pl)}</small></div><span class="pill ${q !== null && q >= 70 ? "ok" : ""}">${q === null ? "Nova" : q + "%"}</span></button>`; }).join("")}</div></details>`).join("")
          : `<div class="feedback no">Abre quando você concluir 70% das lições do ${NIVEIS[i - 1].id}.</div><button class="btn sec" data-acao="abrirNivel" data-id="${nv.id}">Já tenho esse nível: abrir o ${nv.id}</button>`}
      </div>`; }).join("")}
  </div>`;
}

function renderLicao() {
  const idx = CURSO.findIndex(x => x.id === licao), l = CURSO[idx], cs = cartoesDaLicao(l), p = notaLicao(l);
  if (l.audioExt) carregarAudio(l.id);
  const apr = cs.filter(c => (E.cards[c.id] || {}).box >= 2).length, ant = CURSO[idx - 1], prox = CURSO[idx + 1];
  main.innerHTML = `<div class="tela">
    <div><span class="eyebrow">Curso ${l.nivel} · ${esc(l.parte)}</span><h1>${esc(l.pt)}</h1>
    <p class="sub"><span class="pl">${esc(l.pl)}</span> · ${esc(l.obj)}</p></div>

    <h2 class="sub-grupo">Gramática</h2>
    ${l.gram.map(g => `<div class="card plano" style="display:grid;gap:6px"><b>${esc(g[0])}</b><span style="font-size:14.5px;line-height:1.5">${esc(g[1])}</span></div>`).join("")}

    <h2 class="sub-grupo">Palavras e frases</h2>
    <div class="card plano" style="display:grid;gap:0">${l.pal.map(w => `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border-top:1px solid var(--borda);padding:8px 0">
      <div><b class="pl">${esc(w[0])}</b><br><span class="pron">${esc(w[2])}</span> · <span style="font-size:14px">${esc(w[1])}</span>${w[3] ? `<br><small class="sub">${esc(w[3])}</small>` : ""}</div>${btnAudio(w[0])}</div>`).join("")}</div>
    <button class="btn" data-acao="estudarLicao">Estudar as palavras em cartões (${cs.length})</button>
    <p class="sub" style="font-size:12.5px;text-align:center">${apr} de ${cs.length} já aprendidas. As palavras que já estavam em outros temas contam aqui também.</p>

    ${l.dial && l.dial.length ? `<h2 class="sub-grupo">Diálogo</h2>
    <div class="chat">${l.dial.map((d, i) => `<div class="bolha ${i % 2 ? "eu" : "eles"}"><div class="topo-b"><span>${esc(d[0])}</span>${btnAudio(d[0])}</div><span class="pt-b">${esc(d[1])}</span></div>`).join("")}</div>` : ""}
    ${l.texto ? `<h2 class="sub-grupo">Leitura</h2><div class="card plano" style="display:grid;gap:8px"><div style="display:flex;gap:10px;justify-content:space-between"><span class="pl" style="font-size:15px;line-height:1.55">${esc(l.texto)}</span>${btnAudio(l.texto)}</div><span class="sub" style="font-size:13px">${esc(l.textoPt)}</span></div>` : ""}

    <h2 class="sub-grupo">Exercícios</h2>
    <button class="btn" data-acao="nvSim" data-id="${l.id}">${p === null ? "Fazer os exercícios" : `Refazer os exercícios (último: ${p}%)`}</button>

    <div class="linha-btn">
      ${ant ? `<button class="btn sec" data-acao="abrirLicao" data-id="${ant.id}">‹ Anterior</button>` : ""}
      <button class="btn sec" data-acao="fecharLicao">Todas as lições</button>
      ${prox && nivelAberto(NIVEIS.findIndex(n => n.id === prox.nivel)) ? `<button class="btn sec" data-acao="abrirLicao" data-id="${prox.id}">Próxima ›</button>` : ""}
    </div>
  </div>`;
}

Object.assign(acoes, {
  abrirLicao(ds) { licao = ds.id; simul = null; render(); main.scrollTop = 0; },
  fecharLicao() { licao = null; simul = null; render(); main.scrollTop = 0; },
  abrirNivel(ds) { (E.niveisAbertos = E.niveisAbertos || []).push(ds.id); salvar(); renderMantendo(); },
  estudarLicao() { const l = CURSO.find(x => x.id === licao); iniciarSessao(cartoesDaLicao(l), l.pt); }
});
// self-check: toda lição tem palavras ligadas a cartões e exercícios com resposta válida; ids únicos
console.assert(new Set(CURSO.map(l => l.id)).size === CURSO.length, "id de lição repetido");
CURSO.forEach(l => { console.assert(cartoesDaLicao(l).length === l.pal.length, "lição "+l.id+": palavra sem cartão");
  l.ex.forEach((it, i) => console.assert(it.tipo === "txt" ? it.aceitas.length > 0 : it.ok < it.ops.length, "lição "+l.id+" exercício "+(i+1))); });

/* ===================== INÍCIO ===================== */
// fica no fim do script: render() usa variáveis declaradas nas seções acima (simul, nvTela, falaModo)
carregarLocal();
delete E._confirmarReset;
try { render(); } catch(e) { aba = "hoje"; render(); } // se a aba salva falhar, abre em Hoje em vez de ficar em branco
conectarNuvem();

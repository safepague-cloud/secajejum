/* ===========================================================================
   Rastreamento do quiz (painel financeiro → aba Quiz). Anônimo: sem IP, nome ou e-mail.
   - Cada visita ganha um id aleatório (sessão), guardado no navegador por 2 h.
   - Registra: tela vista (índice + gênero + tempo), respostas, voltar, clique final.
   - Envia em lotes (a cada 4 eventos novos, a cada 15 s e ao sair da página) com
     navigator.sendBeacon, para não pesar a hospedagem nem atrasar o quiz.
   - O id da sessão vai junto para o checkout (?qz=...) para o painel ligar a venda às respostas.
   - Com ?tela= (atalho de teste) nada é registrado.
   ========================================================================= */
(function () {
  "use strict";
  var ENDPOINT = "api/evento.php";   // relativo: funciona em quiz.secajejumturbo.site/ e em secajejumturbo.site/quiz-novo/
  var QUIZ = "sjt";
  var VERSAO = "20261011a";
  var p = new URLSearchParams(location.search);
  var desligado = p.has("tela") || p.has("semrastreio");

  function novoId() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  // Sessão: reaproveita se a pessoa recarregar a página em até 2 h (mesmo quiz).
  var sessao = null;
  try {
    var s = JSON.parse(localStorage.getItem("qz_sessao") || "null");
    if (s && s.q === QUIZ && Date.now() - s.t < 2 * 3600 * 1000) sessao = s.id;
  } catch (e) {}
  if (!sessao) sessao = novoId();
  function tocar() { try { localStorage.setItem("qz_sessao", JSON.stringify({ id: sessao, q: QUIZ, t: Date.now() })); } catch (e) {} }
  tocar();

  var t0 = Date.now();
  var fila = [];
  var enviados = 0;
  var cab = {
    q: QUIZ, v: VERSAO, s: sessao,
    utm: {
      source: p.get("utm_source"), medium: p.get("utm_medium"), campaign: p.get("utm_campaign"),
      content: p.get("utm_content"), term: p.get("utm_term")
    },
    disp: (window.matchMedia && matchMedia("(pointer:coarse)").matches) || innerWidth < 768 ? "celular" : "computador",
    ref: (function () { try { return document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) { return ""; } })()
  };

  function txt(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 200); }
  function poe(ev) {
    if (desligado) return;
    ev.ms = Date.now() - t0;     // tempo desde o início da sessão
    fila.push(ev);
    tocar();
    if (fila.length - enviados >= 4) enviar(false);
  }
  function enviar(saindo) {
    if (desligado || enviados >= fila.length) return;
    var lote = fila.slice(enviados);
    var corpo = JSON.stringify({ c: cab, e: lote, n: enviados });
    var ok = false;
    try {
      if (navigator.sendBeacon) ok = navigator.sendBeacon(ENDPOINT, new Blob([corpo], { type: "text/plain" }));
    } catch (e) {}
    if (!ok && !saindo) {
      try { fetch(ENDPOINT, { method: "POST", body: corpo, keepalive: true, headers: { "Content-Type": "text/plain" } }); ok = true; } catch (e) {}
    }
    if (ok) enviados = fila.length;
  }
  setInterval(function () { enviar(false); }, 15000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") enviar(true); });
  addEventListener("pagehide", function () { enviar(true); });

  window.QZ = {
    sessao: sessao,
    // lado do teste da página 1 (app.js chama antes da 1ª tela; o Legas lê a versão do 1º lote da sessão)
    versao: function (sufixo) { cab.v = VERSAO + "-" + sufixo; },
    // tela vista (índice 0-based, gênero escolhido até aqui)
    tela: function (i, g) { poe({ k: "t", i: i, g: g || null }); },
    // resposta da tela i: texto, lista de textos ou valor (régua/idade)
    resp: function (i, valor) {
      poe({ k: "r", i: i, v: Array.isArray(valor) ? valor.map(txt) : txt(valor) });
    },
    voltou: function (i) { poe({ k: "b", i: i }); },
    // clique final: registra (com o lado do teste de preço, sck) e envia na hora (antes de sair para o checkout)
    checkout: function (i, lado) { poe({ k: "c", i: i, p: lado || null }); enviar(true); },
    // parâmetro para o link do checkout
    param: function () { return desligado ? "" : sessao; }
  };
})();

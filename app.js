/*__rt_WRAP__*/;(function(window,location,document,self){/* ===========================================================================
   Reconstrução do quiz Seca Jejum — SPA de estado local.
   Telas: HTML/CSS real capturado (window.SCREENS). Aqui só a lógica:
   navegação, ramificação por gênero, seleção/multi-seleção, réguas
   interativas (altura/peso), tela de carregamento e projeção de peso.
   ========================================================================= */
(function () {
  "use strict";

  var CHECKOUT_URL = "https://comprasseguras.org.ua/c/81a2f1d041";
  var LAST = 40;          // índice 0-based da última tela (RECEBER O MEU PLANO); era 41 antes de tirar "Escolha as comidas" (10/10/2026)
  var LOADING_IDX = 38;   // tela de carregamento (era 39; a tela "Escolha as comidas" saiu em 10/10/2026, como na Inlead)
  var LOADING_MS = 7000;

  var state = {
    gender: null,
    index: 0,
    answers: {
      altura: 180, alturaUnidade: "cm",
      pesoAtual: 80, pesoAtualUnidade: "kg",
      pesoDesejado: 70, pesoDesejadoUnidade: "kg"
    }
  };

  var root = document.getElementById("__next");
  var loadingTimer = null;

  function screensFor() { return window.SCREENS[state.gender || "mulher"]; }

  /* --- query string repassada pro checkout (UTMs e parâmetros da oferta) --- */
  function checkoutHref() {
    var p = new URLSearchParams(window.location.search);
    p.delete("tela"); p.delete("g");
    var metaParams = [];
    p.forEach(function (_, key) {
      if (/^(fbclid|_fbp|_fbc)$/i.test(key)) metaParams.push(key);
    });
    metaParams.forEach(function (key) { p.delete(key); });
    // qz/src permitem ligar a sessão do quiz à venda.
    if (window.QZ && QZ.param()) { p.set("qz", QZ.param()); p.set("src", QZ.param()); }
    if (ab) p.set("sck", ab.sck);           // teste de preço: lado do sorteio (o Legas separa as vendas por ele)
    var s = p.toString();
    return CHECKOUT_URL + (s ? "?" + s : "?");
  }

  /* ======================= TESTE DE PREÇO (19/10/2026) =======================
     api/ab.php sorteia R$ 29 × R$ 37 (cookie). Campanhas em teste no Laboratório
     voltam sempre o lado de R$ 29 (sck=ab_fora). Se falhar, usa o checkout padrão.
     A visita só é registrada quando a pessoa vê a página final (onde está o preço). */
  var ab = null, abVisita = false;
  function abParams(extra) {
    var q = new URLSearchParams(window.location.search), o = new URLSearchParams();
    ["campaign", "source", "content"].forEach(function (k) { if (q.get("utm_" + k)) o.set(k, q.get("utm_" + k)); });
    if (extra) o.set(extra, "1");
    return "api/ab.php?" + o.toString();
  }
  // O index.html já dispara o sorteio (window.__ab) junto com o carregamento; aqui só se ele não existir.
  var abPedido = null;
  if (!/[?&]tela=/.test(window.location.search)) {
    try {
      abPedido = window.__ab || fetch(abParams(), { credentials: "same-origin", cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; });
      abPedido = abPedido.then(function (d) {
        if (d && d.url && d.sck) { ab = d; if (state.index === LAST) aplicarPreco(); }
        return d;
      }).catch(function () { return null; });
    } catch (e) { abPedido = null; }
  }

  /* ======================= TESTE DA PÁGINA 1 (19/10/2026) =======================
     api/ab.php sorteia a página 1 (atual × nova) num sorteio à parte do de preço. A página 1 só aparece quando o
     sorteio responde (ou depois de P1_ESPERA_MS: aí fica a atual, fora da conta). O lado vai na versão da sessão
     (rastreio.js): 20261011a-p1a (atual), -p1b (nova), -p1f (campanha do Laboratório) e -p1x (sem sorteio). */
  var P1_ESPERA_MS = 1500;
  var p1 = "atual";
  function p1Decidir(pronto) {
    var feito = false;
    function fim(d) {
      if (feito) return;
      feito = true;
      var lado = d && d.p1;
      if (lado === "nova" && !(window.SCREENS && window.SCREENS.p1b)) lado = null;   // tela nova não carregou
      p1 = lado === "nova" ? "nova" : "atual";
      var cod = lado === "atual" ? "p1a" : lado === "nova" ? "p1b" : lado === "fora" ? "p1f" : "p1x";
      if (window.QZ && QZ.versao) QZ.versao(cod);
      pronto();
    }
    setTimeout(function () { fim(null); }, P1_ESPERA_MS);
    if (abPedido) abPedido.then(fim, function () { fim(null); }); else fim(null);
  }
  function aplicarPreco() {
    if (!ab || state.index !== LAST) return;
    if (ab.parcela) {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, t;
      while ((n = w.nextNode())) {
        t = n.nodeValue;
        if (/^\s*6x de\s*$/.test(t)) n.nodeValue = t.replace("6x", ab.parcelas);
        else if (/^\s*5,56\s*$/.test(t)) n.nodeValue = t.replace("5,56", ab.parcela);
        else if (/R\$29,00/.test(t)) n.nodeValue = t.replace("R$29,00", "R$" + ab.vista);
      }
    }
    if (!abVisita && ab.sck !== "ab_fora") {
      abVisita = true;
      try { fetch(abParams("visita"), { credentials: "same-origin", cache: "no-store", keepalive: true }); } catch (e) {}
    }
  }
  function redirectCheckout() { if (window.QZ) QZ.checkout(state.index, ab ? ab.sck : null); location.assign(checkoutHref()); }

  function scrollTop() {
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, 0); }
  }

  /* ======================= render ======================= */
  function render() {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    var html = state.index === 0 && p1 === "nova" ? window.SCREENS.p1b : screensFor()[state.index];
    if (html == null) { redirectCheckout(); return; }
    root.innerHTML = html;
    document.title = "Seca Jejum";
    fillDynamicWeight();
    if (state.index === LAST) aplicarPreco();
    wire();
    scrollTop();
    if (state.index === LOADING_IDX) startLoading();
    if (window.QZ) QZ.tela(state.index, state.gender);
  }

  function next() {
    if (state.index >= LAST) { redirectCheckout(); return; }
    state.index++;
    render();
  }
  function goBack() { if (state.index > 0) { if (window.QZ) QZ.voltou(state.index); state.index--; render(); } }

  /* ======================= helpers ======================= */
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  }
  function norm(t) { return (t || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function optionButtons() {
    return Array.prototype.filter.call(root.querySelectorAll('div[id^="opcoes_"] button'), visible);
  }
  function advanceButtons() {
    return Array.prototype.filter.call(root.querySelectorAll("button"), function (b) {
      return /(^|\s)btn(\s|$)/.test(b.className) && /btn-\w{4,}/.test(b.className) && visible(b);
    });
  }
  function backButton() {
    var b = root.querySelector("main button");
    return (b && !b.textContent.trim() && b.querySelector("svg")) ? b : null;
  }
  function itemWrap(btn) { return btn.closest(".group\\/item") || btn.parentElement; }
  function countActive(btns) {
    return btns.filter(function (b) {
      var w = itemWrap(b); return w && w.classList.contains("active");
    }).length;
  }

  /* categorias da tela "escolha as comidas" (≥1 por categoria) */
  function foodGroups(optBtns) {
    var comp = root.querySelector('div[id^="opcoes_"]');
    if (!comp) return [optBtns];
    var groups = [], current = null;
    Array.prototype.forEach.call(comp.querySelectorAll("*"), function (node) {
      var cl = node.classList;
      if (cl && cl.contains("content") && cl.contains("text") && node.textContent.trim()) {
        current = []; groups.push(current);
      } else if (node.tagName === "BUTTON" && optBtns.indexOf(node) !== -1 && current) {
        current.push(node);
      }
    });
    groups = groups.filter(function (g) { return g.length; });
    return groups.length >= 2 ? groups : [optBtns];
  }

  /* ======================= wiring ======================= */
  function wire() {
    var bb = backButton();
    if (bb) bb.addEventListener("click", function (e) { e.preventDefault(); goBack(); });

    // tela de carregamento: sem interação (auto-avança)
    if (state.index === LOADING_IDX) return;

    // réguas de altura/peso
    if (setupRuler()) {
      advanceButtons().forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          if (window.QZ) {
            var k = /desejado/i.test(root.textContent) ? "pesoDesejado" : (/altura/i.test(root.textContent) ? "altura" : "pesoAtual");
            QZ.resp(state.index, state.answers[k] + " " + state.answers[k + "Unidade"]);
          }
          next();
        });
      });
      wireUnitTabs();
      return;
    }

    var opts = optionButtons();
    var adv = advanceButtons();
    var optTexts = opts.map(function (b) { return norm(b.textContent); });
    var isGender = optTexts.indexOf("homem") !== -1 && optTexts.indexOf("mulher") !== -1;
    var isFinal = state.index >= LAST;

    if (isGender) {
      opts.forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          state.gender = norm(b.textContent) === "homem" ? "homem" : "mulher";
          if (window.QZ) QZ.resp(state.index, b.textContent);
          setActive(b, false);
          setTimeout(function () { state.index++; render(); }, 200);
        });
      });
      return;
    }

    var multi = opts.length > 0 && adv.length > 0;
    var single = opts.length > 0 && adv.length === 0;

    if (single) {
      opts.forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault(); setActive(b, false);
          if (window.QZ) QZ.resp(state.index, b.textContent);
          setTimeout(next, 240);
        });
      });
      return;
    }

    if (multi) {
      var isFood = /escolha as comidas/i.test(root.textContent);
      var groups = isFood ? foodGroups(opts) : null;
      var check = function () {
        var ok = groups
          ? groups.every(function (g) { return countActive(g) >= 1; })
          : countActive(opts) >= 1;
        adv.forEach(function (b) {
          // O HTML capturado da Inlead já vem "travado" (cursor-not-allowed no botão e opacity-75 no contêiner):
          // liga/desliga essas marcas junto com a trava, como a Inlead faz.
          b.classList.toggle("recon-locked", !ok);
          b.classList.toggle("cursor-not-allowed", !ok);
          b.classList.toggle("cursor-pointer", ok);
          var w = b.closest(".group\\/button");
          if (w) { w.classList.toggle("opacity-75", !ok); w.classList.toggle("opacity-100", ok); }
        });
        return ok;
      };
      opts.forEach(function (b) {
        b.addEventListener("click", function (e) { e.preventDefault(); setActive(b, true); check(); });
      });
      adv.forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          if (check()) {
            if (window.QZ) QZ.resp(state.index, opts.filter(function (o) { var w = itemWrap(o); return w && w.classList.contains("active"); }).map(function (o) { return o.textContent; }));
            next();
          }
        });
      });
      check(); // já começa travado
      return;
    }

    // intersticial / input
    adv.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.QZ) {
          var vals = Array.prototype.map.call(root.querySelectorAll("main input"), function (x) { return x.value; }).filter(function (v) { return v !== ""; });
          if (vals.length) QZ.resp(state.index, vals.length === 1 ? vals[0] : vals);
        }
        if (isFinal) redirectCheckout(); else next();
      });
    });
  }

  function setActive(btn, multi) {
    var wrap = itemWrap(btn);
    if (!multi) {
      var comp = btn.closest('div[id^="opcoes_"]') || root;
      comp.querySelectorAll(".group\\/item").forEach(function (w) {
        w.classList.remove("active", "scale-[--scale-active]");
      });
    }
    if (wrap) { wrap.classList.toggle("active"); wrap.classList.toggle("scale-[--scale-active]"); }
  }

  /* ======================= RÉGUAS (altura / peso) ======================= */
  function setupRuler() {
    var comp = root.querySelector('div[id^="opcoes_"]') ? null : null;
    // a régua vive num componente que tem um .swiper + abas de unidade
    var swiper = root.querySelector(".swiper.swiper-initialized");
    var tabWrap = root.querySelector(".flex.p-1.w-fit");
    if (!swiper || !tabWrap) return false;

    var host = swiper.parentElement;              // div.pb-2.pt-4 [mask-image]
    var labels = [].map.call(swiper.querySelectorAll("span.mt-2"), function (s) {
      return parseInt(s.textContent, 10);
    }).filter(function (n) { return !isNaN(n); });
    var min = labels.length ? labels[0] : 40;
    var max = labels.length ? labels[labels.length - 1] : 220;

    var kg = /kg/i.test(tabWrap.textContent) && /lb/i.test(tabWrap.textContent);
    var kind, key, unitKey, imperial;
    if (kg) {
      var desejado = /desejado/i.test(root.textContent);
      kind = "weight";
      key = desejado ? "pesoDesejado" : "pesoAtual";
      unitKey = key + "Unidade";
      imperial = "lb";
    } else {
      kind = "height"; key = "altura"; unitKey = "alturaUnidade"; imperial = "pol";
    }

    var cur = clamp(state.answers[key] || Math.round((min + max) / 2), min, max);
    var unit = state.answers[unitKey] || (kg ? "kg" : "cm");

    // monta a régua
    var ruler = document.createElement("div");
    ruler.className = "recon-ruler";
    var strip = "";
    for (var v = min; v <= max; v++) {
      var cls = "recon-ruler-tick" + (v % 10 === 0 ? " t10" : (v % 5 === 0 ? " t5" : ""));
      strip += '<i class="' + cls + '" data-v="' + v + '">' +
        (v % 10 === 0 ? "<b></b>" : "") + "</i>";
    }
    ruler.innerHTML =
      '<span class="recon-ruler-value"></span>' +
      '<div class="recon-ruler-trackwrap">' +
        '<div class="recon-ruler-track"><div class="recon-ruler-strip">' + strip + "</div></div>" +
        '<div class="recon-ruler-pointer"></div>' +
      "</div>";
    // substitui só o .swiper (mantém abas e legenda "Arraste para ajustar")
    swiper.replaceWith(ruler);

    var track = ruler.querySelector(".recon-ruler-track");
    var valEl = ruler.querySelector(".recon-ruler-value");
    var ticks = ruler.querySelectorAll(".recon-ruler-tick");
    var TICK = 12;

    function fmt(metric, u) {
      if (kind === "height") {
        if (u === "cm") return metric + '<small>cm</small>';
        var totIn = metric / 2.54, ft = Math.floor(totIn / 12), inch = Math.round(totIn - ft * 12);
        if (inch === 12) { ft++; inch = 0; }
        return ft + "'" + inch + '"';
      } else {
        if (u === "kg") return metric + '<small>kg</small>';
        return Math.round(metric * 2.2046) + '<small>lb</small>';
      }
    }
    function relabel(u) {
      ticks.forEach(function (t) {
        var b = t.querySelector("b");
        if (!b) return;
        var mv = +t.dataset.v;
        if (u === "cm" || u === "kg") { b.textContent = mv; return; }
        b.textContent = kind === "height"
          ? Math.round(mv / 2.54)
          : Math.round(mv * 2.2046);
      });
    }
    function paint() {
      valEl.innerHTML = fmt(state.answers[key], state.answers[unitKey]);
    }
    function centerOn(metric, smooth) {
      track.scrollTo({ left: (metric - min) * TICK, behavior: smooth ? "smooth" : "auto" });
    }

    state.answers[key] = cur;
    state.answers[unitKey] = unit;
    relabel(unit); paint();
    requestAnimationFrame(function () { centerOn(cur, false); });

    var raf = null;
    track.addEventListener("scroll", function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var v = clamp(Math.round(track.scrollLeft / TICK) + min, min, max);
        if (v !== state.answers[key]) { state.answers[key] = v; paint(); }
      });
    });

    // abas de unidade
    var tabs = tabWrap.querySelectorAll("button");
    tabs[0].addEventListener("click", function () { switchUnit(kg ? "kg" : "cm"); });
    tabs[1].addEventListener("click", function () { switchUnit(imperial); });
    function switchUnit(u) {
      state.answers[unitKey] = u;
      tabs.forEach(function (t) {
        t.classList.remove("btn-theme");
        t.classList.add("text-[--theme-background-contrast-6]");
      });
      var active = (u === "cm" || u === "kg") ? tabs[0] : tabs[1];
      active.classList.add("btn-theme");
      active.classList.remove("text-[--theme-background-contrast-6]");
      relabel(u); paint();
    }
    return true;
  }

  function wireUnitTabs() { /* tratado dentro de setupRuler */ }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ======================= TELA DE CARREGAMENTO ======================= */
  function startLoading() {
    var bar = root.querySelector(".progress");
    var pctEls = root.querySelectorAll(".flex.justify-between .w-\\[2rem\\], .theme-color-title .w-\\[2rem\\]");
    var pctEl = null;
    root.querySelectorAll("div").forEach(function (d) {
      if (!pctEl && /^\d+%$/.test(d.textContent.trim()) && d.children.length === 0) pctEl = d;
    });
    var t0 = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - t0) / LOADING_MS);
      var pc = Math.round(p * 100);
      if (bar) bar.style.width = pc + "%";
      if (pctEl) pctEl.textContent = pc + "%";
      if (p < 1) requestAnimationFrame(tick);
    })(t0);

    // carrossel de depoimentos: rotação simples
    var wrap = root.querySelector(".swiper-wrapper");
    if (wrap && wrap.children.length > 1) {
      var i = 0, cardW = wrap.children[0].getBoundingClientRect().width + 8;
      wrap.style.transition = "transform .5s ease";
      var carTimer = setInterval(function () {
        i = (i + 1) % wrap.children.length;
        wrap.style.transform = "translate3d(" + (-i * cardW) + "px,0,0)";
      }, 2500);
      loadingCleanup = function () { clearInterval(carTimer); };
    }

    loadingTimer = setTimeout(function () { loadingTimer = null; next(); }, LOADING_MS + 150);
  }
  var loadingCleanup = null;

  /* ======================= PESO DINÂMICO (projeção) ======================= */
  function fillDynamicWeight() {
    var w = state.answers.pesoDesejado || 70;
    root.querySelectorAll("[data-w]").forEach(function (el) { el.textContent = w; });
  }

  /* ======================= start ======================= */
  var p = new URLSearchParams(window.location.search);
  if (p.has("tela")) {
    // atalho de teste: ?tela=1&p1=nova mostra a página 1 nova (nada é registrado com ?tela=)
    p1 = p.get("p1") === "nova" && window.SCREENS.p1b ? "nova" : "atual";
    state.gender = p.get("g") === "homem" ? "homem" : "mulher";
    state.index = clamp(parseInt(p.get("tela"), 10) - 1, 0, LAST);
    render();
  } else {
    p1Decidir(render);
  }
})();

}).call(globalThis,(typeof globalThis!=="undefined"&&globalThis.__rt_W)||window,(typeof globalThis!=="undefined"&&globalThis.__rt_L)||location,(typeof globalThis!=="undefined"&&globalThis.__rt_DOC)||document,(typeof globalThis!=="undefined"&&globalThis.__rt_W)||self);
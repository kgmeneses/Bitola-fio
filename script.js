/* ============ CONSTANTES ============ */
// Seção (mm²) e capacidade de condução Iz (A): cobre, PVC 70 °C, 2 condutores carregados, método B1
const CABOS = [
  { s: 1.5, iz: 17.5 }, { s: 2.5, iz: 24 }, { s: 4, iz: 32 }, { s: 6, iz: 41 },
  { s: 10, iz: 57 }, { s: 16, iz: 76 }, { s: 25, iz: 101 }, { s: 35, iz: 125 }
];
const DISJUNTORES = [10, 16, 20, 25, 32, 40, 50, 63]; // A
const RHO = 0.0172;   // resistividade do cobre (Ω·mm²/m)
const QUEDA = 0.04;   // queda de tensão máxima: 4 %
const MIN_NORMA = 1.5; // seção mínima (mm²)

/* ============ FUNÇÕES DE CÁLCULO ============ */

// Etapa 1: Lei de Ohm, Ip = P / V
function calcularIp(potencia, tensao) { return potencia / tensao; }

// Etapa 2: corrente corrigida, Ic = Ip / (FCA × FCT)
function calcularIc(ip, fca, fct) { return ip / (fca * fct); }

// Etapa 3 e 4: menor cabo cuja capacidade (Iz) é >= corrente informada
function escolherBitola(corrente) {
  return CABOS.find(c => c.iz >= corrente) || null;
}

// Etapa 4: menor seção comercial >= seção calculada
function arredondarSecao(secao) {
  return CABOS.find(c => c.s >= secao - 1e-9) || null;
}

// Etapa 4: S = (2 × ρ × L × Ic) / (V% × V)
function calcularSecaoQueda(ic, dist, tensao) {
  return (2 * RHO * dist * ic) / (QUEDA * tensao);
}

// Etapa 5: Ireal = FCA × FCT × Iz; disjuntor comercial entre Ip e Ireal (o maior que o fio protege)
function escolherDisjuntor(ip, ireal) {
  const ok = DISJUNTORES.filter(d => d >= ip && d <= ireal);
  return ok.length ? ok[ok.length - 1] : null;
}

/* ============ AUXILIARES ============ */
const $ = id => document.getElementById(id);
const fmt = (n, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

// Aceita vírgula ou ponto; devolve NaN se vazio ou inválido (letras, "Infinity", "1e5"...)
// permiteMilhar: "2.500" vale 2500 (padrão brasileiro). Desligado em FCT e FCA, onde "0.870" é decimal.
function lerNumero(texto, permiteMilhar = true) {
  let t = texto.trim().replace(/\s/g, "");
  if (t === "") return NaN;
  if (permiteMilhar && /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "");
  t = t.replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

function mostrarErro(id, msg) {
  $(id).classList.add("invalido");
  const p = document.createElement("p");
  p.className = "msg-erro"; p.textContent = msg;
  $(id).parentElement.appendChild(p);
}
function limparErros() {
  document.querySelectorAll(".msg-erro").forEach(e => e.remove());
  document.querySelectorAll(".invalido").forEach(e => e.classList.remove("invalido"));
}

// Desenha o corte do fio: o tamanho do círculo acompanha a bitola
function desenharFio(secao) {
  const k = 9; // pixels por mm de raio
  const r = Math.sqrt(secao / Math.PI) * k;
  const R = r + 11;
  const tam = 2 * (R + 3);
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="Corte do fio de ${fmt(secao)} milímetros quadrados">
    <circle cx="${tam/2}" cy="${tam/2}" r="${R}" fill="#1b4a78"/>
    <circle cx="${tam/2}" cy="${tam/2}" r="${r}" fill="#b87333"/></svg>`;
}

/* ============ CÁLCULO COMPLETO ============ */
function calcular() {
  limparErros();
  const campos = [
    ["potencia", "a potência", true], ["tensao", "a tensão", true], ["fct", "o FCT", false],
    ["fca", "o FCA", false], ["distancia", "a distância", true]
  ];
  const v = {};
  let temErro = false;
  for (const [id, nome, milhar] of campos) {
    v[id] = lerNumero($(id).value, milhar);
    if (!(v[id] > 0)) {
      mostrarErro(id, `Informe ${nome} com um número maior que zero.`);
      temErro = true;
    }
  }
  // Limites razoáveis para os fatores de correção
  if (v.fca > 1) { mostrarErro("fca", "O FCA não pode passar de 1,00."); temErro = true; }
  if (v.fct > 1.5) { mostrarErro("fct", "Esse FCT parece alto. Confira a tabela de valores típicos."); temErro = true; }
  if (temErro) {
    $("resultado").hidden = true;
    const primeiro = document.querySelector(".invalido");
    primeiro.scrollIntoView({ behavior: "smooth", block: "center" });
    primeiro.focus();
    return;
  }
  // Etapas 1 a 4
  const ip = calcularIp(v.potencia, v.tensao);
  const ic = calcularIc(ip, v.fca, v.fct);
  const inicial = escolherBitola(ic);
  const sQueda = calcularSecaoQueda(ic, v.distancia, v.tensao);
  const porQueda = arredondarSecao(sQueda);

  let html = "";
  let profissional = ip > 50;

  if (!inicial || !porQueda) profissional = true;

  const passos = [];
  passos.push(`<div class="etapa"><h3>Etapa 1: corrente do circuito (Lei de Ohm)</h3>
    <p><span class="formula">Ip = P ÷ V = ${fmt(v.potencia, 1)} ÷ ${fmt(v.tensao, 1)} = ${fmt(ip)} A</span></p>
    <p>É a corrente que os aparelhos puxam da rede quando ligados.</p></div>`);
  passos.push(`<div class="etapa"><h3>Etapa 2: corrente corrigida</h3>
    <p><span class="formula">Ic = Ip ÷ (FCA × FCT) = ${fmt(ip)} ÷ (${fmt(v.fca)} × ${fmt(v.fct)}) = ${fmt(ic)} A</span></p>
    <p>É a corrente que o fio precisa aguentar considerando o calor e o agrupamento.</p></div>`);

  if (!inicial) {
    passos.push(`<div class="etapa"><h3>Etapa 3: bitola inicial</h3><p>Nenhuma seção até 35 mm² suporta ${fmt(ic)} A.</p></div>`);
  } else {
    passos.push(`<div class="etapa"><h3>Etapa 3: bitola inicial (sem considerar a distância)</h3>
      <p>Menor fio que suporta ${fmt(ic)} A: <strong>${fmt(inicial.s)} mm²</strong> (aguenta ${fmt(inicial.iz, 1)} A).</p></div>`);
  }
  passos.push(`<div class="etapa"><h3>Etapa 4: bitola final (considerando a distância)</h3>
    <p><span class="formula">S = (2 × ρ × L × Ic) ÷ (V% × V)</span></p>
    <p><span class="formula">S = (2 × 0,0172 × ${fmt(v.distancia, 1)} × ${fmt(ic)}) ÷ (0,04 × ${fmt(v.tensao, 1)}) = ${fmt(sQueda)} mm²</span></p>
    <p>ρ = resistividade do cobre (0,0172 Ω·mm²/m). Queda de tensão máxima usada: 4%.</p></div>`);

  if (profissional && (!inicial || !porQueda)) {
    html = `<div class="cartao destaque"><h2>Resultado</h2>
      <div class="aviso">Este caso exige um profissional. A bitola necessária passa de 35 mm².</div></div>
      <div class="cartao"><h2>Passo a passo</h2>${passos.join("")}</div>`;
    $("resultado").innerHTML = html; $("resultado").hidden = false;
    $("resultado").scrollIntoView({ behavior: "smooth" });
    return;
  }

  // Bitola final = maior entre as etapas 3, 4 e o mínimo da norma
  let idx = CABOS.findIndex(c => c.s === Math.max(inicial.s, porQueda.s, MIN_NORMA));
  const idxBase = idx;

  // Etapa 5: sobe a bitola se nenhum disjuntor servir
  let ireal, disj;
  for (; idx < CABOS.length; idx++) {
    ireal = v.fca * v.fct * CABOS[idx].iz;
    disj = escolherDisjuntor(ip, ireal);
    if (disj) break;
  }
  if (!disj) {
    $("resultado").innerHTML = `<div class="cartao destaque"><h2>Resultado</h2>
      <div class="aviso">Este caso exige um profissional. Não há disjuntor comercial adequado nesta faixa.</div></div>
      <div class="cartao"><h2>Passo a passo</h2>${passos.join("")}</div>`;
    $("resultado").hidden = false;
    $("resultado").scrollIntoView({ behavior: "smooth" });
    return;
  }
  const cabo = CABOS[idx];
  const subiu = idx !== idxBase;
  const quedaV = (2 * RHO * v.distancia * ic) / cabo.s;
  const quedaPct = (quedaV / v.tensao) * 100;
  const uso = Math.min(100, (ip / ireal) * 100);

  passos.push(`<div class="etapa"><h3>Etapa 5: corrente real do fio e disjuntor</h3>
    <p>Bitola final: maior valor entre a etapa 3 (${fmt(inicial.s)} mm²), a etapa 4 (${fmt(porQueda.s)} mm²) e o mínimo da norma (1,5 mm²)${subiu ? ", aumentada para que exista um disjuntor adequado" : ""}: <strong>${fmt(cabo.s)} mm²</strong>.</p>
    <p><span class="formula">Ireal = FCA × FCT × Iz = ${fmt(v.fca)} × ${fmt(v.fct)} × ${fmt(cabo.iz, 1)} = ${fmt(ireal)} A</span></p>
    <p>O disjuntor deve ficar entre a corrente do circuito (${fmt(ip)} A) e a corrente real do fio (${fmt(ireal)} A). O maior valor comercial nessa faixa é <strong>${disj} A</strong>.</p></div>`);

  passos.push(`<div class="etapa"><h3>Conferência: queda de tensão real</h3>
    <p><span class="formula">ΔV = (2 × ρ × L × Ic) ÷ S = (2 × 0,0172 × ${fmt(v.distancia, 1)} × ${fmt(ic)}) ÷ ${fmt(cabo.s)} = ${fmt(quedaV)} V</span></p>
    <p><span class="formula">ΔV% = ΔV ÷ V × 100 = ${fmt(quedaV)} ÷ ${fmt(v.tensao, 1)} × 100 = ${fmt(quedaPct)} %</span> (limite usado: 4%)</p></div>`);

  html = `<div class="cartao destaque"><h2>Resultado</h2>
    ${profissional ? `<div class="aviso">Este caso exige um profissional. A corrente passa de 50 A.</div>` : ""}
    <div class="grade">
      <div class="dado principal"><span>Bitola do fio</span><strong>${fmt(cabo.s)} mm²</strong></div>
      <div class="dado principal"><span>Disjuntor</span><strong>${disj} A</strong></div>
      <div class="dado"><span>Corrente do circuito (Ip)</span><strong>${fmt(ip)} A</strong></div>
      <div class="dado"><span>Queda de tensão real</span><strong>${fmt(quedaPct)} %</strong></div>
    </div>
    <div class="fio">${desenharFio(cabo.s)}<p class="ajuda">Corte do fio na escala da bitola: cobre (laranja) e isolação (azul).</p></div>
    <p><strong>Quanto do fio você usa:</strong> ${fmt(uso, 0)}% (${fmt(ip)} A de até ${fmt(ireal)} A que o fio aguenta com segurança).</p>
    <div class="barra"><i style="width:${uso}%"></i></div>
    <div class="nota">Com ${fmt(ip)} A de corrente, o fio precisa de ${fmt(cabo.s)} mm² e o disjuntor de ${disj} A. Disjuntores entre ${fmt(ip)} A e ${fmt(ireal)} A protegem este fio, mas nunca use um disjuntor acima de ${fmt(ireal)} A.</div>
  </div>
  <div class="cartao"><h2>Passo a passo</h2>${passos.join("")}</div>`;

  $("resultado").innerHTML = html;
  $("resultado").hidden = false;
  $("resultado").scrollIntoView({ behavior: "smooth" });
}

function limpar() {
  $("form").reset();
  $("fct").value = "1,00"; $("fca").value = "1,00";
  limparErros();
  $("resultado").hidden = true; $("resultado").innerHTML = "";
}

/* ============ EVENTOS ============ */
$("form").addEventListener("submit", e => { e.preventDefault(); calcular(); });
$("limpar").addEventListener("click", limpar);
document.querySelectorAll(".atalhos button").forEach(b =>
  b.addEventListener("click", () => { $("tensao").value = b.dataset.v; })
);
// ============================================================
// ApuraPASEP — motor de cálculo (Appwrite Function)
// Porta a lógica de classificação e apuração que antes rodava no navegador
// (PASEP_teste_jspdf.html) para rodar aqui, no servidor. O código HTML público
// não contém mais nenhuma regra de classificação — só envia o XML bruto e
// recebe de volta o resultado já calculado.
//
// Nesta versão, as regras de classificação (RUBRICAS_RETENCAO, RUBRICAS_FUNDEB,
// ALERTAS_FINALIDADE, os dois prefixos de CFEM) deixaram de ser constantes fixas
// no código-fonte e passaram a ser lidas da tabela "regras_motor" a cada execução —
// isso é o que permite o administrador editar/criar regras pela interface, sem
// precisar mexer em código nem reimplantar esta função.
//
// Para isso, a função autentica com uma API Key própria (não a do usuário que
// chamou), configurada como variável de ambiente no Appwrite (Settings da função
// → Environment variables → APPWRITE_API_KEY). Sem isso, usuários comuns (que não
// têm permissão de leitura na tabela regras_motor) não conseguiriam calcular nada.
//
// Receita: desde 01/10/2026 vem só da conta 6.2.1.2 (crédito menos débito, todos os registros do arquivo).
// Ver README, seção 2. A conta 6.2.1.3.1.01 só confere a dedução do FUNDEB (alerta se a diferença passar de R$ 0,10).
//
// A lógica de negócio abaixo (construirEtapasParse, parseAudesp, calcular) é
// uma cópia fiel do motor original, linha por linha — nenhuma regra de cálculo
// foi alterada nesta migração. Só a fonte do XML DOM mudou: em vez do DOMParser
// do navegador, usa-se @xmldom/xmldom (equivalente para Node.js), com um
// pequeno ajuste na função auxiliar childByLocal, que precisa iterar por
// childNodes (não .children, que o xmldom não implementa) e filtrar por
// nodeType === 1 (nó do tipo elemento).
// ============================================================

import { DOMParser } from '@xmldom/xmldom';
import { Client, TablesDB, Query } from 'node-appwrite';

var DATABASE_ID = 'apurapasep';
var EXERCICIOS_RECEITA_DISPONIVEIS = ['2026','2027'];

// Regras de classificação — começam vazias e são preenchidas a cada execução pela
// função carregarRegras(), lendo a tabela regras_motor. construirEtapasParse (abaixo)
// referencia essas mesmas variáveis pelo nome, sem saber se o valor veio de uma
// constante fixa ou do banco — por isso a lógica de negócio não precisou mudar.
var RUBRICAS_RETENCAO = [];
var CFEM_UNIAO_PREFIX = null;
var CFEM_ESTADO_PREFIX = null;
var RUBRICAS_FUNDEB = [];
var ALERTAS_FINALIDADE = [];

async function carregarRegras(){
  var clienteAdmin = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  var tablesDBAdmin = new TablesDB(clienteAdmin);

  var resultado = await tablesDBAdmin.listRows({
    databaseId: DATABASE_ID, tableId: 'regras_motor',
    queries: [Query.equal('ativo', true), Query.limit(200)]
  });

  var novasRetencao = [], novasFundeb = [], novasFinalidade = [];
  var novoCfemUniao = null, novoCfemEstado = null;

  resultado.rows.forEach(function(r){
    if (r.categoria === 'retencao') novasRetencao.push({ label: r.label, prefix: r.prefixo });
    else if (r.categoria === 'fundeb') novasFundeb.push({ label: r.label, prefix: r.prefixo });
    else if (r.categoria === 'finalidade') novasFinalidade.push({ label: r.label, prefix: r.prefixo, bloco: r.bloco });
    else if (r.categoria === 'cfem_uniao') novoCfemUniao = r.prefixo;
    else if (r.categoria === 'cfem_estado') novoCfemEstado = r.prefixo;
  });

  RUBRICAS_RETENCAO = novasRetencao;
  RUBRICAS_FUNDEB = novasFundeb;
  ALERTAS_FINALIDADE = novasFinalidade;
  CFEM_UNIAO_PREFIX = novoCfemUniao;
  CFEM_ESTADO_PREFIX = novoCfemEstado;
}

function localName(el){ return el.localName || el.nodeName.split(':').pop(); }
function findAllByLocal(root, name){
  var all = root.getElementsByTagName('*'), out = [];
  for (var i=0;i<all.length;i++){ if (localName(all[i]) === name) out.push(all[i]); }
  return out;
}
function childByLocal(el, name){
  var kids = el.childNodes;
  for (var i=0;i<kids.length;i++){
    var k = kids[i];
    if (k.nodeType === 1 && localName(k) === name) return k;
  }
  return null;
}
function childText(el, name){ var c = childByLocal(el, name); return c ? c.textContent.trim() : null; }
function num(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function construirEtapasParse(xmlText){
    var ctx = {};
    var etapas = [
      {rotulo:'Lendo o arquivo e validando a estrutura do XML', exec:function(){
        ctx.doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (ctx.doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo não reconhecido como XML válido.');
      }},
      {rotulo:'Identificando a competência e o leiaute AUDESP', exec:function(){
        var descritor = findAllByLocal(ctx.doc, 'Descritor')[0];
        ctx.ano = descritor ? childText(descritor, 'AnoExercicio') : null;
        ctx.mes = descritor ? childText(descritor, 'MesExercicio') : null;
        ctx.codigoMunicipio = descritor ? childText(descritor, 'Municipio') : null;
        var tipo = descritor ? childText(descritor, 'TipoDocumento') : null;
        if (!ctx.ano || !ctx.mes) throw new Error('Não foi possível identificar a competência (mês/ano) no descritor do arquivo.');
        if (tipo && tipo.indexOf('CONTA-CORRENTE') === -1) throw new Error('Leiaute não reconhecido (' + tipo + '). Esta versão lê apenas Contas Correntes.');
        // A tabela de especificação de códigos da receita (TABELAS_RECEITA) tem uma versão por
        // exercício. Não bloqueia a apuração (que não depende dessa tabela para o cálculo em si, só
        // para exibir a descrição por extenso dos códigos nos relatórios), mas o usuário precisa
        // saber quando o exercício do XML não tem tabela própria carregada.
        if (EXERCICIOS_RECEITA_DISPONIVEIS.indexOf(String(ctx.ano)) === -1){
          var maisRecente = EXERCICIOS_RECEITA_DISPONIVEIS[EXERCICIOS_RECEITA_DISPONIVEIS.length-1];
          ctx.avisoExercicio = 'Este XML é do exercício ' + ctx.ano + ', mas não há tabela de especificação de códigos da receita carregada para esse exercício (disponíveis: ' + EXERCICIOS_RECEITA_DISPONIVEIS.join(', ') + '). A apuração do PASEP não é afetada (não depende dessa tabela), mas a descrição por extenso de códigos nos relatórios usará a tabela de ' + maisRecente + ', que pode não corresponder à classificação vigente para ' + ctx.ano + '.';
        }
      }},
      {rotulo:'Separando os registros da conta 6.2.1.2 (receita realizada)', exec:function(){
        // Receita realizada = conta 6.2.1.2 (621200000), de natureza credora: os créditos são a receita e os
        // débitos são estornos, devoluções e correções. A conta é lida em TODOS os registros do arquivo, inclusive
        // os com "Mes" anterior à competência: eles trazem os ajustes de períodos anteriores que compõem o saldo
        // do mês (conferido nas 8 competências de jan a ago/2026 de Piratininga: filtrar só o mês diverge).
        // Nenhuma outra conta entra na receita (nem a 6.2.1.1, nem a 6.2.1.3.1.01, nem a 5.2.1.2.9).
        ctx.receitaBlocks = findAllByLocal(ctx.doc, 'ReceitaArrecadar');      // conta 6.2.1.1, só informativa
        ctx.previsaoBlocks = findAllByLocal(ctx.doc, 'PrevisaoReceitaOrcamentaria');
        var temConta = ctx.previsaoBlocks.some(function(b){ return childText(b,'ContaContabil') === '621200000'; });
        if (!temConta) throw new Error('Não foram encontrados registros da conta 6.2.1.2 (receita realizada) neste arquivo.');
      }},
      {rotulo:'Extraindo a receita realizada (crédito menos débito da 6.2.1.2)', exec:function(){
        ctx.lancamentosPorCodigo = {}; ctx.bruto = {}; ctx.devol = {}; ctx.devolPorFicha = {}; ctx.devolucoesPorCodigo = {};
        ctx.extratoReceita = []; ctx.extratoApoio = []; ctx.dedFundebContabil = 0;
        function lerBloco(b){
          var mov = childByLocal(b,'MovimentoContabil');
          return {
            conta: childText(b,'ContaContabil'), codigo: childText(b,'ClassificacaoEconomicaReceita'),
            fonte: childText(b,'FonteRecursos'), aplicacao: childText(b,'CodigoAplicacao'), mes: childText(b,'Mes'),
            saldoInicial: mov ? num(childText(mov,'SaldoInicial')) : 0, natInicial: mov ? childText(mov,'NatInicial') : '',
            credito: mov ? num(childText(mov,'MovimentoCredito')) : 0, debito: mov ? num(childText(mov,'MovimentoDebito')) : 0,
            saldoFinal: mov ? num(childText(mov,'SaldoFinal')) : 0, natFinal: mov ? childText(mov,'NatFinal') : ''
          };
        }
        ctx.previsaoBlocks.forEach(function(b){
          var l = lerBloco(b);
          if (l.conta === '621200000'){
            ctx.extratoReceita.push(l);
            var ficha = l.codigo+'|'+l.fonte+'|'+l.aplicacao;
            ctx.bruto[l.codigo] = (ctx.bruto[l.codigo]||0) + l.credito;
            ctx.devol[l.codigo] = (ctx.devol[l.codigo]||0) + l.debito;
            ctx.devolPorFicha[ficha] = (ctx.devolPorFicha[ficha]||0) + l.debito;
            if (Math.abs(l.credito) > 0.005){
              (ctx.lancamentosPorCodigo[l.codigo] = ctx.lancamentosPorCodigo[l.codigo]||[]).push({fonte:l.fonte, aplicacao:l.aplicacao, valor:l.credito, mes:l.mes});
            }
            if (Math.abs(l.debito) > 0.005){
              (ctx.devolucoesPorCodigo[l.codigo] = ctx.devolucoesPorCodigo[l.codigo]||[]).push({fonte:l.fonte, aplicacao:l.aplicacao, valor:l.debito, mes:l.mes, origem:'Estorno/correção (débito da 6.2.1.2)'});
            }
          } else if (l.conta === '621310100'){
            // Conta 6.2.1.3.1.01 (deduções do FUNDEB), de natureza devedora: a retenção é o débito. Só serve de
            // conferência da dedução de 20% (não altera a receita nem a base).
            ctx.dedFundebContabil += l.debito - l.credito;
            ctx.extratoApoio.push(l);
          } else if (l.conta === '521290000'){
            ctx.extratoApoio.push(l);   // reestimativa orçamentária: só informativa
          }
        });
        ctx.receitaBlocks.forEach(function(b){ var l = lerBloco(b); ctx.extratoApoio.push(l); });   // 6.2.1.1: só informativa
        var allCodes = {};
        Object.keys(ctx.bruto).forEach(function(c){ allCodes[c]=true; });
        Object.keys(ctx.devol).forEach(function(c){ allCodes[c]=true; });
        ctx.codes = Object.keys(allCodes);
      }},
      {rotulo:'Apurando a Receita Corrente Arrecadada líquida', exec:function(){
        ctx.liquido = function(code){ return (ctx.bruto[code]||0) - (ctx.devol[code]||0); };
        ctx.somaPorPrefixo = function(prefixo, tamanho){
          var t=0; ctx.codes.forEach(function(c){ if (c.substr(0,tamanho)===prefixo) t+=ctx.liquido(c); }); return t;
        };
        ctx.lancamentosDoPrefixo = function(prefixo, tamanho){
          var out=[];
          ctx.codes.forEach(function(c){
            if (c.substr(0,tamanho)!==prefixo) return;
            (ctx.lancamentosPorCodigo[c]||[]).forEach(function(l){ out.push({codigo:c, fonte:l.fonte, aplicacao:l.aplicacao, valor:l.valor, tipo:'Arrecadação'}); });
            (ctx.devolucoesPorCodigo[c]||[]).forEach(function(l){ out.push({codigo:c, fonte:l.fonte, aplicacao:l.aplicacao, valor:-l.valor, tipo:l.origem}); });
          });
          return out;
        };
        ctx.receitaCorrente=0; ctx.receitaCapital=0;
        ctx.codes.forEach(function(c){
          var v=ctx.liquido(c);
          if (c.charAt(0)==='1') ctx.receitaCorrente+=v; else if (c.charAt(0)==='2') ctx.receitaCapital+=v;
        });
      }},
      {rotulo:'Classificando o Bloco 2 — retenção na fonte (art. 2º, §6º)', exec:function(){
        ctx.bloco2 = RUBRICAS_RETENCAO.map(function(r){
          return {label:r.label, codigo:r.prefix, valor: ctx.somaPorPrefixo(r.prefix,7), lancamentos: ctx.lancamentosDoPrefixo(r.prefix,7)};
        }).filter(function(l){ return Math.abs(l.valor) > 0.005 || l.lancamentos.length>0; });
      }},
      {rotulo:'Verificando a classificação da CFEM (União ou Estado)', exec:function(){
        var cfemUniao = ctx.somaPorPrefixo(CFEM_UNIAO_PREFIX,7);
        var cfemEstado = ctx.somaPorPrefixo(CFEM_ESTADO_PREFIX,7);
        // Somamos as duas classificações, em vez de escolher uma só (união OU estado): em um mês de
        // transição, o município pode estornar o valor de um código (ficando negativo) e reconhecer o
        // mesmo valor no outro no mesmo período — descoberto em agosto/2026, quando a CFEM que era
        // contabilizada como Estado passou a ser contabilizada como União. A lógica anterior, de
        // "se-então-senão", pegava só a União (checada primeiro) e descartava por completo o estorno
        // negativo do Estado, deixando de reduzir o retido pela reclassificação. Somando os dois, o
        // resultado é idêntico ao de antes em qualquer mês normal (um dos dois fica zerado) e correto
        // também no mês de transição, onde os dois têm movimento simultâneo.
        var itens = [];
        if (Math.abs(cfemUniao)>0.005) itens.push({pref:CFEM_UNIAO_PREFIX, origem:'uniao', valor:cfemUniao});
        if (Math.abs(cfemEstado)>0.005) itens.push({pref:CFEM_ESTADO_PREFIX, origem:'estado', valor:cfemEstado});
        itens.forEach(function(it){
          ctx.bloco2.push({label:'CFEM — Recursos Minerais' + (it.origem==='estado' ? ' (classificada como Estado)':' (União)'), codigo:it.pref, valor:it.valor, lancamentos:ctx.lancamentosDoPrefixo(it.pref,7),
            nota: it.origem==='estado' ? 'Considerada por equivalência de natureza (art. 2º, §6º).' : null});
        });
        ctx.totalBloco2 = ctx.bloco2.reduce(function(s,l){return s+l.valor;},0);
      }},
      {rotulo:'Classificando o Bloco 4 — FUNDEB e calculando a dedução de 20%', exec:function(){
        ctx.bloco4 = RUBRICAS_FUNDEB.map(function(r){
          return {label:r.label, codigo:r.prefix, valor: ctx.somaPorPrefixo(r.prefix,7), lancamentos: ctx.lancamentosDoPrefixo(r.prefix,7)};
        });
        ctx.totalFundeb = ctx.bloco4.reduce(function(s,l){return s+l.valor;},0);
        ctx.dedFundebFlat = ctx.totalFundeb*0.2;
        ctx.itr = ctx.somaPorPrefixo('1711520',7);
      }},
      {rotulo:'Identificando receitas com finalidade definida (art. 2º, §7º)', exec:function(){
        ctx.alertas=[];
        ALERTAS_FINALIDADE.forEach(function(a){
          var grupos={};
          ctx.codes.forEach(function(c){
            if (c.substr(0,4)!==a.prefix) return;
            (ctx.lancamentosPorCodigo[c]||[]).forEach(function(l){
              var chave=c+'|'+l.fonte+'|'+l.aplicacao;
              grupos[chave]=(grupos[chave]||0)+l.valor;
            });
            // Desconta o débito (estorno/correção) da 6.2.1.2 exatamente da ficha (código+fonte+aplicação)
            // a que pertencem — esses lançamentos já trazem sua própria fonte/aplicação no XML, então a
            // atribuição é exata mesmo quando o código tem mais de uma ficha aberta na competência.
            Object.keys(grupos).forEach(function(chave){
              if (chave.indexOf(c+'|') !== 0) return;
              if (ctx.devolPorFicha[chave]) grupos[chave] -= ctx.devolPorFicha[chave];
            });
          });
          Object.keys(grupos).forEach(function(chave){
            var val=grupos[chave];
            if (Math.abs(val)>0.005){
              var partes=chave.split('|');
              ctx.alertas.push({label:a.label, bloco:a.bloco, codigo:partes[0], fonte:partes[1], aplicacao:partes[2], valor:val, incluir:false});
            }
          });
        });
      }},
      {rotulo:'Consolidando a base de cálculo e o valor devido', exec:function(){
        var mapa = {};
        ctx.codes.forEach(function(c){
          var p6 = c.substr(0,6);
          mapa[p6] = (mapa[p6]||0) + ctx.liquido(c);
        });
        ctx.resultado = {
          ano: ctx.ano, mes: parseInt(ctx.mes,10), competenciaChave: ctx.ano+'-'+String(ctx.mes).padStart(2,'0'),
          codigoMunicipio: ctx.codigoMunicipio,
          receitaCorrente: ctx.receitaCorrente, receitaCapital: ctx.receitaCapital,
          bloco2: ctx.bloco2, totalBloco2: ctx.totalBloco2,
          bloco4: ctx.bloco4, totalFundeb: ctx.totalFundeb, dedFundebFlat: ctx.dedFundebFlat, dedFundebContabil: ctx.dedFundebContabil,
          itr: ctx.itr, alertas: ctx.alertas,
          somaPorPrefixo6: mapa,
          extratoReceita: ctx.extratoReceita, extratoApoio: ctx.extratoApoio,
          // Conferência da dedução do FUNDEB: os 20% calculados contra a retenção lançada na conta 6.2.1.3.1.01
          // (débito menos crédito). Diferença acima de R$ 0,10 gera alerta ao usuário. Não altera o cálculo.
          conferenciaFundeb: (function(){
            var dif = ctx.dedFundebContabil - ctx.dedFundebFlat;
            return { calculada: ctx.dedFundebFlat, contabil: ctx.dedFundebContabil, diferenca: dif, limite: 0.10, excede: Math.round(Math.abs(dif)*100) > 10 };
          })(),
          avisoExercicio: ctx.avisoExercicio || null,
          registros: ctx.extratoReceita.length
        };
      }}
    ];
    return {etapas: etapas, ctx: ctx};
  }

    // Versão síncrona, mantida para uso direto e testes
  function parseAudesp(xmlText){
    var pacote = construirEtapasParse(xmlText);
    pacote.etapas.forEach(function(e){ e.exec(); });
    return pacote.ctx.resultado;
  }

  function calcular(d){
    var totalFinalidadeCorrente=0, totalCapitalIncluido=0;
    d.alertas.forEach(function(a){
      if (a.bloco===3 && !a.incluir) totalFinalidadeCorrente += a.valor;
      if (a.bloco===5 && a.incluir) totalCapitalIncluido += a.valor;
    });
    var base = Math.max(0, d.receitaCorrente - d.dedFundebFlat - totalFinalidadeCorrente + totalCapitalIncluido);
    var valorTotal = base*0.01;
    var retido = Math.max(0, d.totalBloco2*0.01 - (d.itr*0.2*0.01));
    var valorPagar = valorTotal - retido;
    return {base:base, valorTotal:valorTotal, retido:retido, valorPagar:valorPagar, totalFinalidadeCorrente:totalFinalidadeCorrente, totalCapitalIncluido:totalCapitalIncluido};
  }

  // ---------- Estado ----------


// ------------------------------------------------------------
// Handler da Appwrite Function
// Recebe { xmlText: "<...>" } e devolve { d: <detalhamento>, r: <resultado> }.
// ------------------------------------------------------------
export default async ({ req, res, log, error }) => {
  var corpo;
  try {
    corpo = req.bodyJson || JSON.parse(req.body || '{}');
  } catch (e) {
    return res.json({ ok: false, erro: 'Corpo da requisição inválido (esperado JSON com xmlText).' }, 400);
  }

  if (!corpo.xmlText || typeof corpo.xmlText !== 'string'){
    return res.json({ ok: false, erro: 'Campo xmlText ausente ou inválido.' }, 400);
  }

  try {
    await carregarRegras();
  } catch (e) {
    error('Erro ao carregar regras de classificação: ' + e.message);
    return res.json({ ok: false, erro: 'Não foi possível carregar as regras de classificação no momento. Tente novamente em instantes.' }, 500);
  }

  try {
    var d = parseAudesp(corpo.xmlText);
    var r = calcular(d);
    log('Apuração calculada: competência ' + d.mes + '/' + d.ano + ', valor a pagar R$ ' + r.valorPagar.toFixed(2));
    // As constantes de classificação (que rubrica cai em qual bloco) voltam junto da resposta,
    // em vez de ficarem fixas no código-fonte estático do HTML — só existem na memória do
    // navegador depois de uma chamada autenticada de verdade a esta função.
    return res.json({
      ok: true, d: d, r: r,
      constantes: {
        RUBRICAS_RETENCAO: RUBRICAS_RETENCAO,
        CFEM_UNIAO_PREFIX: CFEM_UNIAO_PREFIX,
        CFEM_ESTADO_PREFIX: CFEM_ESTADO_PREFIX,
        RUBRICAS_FUNDEB: RUBRICAS_FUNDEB,
        ALERTAS_FINALIDADE: ALERTAS_FINALIDADE,
        EXERCICIOS_RECEITA_DISPONIVEIS: EXERCICIOS_RECEITA_DISPONIVEIS
      }
    });
  } catch (e) {
    error('Erro ao processar XML: ' + e.message);
    return res.json({ ok: false, erro: e.message }, 422);
  }
};

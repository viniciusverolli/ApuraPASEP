// ============================================================
// ApuraPASEP — motor de cálculo (Appwrite Function)
// Porta a lógica de classificação e apuração que antes rodava no navegador
// (PASEP_teste_jspdf.html) para rodar aqui, no servidor. O código HTML público
// não contém mais nenhuma regra de classificação — só envia o XML bruto e
// recebe de volta o resultado já calculado.
//
// A lógica de negócio abaixo (construirEtapasParse, parseAudesp, calcular) é
// uma cópia fiel do motor original, linha por linha — nenhuma regra foi
// alterada nesta migração. Só a fonte do XML DOM mudou: em vez do DOMParser
// do navegador, usa-se @xmldom/xmldom (equivalente para Node.js), com um
// pequeno ajuste na função auxiliar childByLocal, que precisa iterar por
// childNodes (não .children, que o xmldom não implementa) e filtrar por
// nodeType === 1 (nó do tipo elemento).
// ============================================================

import { DOMParser } from '@xmldom/xmldom';

  var EXERCICIOS_RECEITA_DISPONIVEIS = ['2026','2027'];

  // Códigos de município do TCE (conforme tag <gen:Municipio> do XML) -> [slug da API de transparência, nome extenso]

  var RUBRICAS_RETENCAO = [
    {label:'FPM — Cota Mensal', prefix:'1711511'},
    {label:'FPM — Cotas Extraordinárias', prefix:'1711512'},
    {label:'Cota-Parte ITR', prefix:'1711520'},
    {label:'IOF-Ouro', prefix:'1711550'},
    {label:'CFEM — Recursos Hídricos (União)', prefix:'1712500'},
    {label:'FEP — Compensação Financeira Petróleo', prefix:'1712524'},
    {label:'Bônus de Assinatura', prefix:'1712530'},
    {label:'Transferência LC 176/2020', prefix:'1719580'},
    {label:'CIDE', prefix:'1721530'},
    {label:'Royalties Petróleo — Principal', prefix:'1722520'}
  ];
  var CFEM_UNIAO_PREFIX = '1712510';
  var CFEM_ESTADO_PREFIX = '1722510';
  var RUBRICAS_FUNDEB = [
    {label:'FPM — Cota Mensal', prefix:'1711511'},
    {label:'Cota-Parte ITR', prefix:'1711520'},
    {label:'Cota-Parte ICMS', prefix:'1721500'},
    {label:'Cota-Parte IPVA', prefix:'1721510'},
    {label:'Cota-Parte IPI-Municípios', prefix:'1721520'}
  ];
  var ALERTAS_FINALIDADE = [
    {label:'Convênios da União', prefix:'1717', bloco:3},
    {label:'Convênios dos Estados e DF', prefix:'1724', bloco:3},
    {label:'Convênios dos Municípios', prefix:'1732', bloco:3},
    {label:'Transferências de Instituições Privadas', prefix:'1741', bloco:3},
    {label:'Convênios da União (Capital)', prefix:'2414', bloco:5},
    {label:'Convênios dos Estados e DF (Capital)', prefix:'2422', bloco:5},
    {label:'Convênios dos Municípios (Capital)', prefix:'2432', bloco:5},
    {label:'Transferências de Instituições Privadas (Capital)', prefix:'2441', bloco:5},
    {label:'Outras Transferências de Capital', prefix:'2499', bloco:5}
  ];

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
      {rotulo:'Separando os registros da competência (descartando meses anteriores)', exec:function(){
        ctx.receitaBlocks = findAllByLocal(ctx.doc, 'ReceitaArrecadar');
        var previsaoAll = findAllByLocal(ctx.doc, 'PrevisaoReceitaOrcamentaria');
        ctx.previsaoBlocks = previsaoAll.filter(function(b){ return childText(b,'Mes') === String(parseInt(ctx.mes,10)); });
        ctx.descartadosOutroMes = previsaoAll.length - ctx.previsaoBlocks.length;
        if (ctx.receitaBlocks.length === 0) throw new Error('Nenhum bloco de receita arrecadada encontrado neste arquivo.');
      }},
      {rotulo:'Extraindo os lançamentos de arrecadação', exec:function(){
        ctx.lancamentosPorCodigo = {}; ctx.bruto = {}; ctx.extratoReceita = [];
        ctx.receitaBlocks.forEach(function(b){
          var conta = childText(b,'ContaContabil');
          var code = childText(b,'ClassificacaoEconomicaReceita');
          var mov = childByLocal(b,'MovimentoContabil');
          var fonte = childText(b,'FonteRecursos');
          var aplicacao = childText(b,'CodigoAplicacao');
          var cred = mov ? num(childText(mov,'MovimentoCredito')) : 0;
          var deb = mov ? num(childText(mov,'MovimentoDebito')) : 0;
          var natIni = mov ? childText(mov,'NatInicial') : '';
          var natFim = mov ? childText(mov,'NatFinal') : '';
          ctx.extratoReceita.push({codigo:code, conta:conta, fonte:fonte, aplicacao:aplicacao,
            saldoInicial: mov ? num(childText(mov,'SaldoInicial')) : 0, natInicial: natIni,
            credito: cred, debito: deb,
            saldoFinal: mov ? num(childText(mov,'SaldoFinal')) : 0, natFinal: natFim});
          if (conta !== '621100000') return;
          // Códigos das famílias de finalidade definida (convênios) usam débito líquido de crédito,
          // já que aqui crédito e débito no mesmo lançamento tendem a ser correção, não reforço orçamentário.
          // Só se aplica quando a conta permanece credora do início ao fim do período: quando a natureza
          // inicial é devedora (ex.: 1.7.17.99.01 em maio/2026), a correção já é capturada separadamente
          // pela devolução (conta 621200000), e descontar aqui de novo duplicaria o efeito.
          // Fora dessas famílias (impostos, cotas constitucionais), o crédito pode ser reforço orçamentário
          // legítimo (ex.: ICMS em janeiro/2026 teve R$ 12,7 milhões de crédito) e não deve ser descontado.
          var pref4 = code.substr(0,4);
          var ehFamiliaFinalidade = ALERTAS_FINALIDADE.some(function(a){ return a.prefix === pref4; });
          var permaneceCredora = (natIni === 'C' && natFim === 'C');
          // Só tratamos como correção (a descontar) quando crédito E débito estão presentes no mesmo
          // lançamento: crédito isolado, sem débito, é reforço orçamentário genuíno (ex.: janeiro/2026
          // lança o orçado do convênio 1.7.24.51.01 assim, com R$ 950.000,00 e R$ 1.400.000,00 de crédito
          // e nenhum débito, sem qualquer arrecadação ainda).
          // E, quando crédito e débito são EXATAMENTE iguais (diferença líquida zero), não tratamos como
          // correção: isso representa reconhecimento e arrecadação completos dentro do mesmo mês (ex.:
          // 2.4.14.99.01 em agosto/2026, R$ 840.000,00 de crédito e R$ 840.000,00 de débito, confirmado
          // pelo balancete como arrecadação integral do período), não uma reclassificação a descontar.
          // Nesse caso, usamos o débito cheio, como no padrão geral.
          var jaCorrigido = ehFamiliaFinalidade && permaneceCredora && Math.abs(cred) > 0.005 && Math.abs(deb) > 0.005 && Math.abs(deb - cred) > 0.005;
          var valorLancamento = jaCorrigido ? (deb - cred) : deb;
          ctx.bruto[code] = (ctx.bruto[code]||0) + valorLancamento;
          if (!ctx.lancamentosPorCodigo[code]) ctx.lancamentosPorCodigo[code] = [];
          ctx.lancamentosPorCodigo[code].push({fonte:fonte, aplicacao:aplicacao, valor:valorLancamento});
          if (jaCorrigido){
            // Registra esta ficha (código+fonte+aplicação) como já corrigida no próprio lançamento,
            // para não descontar de novo se a conta 621200000 trouxer o mesmo ajuste espelhado
            // (visto em maio/2026: o mesmo convênio aparece com crédito/débito invertidos nas duas contas).
            if (!ctx.fichasJaCorrigidas) ctx.fichasJaCorrigidas = {};
            ctx.fichasJaCorrigidas[code+'|'+fonte+'|'+aplicacao] = true;
          }
        });
      }},
      {rotulo:'Aplicando devoluções, estornos e ajustes contábeis', exec:function(){
        ctx.devol = {}; ctx.devolPorFicha = {}; ctx.fundebContabil = {}; ctx.devolucoesPorCodigo = {}; ctx.reestimativaPorCodigo = {}; ctx.extratoPrevisao = [];
        ctx.previsaoBlocks.forEach(function(b){
          var conta = childText(b,'ContaContabil');
          var code = childText(b,'ClassificacaoEconomicaReceita');
          var fonte = childText(b,'FonteRecursos');
          var aplicacao = childText(b,'CodigoAplicacao');
          var chaveFichaAtual = code+'|'+fonte+'|'+aplicacao;
          var mov = childByLocal(b,'MovimentoContabil');
          var cred = mov ? num(childText(mov,'MovimentoCredito')) : 0;
          var deb = mov ? num(childText(mov,'MovimentoDebito')) : 0;
          ctx.extratoPrevisao.push({codigo:code, conta:conta, fonte:fonte, aplicacao:aplicacao,
            saldoInicial: mov ? num(childText(mov,'SaldoInicial')) : 0, natInicial: mov ? childText(mov,'NatInicial') : '',
            credito:cred, debito:deb,
            saldoFinal: mov ? num(childText(mov,'SaldoFinal')) : 0, natFinal: mov ? childText(mov,'NatFinal') : ''});
          if (conta === '621200000' && Math.abs(deb) > 0.005){
            var chaveFicha = code+'|'+fonte+'|'+aplicacao;
            if (ctx.fichasJaCorrigidas && ctx.fichasJaCorrigidas[chaveFicha]){
              // Mesmo ajuste já aplicado diretamente no lançamento de arrecadação (ver etapa anterior);
              // contabilizar aqui de novo duplicaria a correção.
            } else {
              ctx.devol[code] = (ctx.devol[code]||0) + deb;
              ctx.devolPorFicha[chaveFichaAtual] = (ctx.devolPorFicha[chaveFichaAtual]||0) + deb;
              (ctx.devolucoesPorCodigo[code] = ctx.devolucoesPorCodigo[code]||[]).push({fonte:fonte, aplicacao:aplicacao, valor:deb, origem:'Devolução/estorno'});
            }
          }
          if (conta === '621310100'){
            ctx.fundebContabil[code] = (ctx.fundebContabil[code]||0) + deb - cred;
            if (Math.abs(cred) > 0.005){
              ctx.devol[code] = (ctx.devol[code]||0) + cred;
              ctx.devolPorFicha[chaveFichaAtual] = (ctx.devolPorFicha[chaveFichaAtual]||0) + cred;
              (ctx.devolucoesPorCodigo[code] = ctx.devolucoesPorCodigo[code]||[]).push({fonte:fonte, aplicacao:aplicacao, valor:cred, origem:'Ajuste (conta FUNDEB)'});
            }
          }
          // Reestimativa da receita orçada (conta 521290000): é um ajuste puramente orçamentário — não
          // representa dinheiro arrecadado. Descoberto em agosto/2026 (16 lançamentos somando exatamente
          // R$ 4.223.302,00, valor que inflava indevidamente a Receita Corrente Arrecadada frente ao
          // balancete). Tratado à parte da devolução/estorno, para manter a origem rastreável.
          // Rastreado também por ficha exata (código+fonte+aplicação): esses lançamentos já trazem sua
          // própria fonte/aplicação, então não há ambiguidade sobre a qual ficha atribuí-los, mesmo
          // quando o código tem mais de uma ficha aberta na competência (ex.: agosto/2026, código
          // 1.7.24.51.01, fichas de fonte/aplicação 2000002 e 2000003 — a atribuição por código apenas
          // ficava bloqueada pela trava de ambiguidade, mesmo a reestimativa já dizendo a qual ficha
          // pertencia, causando divergência de R$ 1,00 contra o balancete).
          if (conta === '521290000' && Math.abs(cred) > 0.005){
            ctx.devol[code] = (ctx.devol[code]||0) + cred;
            ctx.devolPorFicha[chaveFichaAtual] = (ctx.devolPorFicha[chaveFichaAtual]||0) + cred;
            (ctx.reestimativaPorCodigo[code] = ctx.reestimativaPorCodigo[code]||[]).push({fonte:fonte, aplicacao:aplicacao, valor:cred, origem:'Reestimativa da receita orçada'});
          }
        });
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
        ctx.dedFundebContabil = Object.keys(ctx.fundebContabil).reduce(function(s,c){return s+ctx.fundebContabil[c];},0);
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
            // Desconta devolução/ajuste FUNDEB/reestimativa exatamente da ficha (código+fonte+aplicação)
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
          extratoReceita: ctx.extratoReceita, extratoPrevisao: ctx.extratoPrevisao,
          descartadosOutroMes: ctx.descartadosOutroMes,
          reestimativaPorCodigo: ctx.reestimativaPorCodigo,
          reestimativaTotal: Object.values(ctx.reestimativaPorCodigo || {}).reduce(function(soma, lista){
            return soma + lista.reduce(function(s, l){ return s + l.valor; }, 0);
          }, 0),
          avisoExercicio: ctx.avisoExercicio || null,
          registros: ctx.receitaBlocks.length + ctx.previsaoBlocks.length
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
    var d = parseAudesp(corpo.xmlText);
    var r = calcular(d);
    log('Apuração calculada: competência ' + d.mes + '/' + d.ano + ', valor a pagar R$ ' + r.valorPagar.toFixed(2));
    return res.json({ ok: true, d: d, r: r });
  } catch (e) {
    error('Erro ao processar XML: ' + e.message);
    return res.json({ ok: false, erro: e.message }, 422);
  }
};

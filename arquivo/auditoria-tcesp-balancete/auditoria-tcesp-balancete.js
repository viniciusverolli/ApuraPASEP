// ============================================================
// ARQUIVO DO FUTURO — Auditoria: conferência contra a API do TCESP e contra o balancete
//
// Estes trechos foram RETIRADOS de PASEP_teste_jspdf.html em 29/09/2026, por decisão de
// produto: a conferência estava em fase de testes e não agrega ao usuário comum, que confere
// o cálculo pelo "Revisar lançamentos" e pela planilha detalhada em Excel.
//
// Este arquivo NÃO é carregado por nenhuma página e não roda sozinho: é um guia legível do que
// foi removido, com o texto original de cada trecho e o lugar de onde saiu. O código completo,
// funcionando, continua no histórico do git:
//
//     git show origin/arquivo-auditoria-tcesp-v1:PASEP_teste_jspdf.html
//
// (branch "arquivo-auditoria-tcesp-v1", que aponta para a versão que tinha a auditoria). Para restaurar tudo
// de uma vez, veja LEIA-ME.md nesta pasta.
// ============================================================


// ------------------------------------------------------------
// TRECHO 1 — Estilos (CSS) da auditoria, das etiquetas de situação e do indicador de conexão com a API
// Onde ficava: dentro do <style> da ferramenta
// ------------------------------------------------------------
/*<<INICIO>>
  .aud-box{ background:var(--panel); backdrop-filter:blur(10px); border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin-top:8px; }
  .aud-box h3{ margin:0 0 6px; font-size:15px; font-weight:700; color:var(--navy); }
  .aud-box p.hint{ margin:0 0 12px; font-size:12.5px; color:var(--muted); line-height:1.55; }
  .aud-box code{ font-family:'IBM Plex Mono',monospace; font-size:11.5px; background:rgba(255,255,255,.7); padding:2px 5px; border:1px solid var(--line); border-radius:4px; word-break:break-all; }
  .aud-box textarea{ width:100%; height:90px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; padding:10px; border:1px solid var(--line); border-radius:8px; resize:vertical; background:rgba(255,255,255,.7); }
  .aud-box textarea:focus{ outline:2px solid var(--gold); outline-offset:1px; border-color:var(--gold); }
  .aud-resumo{ padding:12px 16px; font-size:13px; margin-bottom:12px; border-radius:10px; }
  .aud-resumo.ok{ background:var(--green-soft); border:1px solid #bbf7d0; color:var(--green); }
  .aud-resumo.dif{ background:var(--red-soft); border:1px solid #fca5a5; color:var(--red); }
  .tag{ font-size:10.5px; padding:2px 8px; border-radius:20px; display:inline-block; white-space:nowrap; }
  .tag.dif{ background:var(--red-soft); color:var(--red); }
  .tag.ok{ background:var(--green-soft); color:var(--green); }
  .tag.info{ background:var(--gold-soft); color:#115e59; }
  .status-api{ margin-top:auto; padding-top:16px; border-top:1px solid rgba(233,225,197,.18); display:flex; align-items:center; gap:8px; font-size:12px; color:#B9B29B; }
  .status-dot{ width:7px; height:7px; border-radius:50%; background:#8b856d; flex:none; }
  .status-dot.verificando{ background:var(--gold); animation:pulso 1.1s ease-in-out infinite; }
  .status-dot.conectado{ background:#4CAF7D; }
  .status-dot.falhou{ background:var(--red, #8E3B33); }
  @keyframes pulso{ 0%,100%{opacity:1} 50%{opacity:.35} }

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 2 — Indicador "Conectado à API do TCESP" no menu lateral
// Onde ficava: dentro de <div id="ml-extra-origem">, logo abaixo do bloco .who
// ------------------------------------------------------------
/*<<INICIO>>
    <div class="status-api">
      <span class="status-dot" id="status-api-dot"></span>
      <span id="status-api-texto">Verificando conexão com a API do TCESP…</span>
    </div>

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 3 — Contêiner da área de auditoria
// Onde ficava: depois de <div id="area-detalhe"></div>
// ------------------------------------------------------------
/*<<INICIO>>
    <div id="area-auditoria"></div>

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 4 — Chamada que exibia a auditoria só para administradores (e o aviso "Recurso em teste" para os demais)
// Onde ficava: no fim de renderDetalhe(), antes de renderTabela()
// ------------------------------------------------------------
/*<<INICIO>>
    if (souAdmin){
      renderAuditoria(chave);
    } else {
      document.getElementById('area-auditoria').innerHTML =
        '<div class="section-title">Auditoria — conferência contra a base do TCESP</div>' +
        '<div class="aud-box">' +
        '<h3>Recurso em teste</h3>' +
        '<p class="hint">A conferência automática contra a API do TCESP e contra o balancete do sistema de gestão ainda está em fase de testes internos. Assim que a validação for concluída, esse recurso ficará disponível aqui.</p>' +
        '</div>';
    }

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 5 — Módulo de auditoria: conferência contra a API do TCESP e contra o balancete (Fiorilli)
// Onde ficava: entre renderDetalhe() e mostrarErro()
// ------------------------------------------------------------
/*<<INICIO>>
  // ---------- Módulo de auditoria: conferência contra a API do TCESP ----------
  var RUBRICAS_AUDITAVEIS = [
    {label:'FPM (cota mensal + extraordinária)', p6:'171151'},
    {label:'Cota-Parte ITR', p6:'171152'},
    {label:'Cota-Parte ICMS', p6:'172150'},
    {label:'Cota-Parte IPVA', p6:'172151'},
    {label:'Cota-Parte IPI-Municípios', p6:'172152'},
    {label:'CFEM — Recursos Minerais (Estado)', p6:'172251'},
    {label:'CFEM — Recursos Minerais (União)', p6:'171251'},
    {label:'Royalties Petróleo', p6:'172252'},
    {label:'CIDE', p6:'172153'},
    {label:'FEP — Compensação Financeira Petróleo', p6:'171252'},
    {label:'Transferência LC 176/2020', p6:'171958'}
  ];

  // ---------- Parser do balancete da receita (formato exportado do Fiorilli, .md) ----------
  // Reconhece linhas-raiz de família no padrão "XXXX.XX.0.0.00.00", que somam integralmente
  // (sem dupla contagem) tudo o que está abaixo delas na hierarquia — validado contra os
  // balancetes de janeiro, abril e maio/2026, batendo ao centavo com os totais oficiais.
  function parseBalancete(texto){
    var linhas = texto.split('\n');
    // O código tolera lixo residual (ex.: "<br>") entre o "00.00" e o próximo "|", artefato comum
    // de quebras de linha na extração do PDF de origem.
    var padrao = /^\|(\d{4})\.(\d{2})\.0\.0\.00\.00[^|]*\|/;
    var porP6 = {};
    var receitaCorrente = null, receitaCapital = null;
    // Dedução do FUNDEB (valor contábil): linha própria do balancete ("(R$) DEDUÇÕES DO FUNDEB"),
    // buscada por descrição em vez de código, porque a célula "(R$)" quebra em duas colunas no
    // documento de origem e desloca o restante da linha de forma diferente das demais.
    var dedFundebContabilBalancete = null;
    linhas.forEach(function(linha){
      if (/DEDU[ÇC][ÕO]ES\s+DO\s+FUNDEB/i.test(linha) && dedFundebContabilBalancete === null){
        var colsD = linha.split('|');
        // O valor de Arrec. Período fica sempre 4 posições antes do fim da linha, robusto ao
        // deslocamento causado pela célula extra "(R$)".
        var valBrutoStr = colsD[colsD.length - 4];
        if (valBrutoStr !== undefined){
          var v = parseFloat(valBrutoStr.trim().replace(/\./g,'').replace(',', '.'));
          if (!isNaN(v)) dedFundebContabilBalancete = Math.abs(v);
        }
      }
      var m = padrao.exec(linha);
      if (!m) return;
      var cols = linha.split('|');
      var p6 = m[1] + m[2];
      // O valor de Arrec. Período fica sempre 4 posições antes do fim da linha, qualquer que seja o
      // número de colunas extras no meio (descrição quebrada, célula "(R$)", linhas de ficha
      // mescladas por artefato de extração do PDF de origem) — mais robusto do que uma posição fixa.
      if (cols.length < 5) return;
      var valorStr = cols[cols.length - 4].trim().replace(/\./g,'').replace(',', '.');
      var valor = parseFloat(valorStr);
      if (isNaN(valor)) return;
      porP6[p6] = valor;
      if (p6 === '100000') receitaCorrente = valor;
      if (p6 === '200000') receitaCapital = valor;
    });
    // Identifica a competência pelo período do cabeçalho (ex.: "01/03/2026 A 31/03/2026"),
    // usando a data inicial, que traz mês e ano sem depender do nome do mês por extenso.
    var competencia = null;
    var mComp = texto.match(/(\d{2})\/(\d{2})\/(\d{4})\s*A\s*\d{2}\/\d{2}\/\d{4}/);
    if (mComp) competencia = {mes: parseInt(mComp[2],10), ano: parseInt(mComp[3],10)};
    return {porP6: porP6, receitaCorrente: receitaCorrente, receitaCapital: receitaCapital, competencia: competencia,
      dedFundebContabil: dedFundebContabilBalancete};
  }

  function renderAuditoria(chave){
    var a = arquivos[chave], d = a.dados;
    var infoMunicipio = MUNICIPIOS_TCE[d.codigoMunicipio];
    var slugAuto = infoMunicipio ? infoMunicipio[0] : null;
    var nomeAuto = infoMunicipio ? infoMunicipio[1] : null;

    var linhaMunicipio;
    if (slugAuto){
      linhaMunicipio = '<p class="hint">Município identificado automaticamente pelo código do XML (<code>' + d.codigoMunicipio + '</code>): <b>' + nomeAuto + '</b>. Apenas registros de Prefeitura são considerados; demais entidades (RPPS, câmaras, autarquias) são descartadas automaticamente.</p>';
    } else {
      linhaMunicipio = '<p class="hint">Não foi possível identificar automaticamente o município pelo código do XML (<code>' + (d.codigoMunicipio||'ausente') + '</code>). Informe o nome manualmente abaixo.</p>' +
        '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">Município</label>' +
        '<input type="text" id="aud-municipio" placeholder="Ex.: Piratininga" style="width:100%;max-width:320px;font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:3px"></div>';
    }

    var html = '<div class="section-title">Auditoria — conferência contra a base do TCESP</div>' +
      '<div class="aud-box">' +
      '<h3>Conferência independente</h3>' +
      linhaMunicipio +
      '<div style="margin:4px 0 12px"><button class="btn primary" id="btn-buscar-api">Buscar automaticamente</button></div>' +
      '<p class="hint" style="margin-bottom:12px">URL consultada: <code id="aud-url">' + (slugAuto ? 'https://transparencia.tce.sp.gov.br/api/json/receitas/' + slugAuto + '/' + d.ano + '/' + d.mes : 'informe o município acima') + '</code></p>' +
      '<details style="margin-bottom:4px"><summary style="font-size:12px;color:var(--muted);cursor:pointer">Prefiro colar manualmente</summary>' +
      '<textarea id="aud-json" placeholder="Cole aqui o retorno da API (JSON)" style="margin-top:8px"></textarea>' +
      '<div style="margin-top:10px"><button class="btn ghost" id="btn-auditar">Conferir o que foi colado</button></div>' +
      '</details>' +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">' +
      '<p class="hint" style="margin-bottom:8px"><b>Balancete (sistema de gestão)</b> — envie o balancete da receita desta competência (exportado do Fiorilli em .md/.txt) para uma terceira conferência, direto contra o sistema de gestão do município, independente da API.</p>' +
      '<input type="file" id="aud-balancete-arquivo" accept=".md,.txt" style="font-size:13px">' +
      '<span id="aud-balancete-status" style="margin-left:10px;font-size:12px;color:var(--muted)">' + (a.balancete ? ('Balancete carregado: ' + a.balancete.nomeArquivo) : 'Nenhum balancete carregado ainda.') + '</span>' +
      '</div>' +
      '<div id="aud-resultado" style="margin-top:16px"></div>' +
      '</div>';
    document.getElementById('area-auditoria').innerHTML = html;

    document.getElementById('aud-balancete-arquivo').addEventListener('change', function(ev){
      var arquivo = ev.target.files[0];
      if (!arquivo) return;
      var status = document.getElementById('aud-balancete-status');
      status.textContent = 'Lendo ' + arquivo.name + '…';
      var leitor = new FileReader();
      leitor.onload = function(e){
        try {
          var parsed = parseBalancete(e.target.result);
          if (parsed.receitaCorrente === null){
            status.innerHTML = '<span style="color:var(--red)">Não foi possível reconhecer a estrutura do balancete em "' + arquivo.name + '". Confira se é o balancete da receita no formato exportado do Fiorilli.</span>';
            ev.target.value = '';
            return;
          }
          if (!parsed.competencia){
            status.innerHTML = '<span style="color:var(--red)">Não foi possível identificar a competência (mês/ano) no cabeçalho de "' + arquivo.name + '". O arquivo não foi aceito, pois não é possível confirmar que se refere a ' + MESES[d.mes] + '/' + d.ano + '.</span>';
            ev.target.value = '';
            return;
          }
          if (parsed.competencia.mes !== d.mes || Number(parsed.competencia.ano) !== Number(d.ano)){
            status.innerHTML = '<span style="color:var(--red)">Arquivo rejeitado: "' + arquivo.name + '" se refere a ' + MESES[parsed.competencia.mes] + '/' + parsed.competencia.ano + ', mas esta apuração é de ' + MESES[d.mes] + '/' + d.ano + '. Envie o balancete da competência correta.</span>';
            ev.target.value = '';
            return;
          }
          a.balancete = {nomeArquivo: arquivo.name, dados: parsed};
          status.textContent = 'Balancete carregado: ' + arquivo.name + ' (' + MESES[parsed.competencia.mes] + '/' + parsed.competencia.ano + ' — Receita Corrente reconhecida: ' + numFmt(parsed.receitaCorrente) + ')';
          // Se já havia um resultado de auditoria na tela, refaz a conferência incluindo o balancete
          if (document.getElementById('aud-resultado').innerHTML.trim() !== ''){
            executarAuditoria(chave, document.getElementById('aud-json').value.trim());
          }
        } catch(err){
          status.textContent = 'Falha ao ler o balancete: ' + err.message;
        }
      };
      leitor.onerror = function(){ status.textContent = 'Não foi possível ler o arquivo "' + arquivo.name + '".'; };
      leitor.readAsText(arquivo, 'UTF-8');
    });

    function slugMunicipio(nome){
      return nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'')   // remove acentos
                 .toLowerCase()
                 .replace(/[^a-z0-9]+/g,'-')                        // separadores viram hífen
                 .replace(/^-+|-+$/g,'');                           // limpa bordas
    }
    function urlAtual(){
      if (slugAuto) return 'https://transparencia.tce.sp.gov.br/api/json/receitas/' + slugAuto + '/' + d.ano + '/' + d.mes;
      var campo = document.getElementById('aud-municipio');
      var nome = campo ? campo.value.trim() : '';
      if (!nome) return null;
      return 'https://transparencia.tce.sp.gov.br/api/json/receitas/' + slugMunicipio(nome) + '/' + d.ano + '/' + d.mes;
    }
    if (!slugAuto){
      document.getElementById('aud-municipio').addEventListener('input', function(){
        document.getElementById('aud-url').textContent = urlAtual() || 'informe o município acima';
      });
    }

    document.getElementById('btn-auditar').addEventListener('click', function(){
      executarAuditoria(chave, document.getElementById('aud-json').value.trim());
    });
    document.getElementById('btn-buscar-api').addEventListener('click', function(){ buscarEAuditar(chave, urlAtual); });
  }

  function buscarEAuditar(chave, urlAtual){
    var alvo = document.getElementById('aud-resultado');
    var url = urlAtual();
    if (!url){ alvo.innerHTML = '<div class="aud-resumo dif">Informe o nome do município antes de buscar.</div>'; return; }

    var prog = criarProgresso(alvo, 'Buscando na API do TCESP');
    prog.atualizar(0, 2, 'Consultando ' + url);

    fetch(url)
      .then(function(resp){
        if (!resp.ok) throw new Error('A API retornou status ' + resp.status + '. Confira se o nome do município está correto.');
        return resp.json();
      })
      .then(function(dados){
        prog.atualizar(1, 2, 'Dados recebidos, iniciando conferência');
        document.getElementById('aud-json').value = JSON.stringify(dados);
        executarAuditoria(chave, JSON.stringify(dados));
      })
      .catch(function(err){
        prog.remover();
        // Falha na própria busca (rede, status, JSON): não impede a auditoria — se houver balancete
        // carregado, prossegue só com ele, avisando o motivo de a API ter ficado de fora.
        var avisoBuscaFalhou = 'Não foi possível buscar automaticamente na API (' + err.message + ').';
        if (arquivos[chave].balancete){
          executarAuditoria(chave, '', avisoBuscaFalhou + ' A conferência prosseguiu só com o balancete.');
        } else {
          alvo.innerHTML = '<div class="aud-resumo dif">' + avisoBuscaFalhou + ' Tente colar o retorno manualmente, usando a opção abaixo, ou carregue o balancete desta competência.</div>';
        }
      });
  }

  function executarAuditoria(chave, txt, avisoInicial){
    var d = arquivos[chave].dados;
    var r = calcular(d);
    var alvo = document.getElementById('aud-resultado');
    txt = (txt || '').trim();
    var balancete = arquivos[chave].balancete ? arquivos[chave].balancete.dados : null;
    if (!txt && !balancete){ alvo.innerHTML = '<div class="aud-resumo dif">' + (avisoInicial ? avisoInicial + ' ' : '') + 'Cole o retorno da API ou carregue o balancete antes de conferir.</div>'; return; }

    var prog = criarProgresso(alvo, 'Conferindo contra as fontes disponíveis');
    var c = {temAPI: !!txt, temBal: !!balancete, conferidas:0, divergencias:0, avisoAPI: avisoInicial || null};
    var RETENCAO_P6 = ['171151','171152','171252','171958','172153','172252'];

    function fechaOk(diff){ return Math.abs(diff) < 0.02; }

    var etapas = [
      {rotulo:'Lendo o conteúdo recebido da API', exec:function(){
        if (!c.temAPI) return;
        try { c.dados = JSON.parse(txt); }
        catch(e){
          c.avisoAPI = 'Não foi possível ler o conteúdo recebido da API como JSON válido.';
          c.temAPI = false;
          if (!c.temBal) throw new Error(c.avisoAPI + ' Confira se copiou o retorno completo, ou tente novamente.');
          return;
        }
        if (!Array.isArray(c.dados)){
          c.avisoAPI = 'O conteúdo recebido da API não tem o formato esperado (lista de registros).';
          c.temAPI = false;
          if (!c.temBal) throw new Error(c.avisoAPI);
          return;
        }
        c.totalRegistros = c.dados.length;
      }},
      {rotulo:'Filtrando registros da Prefeitura (descartando outras entidades)', exec:function(){
        if (!c.temAPI) return;
        c.registros = c.dados.filter(function(x){
          return x && typeof x.orgao === 'string' && x.orgao.toUpperCase().indexOf('PREFEITURA') === 0;
        });
        c.descartados = c.totalRegistros - c.registros.length;
        if (c.registros.length === 0){
          // A API do TCESP não retornou informações para esta competência/município (comum em
          // competências muito recentes, ainda não consolidadas na base de transparência, ou em
          // instabilidades pontuais da API). Não impede a auditoria: segue só com o balancete, se houver.
          c.avisoAPI = 'A API do TCESP não retornou nenhum registro de Prefeitura para esta competência' + (c.totalRegistros > 0 ? ' (' + c.totalRegistros + ' registros de outras entidades foram lidos)' : '') + '.';
          c.temAPI = false;
          if (!c.temBal) throw new Error(c.avisoAPI + ' Confira o nome do município, ou tente novamente mais tarde — a competência pode ainda não estar consolidada na base do TCESP.');
          return;
        }
      }},
      {rotulo:'Agrupando lançamentos da API por classificação econômica', exec:function(){
        if (!c.temAPI) return;
        function parseValor(v){
          if (typeof v === 'number') return v;
          if (typeof v !== 'string') return 0;
          var n = parseFloat(v.replace(/\./g,'').replace(',','.'));
          return isNaN(n) ? 0 : n;
        }
        c.apiPos = {}; c.apiNeg = {};
        c.apiCorrentePos = 0; c.apiCapitalPos = 0;
        c.apiPorPrefixo4 = {};
        c.registros.forEach(function(x){
          var m = (x.ds_alinea || '').trim().match(/^(\d{8})/);
          if (!m) return;
          var cod = m[1];
          var p6 = cod.substr(0,6);
          var p4 = cod.substr(0,4);
          var val = parseValor(x.vl_arrecadacao);
          if (val >= 0){
            c.apiPos[p6] = (c.apiPos[p6]||0) + val;
            if (cod.charAt(0) === '1') c.apiCorrentePos += val;
            else if (cod.charAt(0) === '2') c.apiCapitalPos += val;
          } else {
            c.apiNeg[p6] = (c.apiNeg[p6]||0) + Math.abs(val);
          }
          c.apiPorPrefixo4[p4] = (c.apiPorPrefixo4[p4]||0) + val;
        });
        var fpmExtraordinariaXML = 0;
        d.bloco2.forEach(function(l){ if (l.label.indexOf('Extraordinárias') !== -1) fpmExtraordinariaXML = l.valor; });
        c.apiFPMMensal = (c.apiPos['171151']||0) - fpmExtraordinariaXML;
        c.apiTotalFundeb = c.apiFPMMensal + (c.apiPos['171152']||0) + (c.apiPos['172150']||0) + (c.apiPos['172151']||0) + (c.apiPos['172152']||0);
        c.apiDedFundebFlat = c.apiTotalFundeb * 0.2;
        var FUNDEB_P6_NEG = ['171151','171152','172150','172151','172152'];
        c.fundebApi = FUNDEB_P6_NEG.reduce(function(s,p6){ return s + (c.apiNeg[p6]||0); }, 0);
        // Base de cálculo: usa o valor exato da dedução do FUNDEB que a própria API retorna (soma dos
        // lançamentos negativos das rubricas do FUNDEB), não a estimativa de 20% — a API já traz a
        // cifra exata, sujeita apenas a centavos de arredondamento na consolidação, e usar a estimativa
        // aqui inflava artificialmente a diferença contra o XML mesmo quando os valores reais batem.
        // Cai para a estimativa de 20% só se a API não retornar nenhum lançamento negativo de FUNDEB.
        var apiDedFundebParaBase = Math.abs(c.fundebApi) > 0.005 ? c.fundebApi : c.apiDedFundebFlat;
        c.apiTotalRetencao = RETENCAO_P6.reduce(function(s,p6){ return s + (c.apiPos[p6]||0); }, 0) + (c.apiPos['172251']||0) + (c.apiPos['171251']||0);
        c.apiITR = c.apiPos['171152'] || 0;
        c.apiBase = Math.max(0, c.apiCorrentePos - apiDedFundebParaBase - r.totalFinalidadeCorrente + r.totalCapitalIncluido);
        c.apiRetido = Math.max(0, c.apiTotalRetencao*0.01 - (c.apiITR*0.2*0.01));
        c.apiPagar = (c.apiBase*0.01) - c.apiRetido;
      }},
      {rotulo:'Agrupando o balancete por classificação econômica', exec:function(){
        if (!c.temBal) return;
        c.balCorrente = balancete.receitaCorrente || 0;
        c.balCapital = balancete.receitaCapital || 0;
        c.balTotalRetencao = RETENCAO_P6.reduce(function(s,p6){ return s + (balancete.porP6[p6]||0); }, 0) + (balancete.porP6['172251']||0) + (balancete.porP6['171251']||0);
        // O balancete também agrega FPM Cota Mensal e Cotas Extraordinárias sob o mesmo código 171151
        // (mesma característica já observada na API); isolamos a parcela mensal, a única que compõe
        // a base do FUNDEB, descontando a extraordinária apurada no XML.
        var fpmExtraordinariaXML = 0;
        d.bloco2.forEach(function(l){ if (l.label.indexOf('Extraordinárias') !== -1) fpmExtraordinariaXML = l.valor; });
        c.balFPMMensal = (balancete.porP6['171151']||0) - fpmExtraordinariaXML;
        c.balTotalFundeb = c.balFPMMensal + (balancete.porP6['171152']||0) + (balancete.porP6['172150']||0) + (balancete.porP6['172151']||0) + (balancete.porP6['172152']||0);
        c.balDedFundebFlat = c.balTotalFundeb * 0.2;
        c.balITR = balancete.porP6['171152'] || 0;
        // Base de cálculo: usa o valor exato da linha "(R$) Deduções do FUNDEB" do próprio balancete,
        // não a estimativa de 20% — pelo mesmo motivo já aplicado ao lado da API. Cai para a estimativa
        // só se o balancete não trouxer essa linha (dedFundebContabil nulo).
        var balDedFundebParaBase = (balancete.dedFundebContabil !== null && balancete.dedFundebContabil !== undefined) ? balancete.dedFundebContabil : c.balDedFundebFlat;
        c.balBase = Math.max(0, c.balCorrente - balDedFundebParaBase - r.totalFinalidadeCorrente + r.totalCapitalIncluido);
        c.balRetido = Math.max(0, c.balTotalRetencao*0.01 - (c.balITR*0.2*0.01));
        c.balPagar = (c.balBase*0.01) - c.balRetido;
      }},
      {rotulo:'Conferindo a Receita Corrente e a Receita de Capital', exec:function(){
        if (c.temAPI){ c.difCorrenteApi = c.apiCorrentePos - d.receitaCorrente; c.okCorrenteApi = fechaOk(c.difCorrenteApi);
          c.difCapitalApi = c.apiCapitalPos - d.receitaCapital; c.okCapitalApi = fechaOk(c.difCapitalApi); }
        if (c.temBal){ c.difCorrenteBal = c.balCorrente - d.receitaCorrente; c.okCorrenteBal = fechaOk(c.difCorrenteBal);
          c.difCapitalBal = c.balCapital - d.receitaCapital; c.okCapitalBal = fechaOk(c.difCapitalBal); }
      }},
      {rotulo:'Investigando a origem de eventuais divergências', exec:function(){
        // Quando a Receita Corrente diverge de alguma das fontes, procura por lançamentos de
        // reclassificação/estorno (valor negativo nos blocos de finalidade definida) que possam
        // explicar a diferença, para apontar a causa em vez de só marcar "Diverge".
        c.explicacoes = [];
        var divergeAlgo = (c.temAPI && !c.okCorrenteApi) || (c.temBal && !c.okCorrenteBal);
        if (divergeAlgo){
          var refDiff = c.temAPI && !c.okCorrenteApi ? c.difCorrenteApi : c.difCorrenteBal;
          d.alertas.forEach(function(a){
            if (a.valor >= 0) return;
            var explicaParcial = Math.abs(Math.abs(a.valor) - Math.abs(refDiff)) < 1.00;
            c.explicacoes.push({codigo: a.codigo, label: a.label, valor: a.valor, explicaTotal: explicaParcial});
          });
        }
        // Quando a divergência é especificamente contra a API e não é explicada por nenhuma
        // reclassificação/estorno identificado, o padrão já observado (ex.: abril/2026) é que o
        // total agregado que a API retorna não corresponde exatamente à soma dos seus próprios
        // lançamentos por rubrica — uma característica de como a API consolida os dados, não um
        // problema na apuração. Sinaliza isso como nota, sem afirmar ser a causa comprovada.
        c.notaApiResidual = c.temAPI && !c.okCorrenteApi && !c.explicacoes.some(function(ex){ return ex.explicaTotal; });
      }},
      {rotulo:'Comparando rubrica a rubrica com o apurado no XML', exec:function(){
        c.linhas = '';
        RUBRICAS_AUDITAVEIS.forEach(function(rub){
          var vFerr = d.somaPorPrefixo6[rub.p6] || 0;
          var vApi = c.temAPI ? (c.apiPos[rub.p6] || 0) : 0;
          var vBal = c.temBal ? (balancete.porP6[rub.p6] || 0) : 0;
          if (Math.abs(vFerr) < 0.005 && Math.abs(vApi) < 0.005 && Math.abs(vBal) < 0.005) return;
          var okApi = c.temAPI ? fechaOk(vApi - vFerr) : null;
          var okBal = c.temBal ? fechaOk(vBal - vFerr) : null;
          if (c.temAPI){ okApi ? c.conferidas++ : c.divergencias++; }
          if (c.temBal){ okBal ? c.conferidas++ : c.divergencias++; }
          c.linhas += linhaComparativa(rub.label, vFerr, c.temAPI, vApi, okApi, c.temBal, vBal, okBal);
        });
      }},
      {rotulo:'Conferindo a dedução do FUNDEB', exec:function(){
        if (c.temAPI){ c.difFundeb = c.fundebApi - d.dedFundebContabil; c.okFundeb = fechaOk(c.difFundeb); c.okFundeb?c.conferidas++:c.divergencias++; }
        // Balancete: usa o valor da própria linha "Deduções do FUNDEB" do documento, não um
        // recálculo por 20% — é uma comparação contábil contra contábil, a mesma natureza de dado
        // dos dois lados. Só entra na contagem quando o balancete efetivamente trouxe essa linha.
        c.temFundebBal = c.temBal && balancete.dedFundebContabil !== null && balancete.dedFundebContabil !== undefined;
        if (c.temFundebBal){ c.difFundebBal = balancete.dedFundebContabil - d.dedFundebContabil; c.okFundebBal = fechaOk(c.difFundebBal); c.okFundebBal?c.conferidas++:c.divergencias++; }
        if (c.temAPI){ c.okCorrenteApi?c.conferidas++:c.divergencias++; c.okCapitalApi?c.conferidas++:c.divergencias++; }
        if (c.temBal){ c.okCorrenteBal?c.conferidas++:c.divergencias++; c.okCapitalBal?c.conferidas++:c.divergencias++; }
      }},
      {rotulo:'Recalculando a memória de cálculo do PASEP a partir das fontes disponíveis', exec:function(){
        if (c.temAPI){ c.difBaseApi = c.apiBase - r.base; c.okBaseApi = fechaOk(c.difBaseApi);
          c.difRetidoApi = c.apiRetido - r.retido; c.okRetidoApi = fechaOk(c.difRetidoApi);
          c.difPagarApi = c.apiPagar - r.valorPagar; c.okPagarApi = fechaOk(c.difPagarApi);
          [c.okBaseApi,c.okRetidoApi,c.okPagarApi].forEach(function(ok){ ok?c.conferidas++:c.divergencias++; }); }
        if (c.temBal){ c.difBaseBal = c.balBase - r.base; c.okBaseBal = fechaOk(c.difBaseBal);
          c.difRetidoBal = c.balRetido - r.retido; c.okRetidoBal = fechaOk(c.difRetidoBal);
          c.difPagarBal = c.balPagar - r.valorPagar; c.okPagarBal = fechaOk(c.difPagarBal);
          [c.okBaseBal,c.okRetidoBal,c.okPagarBal].forEach(function(ok){ ok?c.conferidas++:c.divergencias++; }); }
      }},
      {rotulo:'Conferindo transferências com finalidade definida (blocos 3 e 4)', exec:function(){
        var ferrPorP4 = {};
        d.alertas.forEach(function(a){ var p4 = a.codigo.substr(0,4); ferrPorP4[p4] = (ferrPorP4[p4]||0) + a.valor; });
        var familias = {};
        ALERTAS_FINALIDADE.forEach(function(f){ familias[f.prefix] = f; });
        c.linhasB35 = '';
        Object.keys(familias).forEach(function(p4){
          var f = familias[p4];
          var vFerr = ferrPorP4[p4] || 0;
          var vApi = c.temAPI ? (c.apiPorPrefixo4[p4] || 0) : 0;
          var vBal = c.temBal ? (balancete.porP6[p4+'00'] || 0) : 0;
          if (Math.abs(vFerr) < 0.005 && Math.abs(vApi) < 0.005 && Math.abs(vBal) < 0.005) return;
          var okApi = c.temAPI ? fechaOk(vApi - vFerr) : null;
          var okBal = c.temBal ? fechaOk(vBal - vFerr) : null;
          if (c.temAPI){ okApi ? c.conferidas++ : c.divergencias++; }
          if (c.temBal){ okBal ? c.conferidas++ : c.divergencias++; }
          // O campo interno "bloco" (3 ou 5) segue a numeração original da lei; a numeração exibida
          // ao usuário foi renumerada (capital passou a ser chamado de "Bloco 4" na tela).
          var blocoExibido = (f.bloco === 5) ? 4 : f.bloco;
          c.linhasB35 += linhaComparativa(f.label + ' (bloco ' + blocoExibido + ')', vFerr, c.temAPI, vApi, okApi, c.temBal, vBal, okBal);
        });
        c.temB35 = c.linhasB35 !== '';
      }}
    ];

    executarEtapas({etapas:etapas, ctx:c},
      function(i, total, rotulo){ prog.atualizar(i, total, rotulo); },
      function(){
        var fontes = [];
        if (c.temAPI) fontes.push(c.registros.length + ' registros de Prefeitura da API' + (c.descartados?(', '+c.descartados+' de outras entidades descartados'):''));
        if (c.temBal) fontes.push('balancete "' + arquivos[chave].balancete.nomeArquivo + '"');
        var resumo = c.divergencias === 0
          ? '<div class="aud-resumo ok"><b>' + c.conferidas + ' verificações conferem</b>, sem divergência. Fontes: ' + fontes.join('; ') + '.</div>'
          : '<div class="aud-resumo dif"><b>' + c.divergencias + ' divergência(s) encontrada(s)</b>, e ' + c.conferidas + ' verificação(ões) conferindo. Fontes: ' + fontes.join('; ') + '.</div>';
        var avisoApiHtml = c.avisoAPI
          ? '<div class="empty-block" style="border-color:#3FA48C;background:#E3EFEC;margin-bottom:10px;font-size:12px">&#9888; ' + c.avisoAPI + ' A conferência prosseguiu só com ' + (c.temBal ? 'o balancete' : 'as fontes disponíveis') + '.</div>'
          : '';

        alvo.innerHTML = avisoApiHtml + resumo +
          '<table class="review"><tr><th>Item conferido</th><th class="th-num">Apurado (XML)</th><th class="th-num">TCESP (API)</th><th class="th-num">Balancete (sistema de gestão)</th><th>Situação</th></tr>' +
          linhaComparativa('<b>Receita Corrente Arrecadada</b>', d.receitaCorrente, c.temAPI, c.apiCorrentePos, c.okCorrenteApi, c.temBal, c.balCorrente, c.okCorrenteBal, c.explicacoes.length) +
          linhaComparativa('Receita de Capital Arrecadada', d.receitaCapital, c.temAPI, c.apiCapitalPos, c.okCapitalApi, c.temBal, c.balCapital, c.okCapitalBal) +
          c.linhas +
          linhaComparativa('Dedução FUNDEB (valor contábil)', d.dedFundebContabil, c.temAPI, c.fundebApi, c.okFundeb, c.temFundebBal, c.temFundebBal?balancete.dedFundebContabil:0, c.temFundebBal?c.okFundebBal:null, false, true) +
          '</table>' +
          '<p style="font-size:11px;color:var(--muted);margin-top:6px;margin-bottom:10px;line-height:1.55">' +
          '<b>Origem da linha "Dedução FUNDEB (valor contábil)":</b> XML — soma líquida (débito menos crédito) da conta contábil 621310100 nos lançamentos do FUNDEB; ' +
          'API — soma dos lançamentos negativos retornados para as rubricas do FUNDEB (FPM, ITR, ICMS, IPVA, IPI); ' +
          'Balancete — valor exato da própria linha "(R$) Deduções do FUNDEB" do documento carregado, sem nenhum recálculo. ' +
          'Este valor é diferente da linha "(−) Dedução FUNDEB (20%)" da memória de cálculo mais abaixo, que é obtida multiplicando as receitas que compõem o FUNDEB por 20% — a que efetivamente entra na apuração do PASEP.' +
          '</p>' +
          ((c.temAPI && !c.okFundeb) || (c.temFundebBal && !c.okFundebBal)
            ? '<div class="empty-block" style="margin-top:-2px;margin-bottom:10px;border-color:var(--gold);background:var(--gold-soft)">' +
              '<b>Sobre a divergência acima na Dedução FUNDEB (valor contábil):</b><br>' +
              (c.temAPI && !c.okFundeb ? '&bull; XML × API: ' + brl(c.difFundeb) + '<br>' : '') +
              (c.temFundebBal && !c.okFundebBal ? '&bull; XML × Balancete: ' + brl(c.difFundebBal) + '<br>' : '') +
              'Esta é, tipicamente, uma diferença de <b>arredondamento</b>, não um erro de apuração: XML, API e balancete consolidam esse valor de forma independente entre si (a partir de lançamentos contábeis, de retenções informadas e do fechamento do sistema de gestão, respectivamente), e cada consolidação pode arredondar em um ponto ligeiramente diferente do processo. ' +
              'Vale conferir se a diferença se sustenta em faixa pequena (poucos reais); diferenças maiores merecem investigação à parte, pois deixam de ser explicáveis só por arredondamento.' +
              '</div>'
            : '') +
          (c.explicacoes.length
            ? '<div class="empty-block" style="margin-top:10px;border-color:var(--gold);background:var(--gold-soft)">' +
              '<b>Origem provável da divergência na Receita Corrente:</b><br>' +
              c.explicacoes.map(function(ex){
                return '&bull; Código ' + ex.codigo + ' (' + ex.label + '): lançamento de estorno/reclassificação de ' + brl(ex.valor) + ' no XML, ' +
                  (ex.explicaTotal ? 'que corresponde ao valor integral da diferença encontrada.' : 'que pode explicar parte da diferença encontrada.');
              }).join('<br>') +
              '<br><span style="font-size:11px;color:var(--muted)">Nenhum valor foi ajustado automaticamente. Esta nota é apenas informativa; a diferença permanece registrada como divergência acima.</span>' +
              '</div>'
            : '') +
          (c.notaApiResidual
            ? '<div class="empty-block" style="margin-top:10px;border-color:var(--gold);background:var(--gold-soft)">' +
              '<b>Possível causa da divergência remanescente na Receita Corrente (API):</b><br>' +
              'Nenhuma reclassificação ou estorno identificado explica integralmente essa diferença (' + brl(c.difCorrenteApi) + '). Um padrão já observado é que o total agregado de Receita Corrente que a própria API retorna nem sempre corresponde exatamente à soma dos seus próprios lançamentos por rubrica — uma característica de como a API consolida os dados, não necessariamente um erro na apuração. ' +
              (c.temBal && c.okCorrenteBal ? 'Neste caso, o balancete carregado confirma a Receita Corrente apurada pela ferramenta, reforçando essa leitura.' : 'Recomenda-se conferir contra o balancete do sistema de gestão, que é a referência mais confiável quando há conflito com a API.') +
              '</div>'
            : '') +
          (c.temB35
            ? '<div class="section-title" style="margin-top:18px">Transferências com finalidade definida (blocos 3 e 4)</div>' +
              '<table class="review"><tr><th>Rubrica</th><th class="th-num">Apurado (XML)</th><th class="th-num">TCESP (API)</th><th class="th-num">Balancete (sistema de gestão)</th><th>Situação</th></tr>' +
              c.linhasB35 + '</table>'
            : '') +
          '<div class="section-title" style="margin-top:18px">Memória de cálculo do PASEP — conferida contra as fontes disponíveis</div>' +
          '<table class="review">' +
          '<tr><th>Item</th><th class="th-num">Apurado (XML)</th><th class="th-num">TCESP (API)</th><th class="th-num">Balancete (sistema de gestão)</th><th>Situação</th></tr>' +
          linhaComparativa('Receita Corrente Arrecadada', d.receitaCorrente, c.temAPI, c.apiCorrentePos, c.okCorrenteApi, c.temBal, c.balCorrente, c.okCorrenteBal) +
          '<tr><td>(-) Dedução FUNDEB (20%)</td><td class="num">' + numFmt(d.dedFundebFlat) + '</td><td class="num">—</td><td class="num">—</td><td><span class="tag info">Conferido acima (valor contábil)</span></td></tr>' +
          '<tr><td>(-) Transferências Correntes (com Finalidade Definida)</td><td class="num">' + numFmt(r.totalFinalidadeCorrente) + '</td><td class="num">—</td><td class="num">—</td><td><span class="tag info">Conferido acima</span></td></tr>' +
          '<tr><td>(+) Transferências de Capital (sem Finalidade Definida)</td><td class="num">' + numFmt(r.totalCapitalIncluido) + '</td><td class="num">—</td><td class="num">—</td><td><span class="tag info">Conferido acima</span></td></tr>' +
          linhaComparativa('(=) Base de Cálculo', r.base, c.temAPI, c.apiBase, c.okBaseApi, c.temBal, c.balBase, c.okBaseBal, c.explicacoes.length, true) +
          linhaComparativa('(-) PASEP Retido na Fonte', r.retido, c.temAPI, c.apiRetido, c.okRetidoApi, c.temBal, c.balRetido, c.okRetidoBal) +
          linhaComparativa('<b>Valor a Pagar</b>', r.valorPagar, c.temAPI, c.apiPagar, c.okPagarApi, c.temBal, c.balPagar, c.okPagarBal, c.explicacoes.length, true) +
          '</table>' +
          '<p style="font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.55">Esta memória segue os mesmos itens e nomenclatura do painel de resultado ao lado. As linhas de finalidade definida usam o valor já decidido na tela, por ser uma decisão do usuário. Na dedução do FUNDEB via API, como esta agrega a Cota Mensal e as Cotas Extraordinárias do FPM sob o mesmo código, a parcela mensal foi isolada descontando a extraordinária apurada no XML. Ambas as fontes externas refletem o que o município declarou, sujeito a verificação/consolidação posterior.</p>';
      },
      function(err){ alvo.innerHTML = '<div class="aud-resumo dif">' + err.message + '</div>'; }
    );
  }

  // Monta uma linha de tabela comparando XML x API x Balancete, com badges de situação por fonte.
  function linhaComparativa(label, vXml, temApi, vApi, okApi, temBal, vBal, okBal, causaIdentificada, destaque){
    var badges = '';
    if (temApi) badges += '<span class="tag ' + (okApi?'ok':(causaIdentificada?'info':'dif')) + '" style="display:block;margin-bottom:3px">API: ' + (okApi?'Confere':(causaIdentificada?'Diverge — causa identificada':'Diverge')) + '</span>';
    if (temBal) badges += '<span class="tag ' + (okBal?'ok':'dif') + '">Balancete: ' + (okBal?'Confere':'Diverge') + '</span>';
    if (!badges) badges = '<span class="tag" style="background:var(--panel);color:var(--muted)">Sem fonte para conferir</span>';
    var abre = destaque ? '<tr class="subtotal">' : '<tr>';
    return abre + '<td>' + label + '</td>' +
      '<td class="num">' + numFmt(vXml) + '</td>' +
      '<td class="num">' + (temApi ? numFmt(vApi) : '—') + '</td>' +
      '<td class="num">' + (temBal ? numFmt(vBal) : '—') + '</td>' +
      '<td>' + badges + '</td></tr>';
  }


<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 6 — Checagem de conexão com a API do TCESP ao abrir a ferramenta
// Onde ficava: no fim do script da página, antes de })();
// ------------------------------------------------------------
/*<<INICIO>>
  // ---------- Checagem de conexão com a API do TCESP, ao abrir a ferramenta ----------
  function verificarConexaoAPI(){
    var dot = document.getElementById('status-api-dot');
    var texto = document.getElementById('status-api-texto');
    dot.className = 'status-dot verificando';
    texto.textContent = 'Verificando conexão com a API do TCESP…';

    // Tempo limite de 8s: sem isso, se o servidor do TCESP nunca responder (nem sucesso, nem
    // erro — apenas silêncio), o fetch fica pendurado indefinidamente e o status nunca muda,
    // mesmo a auditoria manual (sem API) continuando disponível normalmente.
    var controlador = new AbortController();
    var tempoEsgotado = setTimeout(function(){ controlador.abort(); }, 8000);

    try {
      // Endpoint de municípios: não depende de nenhum XML carregado, serve como teste de conectividade real.
      fetch('https://transparencia.tce.sp.gov.br/api/json/municipios', { signal: controlador.signal })
        .then(function(resp){
          if (!resp.ok) throw new Error('status ' + resp.status);
          return resp.json();
        })
        .then(function(lista){
          clearTimeout(tempoEsgotado);
          dot.className = 'status-dot conectado';
          texto.textContent = 'Conectado à API do TCESP';
        })
        .catch(function(err){
          clearTimeout(tempoEsgotado);
          dot.className = 'status-dot falhou';
          texto.textContent = 'Sem conexão com a API do TCESP (auditoria manual continua disponível)';
        });
    } catch(e){
      clearTimeout(tempoEsgotado);
      dot.className = 'status-dot falhou';
      texto.textContent = 'Sem conexão com a API do TCESP (auditoria manual continua disponível)';
    }
  }
  verificarConexaoAPI();

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 7 — Excel: leitura do balancete carregado (alimentava a aba "Auditoria")
// Onde ficava: início de gerarPlanilhaAuditoria(), logo depois de definir "ente"
// ------------------------------------------------------------
/*<<INICIO>>
      var balanceteObj = arquivos[chave] && arquivos[chave].balancete ? arquivos[chave].balancete : null;
      var temBalancete = !!balanceteObj;
      var balancete = null;
      if (temBalancete){
        var balDados = balanceteObj.dados;
        var totalRetencaoBal = 0;
        var p6sJaContados = {};
        RUBRICAS_RETENCAO.forEach(function(r){
          var p6 = r.prefix.substr(0,6);
          if (p6sJaContados[p6]) return; // FPM Cota Mensal e Cotas Extraordinárias truncam para o mesmo p6 (171151) — não contar duas vezes
          p6sJaContados[p6] = true;
          totalRetencaoBal += (balDados.porP6[p6]||0);
        });
        totalRetencaoBal += (balDados.porP6['171251']||0) + (balDados.porP6['172251']||0);
        balancete = { receitaCorrente: balDados.receitaCorrente||0, dedFundebContabil: balDados.dedFundebContabil,
          totalRetencaoRef: totalRetencaoBal };
      }

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 8 — Excel: aba "Auditoria" (apuração conferida contra o balancete), só para administradores
// Onde ficava: fim de gerarPlanilhaAuditoria(), antes de gerar o arquivo
// ------------------------------------------------------------
/*<<INICIO>>
      // As duas abas abaixo (Classificação e Auditoria) revelam as regras de classificação
      // usadas na apuração — ficam restritas a administradores da plataforma, igual à seção
      // de auditoria na tela. Usuário comum recebe a planilha só com as quatro abas acima.
      if (souAdmin){
      // ============ ABA 6 — AUDITORIA ============
      var wsAu = wb.addWorksheet('Auditoria');
      wsAu.getColumn(1).width = 42; wsAu.getColumn(2).width = 18; wsAu.getColumn(3).width = 18; wsAu.getColumn(4).width = 14; wsAu.getColumn(5).width = 12;
      wsAu.getCell('A1').value = 'Auditoria — apuração desta planilha conferida contra o balancete carregado';
      wsAu.getCell('A1').font = { name:FONTE, size:14, bold:true, color:{argb:'FF23262B'} };

      if (temBalancete){
        wsAu.getCell('A2').value = 'Valores em azul são exatos, extraídos literalmente do balancete carregado no sistema';
        wsAu.getCell('A2').font = { name:FONTE, size:10, italic:true, color:{argb:'FF6B6656'} };
        cabecalho(wsAu, 4, ['Item','Apurado nesta planilha','Balancete (referência exata)','Diferença','Situação'], 18);
        function linhaAudit(row, rotulo, formulaApurado, valorBalancete, tolerancia){
          wsAu.getCell(row,1).value = rotulo; wsAu.getCell(row,1).font = { name:FONTE, size:10 };
          var cAp = wsAu.getCell(row,2); cAp.value = {formula: formulaApurado}; cAp.font = VERDE; cAp.numFmt = NUMFMT;
          var cBal = wsAu.getCell(row,3); cBal.value = valorBalancete; cBal.font = AZUL; cBal.numFmt = NUMFMT;
          var cDif = wsAu.getCell(row,4); cDif.value = {formula:'B'+row+'-C'+row}; cDif.font = PRETO; cDif.numFmt = NUMFMT;
          var cSit = wsAu.getCell(row,5); cSit.value = {formula:'IF(ABS(D'+row+')<='+(tolerancia||0.02)+',"Confere","Diverge")'};
          cSit.font = { name:FONTE, size:10, bold:true };
        }
        var ra = 5;
        linhaAudit(ra, 'Receita Corrente Arrecadada', 'Apuração!B'+L_CORRENTE, balancete.receitaCorrente); ra++;
        linhaAudit(ra, 'Dedução do FUNDEB (valor exato do balancete)', 'Apuração!B'+L_DEDFUNDEB, balancete.dedFundebContabil, 1000); ra++;
        linhaAudit(ra, 'Total Bloco 2 (retenção na fonte)', 'Apuração!B'+L_BLOCO2, balancete.totalRetencaoRef); ra++;
      } else {
        wsAu.getCell('A2').value = 'Nenhum balancete estava carregado no sistema no momento da geração — a conferência abaixo não pôde ser feita.';
        wsAu.getCell('A2').font = { name:FONTE, size:10, italic:true, color:{argb:'FF8E3B33'} };
        wsAu.getCell('A4').value = 'Carregue o balancete desta competência na aba de auditoria do sistema e gere esta planilha novamente para conferir os valores.';
        wsAu.getCell('A4').font = { name:FONTE, size:10 };
      }

      }

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 9 — Botão "Auditar competência (XML × API × Balancete)" no painel
// Onde ficava: painel.html, dentro de <div class="actions" id="blocoAcoes">
// ------------------------------------------------------------
/*<<INICIO>>
      <a class="btn ghost" href="PASEP_teste_jspdf.html">Auditar competência (XML × API × Balancete)</a>

<<FIM>>*/


// ------------------------------------------------------------
// TRECHO 10 — Item "Importar XML / balancete" do menu lateral (apontava para a mesma ferramenta de "Nova apuração")
// Onde ficava: menu-lateral.js, lista NAV
// ------------------------------------------------------------
/*<<INICIO>>
    { href: 'PASEP_teste_jspdf.html', txt: 'Importar XML / balancete', apuracao: true },

<<FIM>>*/

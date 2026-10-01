// ============================================================
// ApuraPASEP — "Revisar lançamentos"
// Modal compartilhado entre painel.html e admin-apuracoes.html. Mostra o detalhamento por
// rubrica salvo junto da apuração (coluna apuracoes.detalhamento, JSON montado por
// montarDetalhamento() em PASEP_teste_jspdf.html).
//
// Único arquivo .js fora das páginas: fica separado só para não duplicar o mesmo modal em
// duas telas. Não contém regra de classificação nenhuma — apenas exibe o que já foi
// calculado pelo motor e gravado na apuração.
//
// Uso: abrirRevisaoLancamentos(apuracao, { titulo: 'Piratininga/SP', linkReprocessar: true })
// ============================================================
(function(){
  var MESES = {1:'Janeiro',2:'Fevereiro',3:'Março',4:'Abril',5:'Maio',6:'Junho',7:'Julho',8:'Agosto',9:'Setembro',10:'Outubro',11:'Novembro',12:'Dezembro'};

  var css =
    '.rl-fundo{ position:fixed; inset:0; background:rgba(15,23,42,.5); z-index:100; display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow-y:auto; }' +
    '.rl-caixa{ background:#fff; color:#172033; border-radius:14px; width:100%; max-width:860px; box-shadow:0 24px 60px rgba(15,23,42,.3); font-family:Inter,sans-serif; }' +
    '.rl-topo{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:20px 24px; border-bottom:1px solid #e2e8f0; }' +
    '.rl-topo h2{ margin:0; font-size:18px; font-weight:800; }' +
    '.rl-topo .rl-sub{ font-size:12.5px; color:#475569; margin-top:4px; }' +
    '.rl-fechar{ background:none; border:1px solid #e2e8f0; border-radius:8px; font-size:16px; width:34px; height:34px; cursor:pointer; color:#172033; flex:none; }' +
    '.rl-corpo{ padding:18px 24px 24px; }' +
    '.rl-corpo h3{ font-size:13.5px; margin:22px 0 8px; }' +
    '.rl-corpo h3:first-child{ margin-top:0; }' +
    '.rl-aviso{ background:#fffbeb; border:1px solid #fcd34d; color:#92400e; border-radius:10px; padding:12px 14px; font-size:13px; line-height:1.5; }' +
    '.rl-tab{ width:100%; border-collapse:collapse; font-size:13px; }' +
    '.rl-tab th{ text-align:left; font-size:11.5px; color:#475569; font-weight:600; padding:7px 8px; border-bottom:1px solid #e2e8f0; }' +
    '.rl-tab td{ padding:7px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }' +
    '.rl-tab td.num, .rl-tab th.num{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }' +
    '.rl-tab tr.rl-total td{ font-weight:700; border-top:1px solid #cbd5e1; }' +
    '.rl-tab tr.rl-lanc td{ color:#475569; font-size:12px; background:#f8fafc; }' +
    '.rl-tab .rl-nota{ display:block; font-size:11.5px; color:#475569; margin-top:2px; }' +
    '.rl-abrir{ background:none; border:none; color:#218b78; cursor:pointer; font-size:12px; padding:0; }' +
    '.rl-tag{ font-size:11px; padding:2px 8px; border-radius:20px; white-space:nowrap; }' +
    '.rl-tag.sim{ background:#dcfce7; color:#166534; } .rl-tag.nao{ background:#f1f5f9; color:#475569; }' +
    '.rl-rodape{ margin-top:18px; font-size:12px; color:#475569; line-height:1.5; }' +
    '.rl-rodape a{ color:#172033; font-weight:600; }' +
    '.rl-scroll{ overflow-x:auto; }';

  function injetarCss(){
    if (document.getElementById('rl-css')) return;
    var s = document.createElement('style');
    s.id = 'rl-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function num(v){
    return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  // Tabela de rubricas com os lançamentos de cada uma, recolhidos por padrão.
  function tabelaRubricas(lista, total, rotuloTotal, prefixoId){
    if (!lista || lista.length === 0) return '<p style="font-size:13px; color:#475569; margin:0">Nenhuma rubrica com movimento nesta competência.</p>';
    var linhas = lista.map(function(l, i){
      var id = prefixoId + i;
      var qtd = (l.lancamentos || []).length;
      var html = '<tr><td>' + esc(l.label) + (l.nota ? '<span class="rl-nota">' + esc(l.nota) + '</span>' : '') + '</td>' +
        '<td>' + esc(l.codigo) + '</td>' +
        '<td class="num">' + num(l.valor) + '</td>' +
        '<td class="num">' + (qtd ? '<button type="button" class="rl-abrir" data-alvo="' + id + '">' + qtd + ' lanç. ▾</button>' : '—') + '</td></tr>';
      (l.lancamentos || []).forEach(function(x){
        html += '<tr class="rl-lanc" data-grupo="' + id + '" style="display:none">' +
          '<td>' + esc(x.tipo) + '</td><td>' + esc(x.codigo) + ' · FR ' + esc(x.fonte) + ' · CA ' + esc(x.aplicacao) + '</td>' +
          '<td class="num">' + num(x.valor) + '</td><td></td></tr>';
      });
      return html;
    }).join('');
    return '<div class="rl-scroll"><table class="rl-tab"><tr><th>Rubrica</th><th>Código</th><th class="num">Valor (R$)</th><th class="num">Lançamentos</th></tr>' +
      linhas + '<tr class="rl-total"><td colspan="2">' + esc(rotuloTotal) + '</td><td class="num">' + num(total) + '</td><td></td></tr></table></div>';
  }

  // Conferência da dedução do FUNDEB com a conta 6.2.1.3.1.01 (guardada na apuração; só as novas a trazem).
  function avisoFundeb(c){
    if (!c) return '';
    var itens = (c.semRetencao || []).map(function(x){
      var nome = String(x.rubrica || '').replace(/^Cota-Parte\s+/i, '');
      var curto = nome.split(/\s+[—–-]\s+/)[0];
      var codigos = (x.codigos && x.codigos.length) ? x.codigos.join(', ') : x.codigo;
      return '<li style="margin:4px 0"><b>' + esc(curto) + '</b> (código ' + esc(codigos) + '): Há lançamentos na Receita "' + esc(nome) + ' - código ' + esc(codigos) + '" sem retenção do FUNDEB, é recomendável verificar essa contabilização.</li>';
    });
    var semRet = itens.length ? '<div style="font-size:12.5px; line-height:1.5; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; color:#92400e; padding:10px 12px; margin:10px 0 0"><b>Atenção: receitas do FUNDEB sem retenção lançada na conta 6.2.1.3.1.01.</b><ol style="margin:6px 0 0; padding-left:20px">' + itens.join('') + '</ol></div>' : '';
    var itens2 = (c.rubricas || []).filter(function(x){ return Math.abs(x.contabil) >= 0.005; }).map(function(x){
      var nome = String(x.rubrica || '').replace(/^Cota-Parte\s+/i, '');
      var curto = nome.split(/\s+[—–-]\s+/)[0];
      var codigos = (x.codigos && x.codigos.length) ? x.codigos.join(', ') : x.codigo;
      var texto = x.foraDasRubricas
        ? 'Há retenção do FUNDEB lançada na conta 6.2.1.3.1.01 (R$ ' + num(x.contabil) + ') para o código ' + codigos + ', que não consta entre as receitas do FUNDEB nas regras, é recomendável verificar essa contabilização.'
        : 'A retenção do FUNDEB lançada para a Receita "' + nome + ' - código ' + codigos + '" (R$ ' + num(x.contabil) + ') difere dos 20% da receita (R$ ' + num(x.calculada) + ') em R$ ' + num(Math.abs(x.diferenca)) + ', é recomendável verificar essa contabilização.';
      return '<li style="margin:4px 0"><b>' + esc(x.foraDasRubricas ? 'Código ' + codigos : curto) + '</b> (código ' + esc(codigos) + '): ' + esc(texto) + '</li>';
    });
    if (itens2.length) semRet += '<div style="font-size:12.5px; line-height:1.5; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; color:#92400e; padding:10px 12px; margin:10px 0 0"><b>Atenção: retenção do FUNDEB diferente de 20% da receita (diferença acima de R$ 0,10).</b><ol style="margin:6px 0 0; padding-left:20px">' + itens2.join('') + '</ol></div>';
    if (!c.excede) return '<p style="font-size:12px; color:#475569; margin:8px 0 0">Conferência com a conta 6.2.1.3.1.01: diferença de R$ ' + num(Math.abs(c.diferenca)) + ', dentro do limite de R$ 0,10.</p>' + semRet;
    return '<p style="font-size:12.5px; line-height:1.5; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; color:#92400e; padding:10px 12px; margin:10px 0 0"><b>Atenção:</b> a dedução calculada (R$ ' + num(c.calculada) +
      ') difere da retenção lançada na conta 6.2.1.3.1.01 (R$ ' + num(c.contabil) + ') em R$ ' + num(c.diferenca) + ', acima do limite de R$ 0,10. Confira os lançamentos do FUNDEB.</p>' + semRet;
  }

  function tabelaAlertas(alertas){
    if (!alertas || alertas.length === 0) return '<p style="font-size:13px; color:#475569; margin:0">Nenhuma receita de finalidade definida nesta competência.</p>';
    return '<div class="rl-scroll"><table class="rl-tab"><tr><th>Receita</th><th>Código / ficha</th><th class="num">Valor (R$)</th><th>Na base?</th></tr>' +
      alertas.map(function(a){
        var tipo = a.bloco === 5 ? 'Capital' : 'Corrente';
        return '<tr><td>' + esc(a.label) + '<span class="rl-nota">Transferência ' + tipo + '</span></td>' +
          '<td>' + esc(a.codigo) + ' · FR ' + esc(a.fonte) + ' · CA ' + esc(a.aplicacao) + '</td>' +
          '<td class="num">' + num(a.valor) + '</td>' +
          '<td>' + (a.incluir ? '<span class="rl-tag sim">Incluída</span>' : '<span class="rl-tag nao">Excluída</span>') + '</td></tr>';
      }).join('') + '</table></div>';
  }

  function memoriaCalculo(det, ap){
    var c = det.calculo || {};
    function linha(rotulo, valor, forte){
      return '<tr' + (forte ? ' class="rl-total"' : '') + '><td>' + rotulo + '</td><td class="num">' + num(valor) + '</td></tr>';
    }
    return '<table class="rl-tab">' +
      linha('Receita Corrente Arrecadada', c.receitaCorrente != null ? c.receitaCorrente : ap.receita_corrente) +
      linha('(-) Dedução FUNDEB (20% — CF, art. 212-A)', det.dedFundebFlat) +
      linha('(-) Transferências Correntes com finalidade definida (art. 2º, §7º)', c.totalFinalidadeCorrente) +
      linha('(+) Transferências de Capital incluídas na base', c.totalCapitalIncluido) +
      linha('(=) Base de cálculo', c.base != null ? c.base : ap.base_calculo, true) +
      linha('PASEP devido (1% — art. 8º, III)', c.valorTotal) +
      linha('(-) PASEP retido na fonte (art. 2º, §6º)', c.retido != null ? c.retido : ap.pasep_retido) +
      linha('(=) Valor a pagar', c.valorPagar != null ? c.valorPagar : ap.valor_pagar, true) +
      '</table>';
  }

  function fechar(){
    var f = document.getElementById('rl-fundo');
    if (f) f.remove();
    document.removeEventListener('keydown', teclaEsc);
  }
  function teclaEsc(e){ if (e.key === 'Escape') fechar(); }

  window.abrirRevisaoLancamentos = function(ap, opcoes){
    opcoes = opcoes || {};
    injetarCss();
    fechar();

    var det = null, erroLeitura = false;
    if (ap.detalhamento){
      try { det = JSON.parse(ap.detalhamento); } catch (e) { erroLeitura = true; }
    }

    var corpo;
    if (!det){
      corpo = '<div class="rl-aviso">' + (erroLeitura
        ? 'O detalhamento desta apuração não pôde ser lido (conteúdo corrompido).'
        : 'Esta apuração foi salva antes de o detalhamento por rubrica passar a ser gravado junto dela, por isso não há lançamentos para revisar aqui.') +
        ' Para ver a composição do valor, reprocesse o XML AUDESP desta competência na ferramenta de apuração e salve de novo.</div>';
    } else {
      corpo =
        '<h3>Memória de cálculo</h3>' + memoriaCalculo(det, ap) +
        '<h3>Retenção na fonte — Bloco 2 (art. 2º, §6º)</h3>' + tabelaRubricas(det.bloco2, det.totalBloco2, 'Total da base de retenção', 'rl-b2-') +
        (det.itr ? '<p class="rl-rodape" style="margin-top:6px">ITR no período: R$ ' + num(det.itr) + ' — retido já ajustado, pois a STN repassa o ITR líquido dos 20% do FUNDEB.</p>' : '') +
        '<h3>FUNDEB — Bloco 4</h3>' + tabelaRubricas(det.bloco4, det.totalFundeb, 'Total FUNDEB (dedução de 20%: R$ ' + num(det.dedFundebFlat) + ')', 'rl-b4-') +
        avisoFundeb(det.conferenciaFundeb) +
        '<h3>Receitas com finalidade definida (art. 2º, §7º)</h3>' + tabelaAlertas(det.alertas);
    }

    var rodape = '<div class="rl-rodape">Valores conforme gravados no momento do salvamento' +
      (ap.$updatedAt ? ' (' + new Date(ap.$updatedAt).toLocaleString('pt-BR') + ')' : '') + '.' +
      (opcoes.linkReprocessar ? ' Para alterar alguma decisão (incluir ou excluir receita de finalidade definida), <a href="PASEP_teste_jspdf.html">reprocesse o XML na ferramenta</a> e salve de novo.' : '') +
      '</div>';

    var fundo = document.createElement('div');
    fundo.className = 'rl-fundo';
    fundo.id = 'rl-fundo';
    fundo.innerHTML =
      '<div class="rl-caixa" role="dialog" aria-modal="true" aria-labelledby="rl-titulo">' +
        '<div class="rl-topo"><div><h2 id="rl-titulo">Revisar lançamentos — ' + esc(MESES[ap.competencia_mes] || ap.competencia_mes) + '/' + esc(ap.competencia_ano) + '</h2>' +
        (opcoes.titulo ? '<div class="rl-sub">' + esc(opcoes.titulo) + '</div>' : '') + '</div>' +
        '<button type="button" class="rl-fechar" aria-label="Fechar">✕</button></div>' +
        '<div class="rl-corpo">' + corpo + rodape + '</div>' +
      '</div>';
    document.body.appendChild(fundo);

    fundo.addEventListener('click', function(e){ if (e.target === fundo) fechar(); });
    fundo.querySelector('.rl-fechar').addEventListener('click', fechar);
    fundo.querySelectorAll('.rl-abrir').forEach(function(btn){
      btn.addEventListener('click', function(){
        var linhas = fundo.querySelectorAll('tr[data-grupo="' + btn.dataset.alvo + '"]');
        var abrir = linhas.length && linhas[0].style.display === 'none';
        linhas.forEach(function(tr){ tr.style.display = abrir ? '' : 'none'; });
        btn.textContent = btn.textContent.replace(/[▾▴]/, abrir ? '▴' : '▾');
      });
    });
    document.addEventListener('keydown', teclaEsc);
    fundo.querySelector('.rl-fechar').focus();
  };
})();

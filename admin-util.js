// ============================================================
// ApuraPASEP: utilidades compartilhadas das telas de administração
// (admin.html, admin-regras.html, admin-apuracoes.html)
//
//   erroAmigavel(erro)            mensagem em português claro para um erro do Appwrite
//   listarTodas(tabela, queries)  lê TODAS as linhas de uma tabela, paginando (100 por vez)
//   baixarArquivo(nome, texto, tipo)  baixa um arquivo gerado no navegador
//   csvLinha(valores)             uma linha de CSV (separador ";", aspas escapadas)
//   confirmar({titulo, texto, ...})   janela de confirmação dentro da página (devolve Promise)
//
// Depende das variáveis globais da página: tablesDB, Query e DATABASE_ID.
// ============================================================
(function(){
  // ---------- Erros em português claro ----------
  // O Appwrite devolve erros técnicos em inglês (ex.: "Permissions must be one of ..."). Aqui
  // cada tipo conhecido vira uma frase que diz o que houve e o que fazer. O erro original vai
  // para o console, para quem precisar investigar.
  var POR_TIPO = {
    user_unauthorized: 'Você não tem permissão para fazer isso.',
    general_unauthorized_scope: 'Você não tem permissão para fazer isso.',
    user_jwt_invalid: 'Sua sessão expirou. Entre de novo no sistema.',
    user_session_not_found: 'Sua sessão expirou. Entre de novo no sistema.',
    user_invalid_credentials: 'E-mail ou senha incorretos.',
    user_already_exists: 'Já existe uma conta com este e-mail.',
    user_not_found: 'Usuário não encontrado.',
    team_invite_already_exists: 'Este e-mail já faz parte do grupo ou já tem um convite pendente.',
    team_already_exists: 'Já existe um grupo com este nome.',
    team_not_found: 'O grupo (time) deste município não foi encontrado.',
    team_membership_mismatch: 'Este usuário não faz parte do grupo.',
    membership_not_found: 'Este usuário não faz parte do grupo.',
    document_not_found: 'O registro não foi encontrado. Ele pode ter sido apagado; recarregue a página.',
    row_not_found: 'O registro não foi encontrado. Ele pode ter sido apagado; recarregue a página.',
    document_already_exists: 'Este registro já existe.',
    row_already_exists: 'Este registro já existe.',
    document_invalid_structure: 'Algum dado está em formato inválido. Confira os campos e tente de novo.',
    row_invalid_structure: 'Algum dado está em formato inválido. Confira os campos e tente de novo.',
    document_missing_data: 'Falta preencher algum dado obrigatório.',
    row_missing_data: 'Falta preencher algum dado obrigatório.',
    general_rate_limit_exceeded: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.',
    general_argument_invalid: 'Algum dado informado é inválido. Confira os campos e tente de novo.',
    general_unknown_origin: 'Este endereço do site não está autorizado no Appwrite. Avise o responsável técnico.',
    storage_device_not_found: 'Arquivo não encontrado.'
  };

  window.erroAmigavel = function(erro){
    try { console.error('Erro original:', erro); } catch (e) {}
    if (!erro) return 'Não foi possível concluir a operação. Tente de novo.';
    // Erros criados pelo próprio sistema já trazem a mensagem pronta para o usuário.
    if (erro.mensagemAmigavel) return erro.mensagemAmigavel;
    var msg = String(erro.message || erro);
    var tipo = erro.type || '';

    // Permissão por linha recusada: o administrador só pode conceder permissão a grupos de que faz parte.
    if (/Permissions must be one of/i.test(msg)){
      return 'O sistema tentou dar acesso a um grupo de que você não faz parte. Nada foi alterado. Avise o responsável técnico com esta descrição.';
    }
    if (/Failed to fetch|NetworkError|Network request failed|Load failed|fetch failed/i.test(msg)){
      return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    }
    if (/timeout|timed out/i.test(msg)) return 'O servidor demorou demais para responder. Tente de novo.';
    if (POR_TIPO[tipo]) return POR_TIPO[tipo];
    if (erro.code === 401) return 'Você não tem permissão para fazer isso, ou sua sessão expirou.';
    if (erro.code === 403) return 'Você não tem permissão para fazer isso.';
    if (erro.code === 404) return 'O registro não foi encontrado. Recarregue a página.';
    if (erro.code === 409) return 'Este registro já existe ou foi alterado por outra pessoa. Recarregue a página.';
    if (erro.code === 429) return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.';
    if (erro.code >= 500) return 'O servidor está com problema agora. Tente de novo em alguns minutos.';
    return 'Não foi possível concluir a operação. Tente de novo; se continuar, avise o responsável técnico.';
  };

  // ---------- Listagem completa, paginando ----------
  window.listarTodas = async function(tabela, queries, maximo){
    var todas = [], cursor = null, limite = maximo || 5000;
    while (todas.length < limite){
      var q = (queries || []).concat([Query.limit(100)]);
      if (cursor) q.push(Query.cursorAfter(cursor));
      var r = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: tabela, queries: q });
      todas = todas.concat(r.rows);
      if (r.rows.length < 100) break;
      cursor = r.rows[r.rows.length - 1].$id;
    }
    return todas;
  };

  // ---------- Arquivos ----------
  window.baixarArquivo = function(nome, texto, tipo){
    var blob = new Blob([texto], { type: tipo || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  };

  // CSV para o Excel em português: separador ";", aspas escapadas. O BOM no começo faz o Excel
  // abrir os acentos corretamente; quem chama deve juntar as linhas com "\r\n".
  window.csvLinha = function(valores){
    return valores.map(function(v){
      var t = (v == null) ? '' : String(v);
      // Evita que o Excel interprete o texto como fórmula (injeção de fórmula em CSV).
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join(';');
  };
  window.CSV_BOM = '﻿';

  // ---------- Janela de confirmação ----------
  var cssConfirma =
    '.uc-fundo{ position:fixed; inset:0; background:rgba(15,20,32,.55); backdrop-filter:blur(4px); z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; }' +
    '.uc-caixa{ background:#fff; border-radius:16px; box-shadow:0 30px 70px rgba(15,20,32,.35); width:100%; max-width:460px; padding:24px 24px 20px; font-family:Inter,sans-serif; color:#172033; }' +
    '.uc-caixa h2{ font-size:17px; font-weight:800; margin:0 0 8px; }' +
    '.uc-caixa p{ font-size:13.5px; line-height:1.55; color:#475569; margin:0 0 10px; white-space:pre-line; }' +
    '.uc-caixa .uc-alerta{ background:#fef3c7; border:1px solid #f5d98b; color:#78350f; border-radius:10px; padding:9px 12px; font-size:12.5px; line-height:1.5; margin:0 0 12px; }' +
    '.uc-caixa label{ display:block; font-size:12.5px; color:#475569; margin:4px 0 5px; }' +
    '.uc-caixa textarea, .uc-caixa input{ width:100%; font:inherit; font-size:13.5px; padding:9px 11px; border:1px solid #e2e8f0; border-radius:10px; box-sizing:border-box; }' +
    '.uc-acoes{ display:flex; gap:10px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap; }' +
    '.uc-acoes button{ font:inherit; font-size:13px; padding:9px 16px; border-radius:9px; cursor:pointer; border:1px solid #e2e8f0; background:#fff; color:#172033; }' +
    '.uc-acoes button.uc-ok{ background:linear-gradient(135deg,#218b78,#5d62d9); color:#fff; border-color:transparent; }' +
    '.uc-acoes button.uc-ok.uc-perigo{ background:#b91c1c; }' +
    '.uc-acoes button:disabled{ opacity:.55; cursor:default; }' +
    '.uc-erro{ color:#b91c1c; font-size:12.5px; margin-top:6px; }';

  // opcoes: titulo, texto, alerta (faixa amarela), rotuloOk, perigo (botão vermelho),
  //         pedeMotivo (campo de texto), motivoObrigatorio, digitar (palavra a digitar para liberar)
  // Devolve Promise: false se cancelou; true (ou o texto do motivo, se pedeMotivo) se confirmou.
  window.confirmar = function(opcoes){
    return new Promise(function(resolve){
      if (!document.getElementById('uc-css')){
        var st = document.createElement('style'); st.id = 'uc-css'; st.textContent = cssConfirma; document.head.appendChild(st);
      }
      function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
      var fundo = document.createElement('div');
      fundo.className = 'uc-fundo';
      fundo.innerHTML =
        '<div class="uc-caixa" role="dialog" aria-modal="true" aria-labelledby="uc-titulo">' +
          '<h2 id="uc-titulo">' + esc(opcoes.titulo || 'Confirmar') + '</h2>' +
          (opcoes.alerta ? '<div class="uc-alerta">' + esc(opcoes.alerta) + '</div>' : '') +
          (opcoes.texto ? '<p>' + esc(opcoes.texto) + '</p>' : '') +
          (opcoes.pedeMotivo ? '<label for="uc-motivo">' + esc(opcoes.rotuloMotivo || 'Motivo') + (opcoes.motivoObrigatorio ? '' : ' (opcional)') + '</label><textarea id="uc-motivo" rows="3"></textarea>' : '') +
          (opcoes.digitar ? '<label for="uc-digitar">Para confirmar, digite <b>' + esc(opcoes.digitar) + '</b></label><input id="uc-digitar" autocomplete="off">' : '') +
          '<div class="uc-erro" id="uc-erro" role="alert"></div>' +
          '<div class="uc-acoes"><button type="button" id="uc-cancelar">' + esc(opcoes.rotuloCancelar || 'Cancelar') + '</button>' +
          '<button type="button" class="uc-ok' + (opcoes.perigo ? ' uc-perigo' : '') + '" id="uc-confirmar">' + esc(opcoes.rotuloOk || 'Confirmar') + '</button></div>' +
        '</div>';
      document.body.appendChild(fundo);

      function fechar(v){ document.removeEventListener('keydown', tecla); fundo.remove(); resolve(v); }
      function tecla(e){ if (e.key === 'Escape') fechar(false); }
      document.addEventListener('keydown', tecla);
      fundo.addEventListener('click', function(e){ if (e.target === fundo) fechar(false); });
      fundo.querySelector('#uc-cancelar').addEventListener('click', function(){ fechar(false); });
      fundo.querySelector('#uc-confirmar').addEventListener('click', function(){
        var erro = fundo.querySelector('#uc-erro');
        var motivo = opcoes.pedeMotivo ? fundo.querySelector('#uc-motivo').value.trim() : '';
        if (opcoes.pedeMotivo && opcoes.motivoObrigatorio && motivo.length < 5){ erro.textContent = 'Informe o motivo (mínimo de 5 caracteres).'; return; }
        if (opcoes.digitar && fundo.querySelector('#uc-digitar').value.trim() !== opcoes.digitar){ erro.textContent = 'O texto digitado não confere.'; return; }
        fechar(opcoes.pedeMotivo ? (motivo || true) : true);
      });
      var primeiro = fundo.querySelector('#uc-motivo') || fundo.querySelector('#uc-digitar') || fundo.querySelector('#uc-confirmar');
      setTimeout(function(){ primeiro.focus(); }, 20);
    });
  };
})();

// ============================================================
// ApuraPASEP — chamada à função do servidor (function-servidor/main.js)
//
// Uso: var r = await chamarServidor(client, 'salvar_apuracao', { ...dados });
// Devolve o objeto de resposta da função (sempre com ok:true). Em caso de recusa ou falha,
// lança um Error com a mensagem em português e mensagemAmigavel:true (para o erroAmigavel de
// admin-util.js, e as páginas, mostrarem o texto como está).
// Depende do SDK Appwrite carregado (Appwrite.Functions).
// ============================================================
(function(){
  var FUNCAO_SERVIDOR_ID = 'servidor';

  window.chamarServidor = async function(client, acao, dados){
    var execucao;
    try {
      execucao = await new Appwrite.Functions(client).createExecution({
        functionId: FUNCAO_SERVIDOR_ID,
        body: JSON.stringify(Object.assign({ acao: acao }, dados || {})),
        async: false
      });
    } catch (e) {
      var falha = new Error('Não foi possível falar com o servidor agora. Verifique sua conexão e tente de novo.');
      falha.mensagemAmigavel = true; falha.original = e;
      throw falha;
    }
    var resposta = {};
    try { resposta = JSON.parse(execucao.responseBody || '{}'); } catch (e) { /* corpo vazio ou inválido */ }
    if (!resposta.ok){
      var erro = new Error(resposta.erro || 'O servidor não conseguiu concluir a operação. Tente novamente em instantes.');
      erro.mensagemAmigavel = true; erro.recusado = execucao.responseStatusCode < 500;
      throw erro;
    }
    return resposta;
  };
})();

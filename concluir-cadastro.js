// ============================================================
// ApuraPASEP — conclusão do cadastro de município (autocadastro)
// Usado por cadastro.html (logo após criar a conta) e por painel.html (retomada).
//
// O autocadastro tem três passos que não são atômicos: criar a conta, criar o time do
// município e criar a linha em "municipios". Se o navegador fechar, a rede cair ou algum
// passo falhar no meio, a conta fica criada sem município — e o usuário não consegue
// refazer o cadastro, porque o e-mail já existe.
//
// Para permitir a retomada, os dados do cadastro ficam guardados nas preferências da própria
// conta (account prefs, campo "cadastroPendente") antes do primeiro passo, e só são apagados
// quando tudo foi concluído. painel.html chama retomarCadastroPendente() a cada acesso: se
// encontrar dados pendentes, conclui o que faltou, sem duplicar o time nem o município.
//
// Depende das variáveis globais da página: account, teams, tablesDB, DATABASE_ID e do SDK
// Appwrite carregado (Appwrite.ID, Appwrite.Query, Appwrite.Permission, Appwrite.Role).
// ============================================================
(function(){
  var TEAM_ADMINS_ID = '6ab476f0000e158fa770';

  async function gravarPendente(prefsAtuais, pendente){
    var novas = Object.assign({}, prefsAtuais || {});
    if (pendente) novas.cadastroPendente = pendente; else delete novas.cadastroPendente;
    await account.updatePrefs({ prefs: novas });
    return novas;
  }

  // Executa (ou retoma) os passos do cadastro. Idempotente: pode ser chamada várias vezes
  // para o mesmo cadastro sem criar time ou município em duplicidade.
  async function executar(pendente, prefs){
    var nomeTime = pendente.nome + '/' + pendente.uf;

    // 1. Time do município. Reaproveita o já criado numa tentativa anterior: primeiro pelo id
    //    guardado nas prefs; se o id não chegou a ser guardado (falha entre criar o time e
    //    gravar as prefs), procura entre os times do usuário um com o mesmo nome.
    var teamId = pendente.team_id || null;
    if (!teamId){
      var meus = await teams.list();
      var existente = meus.teams.find(function(t){ return t.$id !== TEAM_ADMINS_ID && t.name === nomeTime; });
      if (existente){
        teamId = existente.$id;
      } else {
        // Quem cria o time entra automaticamente como owner.
        var novo = await teams.create({ teamId: Appwrite.ID.unique(), name: nomeTime });
        teamId = novo.$id;
      }
      pendente = Object.assign({}, pendente, { team_id: teamId });
      prefs = await gravarPendente(prefs, pendente);
    }

    // 2. Linha do município, só se ainda não existir para este time.
    var jaTem = await tablesDB.listRows({
      databaseId: DATABASE_ID, tableId: 'municipios',
      queries: [Appwrite.Query.equal('team_id', teamId), Appwrite.Query.limit(1)]
    });
    if (jaTem.rows.length === 0){
      await tablesDB.createRow({
        databaseId: DATABASE_ID, tableId: 'municipios', rowId: Appwrite.ID.unique(),
        data: {
          nome: pendente.nome, uf: pendente.uf, sistema_gestao: pendente.sistema_gestao, status: 'pendente', team_id: teamId,
          // Quem pediu o cadastro: o administrador confere antes de aprovar (admin.html).
          responsavel_nome: pendente.responsavel_nome || null, responsavel_email: pendente.responsavel_email || null
        },
        // Só leitura para o time: alterar status, código TCE ou sistema de gestão é atribuição
        // do administrador (permissão de update no nível da tabela, time plataforma-admins).
        // Com update liberado ao time, o próprio município conseguiria se aprovar pela API.
        permissions: [ Appwrite.Permission.read(Appwrite.Role.team(teamId)) ]
      });
    }

    // 3. Tudo concluído: limpa os dados pendentes.
    await gravarPendente(prefs, null);
    return { teamId: teamId };
  }

  // Chamada por cadastro.html logo depois de criar a conta e abrir a sessão.
  window.concluirCadastroMunicipio = async function(nome, uf, sistemaGestao, responsavel){
    var usuario = await account.get();
    var pendente = {
      nome: nome, uf: uf, sistema_gestao: sistemaGestao, iniciado_em: new Date().toISOString(),
      responsavel_nome: (responsavel && responsavel.nome) || usuario.name || '',
      responsavel_email: (responsavel && responsavel.email) || usuario.email || ''
    };
    var prefs = await gravarPendente(usuario.prefs, pendente);
    return executar(pendente, prefs);
  };

  // Chamada por painel.html a cada acesso. Devolve:
  //   null                      — não havia cadastro pendente
  //   { concluido: true }       — havia e foi concluído agora
  //   { concluido: false, erro } — havia, mas ainda não foi possível concluir
  window.retomarCadastroPendente = async function(usuario){
    var pendente = usuario && usuario.prefs && usuario.prefs.cadastroPendente;
    if (!pendente || !pendente.nome || !pendente.uf) return null;
    try {
      await executar(pendente, usuario.prefs);
      return { concluido: true };
    } catch (e) {
      return { concluido: false, erro: e.message };
    }
  };
})();

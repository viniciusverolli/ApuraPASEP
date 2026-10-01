// ============================================================
// ApuraPASEP — função do servidor (Appwrite Function "servidor")
//
// Reúne tudo o que não pode ser decidido no navegador, porque o navegador é controlado por
// quem o usa. O site chama esta função por meio de servidor.js (createExecution) e ela
// confere, com a chave automática da própria função, quem está chamando e se pode fazer
// aquilo. Ações (campo "acao" do corpo JSON):
//
//   registrar_municipio   autocadastro: cria a linha do município (sempre "pendente"), sem
//                         duplicar e só para quem é membro do time informado
//   salvar_apuracao       grava a apuração só se o município está ativo e a licença vigente
//   registrar_acesso      guarda o último acesso do município (no máximo 1 gravação por hora)
//   admin_usuarios        (admin) todos os usuários, com município, papel e último acesso
//   admin_membros         (admin) membros de qualquer time de município
//   admin_convidar        (admin) coloca um usuário (criando a conta, se preciso) em qualquer time de município
//   admin_remover_membro  (admin) remove membro de time de município
//   admin_definir_papel   (admin) altera os papéis de um membro
//   admin_decidir_solicitacao (admin) aprova ou recusa um pedido de acesso a município já cadastrado
//   admin_suspender_usuario (admin) suspende ou reativa a conta de um usuário, sem afetar o município
//   admin_notificar       (admin) e-mail ao responsável sobre aprovação/suspensão/reativação
//
// Execução agendada (cron diário, sem usuário): avisos de licença a vencer/vencida e lembrete
// de cadastros pendentes aos administradores.
//
// E-mail: usa o Messaging do Appwrite. Sem provedor de e-mail habilitado, tudo funciona e o
// envio é apenas ignorado (a resposta traz "email.enviado: false" e o motivo).
//
// Escopos exigidos da função: users.read, teams.read, teams.write, rows.read, rows.write,
// providers.read, messages.write, targets.read.
// ============================================================

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client, Users, Teams, TablesDB, Messaging, Query, ID, Permission, Role } from 'node-appwrite';

var DATABASE_ID = 'apurapasep';
var TEAM_ADMINS_ID = '6ab476f0000e158fa770';
var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
var MESES = ['', 'janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
var UMA_HORA = 60 * 60 * 1000;
var MAX_USUARIOS_POR_MUNICIPIO = 3;

// Código do TCESP de cada município paulista (valor da tag Municipio dos XML AUDESP).
var CODIGO_TCE_POR_NOME = {};
try {
  var tabela = JSON.parse(readFileSync(new URL('./municipios-tce.json', import.meta.url), 'utf8'));
  Object.keys(tabela).forEach(function(codigo){ CODIGO_TCE_POR_NOME[tabela[codigo].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()] = codigo; });
} catch (e) { /* sem a tabela, o código fica para o administrador preencher */ }

class ErroNegocio extends Error {}
function falhar(msg){ throw new ErroNegocio(msg); }
function norm(t){ return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function servicos(req){
  var cliente = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] || process.env.APPWRITE_API_KEY);
  return { users: new Users(cliente), teams: new Teams(cliente), db: new TablesDB(cliente), msg: new Messaging(cliente) };
}

// ---------- consultas de apoio ----------

async function todasAsLinhas(db, tableId, queries){
  var saida = [], offset = 0;
  for (;;){
    var r = await db.listRows({ databaseId: DATABASE_ID, tableId: tableId, queries: (queries || []).concat([Query.limit(100), Query.offset(offset)]) });
    saida = saida.concat(r.rows);
    if (r.rows.length < 100) break;
    offset += 100;
  }
  return saida;
}

async function membrosDoTime(teams, teamId){
  var saida = [], offset = 0;
  for (;;){
    var r = await teams.listMemberships({ teamId: teamId, queries: [Query.limit(100), Query.offset(offset)] });
    saida = saida.concat(r.memberships);
    if (r.memberships.length < 100) break;
    offset += 100;
  }
  return saida;
}

async function ehMembroConfirmado(teams, teamId, userId){
  var r = await teams.listMemberships({ teamId: teamId, queries: [Query.equal('userId', userId), Query.limit(1)] });
  return r.memberships.length > 0 && r.memberships[0].confirm === true;
}

async function exigirAdmin(s, userId){
  if (!userId || !(await ehMembroConfirmado(s.teams, TEAM_ADMINS_ID, userId))) falhar('Ação restrita aos administradores da plataforma.');
}

// Licença vigente: sem data de validade registrada não bloqueia (mesmo comportamento do painel
// para municípios antigos); com data, bloqueia se já passou ou se a licença está suspensa.
function licencaBloqueia(m){
  if (m.licenca_status === 'suspensa') return 'A licença está suspensa.';
  if (m.licenca_validade && new Date(m.licenca_validade) < new Date()) return 'A licença venceu em ' + new Date(m.licenca_validade).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '.';
  return null;
}

// ---------- e-mail ----------

async function provedorDeEmail(s){
  try {
    var r = await s.msg.listProviders({ queries: [Query.equal('enabled', true), Query.limit(50)] });
    return r.providers.some(function(p){ return p.type === 'email'; });
  } catch (e) { return false; }
}

function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

function corpoEmail(titulo, paragrafos){
  return '<div style="font-family:Arial,sans-serif;color:#172033;max-width:560px">' +
    '<div style="font-size:20px;font-weight:800;margin-bottom:16px">Apura<span style="color:#218b78">PASEP</span></div>' +
    '<h2 style="font-size:17px;margin:0 0 12px">' + esc(titulo) + '</h2>' +
    paragrafos.map(function(p){ return '<p style="font-size:14px;line-height:1.55;margin:0 0 10px">' + p + '</p>'; }).join('') +
    '<p style="font-size:12px;color:#64748b;margin-top:20px">Mensagem automática do ApuraPASEP. Não responda este e-mail.</p></div>';
}

// Envia para uma lista de endereços. Localiza a conta de cada endereço; quem não tem conta é ignorado.
async function enviarEmail(s, enderecos, assunto, html){
  var lista = Array.from(new Set((enderecos || []).filter(Boolean).map(function(e){ return String(e).trim().toLowerCase(); })));
  if (!lista.length) return { enviado: false, motivo: 'sem destinatário' };
  if (!(await provedorDeEmail(s))) return { enviado: false, motivo: 'provedor de e-mail não configurado no Appwrite' };
  var ids = [];
  for (var i = 0; i < lista.length; i++){
    var r = await s.users.list({ queries: [Query.equal('email', lista[i]), Query.limit(1)] });
    if (r.users.length) ids.push(r.users[0].$id);
  }
  if (!ids.length) return { enviado: false, motivo: 'nenhuma conta encontrada para os destinatários' };
  try {
    await s.msg.createEmail({ messageId: ID.unique(), subject: assunto, content: html, users: ids, html: true });
    return { enviado: true, destinatarios: ids.length };
  } catch (e) {
    return { enviado: false, motivo: e.message };
  }
}

async function emailsDosAdministradores(s){
  var membros = await membrosDoTime(s.teams, TEAM_ADMINS_ID);
  return membros.filter(function(m){ return m.confirm; }).map(function(m){ return m.userEmail; });
}

// ---------- ações ----------

// O município já existe: em vez de recusar sem saída, registra um PEDIDO DE ACESSO para o administrador
// decidir (aprovar coloca a pessoa no time do município, respeitando o limite de usuários). A própria
// pessoa lê o pedido (permissão por linha), para o painel mostrar em que pé ele está.
async function solicitarAcesso(s, userId, mun){
  if (mun.team_id && await ehMembroConfirmado(s.teams, mun.team_id, userId)) falhar('Você já tem acesso a ' + mun.nome + '/' + mun.uf + '.');
  var u = await s.users.get({ userId: userId });
  var rotulo = mun.nome + '/' + mun.uf;
  var abertas = await s.db.listRows({ databaseId: DATABASE_ID, tableId: 'solicitacoes_acesso', queries: [Query.equal('user_id', userId), Query.equal('municipio_id', mun.$id), Query.equal('status', 'pendente'), Query.limit(1)] });
  if (abertas.rows.length) return { ok: true, solicitacao: true, municipio_nome: rotulo, jaExistia: true };
  await s.db.createRow({
    databaseId: DATABASE_ID, tableId: 'solicitacoes_acesso', rowId: ID.unique(),
    data: { user_id: userId, usuario_nome: u.name || null, usuario_email: u.email || null, municipio_id: mun.$id, municipio_nome: rotulo, status: 'pendente' },
    permissions: [ Permission.read(Role.user(userId)) ]
  });
  var email = await enviarEmail(s, await emailsDosAdministradores(s), 'Pedido de acesso a ' + rotulo,
    corpoEmail('Pedido de acesso a município já cadastrado', [
      esc(u.name || '—') + ' (' + esc(u.email || '—') + ') pediu acesso a <b>' + esc(rotulo) + '</b>.',
      'Confira se a pessoa representa o município e decida no painel de administração (Solicitações de acesso).'
    ]));
  return { ok: true, solicitacao: true, municipio_nome: rotulo, email: email };
}

// Decisão do administrador sobre um pedido de acesso.
async function adminDecidirSolicitacao(s, adminId, c){
  var sol;
  try { sol = await s.db.getRow({ databaseId: DATABASE_ID, tableId: 'solicitacoes_acesso', rowId: String(c.id) }); } catch (e) { falhar('Pedido não encontrado.'); }
  if (sol.status !== 'pendente') falhar('Este pedido já foi decidido (' + sol.status + ').');
  var admin = await s.users.get({ userId: adminId });
  var aprovar = c.aprovar === true;
  if (aprovar){
    var mun;
    try { mun = await s.db.getRow({ databaseId: DATABASE_ID, tableId: 'municipios', rowId: sol.municipio_id }); } catch (e) { falhar('Município não encontrado.'); }
    if (!mun.team_id) falhar('O município não tem time associado.');
    var atuais = await membrosDoTime(s.teams, mun.team_id);
    if (atuais.some(function(m){ return m.userId === sol.user_id; })) falhar('Esta pessoa já faz parte do município.');
    if (atuais.length >= MAX_USUARIOS_POR_MUNICIPIO) falhar('O município já tem ' + MAX_USUARIOS_POR_MUNICIPIO + ' usuários, que é o limite. Remova um usuário antes de aprovar.');
    await s.teams.createMembership({ teamId: mun.team_id, roles: ['member'], userId: sol.user_id });
  }
  await s.db.updateRow({ databaseId: DATABASE_ID, tableId: 'solicitacoes_acesso', rowId: sol.$id,
    data: { status: aprovar ? 'aprovada' : 'recusada', decidido_por: admin.email, decidido_em: new Date().toISOString() },
    permissions: [ Permission.read(Role.user(sol.user_id)) ] });
  var email = await enviarEmail(s, [sol.usuario_email], 'ApuraPASEP: pedido de acesso ' + (aprovar ? 'aprovado' : 'não aprovado'),
    corpoEmail(aprovar ? 'Acesso aprovado' : 'Pedido de acesso não aprovado', [aprovar
      ? 'Seu pedido de acesso a <b>' + esc(sol.municipio_nome) + '</b> foi aprovado. Entre no ApuraPASEP com seu e-mail e senha.'
      : 'Seu pedido de acesso a <b>' + esc(sol.municipio_nome) + '</b> não foi aprovado. Em caso de dúvida, fale com o administrador da plataforma.']));
  return { ok: true, status: aprovar ? 'aprovada' : 'recusada', email: email };
}

async function registrarMunicipio(s, userId, c){
  var nome = String(c.nome || '').trim(), uf = String(c.uf || '').trim().toUpperCase();
  var sistema = c.sistema_gestao;
  if (nome.length < 2 || nome.length > 120) falhar('Informe o nome do município.');
  if (UFS.indexOf(uf) < 0) falhar('UF inválida.');
  if (['fiorilli', 'gemmap'].indexOf(sistema) < 0) falhar('Sistema de gestão inválido.');
  if (!c.teamId) falhar('Time do município não informado.');

  var time = await s.teams.get({ teamId: c.teamId });
  if (c.teamId === TEAM_ADMINS_ID) falhar('Time inválido.');
  if (!(await ehMembroConfirmado(s.teams, c.teamId, userId))) falhar('Você não participa do time informado.');
  if (norm(time.name) !== norm(nome + '/' + uf)) falhar('O nome do time não confere com o município informado.');

  // Idempotente: se já existe linha para este time, devolve a existente.
  var porTime = await s.db.listRows({ databaseId: DATABASE_ID, tableId: 'municipios', queries: [Query.equal('team_id', c.teamId), Query.limit(1)] });
  if (porTime.rows.length) return { ok: true, municipio_id: porTime.rows[0].$id, jaExistia: true };

  // Duplicidade: mesmo município e UF já cadastrado por outro time (comparação sem acentos e caixa).
  var mesmos = await todasAsLinhas(s.db, 'municipios', [Query.equal('uf', uf)]);
  var existente = mesmos.filter(function(m){ return norm(m.nome) === norm(nome); })[0];
  if (existente) return await solicitarAcesso(s, userId, existente);

  // Vincula o código do TCESP pelo nome do município, se a tabela tiver e nenhum outro município usar o código.
  var codigoTce = (uf === 'SP' && CODIGO_TCE_POR_NOME[norm(nome)]) || null;
  if (codigoTce && mesmos.some(function(m){ return String(m.codigo_tce || '') === codigoTce; })) codigoTce = null;

  var u = await s.users.get({ userId: userId });
  var linha = await s.db.createRow({
    databaseId: DATABASE_ID, tableId: 'municipios', rowId: ID.unique(),
    data: {
      nome: nome, uf: uf, sistema_gestao: sistema, status: 'pendente', team_id: c.teamId, codigo_tce: codigoTce,
      responsavel_nome: String(c.responsavel_nome || u.name || '').slice(0, 200) || null,
      responsavel_email: u.email || null
    },
    permissions: [ Permission.read(Role.team(c.teamId)) ]
  });

  var email = await enviarEmail(s, await emailsDosAdministradores(s), 'Novo cadastro aguardando aprovação: ' + nome + '/' + uf,
    corpoEmail('Novo cadastro aguardando aprovação', [
      'O município <b>' + esc(nome) + '/' + esc(uf) + '</b> solicitou acesso ao ApuraPASEP.',
      'Responsável: ' + esc(linha.responsavel_nome || '—') + ' (' + esc(linha.responsavel_email || '—') + ').',
      'Confira os dados no painel de administração antes de aprovar.'
    ]));
  return { ok: true, municipio_id: linha.$id, codigo_tce: codigoTce, email: email };
}

async function salvarApuracao(s, userId, c){
  var mes = Number(c.competencia_mes), ano = Number(c.competencia_ano);
  if (!(mes >= 1 && mes <= 12) || !(ano >= 2020 && ano <= 2100)) falhar('Competência inválida.');
  if (['pendente', 'concluida'].indexOf(c.status) < 0) falhar('Situação da apuração inválida.');
  var num = {};
  ['receita_corrente', 'receita_capital', 'base_calculo', 'pasep_retido', 'valor_pagar'].forEach(function(k){
    var v = Number(c[k]);
    if (!isFinite(v)) falhar('Valor inválido em ' + k + '.');
    num[k] = v;
  });
  if (c.detalhamento != null && (typeof c.detalhamento !== 'string' || c.detalhamento.length > 15000000)) falhar('Detalhamento inválido.');

  var m;
  try { m = await s.db.getRow({ databaseId: DATABASE_ID, tableId: 'municipios', rowId: String(c.municipio_id) }); }
  catch (e) { falhar('Município não encontrado.'); }
  var admin = await ehMembroConfirmado(s.teams, TEAM_ADMINS_ID, userId);
  if (!admin && !(m.team_id && await ehMembroConfirmado(s.teams, m.team_id, userId))) falhar('Você não tem acesso a este município.');
  if (m.status !== 'ativo') falhar('O município não está ativo (situação: ' + m.status + '). A apuração não foi gravada.');
  var bloqueio = licencaBloqueia(m);
  if (bloqueio) falhar(bloqueio + ' A apuração não foi gravada.');

  var dados = Object.assign({
    municipio_id: m.$id, competencia_mes: mes, competencia_ano: ano,
    status: c.status, sistema_gestao_usado: m.sistema_gestao, detalhamento: c.detalhamento || null
  }, num);

  var existente = await s.db.listRows({ databaseId: DATABASE_ID, tableId: 'apuracoes', queries: [
    Query.equal('municipio_id', m.$id), Query.equal('competencia_mes', mes), Query.equal('competencia_ano', ano), Query.limit(1) ] });
  if (existente.rows.length){
    await s.db.updateRow({ databaseId: DATABASE_ID, tableId: 'apuracoes', rowId: existente.rows[0].$id, data: dados });
    return { ok: true, atualizada: true };
  }
  // O time lê e exclui; não altera valores depois de gravados (alterar é refazer a apuração).
  await s.db.createRow({ databaseId: DATABASE_ID, tableId: 'apuracoes', rowId: ID.unique(), data: dados,
    permissions: [ Permission.read(Role.team(m.team_id)), Permission.delete(Role.team(m.team_id)) ] });
  return { ok: true, atualizada: false };
}

async function registrarAcesso(s, userId){
  var vinculos = await s.users.listMemberships({ userId: userId });
  var u = null, agora = Date.now(), gravados = 0;
  for (var i = 0; i < vinculos.memberships.length; i++){
    var teamId = vinculos.memberships[i].teamId;
    if (teamId === TEAM_ADMINS_ID || !vinculos.memberships[i].confirm) continue;
    var r = await s.db.listRows({ databaseId: DATABASE_ID, tableId: 'municipios', queries: [Query.equal('team_id', teamId), Query.limit(1)] });
    var m = r.rows[0];
    if (!m) continue;
    if (m.ultimo_acesso && agora - new Date(m.ultimo_acesso).getTime() < UMA_HORA) continue;
    if (!u) u = await s.users.get({ userId: userId });
    await s.db.updateRow({ databaseId: DATABASE_ID, tableId: 'municipios', rowId: m.$id, data: { ultimo_acesso: new Date(agora).toISOString(), ultimo_acesso_email: u.email } });
    gravados++;
  }
  return { ok: true, gravados: gravados };
}

async function adminUsuarios(s){
  var municipios = await todasAsLinhas(s.db, 'municipios');
  var porUsuario = {};
  function obter(id, nome, email){ return porUsuario[id] || (porUsuario[id] = { id: id, nome: nome || '', email: email || '', municipios: [], admin: false }); }
  var admins = await membrosDoTime(s.teams, TEAM_ADMINS_ID);
  admins.forEach(function(m){ var x = obter(m.userId, m.userName, m.userEmail); x.admin = m.confirm; });
  for (var i = 0; i < municipios.length; i++){
    var m = municipios[i];
    if (!m.team_id) continue;
    var membros = [];
    try { membros = await membrosDoTime(s.teams, m.team_id); } catch (e) { /* time removido */ }
    membros.forEach(function(mb){
      obter(mb.userId, mb.userName, mb.userEmail).municipios.push({ id: m.$id, nome: m.nome, uf: m.uf, teamId: m.team_id, membershipId: mb.$id, papeis: mb.roles, confirmado: mb.confirm });
    });
  }
  // Dados de conta (último acesso, e-mail confirmado, criação) de todos os usuários.
  var contas = [], offset = 0;
  for (;;){
    var r = await s.users.list({ queries: [Query.limit(100), Query.offset(offset)] });
    contas = contas.concat(r.users);
    if (r.users.length < 100) break;
    offset += 100;
  }
  contas.forEach(function(u){
    var x = obter(u.$id, u.name, u.email);
    x.nome = u.name || x.nome; x.email = u.email || x.email;
    x.verificado = !!u.emailVerification; x.criadoEm = u.registration; x.ultimoAcesso = u.accessedAt || null; x.ativo = u.status !== false;
  });
  var lista = Object.keys(porUsuario).map(function(k){ return porUsuario[k]; });
  lista.sort(function(a, b){ return (a.email || '').localeCompare(b.email || ''); });
  return { ok: true, usuarios: lista };
}

function exigirTimeDeMunicipio(teamId){
  if (!teamId) falhar('Time não informado.');
  if (teamId === TEAM_ADMINS_ID) falhar('Esta ação não se aplica ao time de administradores.');
}

async function adminMembros(s, c){
  exigirTimeDeMunicipio(c.teamId);
  var membros = await membrosDoTime(s.teams, c.teamId);
  // Situação da conta de cada membro (conta suspensa não consegue entrar, em município nenhum).
  var contas = {};
  for (var i = 0; i < membros.length; i++){
    try { contas[membros[i].userId] = (await s.users.get({ userId: membros[i].userId })).status !== false; } catch (e) { contas[membros[i].userId] = true; }
  }
  return { ok: true, membros: membros.map(function(m){ return { id: m.$id, userId: m.userId, nome: m.userName, email: m.userEmail, papeis: m.roles, confirmado: m.confirm, entrou: m.joined, ativo: contas[m.userId] }; }) };
}

// Pelo servidor o Appwrite não envia e-mail de convite: a pessoa entra no time na hora. Por isso
// esta ação localiza (ou cria, com senha aleatória e e-mail marcado como verificado pelo
// administrador) a conta e a coloca no time. Quando a conta é nova ("contaCriada"), a página do
// administrador dispara o e-mail de definição de senha (account.createRecovery), que o próprio
// Appwrite envia. Quando a conta já existia, a pessoa só passa a ver o município.
async function adminConvidar(s, c){
  exigirTimeDeMunicipio(c.teamId);
  var email = String(c.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) falhar('E-mail inválido.');
  var papeis = (Array.isArray(c.papeis) ? c.papeis : []).filter(function(p){ return ['owner', 'member'].indexOf(p) >= 0; });
  if (!papeis.length) papeis = ['member'];
  await s.teams.get({ teamId: c.teamId });

  // O limite é checado antes de criar qualquer conta, para não deixar conta sem município.
  var atuais = await membrosDoTime(s.teams, c.teamId);
  if (atuais.length >= MAX_USUARIOS_POR_MUNICIPIO) falhar('Este município já tem ' + MAX_USUARIOS_POR_MUNICIPIO + ' usuários, que é o limite. Remova um usuário antes de adicionar outro.');

  var achados = await s.users.list({ queries: [Query.equal('email', email), Query.limit(1)] });
  var usuario = achados.users[0], contaCriada = false;
  if (usuario && atuais.some(function(m){ return m.userId === usuario.$id; })) falhar('Este usuário já faz parte do município.');
  if (!usuario){
    var senha = randomBytes(24).toString('base64url') + 'Aa1!';
    usuario = await s.users.create({ userId: ID.unique(), email: email, password: senha, name: String(c.nome || '').slice(0, 128) || undefined });
    await s.users.updateEmailVerification({ userId: usuario.$id, emailVerification: true });
    contaCriada = true;
  }
  await s.teams.createMembership({ teamId: c.teamId, roles: papeis, userId: usuario.$id });
  return { ok: true, contaCriada: contaCriada, userId: usuario.$id };
}

// Suspende (ou reativa) a conta de UM usuário, sem mexer no município nem nos demais usuários.
// A conta suspensa não entra mais no sistema; as sessões abertas são encerradas na hora.
// Não vale para administradores da plataforma nem para o próprio administrador que chama.
async function adminSuspenderUsuario(s, adminId, c){
  if (!c.userId) falhar('Usuário não informado.');
  if (c.userId === adminId) falhar('Você não pode suspender a sua própria conta.');
  if (await ehMembroConfirmado(s.teams, TEAM_ADMINS_ID, c.userId)) falhar('Administradores da plataforma não podem ser suspensos por aqui.');
  var alvo;
  try { alvo = await s.users.get({ userId: c.userId }); } catch (e) { falhar('Usuário não encontrado.'); }
  var suspender = c.suspender !== false;
  await s.users.updateStatus({ userId: c.userId, status: !suspender });
  if (suspender){ try { await s.users.deleteSessions({ userId: c.userId }); } catch (e) { /* sem sessões abertas */ } }
  return { ok: true, userId: c.userId, email: alvo.email, suspenso: suspender };
}

async function adminRemoverMembro(s, c){
  exigirTimeDeMunicipio(c.teamId);
  var membros = await membrosDoTime(s.teams, c.teamId);
  var alvo = membros.find(function(m){ return m.$id === c.membershipId; });
  if (!alvo) falhar('Membro não encontrado neste time.');
  var donos = membros.filter(function(m){ return m.confirm && m.roles.indexOf('owner') >= 0; });
  if (alvo.confirm && alvo.roles.indexOf('owner') >= 0 && donos.length <= 1 && membros.length > 1)
    falhar('Este é o único responsável do município. Torne outro membro responsável antes de remover.');
  await s.teams.deleteMembership({ teamId: c.teamId, membershipId: c.membershipId });
  return { ok: true };
}

async function adminDefinirPapel(s, c){
  exigirTimeDeMunicipio(c.teamId);
  var papeis = (c.papeis || []).filter(function(p){ return ['owner', 'member'].indexOf(p) >= 0; });
  if (!papeis.length) falhar('Papel inválido.');
  await s.teams.updateMembership({ teamId: c.teamId, membershipId: c.membershipId, roles: papeis });
  // "Responsável" aparece em dois lugares: o papel no time (owner) e os campos responsavel_* do município,
  // que o painel de administração mostra. Ao tornar alguém responsável, os dois passam a dizer a mesma coisa.
  var sincronizado = false;
  if (papeis.indexOf('owner') >= 0){
    var membro = (await membrosDoTime(s.teams, c.teamId)).filter(function(m){ return m.$id === c.membershipId; })[0];
    var linhas = await s.db.listRows({ databaseId: DATABASE_ID, tableId: 'municipios', queries: [Query.equal('team_id', c.teamId), Query.limit(1)] });
    if (membro && linhas.rows[0]){
      await s.db.updateRow({ databaseId: DATABASE_ID, tableId: 'municipios', rowId: linhas.rows[0].$id,
        data: { responsavel_nome: membro.userName || null, responsavel_email: membro.userEmail || null } });
      sincronizado = true;
    }
  }
  return { ok: true, responsavelAtualizado: sincronizado };
}

async function adminNotificar(s, c){
  var m;
  try { m = await s.db.getRow({ databaseId: DATABASE_ID, tableId: 'municipios', rowId: String(c.municipio_id) }); }
  catch (e) { falhar('Município não encontrado.'); }
  var textos = {
    aprovado: ['Cadastro aprovado', ['O cadastro de <b>' + esc(m.nome) + '/' + esc(m.uf) + '</b> foi aprovado.', 'Você já pode entrar no ApuraPASEP com seu e-mail e senha e importar o XML AUDESP para apurar o PASEP.']],
    suspenso: ['Acesso suspenso', ['O acesso de <b>' + esc(m.nome) + '/' + esc(m.uf) + '</b> ao ApuraPASEP foi suspenso.', 'Para entender o motivo ou regularizar, fale com o administrador da plataforma.']],
    reativado: ['Acesso reativado', ['O acesso de <b>' + esc(m.nome) + '/' + esc(m.uf) + '</b> ao ApuraPASEP foi reativado.']]
  };
  var t = textos[c.resultado];
  if (!t) falhar('Resultado inválido.');
  var destinos = [m.responsavel_email];
  if (m.team_id){
    try { (await membrosDoTime(s.teams, m.team_id)).forEach(function(x){ if (x.confirm && x.roles.indexOf('owner') >= 0) destinos.push(x.userEmail); }); } catch (e) { /* ignora */ }
  }
  var email = await enviarEmail(s, destinos, 'ApuraPASEP: ' + t[0].toLowerCase() + ' (' + m.nome + '/' + m.uf + ')', corpoEmail(t[0], t[1]));
  return { ok: true, email: email };
}

// ---------- execução agendada ----------

async function avisosAgendados(s, log){
  var municipios = await todasAsLinhas(s.db, 'municipios');
  var agora = new Date();
  var hoje = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  hoje.setHours(0, 0, 0, 0);
  var enviados = 0, pendentes = [];
  for (var i = 0; i < municipios.length; i++){
    var m = municipios[i];
    if (m.status === 'pendente' && m.$createdAt && agora - new Date(m.$createdAt) > 2 * 24 * UMA_HORA) pendentes.push(m);
    if (m.status !== 'ativo' || !m.licenca_validade || m.licenca_status === 'suspensa') continue;
    var val = new Date(new Date(m.licenca_validade).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    val.setHours(0, 0, 0, 0);
    var dias = Math.round((val - hoje) / (24 * UMA_HORA));
    var assunto = null, frases = null;
    if (dias === 30 || dias === 7 || dias === 1){
      assunto = 'A licença de ' + m.nome + '/' + m.uf + ' vence em ' + dias + (dias === 1 ? ' dia' : ' dias');
      frases = ['A licença do ApuraPASEP de <b>' + esc(m.nome) + '/' + esc(m.uf) + '</b> vence em <b>' + dias + (dias === 1 ? ' dia' : ' dias') + '</b> (' + val.toLocaleDateString('pt-BR') + ').', 'Para renovar, fale com o administrador da plataforma antes do vencimento, para não interromper as apurações.'];
    } else if (dias === -1){
      assunto = 'A licença de ' + m.nome + '/' + m.uf + ' venceu';
      frases = ['A licença do ApuraPASEP de <b>' + esc(m.nome) + '/' + esc(m.uf) + '</b> venceu em ' + val.toLocaleDateString('pt-BR') + ' e o acesso às apurações foi bloqueado.', 'Fale com o administrador da plataforma para renovar.'];
    }
    if (!assunto) continue;
    var destinos = [m.responsavel_email];
    if (m.team_id){ try { (await membrosDoTime(s.teams, m.team_id)).forEach(function(x){ if (x.confirm && x.roles.indexOf('owner') >= 0) destinos.push(x.userEmail); }); } catch (e) { /* ignora */ } }
    var r = await enviarEmail(s, destinos, 'ApuraPASEP: ' + assunto, corpoEmail(assunto, frases));
    if (r.enviado) enviados++; else log('Aviso de licença não enviado (' + m.nome + '): ' + r.motivo);
  }
  if (pendentes.length){
    var r2 = await enviarEmail(s, await emailsDosAdministradores(s), 'ApuraPASEP: ' + pendentes.length + ' cadastro(s) aguardando aprovação há mais de 2 dias',
      corpoEmail('Cadastros aguardando aprovação', [pendentes.map(function(m){ return esc(m.nome) + '/' + esc(m.uf); }).join(', ') + '.']));
    if (!r2.enviado) log('Lembrete de pendentes não enviado: ' + r2.motivo);
  }
  return { ok: true, avisosEnviados: enviados, pendentes: pendentes.length };
}

// ---------- entrada ----------

export default async ({ req, res, log, error }) => {
  var s = servicos(req);
  var userId = req.headers['x-appwrite-user-id'];

  try {
    if (!userId && req.headers['x-appwrite-trigger'] === 'schedule') return res.json(await avisosAgendados(s, log));
    if (!userId) return res.json({ ok: false, erro: 'Faça login para continuar.' }, 401);

    var c;
    try { c = req.bodyJson || JSON.parse(req.body || '{}'); } catch (e) { return res.json({ ok: false, erro: 'Corpo da requisição inválido.' }, 400); }

    switch (c.acao){
      case 'registrar_municipio':  return res.json(await registrarMunicipio(s, userId, c));
      case 'salvar_apuracao':      return res.json(await salvarApuracao(s, userId, c));
      case 'registrar_acesso':     return res.json(await registrarAcesso(s, userId));
    }
    if (String(c.acao).indexOf('admin_') === 0){
      await exigirAdmin(s, userId);
      switch (c.acao){
        case 'admin_usuarios':        return res.json(await adminUsuarios(s));
        case 'admin_membros':         return res.json(await adminMembros(s, c));
        case 'admin_convidar':        return res.json(await adminConvidar(s, c));
        case 'admin_remover_membro':  return res.json(await adminRemoverMembro(s, c));
        case 'admin_suspender_usuario': return res.json(await adminSuspenderUsuario(s, userId, c));
        case 'admin_definir_papel':   return res.json(await adminDefinirPapel(s, c));
        case 'admin_notificar':       return res.json(await adminNotificar(s, c));
        case 'admin_decidir_solicitacao': return res.json(await adminDecidirSolicitacao(s, userId, c));
      }
    }
    return res.json({ ok: false, erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    if (e instanceof ErroNegocio) return res.json({ ok: false, erro: e.message });
    error('Erro inesperado: ' + (e && e.message));
    return res.json({ ok: false, erro: 'Erro inesperado no servidor. Tente novamente em instantes.' }, 500);
  }
};

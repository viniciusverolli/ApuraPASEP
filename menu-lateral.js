// ============================================================
// ApuraPASEP — menu lateral compartilhado
// Um único componente para todas as páginas do sistema (painel, ferramenta de apuração,
// repositório de normas e telas de administração). Antes, cada página trazia sua própria
// cópia do menu, e elas foram divergindo (o repositório de normas ficou sem menu e com o
// logotipo sem link).
//
// O que ele monta:
//   - menu lateral fixo no computador e gaveta com botão de menu no celular;
//   - mostrador da licença do município do usuário (plano, validade, dias restantes);
//   - identificação do usuário e botão Sair;
//   - grupo "Administração", visível só para quem está no time plataforma-admins;
//   - o botão "Voltar ao painel", em todo elemento <div data-voltar-painel></div> da página.
//
// Como usar numa página:
//   1. logo depois de <body>:  <script src="menu-lateral.js"></script>
//      (atributo data-quebra="1150" muda a largura em que o menu vira gaveta; padrão 880)
//   2. carregar o SDK do Appwrite (o script só busca dados depois que a página carrega);
//   3. opcional: <div id="ml-extra-origem" hidden> ... </div> — o conteúdo é movido para
//      dentro do menu, abaixo da navegação (usado pela ferramenta de apuração).
//
// Para páginas públicas que só precisam do botão (termos, política de privacidade):
//   <script src="menu-lateral.js" data-modo="voltar"></script> no fim do body. Nesse modo o
//   botão só aparece quando há usuário conectado.
//
// A licença é lida da tabela "licencas" (legível pelo time do município). Toda a lógica aqui
// é de exibição: as regras de bloqueio por status e vencimento continuam nas páginas.
// ============================================================
(function(){
  var script = document.currentScript;
  var MODO = (script && script.getAttribute('data-modo')) || 'menu';
  var QUEBRA = parseInt((script && script.getAttribute('data-quebra')) || '880', 10);

  var APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
  var APPWRITE_PROJECT_ID = '6ab3fac90005f026ddb1';
  var DATABASE_ID = 'apurapasep';
  var TEAM_ADMINS_ID = '6ab476f0000e158fa770';

  var LOGO =
    '<svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex:none">' +
    '<rect x="32" y="9" width="52" height="66" rx="9" fill="none" stroke="#2E7D6B" stroke-width="7"/>' +
    '<rect x="16" y="25" width="52" height="66" rx="9" fill="#23262B" stroke="#F2F0EA" stroke-width="7"/>' +
    '<path d="M 25 61 L 38 73 L 60 43" stroke="#F2F0EA" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  var NAV = [
    { href: 'painel.html', txt: 'Painel' },
    { href: 'PASEP_teste_jspdf.html', txt: 'Nova apuração', apuracao: true },
    { href: 'painel.html#historico', txt: 'Histórico' },
    { href: 'PASEP_teste_jspdf.html', txt: 'Importar XML / balancete', apuracao: true },
    { href: 'repositorio_pasep_cosit.html', txt: 'Repositório de normas' },
    { href: null, txt: 'Configurações', embreve: true }
  ];
  var NAV_ADMIN = [
    { href: 'admin.html', txt: 'Clientes e licenças' },
    { href: 'admin-apuracoes.html', txt: 'Apurações por município' },
    { href: 'admin-regras.html', txt: 'Regras de cálculo' }
  ];

  var CSS =
    '.ml-voltar{ display:inline-flex; align-items:center; gap:7px; font:inherit; font-size:13px; font-weight:600; color:#172033; text-decoration:none; padding:8px 14px; border-radius:10px; background:rgba(255,255,255,.75); border:1px solid #cbd5e1; margin:0 0 18px; }' +
    '.ml-voltar:hover{ background:#fff; border-color:#218b78; color:#218b78; }' +
    '.ml-voltar.escuro{ color:#EFE9D8; background:rgba(255,255,255,.08); border-color:rgba(239,233,216,.35); margin:0 0 12px; }' +
    '.ml-voltar.escuro:hover{ background:rgba(255,255,255,.16); color:#fff; border-color:#5eead4; }' +
    '.ml-voltar:focus-visible{ outline:2px solid #218b78; outline-offset:2px; }';

  if (MODO === 'menu'){
    CSS +=
    '.ml-side{ background:rgba(21,27,42,.97); color:#EFE9D8; padding:24px 18px 18px; display:flex; flex-direction:column; width:250px; font-family:Inter,sans-serif; }' +
    '.ml-side *{ box-sizing:border-box; }' +
    '.ml-brand{ display:flex; align-items:center; gap:10px; margin:0 0 28px; text-decoration:none; color:inherit; }' +
    '.ml-brand .t{ font-size:16px; font-weight:800; letter-spacing:-.02em; }' +
    '.ml-brand .t span{ color:#5eead4; }' +
    '.ml-fechar{ background:none; border:none; color:#F2F0EA; font-size:22px; align-self:flex-end; cursor:pointer; margin:-6px -4px 10px 0; padding:6px; display:none; }' +
    '.ml-nav{ display:flex; flex-direction:column; gap:2px; }' +
    '.ml-nav a, .ml-nav .ml-desativado{ display:flex; align-items:center; gap:10px; color:#94a3b8; text-decoration:none; font-size:14px; padding:10px 12px; border-radius:10px; }' +
    '.ml-nav a .dot, .ml-nav .ml-desativado .dot{ width:5px; height:5px; border-radius:50%; background:transparent; flex:none; }' +
    '.ml-nav a.ativo{ background:rgba(255,255,255,.08); color:#F2F0EA; }' +
    '.ml-nav a.ativo .dot{ background:#5eead4; }' +
    '.ml-nav a:hover{ color:#F2F0EA; }' +
    '.ml-nav .ml-desativado{ opacity:.55; cursor:default; }' +
    '.ml-nav .ml-embreve{ font-size:10.5px; border:1px solid rgba(148,163,184,.5); border-radius:20px; padding:1px 7px; margin-left:auto; }' +
    '.ml-tag-admin{ font-size:10.5px; font-weight:700; letter-spacing:.12em; color:#5eead4; margin:18px 12px 6px; }' +
    '.ml-extra{ margin-top:14px; }' +
    '.ml-extra .who{ border-top:1px solid rgba(233,225,197,.18); padding-top:14px; font-size:12.5px; color:#B9B29B; line-height:1.6; }' +
    '.ml-extra .who input{ background:transparent; border:none; border-bottom:1px dashed rgba(233,225,197,.4); color:#EFE9D8; font:inherit; font-size:13.5px; font-weight:600; width:100%; padding:2px 0 4px; }' +
    '.ml-extra .who input::placeholder{ color:#8b856d; font-weight:400; }' +
    '.ml-extra .who input:focus{ outline:none; border-color:#5eead4; }' +
    '.ml-extra .rule{ font-size:11.5px; color:#8b856d; line-height:1.6; margin-top:12px; }' +
    '.ml-extra .status-api{ padding-top:14px; margin-top:14px; border-top:1px solid rgba(233,225,197,.18); display:flex; align-items:center; gap:8px; font-size:12px; color:#B9B29B; }' +
    '.ml-extra .status-dot{ width:7px; height:7px; border-radius:50%; background:#8b856d; flex:none; }' +
    '.ml-extra .status-dot.verificando{ background:#218b78; animation:ml-pulso 1.1s ease-in-out infinite; }' +
    '.ml-extra .status-dot.conectado{ background:#4CAF7D; }' +
    '.ml-extra .status-dot.falhou{ background:#b91c1c; }' +
    '@keyframes ml-pulso{ 0%,100%{opacity:1} 50%{opacity:.35} }' +
    '.ml-espaco{ flex:1; min-height:18px; }' +
    '.ml-licenca{ margin-top:18px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:12px 13px; font-size:12.5px; line-height:1.5; color:#cbd5e1; }' +
    '.ml-licenca .ml-lic-topo{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }' +
    '.ml-licenca .ml-lic-rotulo{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; }' +
    '.ml-licenca .ml-lic-chip{ font-size:11px; font-weight:600; padding:2px 9px; border-radius:20px; white-space:nowrap; }' +
    '.ml-licenca .ml-lic-plano{ font-size:14px; font-weight:700; color:#F2F0EA; }' +
    '.ml-licenca .ml-lic-linha{ color:#94a3b8; margin-top:2px; }' +
    '.ml-licenca .ml-lic-dias{ font-weight:600; margin-top:6px; }' +
    '.ml-licenca .ml-lic-barra{ height:5px; border-radius:5px; background:rgba(255,255,255,.12); margin-top:8px; overflow:hidden; }' +
    '.ml-licenca .ml-lic-barra i{ display:block; height:100%; border-radius:5px; }' +
    '.ml-licenca.ok .ml-lic-chip{ background:rgba(74,222,128,.16); color:#86efac; } .ml-licenca.ok .ml-lic-dias{ color:#86efac; } .ml-licenca.ok .ml-lic-barra i{ background:#4ade80; }' +
    '.ml-licenca.atencao .ml-lic-chip{ background:rgba(251,191,36,.16); color:#fcd34d; } .ml-licenca.atencao .ml-lic-dias{ color:#fcd34d; } .ml-licenca.atencao .ml-lic-barra i{ background:#fbbf24; }' +
    '.ml-licenca.critico .ml-lic-chip{ background:rgba(248,113,113,.18); color:#fca5a5; } .ml-licenca.critico .ml-lic-dias{ color:#fca5a5; } .ml-licenca.critico .ml-lic-barra i{ background:#f87171; }' +
    '.ml-licenca.neutro .ml-lic-chip{ background:rgba(148,163,184,.18); color:#cbd5e1; }' +
    '.ml-quem{ border-top:1px solid rgba(233,225,197,.14); margin-top:14px; padding-top:14px; font-size:12.5px; color:#9BA3A6; line-height:1.6; word-break:break-word; }' +
    '.ml-quem strong{ color:#EFE9D8; display:block; font-size:13.5px; }' +
    '.ml-sair{ color:#8b9498; font-size:12px; text-decoration:none; margin-top:8px; display:inline-block; }' +
    '.ml-sair:hover{ color:#EFE9D8; }' +
    '.ml-side a:focus-visible, .ml-side button:focus-visible{ outline:2px solid #5eead4; outline-offset:2px; }' +
    '.ml-topbar, .ml-backdrop{ display:none; }' +
    '@media (min-width:' + (QUEBRA + 1) + 'px){' +
      '.ml-side{ position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:30; }' +
      'body.ml-com-menu{ padding-left:250px; }' +
    '}' +
    '@media (max-width:' + QUEBRA + 'px){' +
      '.ml-topbar{ display:flex; align-items:center; justify-content:space-between; background:rgba(21,27,42,.97); color:#F2F0EA; padding:12px 16px; position:sticky; top:0; z-index:20; width:100%; flex:none; font-family:Inter,sans-serif; }' +
      '.ml-topbar .ml-marca{ display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px; letter-spacing:-.02em; text-decoration:none; color:inherit; }' +
      '.ml-topbar .ml-marca .t span{ color:#5eead4; }' +
      '.ml-topbar .ml-btn-menu{ background:none; border:1px solid rgba(242,240,234,.3); border-radius:8px; color:#F2F0EA; width:38px; height:38px; display:flex; align-items:center; justify-content:center; cursor:pointer; }' +
      '.ml-side{ position:fixed; top:0; left:0; height:100%; width:82%; max-width:300px; z-index:60; overflow-y:auto; transform:translateX(-100%); transition:transform .2s ease; box-shadow:2px 0 18px rgba(0,0,0,.25); visibility:hidden; }' +
      '.ml-side.aberto{ transform:translateX(0); visibility:visible; }' +
      '.ml-fechar{ display:block; }' +
      '.ml-backdrop{ display:block; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:50; opacity:0; pointer-events:none; transition:opacity .2s ease; }' +
      '.ml-backdrop.aberto{ opacity:1; pointer-events:auto; }' +
    '}';
  }

  function css(){
    var s = document.createElement('style');
    s.id = 'ml-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function arquivoAtual(){
    return (window.location.pathname.split('/').pop() || 'index.html');
  }
  function dataBr(d){ return d.toLocaleDateString('pt-BR'); }

  // ---------- Botão "Voltar ao painel" ----------
  function preencherBotoesVoltar(){
    var alvos = document.querySelectorAll('[data-voltar-painel]');
    alvos.forEach(function(el){
      var escuro = el.getAttribute('data-voltar-painel') === 'escuro';
      el.innerHTML = '<a class="ml-voltar' + (escuro ? ' escuro' : '') + '" href="painel.html">&larr; Voltar ao painel</a>';
    });
    return alvos;
  }

  // ---------- Menu (só no modo "menu") ----------
  var el = {};

  function linhaNav(item, jaAtivo){
    if (!item.href){
      return '<span class="ml-desativado" aria-disabled="true"><span class="dot" aria-hidden="true"></span> ' + esc(item.txt) +
        '<span class="ml-embreve">em breve</span></span>';
    }
    var base = item.href.split('#')[0];
    var ativo = !jaAtivo.feito && base === arquivoAtual();
    if (ativo) jaAtivo.feito = true;
    return '<a href="' + esc(item.href) + '"' + (ativo ? ' class="ativo" aria-current="page"' : '') + (item.apuracao ? ' data-apuracao' : '') + '>' +
      '<span class="dot" aria-hidden="true"></span> ' + esc(item.txt) + '</a>';
  }

  function montarMenu(){
    var jaAtivo = { feito: false };
    var nav = NAV.map(function(i){ return linhaNav(i, jaAtivo); }).join('');
    var admin = NAV_ADMIN.map(function(i){ return linhaNav(i, jaAtivo); }).join('');

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="ml-topbar">' +
        '<a href="painel.html" class="ml-marca" aria-label="ApuraPASEP, ir para o painel">' + LOGO.replace(/width="28" height="28"/, 'width="20" height="20"') + '<div class="t">Apura<span>PASEP</span></div></a>' +
        '<button type="button" class="ml-btn-menu" id="mlAbrir" aria-label="Abrir menu" aria-expanded="false" aria-controls="menuLateral">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="ml-backdrop" id="mlBackdrop"></div>' +
      '<aside class="ml-side" id="menuLateral" aria-label="Menu principal">' +
        '<button type="button" class="ml-fechar" id="mlFechar" aria-label="Fechar menu">&#10005;</button>' +
        '<a href="painel.html" class="ml-brand" aria-label="ApuraPASEP, ir para o painel">' + LOGO + '<div class="t">Apura<span>PASEP</span></div></a>' +
        '<nav class="ml-nav" aria-label="Navegação principal">' + nav +
          '<div id="mlAdmin" style="display:none"><div class="ml-tag-admin">ADMINISTRAÇÃO</div>' + admin + '</div>' +
        '</nav>' +
        '<div class="ml-licenca neutro" id="mlLicenca" aria-live="polite"><div class="ml-lic-rotulo">Licença</div><div class="ml-lic-linha">Carregando…</div></div>' +
        '<div class="ml-extra" id="mlExtra"></div>' +
        '<div class="ml-espaco"></div>' +
        '<div class="ml-quem" id="mlQuem"><strong>Carregando…</strong></div>' +
        '<a class="ml-sair" href="#" id="mlSair">Sair</a>' +
      '</aside>';

    var primeiro = document.body.firstChild;
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, primeiro);
    document.body.classList.add('ml-com-menu');

    el.menu = document.getElementById('menuLateral');
    el.backdrop = document.getElementById('mlBackdrop');
    el.abrir = document.getElementById('mlAbrir');

    function abrir(){ el.menu.classList.add('aberto'); el.backdrop.classList.add('aberto'); el.abrir.setAttribute('aria-expanded', 'true'); }
    function fechar(){ el.menu.classList.remove('aberto'); el.backdrop.classList.remove('aberto'); el.abrir.setAttribute('aria-expanded', 'false'); }
    el.abrir.addEventListener('click', abrir);
    document.getElementById('mlFechar').addEventListener('click', fechar);
    el.backdrop.addEventListener('click', fechar);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') fechar(); });
    el.menu.querySelectorAll('.ml-nav a').forEach(function(a){ a.addEventListener('click', fechar); });
  }

  // ---------- Mostrador da licença ----------
  function desenharLicenca(classe, rotulo, chip, corpoHtml, pctRestante){
    var box = document.getElementById('mlLicenca');
    if (!box) return;
    box.className = 'ml-licenca ' + classe;
    box.innerHTML =
      '<div class="ml-lic-topo"><span class="ml-lic-rotulo">' + esc(rotulo) + '</span>' + (chip ? '<span class="ml-lic-chip">' + esc(chip) + '</span>' : '') + '</div>' +
      corpoHtml +
      (pctRestante != null ? '<div class="ml-lic-barra" role="presentation"><i style="width:' + Math.max(3, Math.min(100, Math.round(pctRestante))) + '%"></i></div>' : '');
  }

  var ROTULO_PLANO = { trial: 'Período de teste', mensal: 'Plano mensal', anual: 'Plano anual' };

  function mostrarLicenca(lic, municipio){
    if (municipio && municipio.status === 'pendente'){
      desenharLicenca('atencao', 'Licença', 'Em análise',
        '<div class="ml-lic-plano">Cadastro em análise</div><div class="ml-lic-linha">A licença é liberada com a aprovação do administrador.</div>');
      return;
    }
    if (municipio && municipio.status === 'suspenso'){
      desenharLicenca('critico', 'Licença', 'Suspenso',
        '<div class="ml-lic-plano">Acesso suspenso</div><div class="ml-lic-linha">Fale com o administrador da plataforma.</div>');
      return;
    }
    if (!lic){
      desenharLicenca('neutro', 'Licença', null,
        '<div class="ml-lic-plano">Sem licença registrada</div><div class="ml-lic-linha">Nenhuma licença cadastrada para este município.</div>');
      return;
    }

    var plano = ROTULO_PLANO[lic.plano] || 'Licença';
    var validade = lic.data_validade ? new Date(lic.data_validade) : null;
    if (!validade || isNaN(validade.getTime())){
      desenharLicenca('neutro', 'Licença', lic.status === 'suspensa' ? 'Suspensa' : 'Ativa',
        '<div class="ml-lic-plano">' + esc(plano) + '</div><div class="ml-lic-linha">Sem data de validade definida.</div>');
      return;
    }

    var agora = new Date();
    var dias = Math.ceil((validade - agora) / 864e5);
    var vencida = validade < agora;
    var classe, chip, textoDias;

    if (lic.status === 'suspensa'){
      classe = 'critico'; chip = 'Suspensa'; textoDias = 'Licença suspensa';
    } else if (vencida || lic.status === 'expirada'){
      var atraso = Math.max(1, Math.floor((agora - validade) / 864e5));
      classe = 'critico'; chip = 'Vencida';
      textoDias = 'Venceu ' + (atraso <= 1 ? 'há 1 dia' : 'há ' + atraso + ' dias');
    } else if (dias <= 7){
      classe = 'critico'; chip = 'Vence em breve';
      textoDias = dias <= 0 ? 'Vence hoje' : dias === 1 ? '1 dia restante' : dias + ' dias restantes';
    } else if (dias <= 30){
      classe = 'atencao'; chip = lic.plano === 'trial' ? 'Teste' : 'Ativa';
      textoDias = dias + ' dias restantes';
    } else {
      classe = 'ok'; chip = lic.plano === 'trial' ? 'Teste' : 'Ativa';
      textoDias = dias + ' dias restantes';
    }

    var pct = null;
    var inicio = lic.data_inicio ? new Date(lic.data_inicio) : null;
    if (inicio && !isNaN(inicio.getTime()) && validade > inicio){
      pct = vencida ? 0 : ((validade - agora) / (validade - inicio)) * 100;
    }

    desenharLicenca(classe, 'Licença', chip,
      '<div class="ml-lic-plano">' + esc(plano) + '</div>' +
      '<div class="ml-lic-linha">' + (vencida ? 'Venceu em ' : 'Válida até ') + esc(dataBr(validade)) + '</div>' +
      '<div class="ml-lic-dias">' + esc(textoDias) + '</div>',
      pct);
  }

  // ---------- Dados do usuário, município e licença ----------
  async function carregarDados(mostrarMenu){
    if (!window.Appwrite){
      if (mostrarMenu) desenharLicenca('neutro', 'Licença', null, '<div class="ml-lic-linha">Não foi possível carregar os dados da licença.</div>');
      return;
    }
    var client = new Appwrite.Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
    var account = new Appwrite.Account(client);
    var teams = new Appwrite.Teams(client);
    var tablesDB = new Appwrite.TablesDB(client);
    var Query = Appwrite.Query;

    var usuario;
    try { usuario = await account.get(); } catch (e) { usuario = null; }

    if (!mostrarMenu){
      // Modo "voltar": o botão só faz sentido para quem está conectado.
      document.querySelectorAll('[data-voltar-painel]').forEach(function(d){ d.style.display = usuario ? '' : 'none'; });
      return;
    }

    document.getElementById('mlSair').addEventListener('click', async function(e){
      e.preventDefault();
      try { await account.deleteSession({ sessionId: 'current' }); } catch (err) {}
      window.location.href = 'login.html';
    });

    if (!usuario){
      // As páginas do sistema já redirecionam para o login; aqui só evita ficar "Carregando…".
      document.getElementById('mlQuem').innerHTML = '<strong>Sessão não iniciada</strong>';
      desenharLicenca('neutro', 'Licença', null, '<div class="ml-lic-linha">Entre no sistema para ver a licença.</div>');
      return;
    }

    var equipes;
    try { equipes = (await teams.list()).teams; } catch (e) { equipes = []; }
    var souAdmin = equipes.some(function(t){ return t.$id === TEAM_ADMINS_ID; });
    var equipeMun = equipes.find(function(t){ return t.$id !== TEAM_ADMINS_ID; });
    if (souAdmin) document.getElementById('mlAdmin').style.display = '';

    var municipio = null, licenca = null, falhaLicenca = false;
    if (equipeMun){
      try {
        var rm = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: 'municipios', queries: [Query.equal('team_id', equipeMun.$id), Query.limit(1)] });
        municipio = rm.rows[0] || null;
      } catch (e) { municipio = null; }
      if (municipio){
        try {
          var rl = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: 'licencas', queries: [Query.equal('municipio_id', municipio.$id), Query.orderDesc('$createdAt'), Query.limit(1)] });
          licenca = rl.rows[0] || null;
        } catch (e) { falhaLicenca = true; }
      }
    }

    var quem = document.getElementById('mlQuem');
    var titulo = municipio ? municipio.nome + ' — ' + municipio.uf : (souAdmin ? 'Administrador da plataforma' : 'Sem município vinculado');
    quem.innerHTML = '<strong>' + esc(titulo) + '</strong>' + esc(usuario.email);

    if (municipio){
      if (falhaLicenca) desenharLicenca('neutro', 'Licença', null, '<div class="ml-lic-linha">Não foi possível consultar a licença agora.</div>');
      else mostrarLicenca(licenca, municipio);
    } else if (souAdmin){
      desenharLicenca('neutro', 'Licença', null, '<div class="ml-lic-plano">Conta administradora</div><div class="ml-lic-linha">Sem licença própria: o acesso não depende de município.</div>');
    } else {
      desenharLicenca('neutro', 'Licença', null, '<div class="ml-lic-plano">Sem município</div><div class="ml-lic-linha">Fale com o administrador para vincular seu acesso.</div>');
    }

    // Mesmas condições em que o painel esconde as ações de apuração.
    var semAcesso = !usuario.emailVerification ||
      (municipio && municipio.status !== 'ativo') ||
      (licenca && licenca.data_validade && new Date(licenca.data_validade) < new Date());
    if (semAcesso) document.querySelectorAll('.ml-nav [data-apuracao]').forEach(function(a){ a.style.display = 'none'; });
  }

  function iniciar(){
    var origem = document.getElementById('ml-extra-origem');
    var extra = document.getElementById('mlExtra');
    if (origem && extra){
      while (origem.firstChild) extra.appendChild(origem.firstChild);
      origem.parentNode.removeChild(origem);
    }
    preencherBotoesVoltar();
    carregarDados(MODO === 'menu');
  }

  css();
  if (MODO === 'menu') montarMenu();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();

# ApuraPASEP

Plataforma web de apoio técnico à apuração mensal da contribuição para o PASEP devida por
entes públicos municipais, a partir do XML AUDESP (leiaute Contas Correntes) do TCE-SP,
nos termos da Lei Federal nº 9.715/1998.

Este documento existe porque o histórico de decisões deste projeto foi construído ao longo
de várias sessões de trabalho assistido por IA, sem registro formal. Ele consolida esse
histórico para que qualquer pessoa (ou agente) que continue o trabalho não precise redescobrir
o porquê de cada regra. **Mantenha-o atualizado a cada mudança relevante.**

---

## 1. Arquitetura

Arquivo único por página, HTML+CSS+JS inline, sem build step, hospedado no **Appwrite Sites**
a partir deste repositório GitHub. Backend em **Appwrite Cloud** (banco de dados, autenticação,
funções serverless).

### 1.1 Páginas

| Arquivo | Função |
|---|---|
| `index.html` | Landing page pública (marketing) |
| `login.html` | Login (e-mail/senha; Google/Microsoft OAuth previstos, nunca testados) |
| `cadastro.html` | Autocadastro de município (fica `pendente` até aprovação do admin) |
| `verificar-email.html` | Confirma o link de verificação de e-mail |
| `aceitar-convite.html` | Aceita o convite do admin para o time de um município (e define a senha, se a conta foi criada pelo convite) |
| `recuperar-senha.html` | Define senha nova a partir do link de recuperação |
| `painel.html` | Painel do usuário do município — histórico de apurações, licença, "Revisar lançamentos" |
| `PASEP_teste_jspdf.html` | A ferramenta em si: importa XML, calcula, gera relatórios, salva no sistema |
| `admin.html` | Painel do administrador — municípios, licenças, log de auditoria |
| `admin-regras.html` | Admin edita as regras de classificação do motor de cálculo |
| `admin-apuracoes.html` | Admin consulta o histórico de apurações de qualquer município |
| `repositorio_pasep_cosit.html` | Repositório de Soluções de Consulta Cosit |
| `termos-de-uso.html`, `politica-de-privacidade.html` | Minutas jurídicas — **têm campos ainda não preenchidos**, ver §6 |

**Scripts compartilhados** (exceção deliberada à regra de arquivo único, para não duplicar
código entre telas; nenhum contém regra de classificação):

| Arquivo | Usado por | Função |
|---|---|---|
| `revisar-lancamentos.js` | `painel.html`, `admin-apuracoes.html` | Modal "Revisar lançamentos" (lê `apuracoes.detalhamento`) |
| `concluir-cadastro.js` | `cadastro.html`, `painel.html` | Cria time + município do autocadastro, com retomada se interrompido |
| `menu-lateral.js` | painel, ferramenta de apuração, repositório de normas, 3 telas de admin | **Menu lateral único** (fixo no computador, gaveta no celular), mostrador da licença, usuário, Sair, grupo Administração (só para `plataforma-admins`) e o botão "Voltar ao painel" |

**Menu lateral e botão "Voltar ao painel".** Nenhuma página escreve mais o próprio menu. Para
usar o componente numa página nova: `<script src="menu-lateral.js"></script>` logo depois de
`<body>`, o SDK do Appwrite carregado na página e, onde o botão deve aparecer,
`<div data-voltar-painel></div>` (use `data-voltar-painel="escuro"` sobre fundo escuro).
`data-quebra="1150"` no script muda a largura em que o menu vira gaveta (a ferramenta de
apuração usa 1150 porque tem três colunas). Conteúdo específico da página pode ir dentro de
`<div id="ml-extra-origem" hidden>`: o script move esse conteúdo para dentro do menu. Nas
páginas públicas (`termos-de-uso.html`, `politica-de-privacidade.html`) o script roda com
`data-modo="voltar"` e mostra só o botão, e apenas para quem está conectado. As páginas de
entrada (`index`, `home`, `login`, `cadastro`, `recuperar-senha`, `verificar-email`,
`aceitar-convite`) não usam o menu, pois o usuário ainda não está no sistema. O item
"Configurações" do menu aparece como "em breve": a tela não existe.

**Mostrador da licença** (lê a tabela `licencas`, que precisa de `read` para o time do
município): plano, validade e dias restantes, em verde (mais de 30 dias), amarelo (8 a 30) e
vermelho (7 ou menos, vencida ou suspensa). Também cobre município pendente, suspenso, sem
licença e conta administradora sem município. É só exibição; o bloqueio por status e
vencimento continua nas páginas.

### 1.2 Appwrite — recursos

- **Project ID:** `6ab3fac90005f026ddb1` — endpoint `https://nyc.cloud.appwrite.io/v1`
- **Database ID:** `apurapasep`
- **Tabelas:** `municipios`, `licencas`, `apuracoes`, `regras_motor`, `auditoria_admin`
- **Team `plataforma-admins`:** `6ab476f0000e158fa770` — administradores da plataforma
- **Cada município tem seu próprio Team** (campo `team_id` na tabela `municipios`), usado para
  permissão por linha (Row Security) — só o time do município lê/atualiza as próprias apurações
  e licenças
- **Appwrite Functions:**
  - `motor-pasep` — recebe o XML (reduzido no navegador, ver §1.4) e devolve o cálculo. Lê as
    regras de `regras_motor` a cada execução, autenticando com uma API Key própria guardada
    como variável de ambiente da função (`APPWRITE_API_KEY`), escopo `rows.read`.
  - `salvar-apuracao` — **nunca implantada** (decisão consciente de não configurar por ora,
    ver §5). **O código da função não está neste repositório**, e a parte de navegador que a
    chamava ficava só em `PASEP teste jspdf.html`, removido em 29/09/2026. Ao implantar, as
    duas partes precisam ser reescritas (a gravação deve incluir a coluna `detalhamento`).

### 1.3 Hospedagem

- Sites e Functions publicados via **GitHub → Appwrite Sites/Functions** (deploy automático a
  cada push, sem pipeline de CI própria)
- Não há ambiente de staging — todo push para `main` vai direto para produção

### 1.4 Motor de cálculo

O cálculo do PASEP roda inteiramente no servidor (Appwrite Function `motor-pasep`), não no
navegador — isso foi uma migração deliberada para não expor a lógica de classificação (que é
o diferencial da ferramenta) no código-fonte público.

- O navegador lê o XML localmente e **reduz** o conteúdo antes de enviar: extrai só os blocos
  `Descritor`, `ReceitaArrecadar` e `PrevisaoReceitaOrcamentaria` (os únicos que o motor usa),
  descartando o resto (empenhos, pagamentos, credores, servidores — dados que não deveriam
  sair da máquina do usuário, e que também fariam o corpo da requisição estourar o limite de
  ~10 MB do Appwrite Functions em arquivos reais, que passam de 40 MB)
- A função reprocessa o XML reduzido e devolve `{ d, r, constantes }`: `d` é o detalhamento
  classificado (por rubrica), `r` é o resultado final (base, retido, valor a pagar),
  `constantes` são as regras de classificação (só voltam ao navegador depois de uma chamada
  autenticada — nunca ficam fixas no HTML estático)
- As regras de classificação (quais prefixos de código caem em qual categoria) estão na tabela
  `regras_motor`, editável pela tela `admin-regras.html` — **qualquer alteração vale
  imediatamente para as próximas apurações de todos os municípios**, sem período de teste, e
  fica registrada no log de auditoria

---

## 2. Decisões normativas e de negócio (o "porquê" por trás do código)

Estas decisões foram tomadas ao longo do projeto e não estão explicadas no código-fonte.
Qualquer alteração na lógica de cálculo deve ser avaliada à luz delas, não revertida por engano.

- **CFEM classificada como Estado:** quando o município contabiliza a CFEM sob o código do
  Estado em vez do código da União (regra geral), essa receita ainda compõe a base de retenção
  do PASEP na fonte, nos mesmos efeitos da CFEM-União. É um tratamento por equivalência de
  natureza econômica, não uma leitura literal do código.
- **Dedução do FUNDEB:** usa percentual **flat de 20%** sobre a base apurada (CF, art. 212-A),
  não o valor contábil de dedução que eventualmente conste do próprio XML.
- **Finalidade definida (Lei 9.715/98, art. 2º, §7º):** valores desses códigos ficam
  **excluídos da base por padrão**. Só entram na base mediante confirmação expressa do usuário
  (checkbox "incluir" na tela) — nunca automaticamente.
- **Correção/estorno vs. devolução real:** lançamentos de crédito e débito de mesmo valor na
  conta de devolução do XML AUDESP representam reclassificação (mudança de Fonte de Recursos
  ou Código de Aplicação), não devolução de receita — não devem reduzir a receita líquida.
- **Ajuste do ITR:** a STN já remete o ITR líquido dos 20% do FUNDEB no repasse, então o valor
  retido na fonte é ajustado para não descontar esse percentual de novo (o código do ITR é
  tratado à parte no motor, não é uma regra editável em `admin-regras.html`).
- **Base legal citada nos relatórios:** Lei nº 9.715/98 (arts. 2º, §§6º e 7º, e 8º, III),
  CF/1988 art. 212-A, e as Soluções de Consulta Cosit vigentes.

---

## 3. Segurança — o que está e o que não está reforçado no servidor

- **Motor de cálculo:** protegido — as regras de classificação não ficam no HTML público, só
  chegam ao navegador depois de uma chamada autenticada à função.
- **Salvamento de apuração:** hoje é feito **direto do navegador** (`PASEP_teste_jspdf.html`,
  função `salvarApuracaoNoSistema`), com as checagens de status do município e validade da
  licença feitas **só na tela** — um usuário com conhecimento técnico, chamando a API
  diretamente, poderia contornar essas checagens (ver item 14 no §5).
- **Tabela `apuracoes`:** permissão de `Create` aberta para `All users` (qualquer usuário
  autenticado no sistema), porque o Appwrite exige API Key/Function para conceder permissão
  por time específico, e isso não é algo que o navegador consegue fazer sozinho.
- **Tabela `municipios`:** as linhas dão ao time do município **só leitura**. Até 29/09/2026 o
  time também tinha `update`, o que permitia ao próprio município mudar o `status` para
  `ativo` (se autoaprovar) ou trocar o `codigo_tce` pela API. A permissão foi retirada da linha
  existente (Piratininga) e do código de `cadastro.html`/`admin.html`. Alterações ficam com o
  `update` de nível de tabela do time `plataforma-admins`.
- **Lacuna ainda aberta em `municipios`:** a tabela tem `Create` para `users`, necessário ao
  autocadastro. Com isso, um usuário técnico ainda consegue criar pela API uma linha nova já
  com `status: ativo`. O fechamento definitivo depende de mover a criação para uma Function
  (mesma decisão de plano gratuito da `salvar-apuracao`).
- **Checagem de duplicidade do cadastro é ineficaz:** como cada linha de `municipios` só é
  legível pelo próprio time e pelos admins, o `listRows` por nome+UF feito em `cadastro.html`
  nunca enxerga o município de outro time. A duplicidade só é pega na aprovação manual.
- **Licenças:** precisam de `read` para o time do município, senão o painel não enxerga o
  vencimento e nunca bloqueia. A licença de Piratininga estava sem essa permissão (só o usuário
  admin lia) e foi corrigida em 29/09/2026.
- **Toda alteração de status/licença/regra de cálculo feita pelo admin fica registrada** na
  tabela `auditoria_admin`, visível em `admin.html`.

---

## 4. Limitações funcionais conhecidas

- **Só o sistema de gestão Fiorilli está implementado.** O leiaute do XML AUDESP é padronizado
  pelo TCE-SP e comum a qualquer jurisdicionado do estado (não é peculiaridade do Fiorilli),
  então a apuração em si funciona para qualquer município de SP — mas a *leitura do balancete*
  para auditoria cruzada (item separado do XML) só tem parser para Fiorilli. GEMMAP aparece
  como opção no cadastro, marcado "em construção".
- **Cobertura geográfica:** só municípios de São Paulo — a apuração automática depende da API
  pública de transparência do TCESP.

---

## 5. Estado das pendências (lista de robustez)

### Concluídas
1. Recuperação de senha (`recuperar-senha.html` + `account.createRecovery`)
2. Verificação de e-mail obrigatória antes de liberar o painel
3. Cadastro com checagem de duplicidade (nome+UF) antes de criar a conta
4. Log de auditoria administrativa (tabela `auditoria_admin`)
5. Regras de cálculo migradas para a tabela `regras_motor`, editáveis por `admin-regras.html`
6. Cadastro direto de município pelo admin (`admin.html`, botão "+ Cadastrar município") — cria
   o time, o município já ativo e a licença inicial
7. `admin-apuracoes.html` — admin consulta histórico de qualquer município
8. "Revisar lançamentos" — detalhamento por rubrica salvo junto da apuração (coluna
   `apuracoes.detalhamento`, mediumtext com JSON montado por `montarDetalhamento()` em
   `PASEP_teste_jspdf.html`), exibido em modal (`revisar-lancamentos.js`) no `painel.html` e no
   `admin-apuracoes.html`. Apurações salvas antes desta coluna existir mostram aviso, não erro.
   *Estava marcado como concluído, mas não existia no repositório nem no Appwrite; foi
   reimplementado em 29/09/2026.*
9. Termos de Uso e Política de Privacidade — **minuta pronta**, ver §6
10. Conclusão de cadastro interrompido (`concluir-cadastro.js`): os dados do autocadastro
    ficam nas prefs da conta (`cadastroPendente`) até o time e o município estarem criados; o
    painel retoma o que faltou a cada acesso, sem duplicar time nem município.
11. Convite de usuário pelo admin (`admin.html`, botão "Usuários" → `aceitar-convite.html`).
    Só funciona nos times de que o admin é owner (municípios cadastrados por ele); nos times de
    autocadastro, o owner é o responsável que se cadastrou.
12. Arquivos duplicados (nomes com espaço) removidos.

### Pendentes
- **[Prioritário] Reforço no servidor do status/licença ao salvar apuração.** O código da
  função `salvar-apuracao` já existe e foi testado (reprocessa o XML no servidor, confere
  time/status/licença antes de gravar, usa chave dinâmica por escopo). **Falta só configurar
  no Appwrite** (criar a função, habilitar escopos `rows.read`/`rows.write`/`teams.read`,
  apontar `APPWRITE_FUNCTION_SALVAR_ID` no `PASEP_teste_jspdf.html`). Não foi implantada por
  decisão consciente — consumiria a segunda e última vaga de função do plano gratuito, e o
  risco foi avaliado como aceitável no curto prazo (usuários identificados, log de auditoria).
- **Criação de município via Function** (fecha a lacuna de `Create` aberto em `municipios`,
  ver §3) e checagem de duplicidade no servidor.
- **GEMMAP:** parser de balancete não implementado.
- **OAuth (Google/Microsoft):** nunca testado de ponta a ponta.
- **Backup do banco Appwrite:** nenhuma rotina configurada.
- **Monitoramento de erro em produção:** nenhum configurado.
- **Deploy:** 100% manual via push no GitHub, sem pipeline de CI, sem ambiente de staging.
- **Domínio próprio:** hoje em `*.appwrite.network`.
- **Este README** — manter atualizado a cada mudança relevante de arquitetura ou decisão.

---

## 6. Termos de Uso e Política de Privacidade — pendências específicas

Os documentos (`termos-de-uso.html`, `politica-de-privacidade.html`) têm campos marcados
visualmente em amarelo (`<mark class="preencher">`) que precisam ser preenchidos antes da
publicação — um aviso no topo da página avisa "minuta para revisão" enquanto restar algum.
Pendências principais:

- Razão social/CPF-CNPJ, endereço e e-mail do encarregado de dados do fornecedor da plataforma
- Prazos de exportação/exclusão de dados após encerramento de uso
- Foro de eleição
- **Decisão de região de hospedagem:** o projeto Appwrite está na região **Nova York**
  (EUA), sem região no Brasil disponível no Appwrite Cloud. Isso caracteriza transferência
  internacional de dados pessoais (LGPD arts. 33–36, Resolução CD/ANPD nº 19/2024). Duas
  saídas possíveis: (a) permanecer nos EUA e formalizar o mecanismo de transferência
  (cláusulas-padrão contratuais, verificar o que o contrato do Appwrite já prevê); ou
  (b) migrar o projeto para a região Frankfurt (UE, com decisão de adequação da ANPD). Convém
  decidir **antes de cadastrar outros municípios**, porque a migração fica mais custosa
  quanto mais dados existirem.

---

## 7. Referências externas usadas no projeto

- Soluções de Consulta Cosit da Receita Federal — mantidas em
  `G:\Outros computadores\DELL\Documentos\Prefeitura\MATERIAIS CONTABILIDADE PÚBLICA\PASEP\Outras soluções de consulta`
  e espelhadas no Google Drive
- Anexo II — Tabelas de Escrituração Contábil - Auxiliares 2026 (AUDESP/STN), aba
  "Classificação da Receita - 2026", internalizada na ferramenta para exibir a especificação
  oficial de cada código de receita nos relatórios

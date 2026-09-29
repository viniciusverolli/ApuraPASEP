# Auditoria: conferência contra a API do TCESP e contra o balancete

**Situação: desativada em 29/09/2026.** O código foi guardado aqui para uso futuro.

## O que era

Na ferramenta de apuração (`PASEP_teste_jspdf.html`), depois de importar o XML AUDESP, havia
uma seção de auditoria, visível só para administradores da plataforma, com três recursos:

1. **Auditoria contra a base do TCESP.** Buscava, pelo navegador, os dados do município na API
   pública de transparência (`https://transparencia.tce.sp.gov.br/api/json/receitas/<município>/<ano>/<mês>`)
   e comparava rubrica por rubrica com o valor apurado a partir do XML.
2. **Conferência independente.** Permitia colar manualmente o retorno da API, caso a busca
   automática falhasse.
3. **Balancete (sistema de gestão).** Aceitava o balancete da receita exportado do Fiorilli
   (`.md` ou `.txt`) e fazia uma terceira conferência, contra o sistema de gestão do município.

Havia ainda: o indicador "Conectado à API do TCESP" no menu lateral, o botão "Auditar competência
(XML × API × Balancete)" no painel, o item "Importar XML / balancete" no menu e a aba
"Auditoria" da planilha em Excel (apuração conferida contra o balancete carregado).

## Por que foi desativada

Estava em fase de testes e não agrega ao usuário comum. A conferência do cálculo passou a ser
feita pelo **Revisar lançamentos** (composição por rubrica, na tela) e pela **planilha detalhada
em Excel** (todos os lançamentos do XML e a memória de cálculo em fórmulas).

## Limitações conhecidas (levar em conta antes de reativar)

- O leitor de balancete só reconhece o formato do **Fiorilli**. Não há leitor para o GEMMAP.
- A busca na API do TCESP depende da disponibilidade e do CORS do servidor deles, e dependia de
  um mapa de códigos do município para o nome usado na URL (`MUNICIPIOS_TCE`, que continua na
  ferramenta porque também serve para identificar o município do XML).
- A API pode não trazer registros de uma competência ainda não consolidada.
- Só funciona para municípios de São Paulo.
- A tela só era restrita a administradores no navegador; nada no servidor impedia o acesso.

## Como recuperar

**Versão completa e funcionando.** Está guardada no branch `arquivo-auditoria-tcesp-v1`, que
aponta para o commit `874b95b`, a última versão que tinha a auditoria. Esse branch existe só
para preservar o código: não deve receber alterações nem ser incorporado à versão principal.

```
git fetch origin arquivo-auditoria-tcesp-v1
git show origin/arquivo-auditoria-tcesp-v1:PASEP_teste_jspdf.html > ferramenta-com-auditoria.html
```

No site do GitHub: **Branches**, escolha `arquivo-auditoria-tcesp-v1`, abra `PASEP_teste_jspdf.html`.

**Só os trechos.** `auditoria-tcesp-balancete.js`, nesta pasta, traz o texto original de cada
trecho removido, numerado, com a indicação de onde ficava. Ele não é carregado por nenhuma
página e não roda sozinho. Para reativar, cada trecho volta ao lugar indicado.

## Sugestão para uma reativação

1. Definir quem terá acesso e reforçar essa restrição no servidor, e não só na tela.
2. Escrever o leitor de balancete do GEMMAP antes de oferecer a conferência a esses municípios.
3. Se a consulta ao TCESP voltar, atualizar a Política de Privacidade (a consulta é feita pelo
   navegador do usuário e o TCESP enxerga o endereço IP dele) e os Termos de Uso.
4. Reincluir o botão no painel e o item no menu.

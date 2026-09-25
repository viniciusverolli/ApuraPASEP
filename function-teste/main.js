// Função de teste — só confirma que o caminho navegador → servidor → resposta funciona,
// antes de portar o motor de cálculo de verdade pra cá.
export default async ({ req, res, log }) => {
  var corpo = {};
  try {
    corpo = req.bodyJson || JSON.parse(req.body || '{}');
  } catch (e) {
    corpo = {};
  }

  log('Recebido: ' + JSON.stringify(corpo));

  return res.json({
    ok: true,
    mensagem: 'Função respondendo do servidor Appwrite.',
    recebido: corpo,
    horario: new Date().toISOString()
  });
};

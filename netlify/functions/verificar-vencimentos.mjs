const FIREBASE_DB_URL =
  'https://dashboard-clinicas-b471f-default-rtdb.firebaseio.com';

const EMAIL_GERAL =
  'notificacoes.clinicas@gmail.com';

const EMAILJS_SERVICE_ID =
  'service_rrvigcl';

const EMAILJS_TEMPLATE_ID =
  'template_l619esm';

const EMAILJS_PUBLIC_KEY =
  '9_sWrO7qr5CGeK8ru';

const LINK_SISTEMA =
  'https://splendid-sprite-50bf63.netlify.app/';

function dataCuritiba() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const obj = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

async function firebaseGet(path) {
  const url = `${FIREBASE_DB_URL}/v2/${path}.json`;
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`Firebase GET ${resposta.status}: ${await resposta.text()}`);
  }
  return await resposta.json();
}

async function firebasePut(path, value) {
  const url = `${FIREBASE_DB_URL}/v2/${path}.json`;
  const resposta = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  if (!resposta.ok) {
    throw new Error(`Firebase PUT ${resposta.status}: ${await resposta.text()}`);
  }
}

async function enviarEmail(clinica) {
  const resposta = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: EMAIL_GERAL,
        clinica,
        link_sistema: LINK_SISTEMA,
        name: 'Sistema de Gerenciamento de Clínicas'
      }
    })
  });

  if (!resposta.ok) {
    throw new Error(`EmailJS ${resposta.status}: ${await resposta.text()}`);
  }
}

export default async () => {
  const hoje = dataCuritiba();
  console.log(`Iniciando verificação geral. Data Curitiba: ${hoje}`);

  const todosMeses = await firebaseGet('contas');
  if (!todosMeses || typeof todosMeses !== 'object') {
    console.log('Nenhuma conta cadastrada no Firebase.');
    return new Response('Nenhuma conta encontrada.', { status: 200 });
  }

  const meses = Object.keys(todosMeses);
  console.log(`Meses encontrados no Firebase: ${meses.join(', ')}`);

  let totalRegistros = 0;
  let totalVencendoHoje = 0;
  let totalJaNotificados = 0;
  let totalClinicasNotificadas = 0;
  const notificacoes = {};

  for (const chaveMes of meses) {
    const dadosMes = todosMeses[chaveMes];
    if (!dadosMes || typeof dadosMes !== 'object') continue;

    console.log(`Analisando período ${chaveMes}`);

    for (const [clinica, itens] of Object.entries(dadosMes)) {
      if (!itens || typeof itens !== 'object') continue;

      for (const [id, conta] of Object.entries(itens)) {
        totalRegistros++;
        if (!conta || typeof conta !== 'object') continue;
        if (!conta.desc || conta.padrao === true) continue;

        const vencimento = String(conta.venc || '').trim();
        const pago = conta.pago === true;
        const jaNotificada = conta.avisoVencimentoEm === hoje;

        if (vencimento !== hoje) continue;

        totalVencendoHoje++;
        console.log(`[${clinica}] "${conta.desc}" vence hoje. Período salvo: ${chaveMes}. Pago: ${pago}. Aviso: ${conta.avisoVencimentoEm || 'nenhum'}`);

        if (pago) continue;

        if (jaNotificada) {
          totalJaNotificados++;
          console.log(`[${clinica}] Ignorada porque já foi notificada hoje: ${conta.desc}`);
          continue;
        }

        if (!notificacoes[clinica]) notificacoes[clinica] = [];
        notificacoes[clinica].push({ chaveMes, id });
      }
    }
  }

  for (const [clinica, contas] of Object.entries(notificacoes)) {
    console.log(`[${clinica}] Enviando notificação para ${EMAIL_GERAL}. ${contas.length} conta(s) vencendo hoje.`);
    await enviarEmail(clinica);

    for (const item of contas) {
      todosMeses[item.chaveMes][clinica][item.id].avisoVencimentoEm = hoje;
    }

    totalClinicasNotificadas++;
    console.log(`[${clinica}] E-mail enviado com sucesso.`);
  }

  if (totalClinicasNotificadas > 0) {
    await firebasePut('contas', todosMeses);
  }

  console.log(`Resumo ${hoje}: ${totalRegistros} registro(s) analisado(s); ${totalVencendoHoje} conta(s) vencendo hoje; ${totalJaNotificados} já notificada(s); ${totalClinicasNotificadas} clínica(s) notificada(s).`);

  return new Response(JSON.stringify({
    data: hoje,
    mesesAnalisados: meses.length,
    registrosAnalisados: totalRegistros,
    contasVencendoHoje: totalVencendoHoje,
    contasJaNotificadasHoje: totalJaNotificados,
    clinicasNotificadas: totalClinicasNotificadas
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

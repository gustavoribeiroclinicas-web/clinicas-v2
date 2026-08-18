const FIREBASE_DB_URL = 'https://dashboard-clinicas-b471f-default-rtdb.firebaseio.com';
const EMAIL_GERAL = 'notificacoes.clinicas@gmail.com';

const EMAILJS_SERVICE_ID = 'service_rivigcl';
const EMAILJS_TEMPLATE_ID = 'template_l619esm';
const EMAILJS_PUBLIC_KEY = '9_sWrO7qr5CGeK8ru';

const LINK_SISTEMA = 'https://splendid-sprite-50bf63.netlify.app/';

function dataCuritiba() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const obj = Object.fromEntries(
    partes.map(p => [p.type, p.value])
  );

  return `${obj.year}-${obj.month}-${obj.day}`;
}

function chaveMes(dataISO) {
  const [ano, mes] = dataISO.split('-');

  return `${Number(mes)}_${ano}`;
}

async function firebaseGet(path) {
  const url = `${FIREBASE_DB_URL}/v2/${path}.json`;

  const resposta = await fetch(url);

  if (!resposta.ok) {
    throw new Error(
      `Firebase GET ${resposta.status}: ${await resposta.text()}`
    );
  }

  return await resposta.json();
}

async function firebasePut(path, value) {
  const url = `${FIREBASE_DB_URL}/v2/${path}.json`;

  const resposta = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });

  if (!resposta.ok) {
    throw new Error(
      `Firebase PUT ${resposta.status}: ${await resposta.text()}`
    );
  }
}

async function enviarEmail(clinica) {
  const resposta = await fetch(
    'https://api.emailjs.com/api/v1.0/email/send',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,

        template_params: {
          to_email: EMAIL_GERAL,
          clinica: clinica,
          link_sistema: LINK_SISTEMA,
          name: 'Sistema de Gerenciamento de Clínicas'
        }
      })
    }
  );

  if (!resposta.ok) {
    throw new Error(
      `EmailJS ${resposta.status}: ${await resposta.text()}`
    );
  }
}

export default async () => {

  const hoje = dataCuritiba();

  const k = chaveMes(hoje);

  console.log(
    `Iniciando verificação. Data Curitiba: ${hoje}. Chave do mês: ${k}`
  );

  const contasMes = await firebaseGet(
    `contas/${k}`
  );

  if (!contasMes || typeof contasMes !== 'object') {

    console.log(
      `Nenhuma estrutura encontrada em v2/contas/${k}.`
    );

    return new Response(
      'Nenhuma conta encontrada.',
      {
        status: 200
      }
    );
  }

  const clinicas = Object.keys(contasMes);

  console.log(
    `Firebase retornou ${clinicas.length} clínica(s): ${clinicas.join(', ')}`
  );

  let totalItens = 0;

  let totalVencendoHoje = 0;

  let totalJaNotificados = 0;

  let clinicasNotificadas = 0;

  for (const clinica of clinicas) {

    const itens = contasMes[clinica] || {};

    const entradas = Object.entries(itens);

    totalItens += entradas.length;

    console.log(
      `[${clinica}] ${entradas.length} registro(s) encontrado(s).`
    );

    const pendentes = [];

    for (const [id, conta] of entradas) {

      if (!conta || typeof conta !== 'object') {
        continue;
      }

      // Ignora linhas vazias/padrão usadas apenas
      // como estrutura visual do sistema.
      if (!conta.desc || conta.padrao === true) {
        continue;
      }

      const vencimento =
        String(conta.venc || '').trim();

      const pago =
        conta.pago === true;

      const jaNotificadaHoje =
        conta.avisoVencimentoEm === hoje;

      if (vencimento === hoje) {

        totalVencendoHoje++;

        console.log(
          `[${clinica}] Vence hoje: "${conta.desc}" | ` +
          `id=${id} | ` +
          `pago=${pago} | ` +
          `aviso=${conta.avisoVencimentoEm || 'nenhum'}`
        );
      }

      if (vencimento !== hoje) {
        continue;
      }

      if (pago) {
        continue;
      }

      if (jaNotificadaHoje) {

        totalJaNotificados++;

        console.log(
          `[${clinica}] Ignorada porque já foi notificada hoje: "${conta.desc}"`
        );

        continue;
      }

      pendentes.push([
        id,
        conta
      ]);
    }

    if (!pendentes.length) {
      continue;
    }

    console.log(
      `[${clinica}] Enviando aviso para ${EMAIL_GERAL}...`
    );

    await enviarEmail(
      clinica
    );

    for (const [id] of pendentes) {

      contasMes[clinica][id].avisoVencimentoEm =
        hoje;
    }

    await firebasePut(
      `contas/${k}`,
      contasMes
    );

    clinicasNotificadas++;

    console.log(
      `[${clinica}] Aviso enviado. ` +
      `${pendentes.length} conta(s) marcada(s) como notificadas.`
    );
  }

  console.log(
    `Resumo ${hoje}: ` +
    `${totalItens} registro(s); ` +
    `${totalVencendoHoje} conta(s) vencendo hoje; ` +
    `${totalJaNotificados} já notificada(s); ` +
    `${clinicasNotificadas} clínica(s) notificada(s).`
  );

  return new Response(
    JSON.stringify({
      data: hoje,
      chaveMes: k,
      clinicasEncontradas: clinicas.length,
      registrosEncontrados: totalItens,
      contasVencendoHoje: totalVencendoHoje,
      contasJaNotificadasHoje: totalJaNotificados,
      clinicasNotificadas: clinicasNotificadas
    }),
    {
      status: 200,

      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
};

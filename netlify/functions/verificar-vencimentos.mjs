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
  const r = await fetch(
    `${FIREBASE_DB_URL}/v2/${path}.json`
  );

  if (!r.ok) {
    throw new Error(
      `Firebase GET ${r.status}: ${await r.text()}`
    );
  }

  return await r.json();
}

async function firebasePatch(path, value) {
  const r = await fetch(
    `${FIREBASE_DB_URL}/v2/${path}.json`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(value)
    }
  );

  if (!r.ok) {
    throw new Error(
      `Firebase PATCH ${r.status}: ${await r.text()}`
    );
  }
}

async function enviarEmail(clinica) {
  const r = await fetch(
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

  if (!r.ok) {
    throw new Error(
      `EmailJS ${r.status}: ${await r.text()}`
    );
  }
}

export default async () => {
  const hoje = dataCuritiba();
  const k = chaveMes(hoje);

  const contas =
    await firebaseGet(`contas/${k}`) || {};

  let enviados = 0;

  for (const [clinica, itens] of Object.entries(contas)) {

    const pendentes = Object.entries(itens || {}).filter(
      ([, c]) =>
        c &&
        !c.pago &&
        c.venc === hoje &&
        !c.padrao &&
        c.desc &&
        c.avisoVencimentoEm !== hoje
    );

    if (!pendentes.length) {
      continue;
    }

    await enviarEmail(clinica);

    const patch = {};

    for (const [id] of pendentes) {
      patch[`${id}/avisoVencimentoEm`] = hoje;
    }

    await firebasePatch(
      `contas/${k}/${clinica}`,
      patch
    );

    enviados++;
  }

  console.log(
    `Verificação ${hoje}: ${enviados} clínica(s) notificada(s) em ${EMAIL_GERAL}.`
  );
};

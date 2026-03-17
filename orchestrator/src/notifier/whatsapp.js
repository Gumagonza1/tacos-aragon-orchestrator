'use strict';

const API_URL = process.env.API_URL;
const API_TOKEN = process.env.API_TOKEN;
const ADMIN_NUMERO = process.env.ADMIN_NUMERO;

if (!API_URL) {
  console.error('[notifier] API_URL no definida — proceso detenido');
  process.exit(1);
}

if (!API_TOKEN) {
  console.error('[notifier] API_TOKEN no definida — proceso detenido');
  process.exit(1);
}

if (!ADMIN_NUMERO) {
  console.error('[notifier] ADMIN_NUMERO no definido — proceso detenido');
  process.exit(1);
}

async function notificarAdmin(mensaje) {
  const { default: fetch } = await import('node-fetch');

  try {
    const res = await fetch(`${API_URL}/interno/mensaje-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': API_TOKEN,
      },
      body: JSON.stringify({
        numero: ADMIN_NUMERO,
        mensaje,
      }),
    });

    if (!res.ok) {
      const texto = await res.text();
      console.error(`[notifier] Error al enviar mensaje: ${res.status} ${texto}`);
    }
  } catch (err) {
    console.error(`[notifier] Fallo de conexion al API: ${err.message}`);
  }
}

module.exports = { notificarAdmin };

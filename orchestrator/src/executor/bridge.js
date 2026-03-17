'use strict';

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://host.docker.internal:9999';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

async function llamarBridge(comando, params = {}) {
  if (!BRIDGE_TOKEN) {
    throw new Error('BRIDGE_TOKEN no configurado');
  }

  const { default: fetch } = await import('node-fetch');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);

  try {
    const res = await fetch(`${BRIDGE_URL}/ejecutar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ comando, params }),
      signal: ctrl.signal,
    });

    clearTimeout(timer);

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'Error desconocido en bridge');
    }

    return data.resultado;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function pingBridge() {
  const { default: fetch } = await import('node-fetch');
  try {
    const res = await fetch(`${BRIDGE_URL}/ping`, {
      headers: { 'Authorization': `Bearer ${BRIDGE_TOKEN}` },
      timeout: 3000,
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { llamarBridge, pingBridge };

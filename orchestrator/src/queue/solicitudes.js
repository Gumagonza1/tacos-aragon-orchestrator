'use strict';

const { crearSolicitudCfo, resolverSolicitudCfo } = require('../db/queries');

const CFO_URL   = process.env.CFO_URL   || 'http://host.docker.internal:3002';
const API_TOKEN = process.env.API_TOKEN;
const TIMEOUT_MS = 30000;

async function enviarSolicitudCfo(origen, mensaje) {
  const id = crearSolicitudCfo(origen, mensaje);

  try {
    const { default: fetch } = await import('node-fetch');
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${CFO_URL}/api/cfo/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify({ mensaje }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const err = await res.text();
      resolverSolicitudCfo(id, `Error del CFO: ${res.status} — ${err}`);
      return { ok: false, error: `CFO respondio ${res.status}` };
    }

    const data = await res.json();
    const respuesta = data.respuesta || data.mensaje || JSON.stringify(data);
    resolverSolicitudCfo(id, respuesta);

    return { ok: true, respuesta };
  } catch (err) {
    resolverSolicitudCfo(id, `Error de conexion: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { enviarSolicitudCfo };

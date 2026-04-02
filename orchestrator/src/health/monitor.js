'use strict';

const { SERVICIOS } = require('./servicios');
const { llamarBridge } = require('../executor/bridge');
const { registrarEvento } = require('../db/queries');

const TIMEOUT_HTTP_MS = 5000;
const estado = new Map();

async function verificarTodos() {
  const resultados = await Promise.all(SERVICIOS.map(verificarServicio));
  return resultados;
}

async function verificarServicio(servicio) {
  try {
    let ok = false;

    if (servicio.tipo === 'docker') {
      ok = await _verificarDocker(servicio);
    } else if (servicio.tipo === 'http') {
      ok = await _verificarHttp(servicio);
    } else if (servicio.tipo === 'pm2') {
      ok = await _verificarDocker(servicio); // PM2 → Docker in this environment
    }

    const anterior = estado.get(servicio.nombre);
    estado.set(servicio.nombre, ok);

    if (!ok) {
      registrarEvento(servicio.nombre, 'health_check', `Servicio no responde`, 'error');
    } else if (anterior === false) {
      registrarEvento(servicio.nombre, 'health_check', `Servicio recuperado`, 'info');
    }

    return { nombre: servicio.nombre, ok, tipo: servicio.tipo };
  } catch (err) {
    registrarEvento(servicio.nombre, 'health_check', `Error al verificar: ${err.message}`, 'error');
    return { nombre: servicio.nombre, ok: false, tipo: servicio.tipo, error: err.message };
  }
}

function obtenerEstado(nombre) {
  return estado.get(nombre);
}

function obtenerEstadoTodos() {
  return Object.fromEntries(estado);
}

async function _verificarDocker(servicio) {
  try {
    const lista = await llamarBridge('pm2_list', {});
    if (!Array.isArray(lista)) return false;
    const container = lista.find(c => c.name === servicio.proceso || c.name.includes(servicio.proceso));
    return container && container.status === 'running';
  } catch {
    return false;
  }
}

async function _verificarHttp(servicio) {
  const { default: fetch } = await import('node-fetch');
  const url = `${servicio.url}${servicio.endpoint}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_HTTP_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { verificarTodos, verificarServicio, obtenerEstado, obtenerEstadoTodos, SERVICIOS };

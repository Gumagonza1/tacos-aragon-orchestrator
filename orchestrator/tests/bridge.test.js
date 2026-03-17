'use strict';

// Tests de integración para el host-bridge.
// Requieren que host-bridge este corriendo en localhost:9999.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const BRIDGE_URL   = process.env.BRIDGE_URL   || 'http://127.0.0.1:9999';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

async function ejecutar(comando, params, token) {
  const res = await fetch(`${BRIDGE_URL}/ejecutar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || BRIDGE_TOKEN}`,
    },
    body: JSON.stringify({ comando, params }),
  });
  return { status: res.status, data: await res.json() };
}

test('GET /ping — bridge responde', async () => {
  const res = await fetch(`${BRIDGE_URL}/ping`, {
    headers: { 'Authorization': `Bearer ${BRIDGE_TOKEN}` },
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.ok(typeof data.ts === 'number');
});

test('GET /ping — sin token retorna 401', async () => {
  const res = await fetch(`${BRIDGE_URL}/ping`);
  assert.equal(res.status, 401);
});

test('pm2_list — retorna lista con procesos online', async () => {
  const { status, data } = await ejecutar('pm2_list', {});
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  const lista = JSON.parse(data.resultado);
  assert.ok(Array.isArray(lista));
  const online = lista.filter(p => p.pm2_env.status === 'online');
  assert.ok(online.length > 0);
});

test('pm2_list — contiene TacosAragon y MonitorBot', async () => {
  const { data } = await ejecutar('pm2_list', {});
  const lista = JSON.parse(data.resultado);
  const nombres = lista.map(p => p.name);
  assert.ok(nombres.includes('TacosAragon'));
  assert.ok(nombres.includes('MonitorBot'));
});

test('disk_status — retorna informacion de disco', async () => {
  const { status, data } = await ejecutar('disk_status', {});
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.resultado.includes('C:'));
});

test('mem_status — retorna memoria disponible', async () => {
  const { status, data } = await ejecutar('mem_status', {});
  assert.equal(status, 200);
  assert.ok(data.resultado.includes('FreePhysicalMemory'));
  assert.ok(data.resultado.includes('TotalVisibleMemorySize'));
});

test('sc_query TacosAragon — servicio esta RUNNING', async () => {
  const { status, data } = await ejecutar('sc_query', { servicio: 'TacosAragon' });
  assert.equal(status, 200);
  assert.ok(data.resultado.includes('RUNNING'));
});

test('comando invalido — retorna error claro', async () => {
  const { status, data } = await ejecutar('rm_rf', {});
  assert.equal(status, 500);
  assert.equal(data.ok, false);
  assert.ok(data.error.includes('no permitido'));
});

test('token incorrecto — retorna 401', async () => {
  const { status } = await ejecutar('pm2_list', {}, 'token-falso');
  assert.equal(status, 401);
});

test('proceso con nombre invalido — retorna error', async () => {
  const { status, data } = await ejecutar('pm2_restart', { proceso: 'nombre malo; ls' });
  assert.equal(status, 500);
  assert.equal(data.ok, false);
});

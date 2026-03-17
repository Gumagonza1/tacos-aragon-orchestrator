'use strict';

// Tests de integración para POST /interno/mensaje-admin en tacos-aragon-api.
// Requieren que tacos-aragon-api este corriendo en localhost:3001.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const API_URL   = process.env.API_URL   || 'http://localhost:3001';
const API_TOKEN = process.env.API_TOKEN;

async function post(path, body, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-token': token || API_TOKEN,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('POST /interno/mensaje-admin — happy path', async () => {
  const { status, data } = await post('/interno/mensaje-admin', {
    mensaje: '[TEST] Mensaje de prueba automatica — ignorar',
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.ok(typeof data.id === 'string');
  assert.ok(data.id.startsWith('orch-'));
});

test('POST /interno/mensaje-admin — sin token retorna 401', async () => {
  const res = await fetch(`${API_URL}/interno/mensaje-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensaje: 'test' }),
  });
  assert.equal(res.status, 401);
});

test('POST /interno/mensaje-admin — token incorrecto retorna 401', async () => {
  const { status } = await post('/interno/mensaje-admin', { mensaje: 'test' }, 'token-falso');
  assert.equal(status, 401);
});

test('POST /interno/mensaje-admin — sin campo mensaje retorna 400', async () => {
  const { status, data } = await post('/interno/mensaje-admin', {});
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('POST /interno/mensaje-admin — mensaje vacio retorna 400', async () => {
  const { status, data } = await post('/interno/mensaje-admin', { mensaje: '   ' });
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('POST /interno/mensaje-admin — mensaje demasiado largo retorna 400', async () => {
  const { status, data } = await post('/interno/mensaje-admin', {
    mensaje: 'x'.repeat(4001),
  });
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('POST /interno/mensaje-admin — mensaje de exactamente 4000 chars pasa', async () => {
  const { status, data } = await post('/interno/mensaje-admin', {
    mensaje: 'x'.repeat(4000),
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('GET /health — API responde ok', async () => {
  const res = await fetch(`${API_URL}/health`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.status, 'ok');
});

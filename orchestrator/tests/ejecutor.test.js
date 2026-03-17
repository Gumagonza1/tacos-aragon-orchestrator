'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ejecutar } = require('../../host-bridge/ejecutor');

test('ejecutar — rechaza comandos no permitidos', () => {
  assert.throws(
    () => ejecutar('rm_rf', {}),
    /Comando no permitido/
  );
});

test('ejecutar — rechaza nombre de proceso con caracteres invalidos', () => {
  assert.throws(
    () => ejecutar('pm2_restart', { proceso: 'mi proceso; rm -rf /' }),
    /invalido/
  );
});

test('ejecutar — rechaza proceso con espacios', () => {
  assert.throws(
    () => ejecutar('pm2_stop', { proceso: 'proceso con espacio' }),
    /invalido/
  );
});

test('ejecutar — rechaza proceso vacio', () => {
  assert.throws(
    () => ejecutar('pm2_restart', { proceso: '' }),
    /invalido/
  );
});

test('ejecutar — rechaza proceso undefined', () => {
  assert.throws(
    () => ejecutar('pm2_restart', {}),
    /invalido/
  );
});

test('ejecutar — rechaza nombre de servicio con caracteres peligrosos', () => {
  assert.throws(
    () => ejecutar('sc_query', { servicio: 'servicio && cmd' }),
    /invalido/
  );
});

test('ejecutar — rechaza git_pull sin ruta', () => {
  assert.throws(
    () => ejecutar('git_pull', {}),
    /Ruta requerida/
  );
});

test('ejecutar — rechaza git_pull con ruta null', () => {
  assert.throws(
    () => ejecutar('git_pull', { ruta: null }),
    /Ruta requerida/
  );
});

test('ejecutar — disk_status retorna string', () => {
  const resultado = ejecutar('disk_status', {});
  assert.ok(typeof resultado === 'string');
  assert.ok(resultado.length > 0);
});

test('ejecutar — mem_status retorna string', () => {
  const resultado = ejecutar('mem_status', {});
  assert.ok(typeof resultado === 'string');
  assert.ok(resultado.length > 0);
});

test('ejecutar — pm2_list retorna JSON parseable', () => {
  const resultado = ejecutar('pm2_list', {});
  assert.ok(typeof resultado === 'string');
  const parsed = JSON.parse(resultado);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.length > 0);
});

test('ejecutar — pm2_list contiene procesos esperados', () => {
  const resultado = ejecutar('pm2_list', {});
  const lista = JSON.parse(resultado);
  const nombres = lista.map(p => p.name);
  assert.ok(nombres.includes('TacosAragon'), `TacosAragon no encontrado en: ${nombres.join(', ')}`);
  assert.ok(nombres.includes('MonitorBot'), `MonitorBot no encontrado en: ${nombres.join(', ')}`);
});

test('ejecutar — sc_query servicio existente contiene RUNNING', () => {
  const resultado = ejecutar('sc_query', { servicio: 'TacosAragon' });
  assert.ok(resultado.includes('RUNNING'));
});

test('ejecutar — taskkill_chrome no lanza excepcion aunque no haya Chrome', () => {
  assert.doesNotThrow(() => {
    ejecutar('taskkill_chrome', {});
  });
});

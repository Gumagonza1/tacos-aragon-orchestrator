'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const COMANDOS_PERMITIDOS = [
  'pm2_restart',
  'pm2_stop',
  'pm2_start',
  'pm2_list',
  'pm2_logs',
  'taskkill_chrome',
  'git_pull',
  'git_check_updates',
  'disk_status',
  'mem_status',
];

const RUTAS_GIT_PERMITIDAS = (process.env.RUTAS_GIT_PERMITIDAS || '')
  .split(',')
  .map(r => path.resolve(r.trim()))
  .filter(Boolean);

function ejecutar(comando, params = {}) {
  if (!COMANDOS_PERMITIDOS.includes(comando)) {
    throw new Error(`Comando no permitido: ${comando}`);
  }

  switch (comando) {
    case 'pm2_restart':
      return _exec(`pm2 restart ${_validarNombreProceso(params.proceso)}`);

    case 'pm2_stop':
      return _exec(`pm2 stop ${_validarNombreProceso(params.proceso)}`);

    case 'pm2_start':
      return _exec(`pm2 start ${_validarNombreProceso(params.proceso)}`);

    case 'pm2_list':
      return _exec('pm2 jlist');

    case 'pm2_logs':
      return _exec(`pm2 logs ${_validarNombreProceso(params.proceso)} --lines ${_validarNumero(params.lineas, 50)} --nostream`);

    case 'taskkill_chrome':
      return _killChromium();

    case 'git_pull':
      return _gitPull(params.ruta);

    case 'git_check_updates':
      return _gitCheckUpdates(params.ruta);

    case 'disk_status':
      return _exec("df -h / | tail -1 | awk '{print $2,$3,$4,$5}'");

    case 'mem_status':
      return _exec("free -m | grep Mem | awk '{print $2,$3,$4}'");

    default:
      throw new Error(`Comando sin implementar: ${comando}`);
  }
}

function _killChromium() {
  const procesos = ['chromium', 'chrome'];
  const resultados = [];

  for (const proc of procesos) {
    const r = spawnSync('pkill', ['-f', proc], { encoding: 'utf8' });
    resultados.push({ proceso: proc, salida: (r.stdout || '') + (r.stderr || '') });
  }

  return resultados.map(r => `${r.proceso}: ${r.salida.trim() || 'OK'}`).join('\n');
}

function _gitCheckUpdates(ruta) {
  if (!ruta || typeof ruta !== 'string') {
    throw new Error('Ruta requerida para git_check_updates');
  }

  const rutaResuelta = path.resolve(ruta);

  if (RUTAS_GIT_PERMITIDAS.length === 0) {
    throw new Error('RUTAS_GIT_PERMITIDAS no configuradas — git_check_updates deshabilitado');
  }

  const permitida = RUTAS_GIT_PERMITIDAS.some(
    p => rutaResuelta === p || rutaResuelta.startsWith(p + path.sep)
  );

  if (!permitida) {
    throw new Error(`Ruta no permitida para git_check_updates: ${rutaResuelta}`);
  }

  const fetch = spawnSync('git', ['-C', rutaResuelta, 'fetch', '--quiet'], { encoding: 'utf8', timeout: 30000 });
  if (fetch.status !== 0) {
    throw new Error(`git fetch falló: ${(fetch.stderr || '').trim()}`);
  }

  const log = spawnSync(
    'git', ['-C', rutaResuelta, 'log', 'HEAD..FETCH_HEAD', '--oneline', '--no-merges'],
    { encoding: 'utf8', timeout: 10000 }
  );
  return (log.stdout || '').trim();
}

function _gitPull(ruta) {
  if (!ruta || typeof ruta !== 'string') {
    throw new Error('Ruta requerida para git pull');
  }

  const rutaResuelta = path.resolve(ruta);

  if (RUTAS_GIT_PERMITIDAS.length === 0) {
    throw new Error('RUTAS_GIT_PERMITIDAS no configuradas — git pull deshabilitado');
  }

  const permitida = RUTAS_GIT_PERMITIDAS.some(
    p => rutaResuelta === p || rutaResuelta.startsWith(p + path.sep)
  );

  if (!permitida) {
    throw new Error(`Ruta no permitida para git pull: ${rutaResuelta}`);
  }

  return _exec(`git -C "${rutaResuelta}" pull --ff-only`);
}

function _exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    return err.stdout || err.stderr || err.message;
  }
}

function _validarNombreProceso(nombre) {
  if (!nombre || !/^[a-zA-Z0-9_\-]+$/.test(nombre)) {
    throw new Error(`Nombre de proceso invalido: ${nombre}`);
  }
  return nombre;
}

function _validarNumero(valor, defecto) {
  const n = parseInt(valor, 10);
  return isNaN(n) ? defecto : Math.min(Math.max(n, 1), 500);
}

module.exports = { ejecutar, RUTAS_GIT_PERMITIDAS };

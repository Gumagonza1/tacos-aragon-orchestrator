'use strict';

const { llamarBridge } = require('./bridge');
const { registrarAccionAutonoma, registrarEvento } = require('../db/queries');
const { notificarAdmin } = require('../notifier/notifier');
const { proponerCambio } = require('../approval/cola');

const DISCO_MINIMO_GB = parseFloat(process.env.DISCO_MINIMO_GB) || 5;
const MEM_MINIMA_MB = parseFloat(process.env.MEM_MINIMA_MB) || 512;

async function limpiarLogsViejos() {
  try {
    const resultado = await llamarBridge('pm2_logs', { proceso: 'all', lineas: 1 });
    registrarAccionAutonoma('limpieza_logs', null, 'Verificacion completada');
    return resultado;
  } catch (err) {
    registrarEvento('orquestador', 'limpieza_logs', `Error: ${err.message}`, 'error');
  }
}

async function verificarDisco() {
  try {
    const resultado = await llamarBridge('disk_status', {});
    if (!resultado) return;

    const lineas = resultado.split('\n');
    const alertas = [];

    for (const linea of lineas) {
      const match = linea.match(/(\w:)\s+(\d+)\s+(\d+)/);
      if (!match) continue;

      const [, drive, freespace, size] = match;
      const libreGb = parseInt(freespace) / 1e9;

      if (libreGb < DISCO_MINIMO_GB) {
        alertas.push(`${drive} solo tiene ${libreGb.toFixed(1)} GB libres`);
      }
    }

    if (alertas.length > 0) {
      const msg = `*[ORQUESTADOR]* Alerta de disco bajo:\n${alertas.join('\n')}\nRevisa y libera espacio.`;
      await notificarAdmin(msg);
      registrarEvento('servidor', 'disco_bajo', alertas.join(' | '), 'warn');
    }
  } catch (err) {
    registrarEvento('servidor', 'verificar_disco', `Error: ${err.message}`, 'error');
  }
}

async function verificarMemoria() {
  try {
    const resultado = await llamarBridge('mem_status', {});
    if (!resultado || resultado.error) return;

    const { totalMB, usadoMB, disponibleMB } = resultado;
    if (!totalMB || !disponibleMB) return;

    const porcLibre = (disponibleMB / totalMB) * 100;

    if (disponibleMB < MEM_MINIMA_MB) {
      // Identificar qué consume más RAM (procesos no-Docker del host)
      let topProcs = '';
      try {
        const { execSync } = require('child_process');
        topProcs = execSync(
          "ps aux --sort=-%mem | head -6 | tail -5 | awk '{printf \"  %s: %.0f MB\\n\", $11, $6/1024}'",
          { encoding: 'utf8', timeout: 3000 }
        ).trim();
      } catch {}

      const critico = disponibleMB < (MEM_MINIMA_MB / 2);
      const nivel = critico ? '🔴 CRÍTICO' : '🟡 ALERTA';

      const sugerencias = [
        '💡 *Acciones sugeridas (los contenedores Docker NO se pueden apagar):*',
        '• `docker system prune -f` — limpiar imágenes/cache Docker sin uso',
        '• `journalctl --vacuum-size=50M` — reducir logs del sistema',
        '• `sync && echo 3 > /proc/sys/vm/drop_caches` — liberar cache de disco',
      ];

      if (topProcs) {
        sugerencias.push('', '*Top procesos por RAM:*', topProcs);
      }

      if (critico) {
        sugerencias.push(
          '',
          '⚠️ *Nivel crítico* — si no se libera RAM, el sistema puede volverse inestable.',
          'Responde *!o aprobar limpiar\\_ram* para ejecutar limpieza automática.'
        );
        await proponerCambio(
          'limpiar_ram',
          'Limpieza automática de RAM (prune Docker + limpiar cache + reducir logs)',
          'docker system prune -f && journalctl --vacuum-size=50M && sync && echo 3 > /proc/sys/vm/drop_caches'
        );
      }

      const msg = [
        `*[ORQUESTADOR]* ${nivel} — Memoria RAM baja`,
        `RAM: ${usadoMB.toFixed(0)} MB usados / ${totalMB.toFixed(0)} MB total (${porcLibre.toFixed(1)}% libre)`,
        `Disponible: ${disponibleMB.toFixed(0)} MB`,
        '',
        ...sugerencias,
      ].join('\n');

      await notificarAdmin(msg);
      registrarEvento('servidor', 'memoria_baja', `${disponibleMB.toFixed(0)} MB libres`, critico ? 'error' : 'warn');
    }
  } catch (err) {
    registrarEvento('servidor', 'verificar_memoria', `Error: ${err.message}`, 'error');
  }
}

async function verificarCommitsNuevos(ruta, nombreRepo) {
  try {
    const resultado = await llamarBridge('git_check_updates', { ruta });
    if (!resultado || !resultado.trim()) return;

    const lineas = resultado.trim().split('\n');
    const resumen = lineas.length > 5
      ? lineas.slice(0, 5).join('\n') + `\n...(+${lineas.length - 5} más)`
      : resultado.trim();

    await proponerCambio(
      'git_pull',
      `Actualizar ${nombreRepo}\n\nCommits nuevos:\n${resumen}`,
      ruta
    );
    registrarEvento(nombreRepo, 'git_nuevos_commits', `${lineas.length} commit(s) nuevo(s)`, 'info');
  } catch (err) {
    registrarEvento(nombreRepo, 'git_check_updates', `Error: ${err.message}`, 'error');
  }
}

// ── Prioridad de recursos tipo Kubernetes ────────────────────────────────────
const PRIORIDADES_TRABAJO = {
  'bot-tacos':          1024,
  'tacos-api':          1024,
  'bot-tacos-monitor':   768,
  'portfolio-aragon':    768,
  'telegram-dispatcher': 512,
  'orchestrator':        512,
  'pmo-agent':           256,
  'cfo-agent':           256,
};

const PRIORIDADES_NORMAL = {
  'bot-tacos':          1024,
  'tacos-api':          1024,
  'bot-tacos-monitor':  1024,
  'portfolio-aragon':   1024,
  'telegram-dispatcher':1024,
  'orchestrator':       1024,
  'pmo-agent':          1024,
  'cfo-agent':          1024,
};

async function ajustarPrioridades(modo) {
  const http = require('http');
  const shares = modo === 'trabajo' ? PRIORIDADES_TRABAJO : PRIORIDADES_NORMAL;
  const errores = [];

  for (const [container, cpuShares] of Object.entries(shares)) {
    try {
      await new Promise((resolve, reject) => {
        const body = JSON.stringify({ CpuShares: cpuShares });
        const req = http.request({
          socketPath: '/var/run/docker.sock',
          path: `/containers/${container}/update`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            if (res.statusCode === 200) resolve();
            else reject(new Error(`${res.statusCode} ${data}`));
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    } catch (err) {
      errores.push(`${container}: ${err.message}`);
    }
  }

  const label = modo === 'trabajo'
    ? '🔄 *Modo trabajo activado* — prioridad a bot, monitor, API y página'
    : '🔄 *Modo normal* — recursos equitativos';

  if (errores.length > 0) {
    await notificarAdmin(`${label}\n⚠️ Errores: ${errores.join(', ')}`);
  } else {
    await notificarAdmin(label);
  }

  registrarEvento('orquestador', 'prioridades', `Modo: ${modo}`, 'info');
  registrarAccionAutonoma('ajuste_prioridades', modo, `${Object.keys(shares).length} contenedores actualizados`);
}

module.exports = {
  limpiarLogsViejos,
  verificarDisco,
  verificarMemoria,
  verificarCommitsNuevos,
  ajustarPrioridades,
};

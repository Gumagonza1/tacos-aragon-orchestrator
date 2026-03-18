'use strict';

const { llamarBridge } = require('./bridge');
const { registrarAccionAutonoma, registrarEvento } = require('../db/queries');
const { notificarAdmin } = require('../notifier/whatsapp');
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
    if (!resultado) return;

    const libreMatch = resultado.match(/FreePhysicalMemory=(\d+)/);
    const totalMatch = resultado.match(/TotalVisibleMemorySize=(\d+)/);

    if (!libreMatch || !totalMatch) return;

    const libreMb = parseInt(libreMatch[1]) / 1024;
    const totalMb = parseInt(totalMatch[1]) / 1024;
    const porcento = (libreMb / totalMb) * 100;

    if (libreMb < MEM_MINIMA_MB) {
      const msg = `*[ORQUESTADOR]* Memoria RAM baja: ${libreMb.toFixed(0)} MB libres de ${totalMb.toFixed(0)} MB (${porcento.toFixed(1)}% libre).`;
      await notificarAdmin(msg);
      registrarEvento('servidor', 'memoria_baja', `${libreMb.toFixed(0)} MB libres`, 'warn');
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

module.exports = {
  limpiarLogsViejos,
  verificarDisco,
  verificarMemoria,
  verificarCommitsNuevos,
};

'use strict';

const { crearPropuesta, responderPropuesta, obtenerPropuesta, obtenerPropuestasPendientes, registrarAccionAutonoma } = require('../db/queries');
const { notificarAdmin, leerRespuestasAdmin, marcarRespuestaOrchProcesada } = require('../notifier/notifier');
const { llamarBridge } = require('../executor/bridge');

async function proponerCambio(tipo, descripcion, detalle) {
  const id = crearPropuesta(tipo, descripcion, detalle);

  const msg = [
    `*[ORQUESTADOR]* Propuesta #${id}`,
    `Tipo: ${tipo}`,
    ``,
    descripcion,
    ``,
    detalle ? `Detalle:\n${detalle}` : '',
    ``,
    `Responde *!o aprobar ${id}* o *!o rechazar ${id}*`,
  ].filter(l => l !== null).join('\n');

  await notificarAdmin(msg);
  return id;
}

async function procesarRespuesta(texto) {
  const texto_limpio = texto.trim().toLowerCase();

  const matchAprobar = texto_limpio.match(/^aprobar\s+(\d+)$/);
  const matchRechazar = texto_limpio.match(/^rechazar\s+(\d+)$/);

  if (matchAprobar) {
    const id = parseInt(matchAprobar[1], 10);
    responderPropuesta(id, true);
    await notificarAdmin(`*[ORQUESTADOR]* Propuesta #${id} aprobada. Ejecutando...`);
    return { accion: 'aprobar', id };
  }

  if (matchRechazar) {
    const id = parseInt(matchRechazar[1], 10);
    responderPropuesta(id, false);
    await notificarAdmin(`*[ORQUESTADOR]* Propuesta #${id} rechazada. No se aplicara el cambio.`);
    return { accion: 'rechazar', id };
  }

  return null;
}

function listarPendientes() {
  return obtenerPropuestasPendientes();
}

async function ejecutarPropuestaAprobada(id) {
  const propuesta = obtenerPropuesta(id);
  if (!propuesta) return;

  const TIPOS_EJECUTABLES = ['git_pull', 'limpiar_ram'];

  if (!TIPOS_EJECUTABLES.includes(propuesta.tipo)) return;

  try {
    let salida = '';

    if (propuesta.tipo === 'git_pull') {
      const resultado = await llamarBridge('git_pull', { ruta: propuesta.detalle });
      salida = resultado ? resultado.trim() : 'Sin salida.';
    }

    if (propuesta.tipo === 'limpiar_ram') {
      const { execSync } = require('child_process');
      const cmds = [
        'docker system prune -f 2>&1 | tail -2',
        'journalctl --vacuum-size=50M 2>&1 | tail -1',
        'sync && echo 3 > /proc/sys/vm/drop_caches && echo "Cache liberado"',
      ];
      const resultados = [];
      for (const cmd of cmds) {
        try {
          resultados.push(execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim());
        } catch (e) { resultados.push(`Error: ${e.message}`); }
      }
      // Verificar RAM después de limpiar
      const memDespues = execSync("free -m | grep Mem | awk '{print $4}'", { encoding: 'utf8' }).trim();
      salida = resultados.join('\n') + `\n\nRAM disponible ahora: ${memDespues} MB`;
    }

    await notificarAdmin(`*[ORQUESTADOR]* Propuesta #${id} ejecutada.\n${salida}`);
    registrarAccionAutonoma(propuesta.tipo, propuesta.detalle, salida);
  } catch (err) {
    await notificarAdmin(`*[ORQUESTADOR]* Error ejecutando propuesta #${id}: ${err.message}`);
  }
}

let _procesandoRespuestas = false;

async function procesarRespuestasAdmin() {
  if (_procesandoRespuestas) return;
  const filas = leerRespuestasAdmin();
  if (!filas.length) return;

  _procesandoRespuestas = true;
  try {
    for (const fila of filas) {
      try {
        const resultado = await procesarRespuesta(fila.texto);
        if (!resultado) {
          console.warn(`[cola] Respuesta admin no reconocida: "${fila.texto}"`);
        } else if (resultado.accion === 'aprobar') {
          await ejecutarPropuestaAprobada(resultado.id);
        }
      } catch (err) {
        console.error('[cola] Error procesando respuesta admin:', err.message);
      } finally {
        marcarRespuestaOrchProcesada(fila.rowid);
      }
    }
  } finally {
    _procesandoRespuestas = false;
  }
}

module.exports = { proponerCambio, procesarRespuesta, listarPendientes, procesarRespuestasAdmin, ejecutarPropuestaAprobada };

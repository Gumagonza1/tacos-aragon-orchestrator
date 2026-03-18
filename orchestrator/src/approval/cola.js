'use strict';

const { crearPropuesta, responderPropuesta, obtenerPropuestasPendientes } = require('../db/queries');
const { notificarAdmin, leerRespuestasAdmin, marcarRespuestaOrchProcesada } = require('../notifier/whatsapp');

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

module.exports = { proponerCambio, procesarRespuesta, listarPendientes, procesarRespuestasAdmin };

'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('[reasoning] ANTHROPIC_API_KEY no definida — proceso detenido');
  process.exit(1);
}

const cliente = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SISTEMA = `Eres el orquestador inteligente del ecosistema de software del restaurante Tacos Aragon.
Tu funcion es analizar problemas en los servicios y proponer soluciones claras y precisas.

El ecosistema tiene estos servicios:
- TacosAragon: bot de WhatsApp (Node.js, PM2, whatsapp-web.js + Gemini)
- MonitorBot: agente monitor (Node.js, PM2, Claude con tool use)
- tacos-aragon-api: API central (Node.js, PM2, Express en puerto 3001)
- cfo-aragon-agent: agente fiscal CFO (Python, PM2, FastAPI en puerto 3002)
- tacos-aragon-web: pagina web de facturacion (Python, Flask, NSSM)

Reglas:
- Nunca menciones modelos de IA ni nombres de companias de IA en tus propuestas
- Propuestas de codigo siempre en formato diff o bloque claro
- Si no tienes suficiente contexto, pide mas informacion antes de proponer
- Distingue entre problemas transitorios (red, timeout) y problemas de codigo
- Sé conciso y directo — el dueno del restaurante es quien lee tus mensajes
- Nunca uses emojis`;

async function analizarProblema(contexto) {
  const mensaje = `Analiza el siguiente problema y propone una solucion:\n\n${contexto}`;

  const res = await cliente.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SISTEMA,
    messages: [{ role: 'user', content: mensaje }],
  });

  return res.content[0].text;
}

async function analizarLogs(servicio, logs) {
  const mensaje = `Servicio: ${servicio}\n\nLogs recientes:\n${logs}\n\nIdentifica el patron de error principal y propone la causa mas probable y solucion.`;

  const res = await cliente.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: SISTEMA,
    messages: [{ role: 'user', content: mensaje }],
  });

  return res.content[0].text;
}

async function generarResumenDiario(datos) {
  const mensaje = `Genera un resumen operativo del dia para el dueno del restaurante.
Datos de las ultimas 24 horas:\n${JSON.stringify(datos, null, 2)}\n\nEl resumen debe ser claro, en espanol, sin tecnicismos innecesarios.`;

  const res = await cliente.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SISTEMA,
    messages: [{ role: 'user', content: mensaje }],
  });

  return res.content[0].text;
}

module.exports = { analizarProblema, analizarLogs, generarResumenDiario };

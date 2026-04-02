# CLAUDE.md — tacos-aragon-orchestrator

Watchdog central de monitoreo y recuperación automática del ecosistema.

## Propósito
Monitorea 5 servicios cada 30s, ejecuta recuperación escalonada autónoma y envía notificaciones/propuestas al admin vía Telegram.

## Estructura
| Carpeta | Contenido |
|---------|-----------|
| `orchestrator/src/index.js` | Entry point, ciclo de health polling |
| `orchestrator/src/health/` | Monitor de servicios (PM2, HTTP, NSSM) |
| `orchestrator/src/recovery/` | Recuperación: whatsapp.js (especial), proceso.js (genérico) |
| `orchestrator/src/executor/` | Bridge Docker Engine API + acciones autónomas + prioridades |
| `orchestrator/src/db/` | SQLite: eventos, fallas, propuestas, acciones |
| `orchestrator/src/notifier/` | Notificaciones al admin vía cola compartida |
| `orchestrator/src/approval/` | Sistema de propuestas con aprobación |
| `orchestrator/src/scheduler/` | Cron: disco, memoria, logs, resumen diario, git, prioridades CPU |
| `orchestrator/src/queue/` | Cola de solicitudes al CFO Agent |
| `host-bridge/` | Legado Windows — reemplazado por Docker Engine API en bridge.js |

## Servicios monitoreados
| Servicio | Tipo | Puerto | Crítico |
|----------|------|--------|---------|
| TacosAragon | HTTP | 3003 | Sí |
| MonitorBot | PM2 | - | Sí |
| tacos-api | HTTP | 3001 | Sí |
| cfo-agent | HTTP | 3002 | No |
| tacos-aragon-web | NSSM | 80/443 | No |

## Reglas de trabajo
- Timezone GMT-7
- No ejecutar acciones destructivas sin aprobación del admin
- Git pull solo en rutas whitelisted (RUTAS_GIT_PERMITIDAS)
- Cooldown de 5 min obligatorio después de recuperación completa de WhatsApp
- Los contenedores Docker NUNCA se apagan — solo se ajustan prioridades de CPU

## Gestión de prioridades CPU
- **Modo trabajo** (18:00–23:59 mar-dom): Prioridad alta a bot-tacos y tacos-api (1024), media-alta a monitor y portfolio (768), baja a pmo y cfo (256)
- **Modo normal** (00:00–17:59): Todos en 1024 (equitativo)
- Implementado via Docker Engine API (`/containers/{name}/update` con `CpuShares`)
- `cpu-shares` es relativo — solo aplica cuando hay contención de CPU

## Alerta de memoria inteligente
- Lee RAM via bridge (`mem_status`) — formato Linux (`free -m`)
- **🟡 ALERTA** (< 512 MB): Sugerencias + top procesos por RAM
- **🔴 CRÍTICO** (< 256 MB): Propuesta con botones para limpieza automática (prune Docker + cache + logs)
- Tipos de propuesta ejecutables: `git_pull`, `limpiar_ram`

---

## MCP Prompt Primitives

Servidor: `../mcp-prompts-server/` — ejecutar con `python server.py`

### Prompts asignados a este proyecto

| # | Prompt | Archivo | Descripción | Función que cubre |
|---|--------|---------|-------------|-------------------|
| 1 | `verificar_salud_servicios` | `prompts/orchestrator.py` | Diagnóstico de salud de todos los servicios | `health/monitor.js:verificarTodos()` |
| 2 | `recuperar_servicio` | `prompts/orchestrator.py` | Protocolo de recuperación escalonada | `recovery/whatsapp.js` + `recovery/proceso.js` |
| 3 | `resumen_diario_operaciones` | `prompts/orchestrator.py` | Reporte diario de operaciones (9 AM) | `scheduler/tareas.js` cron 0 9 * * * |
| 4 | `proponer_cambio_sistema` | `prompts/orchestrator.py` | Propuestas de cambio para aprobación admin | `approval/cola.js:proponerCambio()` |

### Detalle de cada prompt

#### 1. `verificar_salud_servicios`
- **Argumentos**: `estados` (mapa servicio→status), `historial_fallas`
- **System prompt**: Verifica PM2 (status=online), HTTP (200 en <5s), NSSM (STATE=RUNNING). Clasifica: rojo (crítico caído), amarillo (no-crítico), verde (OK)
- **Función**: `health/monitor.js:verificarTodos()` — ejecuta cada 30s
- **Salida**: Diagnóstico con causa probable, acción recomendada, escalación

#### 2. `recuperar_servicio`
- **Argumentos**: `servicio`, `tipo_servicio`, `contador_fallas`, `error`
- **System prompt**: Escalamiento:
  - WhatsApp: restart (×2) → stop+taskkill+start+cooldown (×3) → manual (×4+)
  - PM2 genérico: restart (×2) → notificar (×3+)
  - HTTP/NSSM: solo notificar
- **Funciones**: `recovery/whatsapp.js:manejarFallaWhatsApp()`, `recovery/proceso.js:manejarFallaProceso()`

#### 3. `resumen_diario_operaciones`
- **Argumentos**: `eventos`, `acciones_autonomas`, `propuestas_pendientes`, `estado_disco`, `estado_memoria`
- **System prompt**: Máximo 1000 chars (Telegram). Formato: servicios OK, caídas, recuperaciones auto, disco/RAM, eventos relevantes
- **Cron**: Diario 9 AM GMT-7

#### 4. `proponer_cambio_sistema`
- **Argumentos**: `tipo` (git_pull/config_change/restart), `repositorio`, `detalle`
- **System prompt**: Crea propuesta con botones Aprobar/Rechazar para Telegram. Muestra commits nuevos para git_pull
- **Función**: `approval/cola.js:proponerCambio()`
- **Seguridad**: Solo repos whitelisted, timeout 30s, nombres alfanuméricos

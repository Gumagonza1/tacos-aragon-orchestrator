# tacos-aragon-orchestrator — Ecosistema Aragón

Vigilante central de todos los servicios Aragón. Monitorea 6 servicios cada 30 segundos via Docker Engine API, ejecuta recuperaciones autónomas, gestiona prioridades de CPU, y enruta decisiones críticas al admin por Telegram.

## Arquitectura

```
Servicios Docker
  ├── bot-tacos           (WhatsApp bot, :3003)
  ├── tacos-api           (API central, :3001)
  ├── cfo-agent           (CFO, :3002)
  ├── bot-tacos-monitor   (Monitor calidad)
  ├── pmo-agent           (Claude Code agent)
  └── portfolio-aragon    (Web, :80)
          │
          ▼
  ┌──────────────────────────────────────┐
  │    Docker: orchestrator              │
  │                                      │
  │  health/      Polling cada 30s       │
  │  recovery/    Restart + recuperación │
  │  executor/    Docker Engine API      │
  │  approval/    Propuestas con botones │
  │  notifier/    Notificaciones Telegram│
  │  scheduler/   Cron (disco, RAM, git) │
  │  pmo/         Auto-corrección código │
  │  queue/       Cola CFO Agent         │
  │  db/          SQLite                 │
  └──────────┬───────────────────────────┘
             │
             ▼
  telegram-dispatcher ──► Telegram (admin)
          ▲
          └── ✅ Aprobar / ❌ Rechazar
```

**Cambio clave:** El orchestrator ahora usa **Docker Engine API** directamente (via socket Unix `/var/run/docker.sock`), eliminando la dependencia del host-bridge de Windows.

## Servicios monitoreados

| Servicio | Container | Puerto | Crítico |
|----------|-----------|--------|---------|
| TacosAragon | bot-tacos | 3003 | Si |
| tacos-api | tacos-api | 3001 | Si |
| MonitorBot | bot-tacos-monitor | — | Si |
| cfo-agent | cfo-agent | 3002 | No |
| pmo-agent | pmo-agent | — | No |
| telegram-dispatcher | telegram-dispatcher | — | No |

## Acciones autónomas (sin pedir permiso)

| Acción | Detalle |
|--------|---------|
| Restart de contenedor | Hasta 2 intentos antes de escalar |
| Recuperación WhatsApp | stop → kill chromium → start → cooldown 5 min (3er fallo) |
| Alerta disco bajo | < 5 GB libres |
| Alerta memoria (2 niveles) | 🟡 < 512 MB: sugerencias + top procesos / 🔴 < 256 MB: propuesta de limpieza auto |
| Prioridades CPU | Modo trabajo (18:00-23:59 mar-dom) vs modo normal |
| Limpieza de logs | 4:00 AM diario |
| Resumen diario | 9:00 AM por Telegram |
| Detección de commits | Cada 2 horas en todos los repos |
| Auto-corrección PMO | Notifica al pmo-agent cuando un servicio falla repetidamente |

## Gestión de prioridades CPU

El orchestrator ajusta `CpuShares` de cada contenedor via Docker Engine API:

### Modo trabajo (18:00–23:59, mar-dom)

| Contenedor | CpuShares | Prioridad |
|------------|-----------|-----------|
| bot-tacos | 1024 | Máxima |
| tacos-api | 1024 | Máxima |
| bot-tacos-monitor | 768 | Media-alta |
| portfolio-aragon | 768 | Media-alta |
| pmo-agent | 256 | Baja |
| cfo-agent | 256 | Baja |

### Modo normal (00:00–17:59)

Todos los contenedores en 1024 (equitativo).

`CpuShares` es relativo — solo aplica cuando hay contención de CPU.

## Alerta de memoria inteligente

| Nivel | Umbral | Acción |
|-------|--------|--------|
| 🟡 ALERTA | < 512 MB | Sugerencias + top 5 procesos por RAM |
| 🔴 CRITICO | < 256 MB | Propuesta con botones para limpieza automática |

La limpieza automática ejecuta:
1. `docker system prune -f` (contenedores/imágenes no usados)
2. `journalctl --vacuum-size` (comprimir logs del sistema)
3. `drop_caches` (liberar caché del kernel)

## Auto-corrección via PMO

Cuando un servicio falla repetidamente (después de agotar reintentos):

1. Orchestrator detecta fallas persistentes
2. Notifica al **pmo-agent** via cola SQLite compartida (`mensajes.db`)
3. PMO ejecuta `claude -p` para diagnosticar y corregir el código
4. Si PMO corrige, el servicio se reinicia automáticamente

## Acciones que requieren aprobación

| Acción | Tipo |
|--------|------|
| `git pull` en cualquier repo | Solo repos whitelisted |
| Limpieza de RAM | docker prune + journal + caches |
| Cambios de configuración | — |
| Reinicios no urgentes | — |

Respuesta del admin desde Telegram:

```
✅ Aprobar / ❌ Rechazar (botones inline)
  — o —
aprobar 3    → aprueba la propuesta #3
rechazar 3   → rechaza la propuesta #3
```

## Estructura del proyecto

```
tacos-aragon-orchestrator/
├── docker-compose.yml
├── orchestrator/
│   ├── src/
│   │   ├── index.js           # Entry point, ciclo de polling
│   │   ├── config.js          # Variables de entorno
│   │   ├── health/
│   │   │   ├── monitor.js     # Verificación de todos los servicios
│   │   │   └── servicios.js   # Definición de servicios y checks
│   │   ├── recovery/
│   │   │   ├── whatsapp.js    # Recuperación especial WhatsApp
│   │   │   └── proceso.js     # Recuperación genérica
│   │   ├── executor/
│   │   │   ├── bridge.js      # Docker Engine API (reemplaza host-bridge)
│   │   │   └── acciones.js    # Acciones autónomas + prioridades CPU
│   │   ├── approval/
│   │   │   └── cola.js        # Propuestas pendientes (git_pull, limpiar_ram)
│   │   ├── notifier/          # Notificaciones Telegram
│   │   ├── scheduler/
│   │   │   └── tareas.js      # Cron: disco, RAM, logs, resumen, git, CPU
│   │   ├── pmo/
│   │   │   └── autocorrect.js # Integración con pmo-agent
│   │   ├── queue/
│   │   │   └── cfo.js         # Cola de solicitudes al CFO Agent
│   │   └── db/                # SQLite (eventos, fallas, propuestas)
│   └── Dockerfile
├── host-bridge/               # Legado Windows (opcional)
│   ├── bridge.js              # HTTP server para PM2/NSSM
│   └── ejecutor.js            # Comandos del sistema (Linux)
└── generar-token.js           # Utilidad para generar tokens
```

## Instalación (Docker)

```bash
cd tacos-aragon-orchestrator
docker-compose up -d --build
docker-compose logs -f
```

**Requisito:** Montar Docker socket al contenedor:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

## Variables de entorno

Ver [orchestrator/.env.example](orchestrator/.env.example) para la lista completa.

> **Seguridad:** `.env` y `ecosystem.config.js` nunca se incluyen en el repositorio.

## Ecosistema

| Servicio | Repo | Puerto |
|----------|------|--------|
| Bot WhatsApp | [whatsapp-tacos-bot](https://github.com/Gumagonza1/whatsapp-tacos-bot) | 3003 |
| API central | [tacos-aragon-api](https://github.com/Gumagonza1/tacos-aragon-api) | 3001 |
| Monitor | [tacos-aragon-monitor](https://github.com/Gumagonza1/tacos-aragon-monitor) | — |
| Orchestrator | este repo | — |
| PMO Agent | pmo-agent | — |
| CFO Agent | cfo_aragon_agent | 3002 |

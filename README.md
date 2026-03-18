# tacos-aragon-orchestrator — Aragón Ecosystem

Central watchdog for all Aragón services. Polls every 30 s, executes low-risk recoveries autonomously, and routes critical decisions to the admin via Telegram for approval.

## How it works

```
All services
  ├── TacosAragon (NSSM)
  ├── tacos-aragon-api (PM2)
  ├── cfo-aragon-agent (PM2)
  ├── MonitorBot (PM2)
  └── tacos-aragon-web (NSSM + HTTP)
          │
          ▼
  [Docker: orchestrator]  ◄──►  [Windows: host-bridge (PM2)]
          │
          ├── health/      Service polling every 30 s
          ├── recovery/    Restart + recovery logic
          ├── reasoning/   Intelligent problem analysis
          ├── approval/    Pending proposals queue
          ├── notifier/    Telegram notifications
          ├── scheduler/   Scheduled automatic tasks
          └── db/          SQLite (single source of truth)
          │
          ▼
  telegram-dispatcher ──► Telegram (admin)
          ▲
          └── ✅ Approve / ❌ Reject
```

## Monitored services

| Service | Type | Port |
|---------|------|------|
| TacosAragon | NSSM | — |
| MonitorBot | PM2 | — |
| tacos-aragon-api | PM2 + HTTP | 3001 |
| cfo-aragon-agent | PM2 + HTTP | 3002 |
| tacos-aragon-web | NSSM + HTTP | 80 / 443 |

## Autonomous actions (no approval required)

- PM2 process restart on failure (up to 2 attempts)
- Full WhatsApp recovery: `pm2 stop` → `taskkill chrome` → `pm2 start` → 5 min cooldown (on 3rd failure)
- Low disk alert (< 5 GB free)
- Low memory alert (< 512 MB free)
- Log cleanup at 4 AM
- Daily summary at 9 AM via Telegram
- New commit detection in all repos every 2 hours

## Actions requiring approval

- `git pull` in any repo
- Configuration changes
- Code modifications
- Non-urgent restarts

## Admin response

From Telegram (inline buttons or text):

```
Tap ✅ Approve / ❌ Reject on the proposal message
  — or —
aprobar 3    → approve proposal #3
rechazar 3   → reject proposal #3
```

## Setup

### 1. Host-bridge (Windows — run once)

```bash
cd host-bridge
npm install
cp .env.example .env
# fill in BRIDGE_TOKEN
pm2 start ecosystem.config.js
pm2 save
```

### 2. Orchestrator (Docker)

```bash
cd orchestrator
cp .env.example .env
# fill in all variables
cd ..
docker-compose up -d --build
docker-compose logs -f
```

## Environment variables

See [orchestrator/.env.example](orchestrator/.env.example) for the full list with descriptions.

---

# tacos-aragon-orchestrator — Ecosistema Aragón

Vigilante central de todos los servicios Aragón. Hace polling cada 30 s, ejecuta recuperaciones de bajo riesgo de forma autónoma y enruta las decisiones críticas al admin por Telegram para su aprobación.

## Cómo funciona

```
Todos los servicios
  ├── TacosAragon (NSSM)
  ├── tacos-aragon-api (PM2)
  ├── cfo-aragon-agent (PM2)
  ├── MonitorBot (PM2)
  └── tacos-aragon-web (NSSM + HTTP)
          │
          ▼
  [Docker: orchestrator]  ◄──►  [Windows: host-bridge (PM2)]
          │
          ├── health/      Polling de servicios cada 30 s
          ├── recovery/    Lógica de reinicio y recuperación
          ├── reasoning/   Análisis inteligente de problemas
          ├── approval/    Cola de propuestas pendientes
          ├── notifier/    Notificaciones Telegram
          ├── scheduler/   Tareas automáticas programadas
          └── db/          SQLite (única fuente de verdad)
          │
          ▼
  telegram-dispatcher ──► Telegram (admin)
          ▲
          └── ✅ Aprobar / ❌ Rechazar
```

## Servicios monitoreados

| Servicio | Tipo | Puerto |
|----------|------|--------|
| TacosAragon | NSSM | — |
| MonitorBot | PM2 | — |
| tacos-aragon-api | PM2 + HTTP | 3001 |
| cfo-aragon-agent | PM2 + HTTP | 3002 |
| tacos-aragon-web | NSSM + HTTP | 80 / 443 |

## Acciones autónomas (sin pedir permiso)

- Restart de proceso PM2 caído (hasta 2 intentos)
- Recuperación completa de WhatsApp: `pm2 stop` → `taskkill chrome` → `pm2 start` → cooldown 5 min (al 3er fallo)
- Alerta de disco bajo (< 5 GB libres)
- Alerta de memoria baja (< 512 MB libres)
- Limpieza de logs a las 4 AM
- Resumen diario a las 9 AM por Telegram
- Detección de commits nuevos en repos cada 2 horas

## Acciones que requieren aprobación

- `git pull` en cualquier repo
- Cambios de configuración
- Modificaciones de código
- Reinicios no urgentes

## Respuesta del administrador

Desde Telegram (botones inline o comandos de texto):

```
Presionar ✅ Aprobar / ❌ Rechazar en el mensaje de propuesta
  — o —
aprobar 3    → aprueba la propuesta #3
rechazar 3   → rechaza la propuesta #3
```

## Instalación

### 1. Host-bridge (Windows — ejecutar una sola vez)

```bash
cd host-bridge
npm install
cp .env.example .env
# completar BRIDGE_TOKEN
pm2 start ecosystem.config.js
pm2 save
```

### 2. Orchestrator (Docker)

```bash
cd orchestrator
cp .env.example .env
# completar todas las variables
cd ..
docker-compose up -d --build
docker-compose logs -f
```

## Variables de entorno

Ver [orchestrator/.env.example](orchestrator/.env.example) para la lista completa con descripciones.

> **Seguridad:** El archivo `.env` y `ecosystem.config.js` (con rutas locales) nunca se incluyen en el repositorio.

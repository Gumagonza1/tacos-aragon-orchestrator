# tacos-aragon-orchestrator

Orquestador central del ecosistema Aragon. Monitorea todos los servicios, ejecuta acciones autonomas de bajo riesgo, y solicita aprobacion del administrador para cambios criticos.

---

## Arquitectura

```
[Docker: orchestrator]  <-->  [Windows: host-bridge (PM2)]
        |
        |-- health/       Polling de servicios cada 30s
        |-- recovery/     Logica de reinicio y recuperacion
        |-- reasoning/    Analisis de problemas con IA
        |-- approval/     Cola de propuestas pendientes
        |-- notifier/     Mensajes WhatsApp al admin
        |-- queue/        Solicitudes al CFO sin JSON
        |-- scheduler/    Tareas automaticas programadas
        |-- db/           SQLite (unica fuente de verdad)
```

## Servicios monitoreados

| Servicio | Tipo | Puerto |
|---|---|---|
| TacosAragon | PM2 | sin HTTP |
| MonitorBot | PM2 | sin HTTP |
| tacos-aragon-api | PM2 + HTTP | 3001 |
| cfo-aragon-agent | PM2 + HTTP | 3002 |
| tacos-aragon-web | NSSM + HTTP | 80/443 |

## Acciones autonomas (sin pedir permiso)

- Restart de proceso PM2 caido (hasta 2 veces)
- Recuperacion completa de WhatsApp (pm2 stop + taskkill chrome + pm2 start + cooldown 5 min) al tercer fallo
- Alerta de disco bajo (< 5 GB libres)
- Alerta de memoria baja (< 512 MB libres)
- Limpieza de logs a las 4 AM
- Resumen diario a las 9 AM por WhatsApp
- Deteccion de commits nuevos en repos cada 2 horas

## Acciones que requieren aprobacion

- git pull en cualquier repo
- Cambios de configuracion
- Cualquier cambio de codigo
- Reinicios no urgentes

## Respuesta del administrador

Desde WhatsApp responder:
- `aprobar 3` — aprueba la propuesta numero 3
- `rechazar 3` — rechaza la propuesta numero 3

---

## Instalacion

### 1. Host-bridge (Windows, ejecutar una sola vez)

```bash
cd host-bridge
npm install
cp .env.example .env
# Editar .env con BRIDGE_TOKEN seguro
pm2 start ecosystem.config.js
pm2 save
```

### 2. Orchestrator (Docker)

```bash
cd orchestrator
cp .env.example .env
# Editar .env con todas las variables
cd ..
docker-compose up -d --build
```

### Verificar

```bash
docker-compose logs -f
```

---

## Variables de entorno

Ver [orchestrator/.env.example](orchestrator/.env.example) para la lista completa con descripciones.

---

Aragon Ecosystem — tacos-aragon-orchestrator

---

# tacos-aragon-orchestrator (ES)

Orquestador central del ecosistema. Monitorea servicios, actua de forma autonoma en situaciones de bajo riesgo, y solicita aprobacion via WhatsApp para cambios importantes.

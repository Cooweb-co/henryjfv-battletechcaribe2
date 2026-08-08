# FinBot · Tu asesor financiero personal

Registra gastos escribiendo en lenguaje natural — por Telegram o por el chat web — y
mira tu comportamiento de gasto en gráficas. Next.js + SQLite + Claude API.

## Arranque

```bash
npm install
cp .env.example .env.local     # completa las llaves que vayas a usar
npm run dev                    # http://localhost:3000
```

Sin `ANTHROPIC_API_KEY` el bot sigue funcionando: cae a una heurística local por
palabras clave, así que la demo nunca queda muerta.

## Telegram

Dos caminos, ambos comparten la misma lógica y la misma base:

```bash
# Local, sin URL pública (long polling)
TELEGRAM_BOT_TOKEN=... npm run telegram

# Producción: registra el webhook contra /api/telegram/webhook
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://TU-DOMINIO/api/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

## Cómo se habla con el bot

| Mensaje | Qué hace |
|---|---|
| `gasté 20 mil en café` | extrae monto 20000 y categoría alimentación |
| `12.000 taxi y 45 mil mercado` | registra los dos gastos en un solo mensaje |
| `compré algo carísimo` | detecta ambigüedad y pregunta el monto |
| `/resumen` | total del mes, desglose por categoría y estado del presupuesto |
| `/presupuesto 1500000` | fija el tope mensual y activa las alertas |
| `no eran 20 mil, eran 30 mil` | corrige el monto del último gasto |
| `en realidad fue un taxi` | recategoriza el último gasto |
| `borra el último` / `/deshacer` | elimina el último registro |

## Arquitectura

| Pieza | Archivo |
|---|---|
| Extracción NLP (Claude structured outputs + fallback local) | [lib/ai.js](lib/ai.js) |
| Orquestación, resumen y alertas | [lib/finbot.js](lib/finbot.js) |
| Persistencia SQLite y consultas agregadas | [lib/db.js](lib/db.js) |
| Cliente de Telegram | [lib/telegram.js](lib/telegram.js) |
| Chat web | [components/Chat.jsx](components/Chat.jsx) · [app/api/chat/route.js](app/api/chat/route.js) |
| Gráficas | [components/Charts.jsx](components/Charts.jsx) · [app/api/stats/route.js](app/api/stats/route.js) |
| Observaciones y proyección | [lib/insights.js](lib/insights.js) |
| Validación, límite de tasa | [lib/security.js](lib/security.js) |
| Exportación CSV | [lib/csv.js](lib/csv.js) · [app/api/export/route.js](app/api/export/route.js) |

`interpret()` usa `claude-opus-5` con `output_config.format` (json_schema), así que la
salida siempre valida contra el esquema: monto, categoría, descripción, fecha y
presupuesto. Si la llamada falla o no hay llave, la heurística de `fallbackParse()`
mantiene el flujo vivo.

## Gráficas

Tres lecturas del comportamiento, en SVG propio con tooltips y modo claro/oscuro:

- **Barras por categoría** — en qué se va la plata este mes.
- **Acumulado del mes contra la línea de presupuesto** — si el ritmo de gasto aguanta.
- **Tendencia de los últimos 6 meses** — si el mes viene peor que los anteriores.

La paleta pasó el validador de contraste y visión cromática (banda de luminosidad,
piso de croma, separación CVD y contraste sobre la superficie) en ambos modos.

## Observaciones automáticas

Todas se calculan sobre SQLite, nunca las escribe el modelo, así que no hay cifras
inventadas:

- variación contra el mes anterior;
- concentración: qué categoría se lleva más del 40% del gasto;
- proyección de cierre según el ritmo diario, y cuánto habría que bajar por día
  para volver al presupuesto;
- día más caro del mes.

## Alertas de presupuesto

Al 80% del tope el mensaje pasa a "atención" y la barra se pone ámbar; al pasarse,
el bot responde con el excedente exacto y la barra se pone roja. La alerta viaja en
la misma respuesta del chat, así que llega igual por Telegram y por web.

## Pruebas

```bash
npm test   # 25 pruebas con node:test sobre una base SQLite temporal
```

Cubren montos coloquiales, categorización, entradas ambiguas que no deben inventar
monto, corrección y borrado del último gasto, umbrales de presupuesto, aislamiento
entre usuarios, proyección de cierre, validación de entrada, límite de tasa y
escape del CSV.

## Seguridad

- `userId` validado contra lista blanca de caracteres; consultas siempre con
  sentencias preparadas.
- Mensajes limitados a 500 caracteres y límite de tasa por usuario (20/min en el
  chat, 60/min en estadísticas, 10/min en exportación).
- El webhook de Telegram verifica `x-telegram-bot-api-secret-token`.
- Los errores del servidor no devuelven el detalle interno al cliente.
- El CSV neutraliza celdas que empiezan por `=`, `+`, `-` o `@`.
- Cada navegador tiene su propio id en `localStorage`: es identidad, no
  autenticación — un despliegue real necesita login.

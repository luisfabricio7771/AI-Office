# AI OFFICE

Oficina 3D con DEMO autónoma y eventos LIVE por WebSocket. Node >=22.18.

```sh
npm install
# Terminal 1: usa un token local propio; no lo incluyas en variables VITE_*.
export AI_OFFICE_TOKEN='tu-token-local'
npm run bridge
# Terminal 2
npm run dev
# Terminal 3: el mismo token que el servidor
export AI_OFFICE_TOKEN='tu-token-local'
npm run send:event
```

Selecciona LIVE en la interfaz. El script recorre inicio, progreso, finalización y reposo de CODEX.
`npm run send:event -- '<JSON>'` envía un evento personalizado.

Emisores: `ws://127.0.0.1:8787/events`, cabecera `Authorization: Bearer <token>`.
Interfaz de lectura: `ws://127.0.0.1:8787/watch`. Nunca publiques el token en el cliente.
Eventos: `eventId`, `agentId` (jarvis/codex/nexus/scout), `type`, `timestamp` ISO con zona horaria; `task` requerida en eventos task.*; `status` requerido en agent.status_changed; `progress` opcional 0–100 en task.progress.

Configuración opcional: `AI_OFFICE_PORT`, `AI_OFFICE_HOST` (localhost por defecto), `AI_OFFICE_ORIGINS` (orígenes separados por comas). Cliente: `VITE_BRIDGE_URL`. Script: `AI_OFFICE_EVENTS_URL`.
El servidor retiene el último evento por agente para reconexiones y hasta 10 000 IDs para deduplicar; todo se pierde al reiniciar. Los eventos anteriores al último timestamp del agente se rechazan. Las instantáneas no disparan notificaciones de finalización.

Verificación: `npm run build` y `npm run test:bridge`.

## Codex CLI · PowerShell

Solo observa JSONL conectado explícitamente; no observa sesiones existentes de VS Code ni inicia IA.

```powershell
# Terminal servidor (elige un token local propio)
$env:AI_OFFICE_TOKEN = 'tu-token-local'
npm run bridge
# Otra terminal
npm run dev
# Otra terminal, mismo token; selecciona LIVE en la web
$env:AI_OFFICE_TOKEN = 'tu-token-local'
node scripts/codex-bridge.mjs --file examples/codex-demo.jsonl
# Para conectar una tarea CLI que tú decidas ejecutar (consume créditos):
codex exec --json "TU TAREA" | node scripts/codex-bridge.mjs
# Captura real existente, únicamente un archivo que elijas explícitamente:
node scripts/codex-bridge.mjs --file captura.jsonl --live
```

Los archivos se etiquetan SIMULACIÓN por defecto; `--demo` también etiqueta stdin simulado. Solo se envían etiquetas fijas: nunca comandos, prompts, rutas, contenido ni mensajes de error originales. No se inventan porcentajes. El contador corresponde a eventos de finalización recibidos en esta vista, excluye instantáneas y se reinicia al cambiar de modo o de origen (simulación/CLI). La celebración dura unos segundos. El adaptador espera ACK, reintenta con el mismo ID hasta cinco veces y termina con error si no puede entregar; no persiste datos ni inicia procesos de IA.

Prueba local sin créditos: `npm run test:codex`.

## Living Office

Vida ambiental y velocidad se controlan desde el panel. Selecciona al menos dos agentes libres para una reunión visual SIM y usa «Terminar reunión» para hacerlos volver. «A su escritorio» actúa sobre el agente seleccionado. DEMO puede pasear y saludar; LIVE no genera paseos autónomos. Los eventos de tareas interrumpen recorridos y reuniones. Velocidad solo cambia animaciones/movimientos, nunca los eventos reales. Pruebas: `npm run test:living`.

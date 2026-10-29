import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { WebSocket } from 'ws'

// Only fixed activity labels leave this process; never forward CLI payloads.
export function transformCodexEvent(input, source = 'codex-cli') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  let type, task
  switch (input.type) {
    case 'turn.started': type = 'task.started'; task = 'CODEX comienza a trabajar'; break
    case 'turn.completed': type = 'task.completed'; task = 'Tarea finalizada'; break
    case 'turn.failed': case 'error': type = 'task.failed'; task = 'Error en la tarea de CODEX'; break
    case 'item.started': case 'item.updated': case 'item.completed': {
      const item = input.item
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || typeof item.type !== 'string') return null
      const activities = { command_execution: 'Ejecutando comando', file_change: 'Modificando código', agent_message: 'Preparando respuesta', reasoning: 'Analizando tarea', web_search: 'Investigando', mcp_tool_call: 'Utilizando herramienta', todo_list: 'Actualizando plan' }
      task = activities[item.type]
      if (!task) return null
      if (input.type === 'item.completed') task = item.type === 'command_execution' ? 'Comando finalizado' : item.type === 'file_change' ? 'Modificación de código registrada' : 'Actividad finalizada'
      type = 'task.progress'
      break
    }
    default: return null
  }
  return { eventId: randomUUID(), agentId: 'codex', type, task, timestamp: new Date().toISOString(), source }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
export async function runAdapter({ input, token, url = 'ws://127.0.0.1:8787/events', source = 'codex-cli' }) {
  if (!token) throw new Error('Configura AI_OFFICE_TOKEN con el mismo token local del servidor.')
  const endpoint = new URL(url)
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('URL de eventos no válida.')
  let ws
  async function connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` }, handshakeTimeout: 5000 })
      socket.on('error', () => {})
      const fail = () => { socket.terminate(); reject(new Error('Conexión no disponible')) }
      socket.once('error', fail)
      socket.once('open', () => { socket.removeListener('error', fail); resolve(socket) })
    })
  }
  async function send(event) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (ws?.readyState !== WebSocket.OPEN) ws = await connect()
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => finish(new Error('Sin confirmación')), 5000)
          const closed = () => finish(new Error('Desconectado'))
          const message = raw => {
            let result
            try { result = JSON.parse(raw.toString()) } catch { return }
            if (result.kind === 'rejected') finish(new Error('Evento rechazado'))
            else if (result.kind === 'ack' && result.eventId === event.eventId) finish()
          }
          function finish(error) { clearTimeout(timer); ws.off('message', message); ws.off('close', closed); error ? reject(error) : resolve() }
          ws.on('message', message); ws.once('close', closed)
          ws.send(JSON.stringify(event), error => { if (error) finish(error) })
        })
        return
      } catch {
        ws?.terminate()
        if (attempt === 4) throw new Error('No se pudo entregar el evento al puente local. Comprueba servidor y token.')
        await delay(Math.min(250 * 2 ** attempt, 2000))
      }
    }
  }
  let sent = 0, ignored = 0
  const lines = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (!line.trim()) continue
      let raw
      try { if (line.length > 1024 * 1024) throw new Error(); raw = JSON.parse(line.replace(/^\uFEFF/, '')) } catch { ignored++; continue }
      const event = transformCodexEvent(raw, source)
      if (!event) { ignored++; continue }
      await send(event)
      sent++
    }
    return { sent, ignored }
  } finally { lines.close(); ws?.close() }
}
async function main() {
  const args = process.argv.slice(2)
  let file, demo = false, live = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i+1]) file = args[++i]
    else if (args[i] === '--demo') demo = true
    else if (args[i] === '--live') live = true
    else throw new Error('Uso: node scripts/codex-bridge.mjs [--file archivo.jsonl] [--demo | --live]')
  }
  if (demo && live) throw new Error('Elige --demo o --live.')
  const input = file ? createReadStream(file, { encoding: 'utf8' }) : process.stdin
  const source = demo || file && !live ? 'simulation' : 'codex-cli'
  try {
    const result = await runAdapter({ input, token: process.env.AI_OFFICE_TOKEN, url: process.env.AI_OFFICE_EVENTS_URL, source })
    console.log(`${source === 'simulation' ? 'SIMULACIÓN' : 'CODEX CLI'}: ${result.sent} eventos enviados, ${result.ignored} líneas ignoradas.`)
  } finally { if (file) input.destroy() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Adaptador detenido: comprueba argumentos, archivo, servidor y AI_OFFICE_TOKEN. No se muestran datos de entrada.'); process.exitCode = 1 })

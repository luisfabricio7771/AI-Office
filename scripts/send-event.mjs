import { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
const token = process.env.AI_OFFICE_TOKEN
if (!token) throw new Error('Configura AI_OFFICE_TOKEN con el mismo token del servidor.')
const ws = new WebSocket(process.env.AI_OFFICE_EVENTS_URL || 'ws://127.0.0.1:8787/events', { headers: { Authorization: `Bearer ${token}` } })
const phases = process.argv[2] ? [JSON.parse(process.argv[2])] : [
  { type: 'task.started', task: 'Programando interfaz' },
  { type: 'task.progress', task: 'Programando interfaz', progress: 65 },
  { type: 'task.completed', task: 'Interfaz terminada' },
  { type: 'agent.status_changed', status: 'idle' },
]
let index = 0
const timeout = setTimeout(() => { console.error('Tiempo de espera agotado'); ws.terminate(); process.exitCode = 1 }, 20000)
function next() { ws.send(JSON.stringify({ eventId: randomUUID(), agentId: 'codex', timestamp: new Date().toISOString(), source: 'simulation', ...phases[index++] })) }
ws.on('open', next)
ws.on('message', data => {
  const result = JSON.parse(data.toString()); console.log(result)
  if (result.kind !== 'ack') { process.exitCode = 1; ws.close(); return }
  if (index < phases.length) setTimeout(next, 2000)
  else ws.close()
})
ws.on('error', error => { console.error(error.message); process.exitCode = 1; clearTimeout(timeout) })
ws.on('close', () => clearTimeout(timeout))

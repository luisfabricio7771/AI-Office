import { create } from 'zustand'
import { initialLife, advanceLife, meetingStart, meetingEnd, returnHome, interrupt, type Life } from './living.ts'
import { eventStatus, validEvent, type AgentEvent, type Status } from '../shared/events.ts'
import type { Connection } from './bridge.ts'
export type { Status } from '../shared/events.ts'
export const labels: Record<Status, string> = { idle: 'En espera', thinking: 'Pensando', working: 'Trabajando', completed: 'Completado', error: 'Error' }
const initial = [
  { name: 'JARVIS', role: 'Coordinador', color: '#38BDF8', task: 'Organizar el siguiente sprint' },
  { name: 'CODEX', role: 'Programador', color: '#4ADE80', task: 'Construir una nueva experiencia' },
  { name: 'NEXUS', role: 'Conocimiento', color: '#8B5CF6', task: 'Conectar ideas y documentos' },
  { name: 'SCOUT', role: 'Investigador', color: '#FBBF24', task: 'Explorar nuevas oportunidades' },
].map(a => ({ ...a, status: 'idle' as Status, progress: undefined as number | undefined, source: undefined as AgentEvent['source'], completedTasks: 0, recent: [] as string[], celebration: 0 }))
export type Agent = typeof initial[number]
type Log = { id: number; time: string; text: string; color: string }
type Store = { life: Life; advance: (dt: number) => void; setAmbient: (enabled:boolean) => void; setSpeed: (speed:number) => void; startMeeting: (ids:number[]) => void; endMeeting: () => void; sendHome: (id:number) => void; mode: 'demo' | 'live'; connection: Connection; lastEvent: AgentEvent | null; notification: string | null; received: string[]; setMode: (mode: 'demo' | 'live') => void; setConnection: (connection: Connection) => void; receive: (e: AgentEvent, replay?: boolean) => void; dismiss: () => void; agents: Agent[]; selected: number | null; running: boolean; tick: number; logs: Log[]; select: (id: number | null) => void; toggle: () => void; reset: () => void; step: () => void }
let logSequence = 0
const event = (_id: number, text: string, color = '#38BDF8'): Log => ({ id: ++logSequence, text, color, time: new Date().toLocaleTimeString('es-MX', { hour12: false }) })
export const useOffice = create<Store>((set) => ({
  life: initialLife(),
  advance: dt => set(s => ({ life: advanceLife(s.life,s.agents,s.mode === 'demo',s.running,dt) })),
  setAmbient: ambient => set(s => {let life={...s.life,ambient};if(!ambient)for(let i=0;i<4;i++)if(!life.meeting.includes(i)&&life.motions[i].target!==`home${i}`)life=returnHome(life,i);return {life}}),
  setSpeed: speed => set(s => Number.isFinite(speed) ? {life: {...s.life,speed:Math.max(.5,Math.min(2,speed))}} : s),
  startMeeting: ids => set(s => ({life:meetingStart(s.life,ids,s.agents)})),
  endMeeting: () => set(s => ({life:meetingEnd(s.life)})),
  sendHome: id => set(s => ({life:returnHome(s.life,id)})),
  mode: 'demo', connection: 'offline', lastEvent: null, notification: null, received: [],
  setConnection: connection => set({ connection }),
  dismiss: () => set({ notification: null }),
  setMode: mode => set(s => s.mode === mode ? s : ({ life: initialLife(s.life.ambient,s.life.speed), mode, running: false, tick: 0, agents: initial.map(a => ({ ...a, task: mode === 'live' ? 'En espera de eventos externos' : a.task })), logs: [event(Date.now(), mode === 'live' ? 'LIVE · Esperando eventos reales.' : 'DEMO · Simulación local lista.')], lastEvent: null, notification: null, received: [], connection: 'offline' })),
  receive: (e, replay = false) => set(s => {
    if (s.mode !== 'live' || !validEvent(e) || s.received.includes(e.eventId)) return s
    const status = eventStatus(e)
    return { life: interrupt(s.life,initial.findIndex(a => a.name.toLowerCase() === e.agentId),!replay && (e.type === 'task.started' || e.type === 'task.failed')), agents: s.agents.map(a => a.name.toLowerCase() === e.agentId ? { ...a, status, task: e.task ?? a.task, progress: e.type === 'task.progress' ? e.progress : undefined, source: e.source, completedTasks: (a.source === e.source ? a.completedTasks : 0) + (!replay && e.type === 'task.completed' ? 1 : 0), recent: [`${e.source === 'simulation' ? 'SIM' : 'LIVE'} · ${e.task ?? labels[status]}`, ...a.recent].slice(0,5), celebration: !replay && e.type === 'task.completed' ? performance.now() : 0 } : a), lastEvent: e, received: [...s.received, e.eventId].slice(-10000), notification: !replay && e.type === 'task.completed' ? `${e.source === 'simulation' ? 'SIMULACIÓN · ' : ''}${e.agentId.toUpperCase()} · Tarea finalizada` : s.notification, logs: [event(Date.now(), `${e.source === 'simulation' ? 'SIMULACIÓN' : 'LIVE'}${replay ? ' · Recuperado' : ''} · ${e.agentId.toUpperCase()} · ${labels[status]}${e.task ? ' · ' + e.task : ''}`, initial.find(a => a.name.toLowerCase() === e.agentId)?.color), ...s.logs].slice(0,40) }
  }),
  agents: initial.map(a => ({ ...a })), selected: null, running: false, tick: 0,
  logs: [event(0, 'Oficina lista. Inicia la simulación.')],
  select: selected => set({ selected }),
  toggle: () => set(s => s.mode !== 'demo' ? s : ({ running: !s.running, logs: [event(Date.now(), s.running ? 'Simulación en pausa.' : 'Simulación en marcha.'), ...s.logs].slice(0, 40) })),
  reset: () => set(s => s.mode !== 'demo' ? s : ({ life: initialLife(s.life.ambient,s.life.speed), agents: initial.map(a => ({ ...a })), running: false, tick: 0, logs: [event(Date.now(), 'Simulación reiniciada. Todos los agentes listos.')] })),
  step: () => set(s => {
    if (s.mode !== 'demo' || !s.running) return s
    const tick = s.tick + 1
    const phases: Status[] = ['thinking', 'working', 'working', 'completed', 'idle', 'thinking', 'working', 'error', 'thinking', 'working', 'completed', 'idle']
    const changes: Log[] = []
    const agents = s.agents.map((a, i) => {
      if(s.life.meeting.includes(i) || s.life.motions[i].target !== `home${i}` || s.life.motions[i].route.length) return a
      const status = tick <= i ? 'idle' : phases[(tick - i - 1) % phases.length]
      if (status !== a.status) changes.push(event(tick * 10 + i, `${a.name} · ${labels[status]}${status === 'error' ? ' — reintentando en el siguiente ciclo' : ''}`, a.color))
      return { ...a, status }
    })
    return { agents, tick, logs: [...changes, ...s.logs].slice(0, 40) }
  }),
}))

import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOffice } from './store'
import { busy } from './living'
export function LivingControls() {
  const { ambient, speed, meeting, agents, selected, setAmbient, setSpeed, startMeeting, endMeeting, sendHome } = useOffice(useShallow(s=>({ambient:s.life.ambient,speed:s.life.speed,meeting:s.life.meeting,agents:s.agents,selected:s.selected,setAmbient:s.setAmbient,setSpeed:s.setSpeed,startMeeting:s.startMeeting,endMeeting:s.endMeeting,sendHome:s.sendHome})))
  const [participants,setParticipants]=useState([0,1,2,3])
  const eligible=participants.filter(i=>!busy(agents[i]))
  return <section className="living-controls" aria-label="Vida de la oficina">
    <div className="living-title"><strong>✦ LIVING OFFICE</strong><span>COMPORTAMIENTOS SIMULADOS</span></div>
    <div className="living-actions"><label className="ambient-toggle"><input type="checkbox" checked={ambient} onChange={e=>setAmbient(e.target.checked)}/> Vida ambiental <small>DEMO</small></label><label>Velocidad <select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label><button disabled={selected===null} onClick={()=>selected!==null&&sendHome(selected)}>↩ A su escritorio</button></div>
    <div className="meeting-actions"><div className="participants">{agents.map((a,i)=><label key={a.name} title={busy(a)?'Ocupado con una tarea':a.name}><input type="checkbox" disabled={busy(a)||meeting.length>0} checked={participants.includes(i)} onChange={e=>setParticipants(p=>e.target.checked?[...p,i]:p.filter(id=>id!==i))}/><span style={{color:busy(a)?'#718096':a.color}}>{a.name}</span></label>)}</div>{meeting.length ? <button onClick={endMeeting}>Terminar reunión ({meeting.length})</button> : <button disabled={eligible.length<2} onClick={()=>startMeeting(eligible)}>Iniciar reunión · SIM</button>}</div>
    <small className="living-hint">{meeting.length?'Reunión visual: los eventos de tareas tienen prioridad.':'Selecciona al menos dos agentes libres. La vida ambiental solo actúa en DEMO.'}</small>
  </section>
}

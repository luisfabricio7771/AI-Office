import React, { Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Office } from './scene'
import { labels, useOffice } from './store'
import './style.css'
import { useShallow } from 'zustand/react/shallow'
import { LivingControls } from './LivingControls'
import { connectBridge } from './bridge'
class SceneBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="fallback">La escena necesita WebGL. Activa la aceleración gráfica y recarga la página.</div> : this.props.children }
}
function App() {
  const { agents, selected, select, running, toggle, reset, logs, step, tick, mode, setMode, connection, setConnection, receive, lastEvent, notification, dismiss } = useOffice(useShallow(s => { const { life: _life, ...ui } = s; return ui }))
  const [help, setHelp] = useState(false)
  useEffect(() => { const timer = window.setInterval(step, 2200); return () => clearInterval(timer) }, [step])
  useEffect(() => {
    if (mode !== 'live') return
    return connectBridge(import.meta.env.VITE_BRIDGE_URL || 'ws://127.0.0.1:8787/watch', receive, setConnection)
  }, [mode, receive, setConnection])
  useEffect(() => { if (notification) { const timer = setTimeout(dismiss, 4500); return () => clearTimeout(timer) } }, [notification, dismiss])
  const connectionLabel = { offline: 'Desconectado', connecting: 'Conectando…', connected: 'Conectado', reconnecting: 'Reconectando…' }[connection]
  const agent = selected === null ? null : agents[selected]
  return <div className="app">
    <header><a className="brand" href="./"><span className="brand-icon">▦</span><div>AI OFFICE<small>UN ESPACIO PARA GRANDES IDEAS</small></div></a><div className="header-right"><div className="mode-switch" aria-label="Modo de actividad">{(['demo','live'] as const).map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'chosen' : ''} onClick={() => setMode(value)}>{value.toUpperCase()}</button>)}</div><span className="connection"><i className={connection}/> {mode === 'demo' ? 'DEMO · Sin servidor' : `WS · ${connectionLabel}`}</span></div></header>
    <main><aside className="sidebar"><div className="section-title"><span>TU EQUIPO</span><span>04</span></div><h1>Talento artificial.<br/>Energía real.</h1><p className="intro">Cuatro mentes, un espacio.<br/>Observa cómo las ideas toman forma.</p>
      <div className="agents">{agents.map((a,i) => <button key={a.name} className={`agent-card ${selected === i ? 'selected' : ''}`} style={{ '--agent': a.color } as React.CSSProperties} onClick={() => select(i)}><span className="avatar">▟<b>▪ ▪</b></span><span className="agent-info"><strong>{a.name}</strong><small>{a.role}</small><span className={`status ${a.status}`}><i/>{labels[a.status]}</span></span><span className="arrow">↗</span></button>)}</div>
      <div className="sidebar-bottom"><span className="pulse"/> SISTEMA LOCAL OPERATIVO<small>{mode === 'demo' ? 'Simulación local. Sin eventos reales.' : 'Puente local. Eventos de aplicaciones externas.'}</small></div>
    </aside><section className="workspace"><div className="scene-heading"><div><span className="eyebrow">WORKSPACE / 001</span><h2>La oficina <span>principal</span></h2></div><div className="live"><i className={(mode === 'live' ? connection === 'connected' : running) ? 'on' : ''}/>{mode === 'demo' ? (running ? 'DEMO ACTIVA' : 'DEMO EN PAUSA') : `LIVE · ${connectionLabel.toUpperCase()}`}</div></div>
      <div className="viewport"><SceneBoundary><Suspense fallback={<div className="fallback">Preparando la oficina…</div>}><Canvas orthographic shadows dpr={[1, 1.75]} camera={{ position: [12, 12, 14], zoom: 48, near: .1, far: 100 }} onPointerMissed={() => select(null)}><Office/></Canvas></Suspense></SceneBoundary><div className="scene-tag"><span>✦</span> DONDE TRABAJAN LAS IDEAS</div><button className="help-button" onClick={() => setHelp(!help)} aria-label="Ayuda de controles">?</button>{help && <div className="help">Arrastra para girar · Rueda para zoom<br/>Toca un personaje para conocerlo.</div>}<div className="scene-caption">VISTA ISOMÉTRICA <span>◇</span> ESTUDIO 01</div></div>
      <div className="controls"><div><span className={`activity ${(mode === 'live' ? connection === 'connected' : running) ? 'active' : ''}`}/><strong>{mode === 'live' ? (lastEvent?.source === 'simulation' ? 'SIMULACIÓN · JSONL de prueba' : 'Actividad externa · LIVE') : running ? 'El equipo está creando' : tick ? 'Un momento de pausa' : 'Todo listo para comenzar'}</strong><small>{mode === 'demo' ? `Ciclo ${String(tick).padStart(2,'0')} · Simulación de tareas` : lastEvent ? `Último: ${lastEvent.agentId.toUpperCase()} · ${lastEvent.type} · ${new Date(lastEvent.timestamp).toLocaleTimeString()}` : 'Esperando el primer evento real'}</small></div><div className="buttons" hidden={mode === 'live'}><button className="reset" onClick={reset}>↺ <span>Reiniciar</span></button><button className="primary" onClick={toggle}>{running ? 'Ⅱ Pausar' : '▶ Iniciar'} simulación</button></div></div>
      <LivingControls/>
      <div className="bottom-grid"><section className="events"><div className="section-title"><span>REGISTRO DE ACTIVIDAD</span><span className="event-count">{logs.length} eventos</span></div><div className="log-list" role="log" aria-live="polite">{logs.map(l => <div className="log" key={l.id}><time>{l.time}</time><i style={{background:l.color}}/><span>{l.text}</span></div>)}</div></section><section className="details"><div className="section-title"><span>{agent ? 'AGENTE SELECCIONADO' : 'EXPLORA EL EQUIPO'}</span>{agent && <button onClick={() => select(null)} aria-label="Cerrar detalles">×</button>}</div>{agent ? <><h3 style={{color:agent.color}}>{agent.name}<span>{agent.role}</span></h3><p>{agent.task}{agent.progress !== undefined && <span> · {agent.progress}%</span>}</p><div className={`status ${agent.status}`}><i/>{labels[agent.status]}</div>{agent.name === 'CODEX' && <div className="codex-recent"><strong>{mode === 'demo' ? 'DEMO' : agent.source === 'simulation' ? 'SIMULACIÓN' : agent.source === 'codex-cli' ? 'CODEX CLI' : 'ESPERANDO CLI'} · {agent.completedTasks} tareas finalizadas en esta vista</strong>{agent.recent.map((text,i) => <small key={i}>{text}</small>)}</div>}</> : <><div className="detail-symbol">⌖</div><p>Hay una mente detrás de cada escritorio.</p><small>Selecciona un agente para ver qué está haciendo.</small></>}</section></div>
    </section></main>{notification && <div className="toast" role="status">✓ {notification}<button onClick={dismiss} aria-label="Cerrar notificación">×</button></div>}<footer><span>AI OFFICE <b>v1.0</b></span><span>Pequeños píxeles. Grandes posibilidades. <span className="footer-star">✦</span></span><span>HECHO PARA IMAGINAR</span></footer>
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)

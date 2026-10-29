import { useRef, useState } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import { Html, OrbitControls, ContactShadows } from '@react-three/drei'
import { Group, Mesh } from 'three'
import { useOffice, type Agent } from './store'
import { desks, nodes } from './living'
type Vec = [number, number, number]
function Box({ at, size, color, glow = false, ...props }: { at: Vec; size: Vec; color: string; glow?: boolean } & Omit<ThreeElements['mesh'], 'position' | 'scale'>) {
  return <mesh position={at} castShadow receiveShadow {...props}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.78} emissive={glow ? color : '#000'} emissiveIntensity={glow ? 1.3 : 0}/></mesh>
}
function Plant({ at, large = false }: { at: Vec; large?: boolean }) {
  const s = large ? 1 : .55
  return <group position={at} scale={s}><Box at={[0,.22,0]} size={[.48,.44,.48]} color="#c7a28c"/><Box at={[0,.7,0]} size={[.1,.8,.1]} color="#3b7058"/>{[[-.22,.85,0],[.2,1.12,.04],[0,1.4,0],[.04,.95,.22]].map((p,i) => <Box key={i} at={p as Vec} size={[.38,.38,.3]} color={i % 2 ? '#4b9672' : '#72b78a'}/>)}</group>
}
function Character({ agent, index, position }: {agent: Agent; index: number; position: Vec}) {
  const root = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const legL = useRef<Group>(null!)
  const legR = useRef<Group>(null!)
  const pulse = useRef<Mesh>(null!)
  const motion = useOffice(s => s.life.motions[index])
  const meeting = useOffice(s => s.life.meeting.includes(index))
  const speaker = useOffice(s => s.life.speaker)
  const lifeTime = useOffice(s => s.life.time)
  const speed = useOffice(s => s.life.speed)
  const left = useRef<Mesh>(null!)
  const right = useRef<Mesh>(null!)
  const selected = useOffice(s => s.selected === index)
  const select = useOffice(s => s.select)
  const running = useOffice(s => s.running || s.mode === 'live')
  const clock = useRef(0)
  const celebration = useRef({id:0,elapsed:0})
  const [hover, setHover] = useState(false)
  useFrame((_,dt) => {
    if (running || agent.status === 'idle') clock.current += Math.min(dt,.1)*speed
    const t = clock.current
    const walking = motion.pose === 'walking'
    const atDesk = motion.target === `home${index}` && !motion.route.length
    const talk = meeting && motion.pose === 'talking' && speaker === index
    root.current.position.set(motion.position[0],.06,motion.position[1])
    body.current.rotation.y = motion.yaw
    if(celebration.current.id!==agent.celebration) celebration.current={id:agent.celebration,elapsed:0}
    if(atDesk) celebration.current.elapsed+=Math.min(dt,.1)*speed
    const celebrate = atDesk && agent.status === 'completed' && (!agent.source || agent.celebration>0 && celebration.current.elapsed<2.4)
    body.current.position.y = .18*(1-motion.lift) + (walking ? Math.abs(Math.sin(t*9))*.045 : celebrate ? Math.abs(Math.sin(t*7))*.2 : Math.sin(t*2)*.018)
    legL.current.rotation.x = walking ? Math.sin(t*9)*.5 : -(1-motion.lift)*1.35
    legR.current.rotation.x = walking ? -Math.sin(t*9)*.5 : -(1-motion.lift)*1.35
    pulse.current.visible = motion.taskPulse>0
    pulse.current.scale.setScalar(1+Math.sin(t*10)*.15)
    body.current.rotation.z = agent.status === 'error' ? Math.sin(t*16)*.05 : agent.status === 'thinking' ? Math.sin(t*2)*.06 : 0
    left.current.rotation.x = walking ? Math.sin(t*9)*.5 : talk ? -.6+Math.sin(t*5)*.25 : atDesk && agent.status === 'working' ? -.8 + Math.sin(t*14)*.3 : celebrate ? -2.5 : 0
    right.current.rotation.x = walking ? -Math.sin(t*9)*.5 : motion.bubbleTime>0 ? -2.4+Math.sin(t*8)*.2 : atDesk && agent.status === 'working' ? -.8 - Math.sin(t*14)*.3 : celebrate ? -2.5 : agent.status === 'thinking' ? -1.8 : 0
  })
  return <group ref={root} position={position} onClick={e => {e.stopPropagation(); select(index)}} onPointerOver={e => { e.stopPropagation(); setHover(true); document.body.style.cursor='pointer' }} onPointerOut={() => {setHover(false); document.body.style.cursor='auto'}}>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}><ringGeometry args={[.51,.55,32]}/><meshBasicMaterial color={agent.color} transparent opacity={selected || hover ? 1 : .25}/></mesh>
    <group ref={body} rotation={[0,index === 1 ? Math.PI : 0,0]}>
      <group ref={legL} position={[-.13,.45,0]}><Box at={[0,-.2,0]} size={[.2,.42,.24]} color="#263348"/><Box at={[0,-.37,.06]} size={[.23,.13,.36]} color="#e4d6c0"/></group>
      <group ref={legR} position={[.13,.45,0]}><Box at={[0,-.2,0]} size={[.2,.42,.24]} color="#263348"/><Box at={[0,-.37,.06]} size={[.23,.13,.36]} color="#e4d6c0"/></group>
      <Box at={[0,.65,0]} size={[.53,.48,.34]} color={agent.color}/><Box at={[0,.65,.18]} size={[.12,.12,.02]} color="#eef8ff"/>
      <Box at={[0,1.08,0]} size={[.47,.43,.4]} color="#edb98e"/>
      <Box at={[0,1.29,-.025]} size={[.51,.16,.45]} color={index === 3 ? '#734b33' : '#243046'}/><Box at={[-.22,1.16,-.03]} size={[.09,.25,.43]} color="#243046"/>
      <Box at={[-.11,1.08,.207]} size={[.065,.07,.015]} color="#172033"/><Box at={[.11,1.08,.207]} size={[.065,.07,.015]} color="#172033"/>
      <Box at={[0,.96,.207]} size={[.1,.025,.015]} color="#986950"/>
      <mesh ref={left} position={[-.35,.76,0]}><boxGeometry args={[.16,.4,.2]}/><meshStandardMaterial color={agent.color}/></mesh><mesh ref={right} position={[.35,.76,0]}><boxGeometry args={[.16,.4,.2]}/><meshStandardMaterial color={agent.color}/></mesh>
      <Box at={[.26,1.1,0]} size={[.1,.19,.21]} color={agent.color}/>
    </group>
    <mesh ref={pulse} position={[0,1.65,0]}><octahedronGeometry args={[.12,0]}/><meshBasicMaterial color={agent.status === 'error' ? '#fb7185' : '#fbbf24'}/></mesh>
    {(motion.bubbleTime>0 || speaker === index) && <Html center position={[0,2.65,0]} zIndexRange={[23,0]} style={{pointerEvents:'none'}}><div className="speech-bubble">{speaker === index ? ['SIM · ¿Lo revisamos?','SIM · ¡Buena idea!','SIM · Hagamos una pausa.'][Math.floor(lifeTime/4)%3] : motion.bubble}</div></Html>}
    <Html center position={[0,1.95,0]} zIndexRange={[20,0]} style={{pointerEvents:'none'}}><div className={`nameplate ${selected ? 'chosen' : ''} ${meeting && speaker !== index && !selected ? 'meeting-muted' : ''}`} style={{borderColor:agent.color}}><i style={{background:agent.status === 'error' ? '#fb7185' : agent.color}}/>{agent.name}<span>{agent.status === 'thinking' ? '•••' : agent.status === 'completed' ? '✓' : agent.status === 'error' ? '!' : agent.status === 'working' ? '⌨' : ''}</span></div></Html>
  </group>
}
function Desk({ at, color, index }: { at: Vec; color: string; index: number }) {
  const codex = useOffice(s => s.agents[1])
  const mode = useOffice(s => s.mode)
  const connection = useOffice(s => s.connection)
  const lit = index !== 1 || codex.status === 'working'
  const badge = mode === 'demo' ? 'DEMO' : codex.source === 'simulation' ? 'SIMULACIÓN' : codex.source === 'codex-cli' ? (connection === 'connected' ? 'LIVE · CLI' : 'CLI · DESCONECTADO') : 'EN ESPERA'
  return <group position={at}>
    <Box at={[0,.89,0]} size={[2.2,.16,1.05]} color="#d8ad83"/>
    {[-.88,.88].map(x => <group key={x}><Box at={[x,.44,0]} size={[.13,.85,.75]} color="#414355"/></group>)}
    <Box at={[0,1.03,-.21]} size={[.4,.07,.27]} color="#292d40"/><Box at={[0,1.25,-.27]} size={[.1,.4,.09]} color="#292d40"/><Box at={[0,1.5,-.27]} size={[1,.63,.1]} color="#232b40"/>
    <Box at={[0,1.5,-.208]} size={[.88,.5,.018]} color={index === 1 && lit ? '#164c53' : '#132d3b'} glow={index === 1 && lit}/>
    {[0,1,2,3].map(i => <Box key={i} at={[-.22 + (i%2)*.08,1.65-i*.09,-.19]} size={[i===2 ? .48 : .32,.027,.015]} color={lit ? color : '#34515b'} glow={lit}/>)}
    <Box at={[0,1.0,.25]} size={[.69,.04,.25]} color="#384052"/>
    {index === 1 && <>
      <Box at={[0,.81,.49]} size={[2.08,.055,.04]} color="#fbbf24" glow/>
      <Box at={[.94,1.2,-.25]} size={[.22,.46,.4]} color="#263447"/>
      <Box at={[.94,1.2,-.035]} size={[.12,.13,.015]} color={lit ? '#38bdf8' : '#34515b'} glow={lit}/>
      {Array.from({length:8},(_,i)=><Box key={i} at={[-.26+i*.075,1.028,.25]} size={[.045,.012,.13]} color={lit ? '#74d5cf' : '#70808d'}/>)}
      <Html position={[0,2.02,-.3]} center zIndexRange={[15,0]} style={{pointerEvents:'none'}}><div className="codex-desk"><b>{badge}</b><span>{codex.task}</span><small>{codex.completedTasks} finalizadas · esta vista</small></div></Html>
    </>}
    <Box at={[.58,1,.25]} size={[.13,.04,.18]} color={color}/>
    <Box at={[-.77,1.1,.17]} size={[.17,.25,.17]} color="#f3d9ba"/>
    <Box at={[.83,1.0,-.18]} size={[.26,.05,.34]} color={color}/>
    <Box at={[0,.45,1.12]} size={[.6,.15,.6]} color="#3f485f"/><Box at={[0,.76,1.38]} size={[.63,.63,.12]} color="#3f485f"/><Box at={[0,.22,1.12]} size={[.1,.4,.1]} color="#282f42"/><Box at={[0,.06,1.12]} size={[.75,.08,.6]} color="#282f42"/>
    <Html position={[-.95,.88,.55]} center transform rotation={[-Math.PI/2,0,0]} distanceFactor={3}><span className="desk-number">0{index+1}</span></Html>
  </group>
}
export function Office() {
  const agents = useOffice(s=>s.agents)
  const positions = desks
  return <>
    <LifeClock/>
    <color attach="background" args={['#151f30']}/><ambientLight intensity={.8}/><hemisphereLight args={['#c6dfff','#b98a71',1.1]}/><directionalLight position={[3,9,5]} intensity={2} color="#ffe1b2" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-normalBias={.03}/>
    <group position={[0,-.55,0]}>
      <Box at={[0,-.22,0]} size={[9,.4,8]} color="#29384a"/>
      {Array.from({length:16},(_,i)=><Box key={i} at={[0,.005,-3.75+i*.5]} size={[8.8,.06,.47]} color={i%3===0 ? '#b18c70' : '#bc977b'}/>)}
      <Box at={[-4.4,1.55,0]} size={[.18,3.15,8]} color="#394958"/><Box at={[0,1.55,-3.94]} size={[9,3.15,.18]} color="#435365"/>
      <Box at={[-4.28,.15,0]} size={[.04,.14,7.9]} color="#8B5CF6" glow/><Box at={[0,.15,-3.82]} size={[8.7,.14,.04]} color="#38BDF8" glow/>
      <Box at={[-4.27,1.95,-1.2]} size={[.035,1.45,2.5]} color="#232f48"/>{[-2.2,-1.2,-.2].map(z=><Box key={z} at={[-4.24,1.95,z]} size={[.04,1.25,.035]} color="#77b7c7" glow/>)}
      <Box at={[1.6,2.15,-3.81]} size={[2.8,.85,.06]} color="#1e2c41"/>
      <Html transform position={[1.6,2.15,-3.76]} distanceFactor={4}><div className="wall-logo">AI OFFICE<span>MAKE ROOM FOR IDEAS</span></div></Html>
      <Box at={[-2.25,2.05,-3.8]} size={[1.35,1,.06]} color="#dec9aa"/><Box at={[-2.25,2.05,-3.75]} size={[1.12,.77,.03]} color="#273c4b"/><Box at={[-2.4,2,-3.72]} size={[.27,.36,.03]} color="#8B5CF6"/><Box at={[-2.06,2.17,-3.72]} size={[.27,.44,.03]} color="#FBBF24"/>
      {positions.map((p,i)=><group key={i}><Desk at={p} color={agents[i].color} index={i}/><Character position={[p[0],.06,p[2]+1.12]} agent={agents[i]} index={i}/></group>)}
      <MeetingArea/>
      <Plant at={[-3.65,.06,-3.05]} large/><Plant at={[3.6,.06,2.95]} large/><Plant at={[3.55,.06,-3.1]} large/>
      <group position={[3.55,0,-.7]}><Box at={[0,.55,0]} size={[.85,1.1,1.4]} color="#c6ac91"/><Box at={[0,1.13,0]} size={[.98,.1,1.5]} color="#e5c6a0"/><Box at={[0,1.4,-.26]} size={[.5,.48,.45]} color="#253345"/><Box at={[0,1.44,-.02]} size={[.27,.1,.02]} color="#4ADE80" glow/><Plant at={[0,1.2,.4]}/></group>
      <Box at={[-.8,.06,3.27]} size={[3.1,.035,.9]} color="#526a71"/>
    </group>
    <ContactShadows position={[0,-.79,0]} opacity={.35} scale={16} blur={2} far={5} resolution={256}/>
    <OrbitControls target={[0,.4,0]} enablePan={false} minZoom={35} maxZoom={80} minPolarAngle={Math.PI/4} maxPolarAngle={Math.PI/3} minAzimuthAngle={.15} maxAzimuthAngle={1.35}/>
  </>
}

function LifeClock() {
  const elapsed = useRef(0)
  useFrame((_,dt) => { elapsed.current+=Math.min(dt,.1); if(elapsed.current>=.04){useOffice.getState().advance(elapsed.current);elapsed.current=0} })
  return null
}
function MeetingArea() {
  return <group>
    <Box at={[3.55,.035,1.5]} size={[1.6,.025,2.1]} color="#425b65"/>
    <Box at={[3.55,.76,1.5]} size={[.5,.12,.55]} color="#d7b38b"/>
    <Box at={[3.55,.36,1.5]} size={[.12,.72,.15]} color="#303e53"/>
    <Box at={[3.55,.84,1.5]} size={[.22,.03,.25]} color="#8b5cf6"/>
    {[0,1,2,3].map(i=>{const [x,z]=nodes[`m${i}`];const yaw=Math.atan2(3.55-x,1.5-z);return <group key={i} position={[x,0,z]} rotation={[0,yaw,0]}><Box at={[0,.45,0]} size={[.32,.12,.32]} color="#64708d"/><Box at={[0,.66,-.19]} size={[.34,.42,.07]} color="#64708d"/><Box at={[0,.22,0]} size={[.08,.44,.08]} color="#293547"/></group>})}
    <Html center position={[3.55,1.1,1.5]} style={{pointerEvents:'none'}}><span className="meeting-label">REUNIONES · SIM</span></Html>
  </group>
}

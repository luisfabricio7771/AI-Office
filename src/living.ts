import type { Status } from '../shared/events.ts'
export type Point = [number, number]
export const desks: [number, number, number][] = [[-2.35,0,-1.85],[1.05,0,-1.85],[-2.35,0,1.05],[1.05,0,1.05]]
// Fixed aisle graph. Desk exits run beside the chairs; shared routes stay in the aisles.
export const nodes: Record<string, Point> = { rear: [-.65,-.73], front: [-.65,2.17], hub: [-.65,2.85], rest: [-2.65,3.25], east: [2.47,2.85], upper: [2.47,.3], top: [3.55,.3], right: [4.15,.3], m0: [2.95,1.5], m1: [4.15,1.5], m2: [3.55,.85], m3: [3.55,2.15], bottom: [2.47,2.4], west: [2.47,1.5], topSeat: [2.95,.85], bottomSeat: [2.95,2.15] }
const edges: [string,string][] = [['rear','front'],['front','hub'],['hub','rest'],['hub','east'],['east','bottom'],['bottom','west'],['west','upper'],['west','m0'],['upper','top'],['top','right'],['right','m1'],['upper','topSeat'],['topSeat','m2'],['bottom','bottomSeat'],['bottomSeat','m3']]
for (let i=0;i<4;i++) {
  const [x,,z] = desks[i]
  nodes[`home${i}`]=[x,z+1.12]
  nodes[`exit${i}`]=[x+(i%2===0 ? .7 : -.7),z+1.12]
  edges.push([`home${i}`,`exit${i}`],[`exit${i}`,i<2?'rear':'front'])
}
export function routeBetween(from:string,to:string): string[] {
  const distance: Record<string,number> = {[from]:0}, prev: Record<string,string> = {}, pending = new Set(Object.keys(nodes))
  while(pending.size) {
    const here = [...pending].reduce((a,b)=>(distance[a]??Infinity)<(distance[b]??Infinity)?a:b)
    pending.delete(here)
    if(here===to) break
    for(const [a,b] of edges) {
      const next = a===here?b:b===here?a:null
      if(!next || !pending.has(next)) continue
      const d = distance[here]+Math.hypot(nodes[here][0]-nodes[next][0],nodes[here][1]-nodes[next][1])
      if(d<(distance[next]??Infinity)){distance[next]=d;prev[next]=here}
    }
  }
  const result:string[]=[]
  for(let at=to;at!==from;at=prev[at]) { if(!prev[at]) return [];result.unshift(at) }
  return result
}
export type Motion = { position: Point; anchor: string; route: string[]; target: string; pose: 'seated'|'standing'|'walking'|'talking'; lift: number; yaw: number; wait: number; bubble: string; bubbleTime: number; taskPulse: number }
export type Life = { ambient: boolean; speed: number; time: number; nextWander: number; turn: number; meeting: number[]; motions: Motion[]; speaker: number|null }
export function initialLife(ambient=true,speed=1): Life { return {ambient,speed,time:0,nextWander:12,turn:0,meeting:[],speaker:null,motions:desks.map((_,i)=>({position:[...nodes[`home${i}`]],anchor:`home${i}`,route:[],target:`home${i}`,pose:'seated',lift:0,yaw:Math.PI,wait:0,bubble:'',bubbleTime:0,taskPulse:0}))} }
export function moveTo(m:Motion,target:string):Motion {
  if(m.target===target) return m
  // Return along the current segment before choosing a new route, never cut a corner.
  const returnSegment = Math.hypot(m.position[0]-nodes[m.anchor][0],m.position[1]-nodes[m.anchor][1])>.001 ? [m.anchor] : []
  return {...m,target,route:[...returnSegment,...routeBetween(m.anchor,target)],pose:'standing',wait:0,bubble:'',bubbleTime:0}
}
type Activity = {status:Status;source?:string}
export const busy = (a:Activity) => a.status!=='idle'
export function meetingStart(life:Life, ids:number[], agents:Activity[]):Life {
  const meeting = [...new Set(ids)].filter(i=>Number.isInteger(i)&&i>=0&&i<4&&!busy(agents[i]))
  if(meeting.length<2 || life.meeting.length) return life
  return {...life,meeting,speaker:null,motions:life.motions.map((m,i)=>meeting.includes(i)?moveTo(m,`m${meeting.indexOf(i)}`):m)}
}
export function meetingEnd(life:Life):Life {return {...life,meeting:[],speaker:null,motions:life.motions.map((m,i)=>life.meeting.includes(i)?moveTo(m,`home${i}`):m)}}
export function returnHome(life:Life,i:number):Life {
  if(!Number.isInteger(i)||i<0||i>3)return life
  const meeting=life.meeting.filter(id=>id!==i)
  const result={...life,meeting,motions:life.motions.map((m,id)=>id===i?moveTo(m,`home${i}`):m)}
  return meeting.length<2?meetingEnd(result):result
}
export function interrupt(life:Life,i:number,pulse=true):Life {
  const next=returnHome(life,i)
  return {...next,motions:next.motions.map((m,id)=>id===i?{...m,taskPulse:pulse?2:m.taskPulse}:m)}
}
export function advanceLife(life:Life, agents:Activity[], demo:boolean, running:boolean, dt:number):Life {
  if(!Number.isFinite(dt)||dt<=0)return life
  const delta=Math.min(dt,.1)*life.speed
  let next={...life,time:life.time+delta,motions:life.motions.map(m=>({...m,position:[...m.position] as Point,route:[...m.route]}))}
  for(let i=0;i<4;i++) if(busy(agents[i]) && next.motions[i].target!==`home${i}`) next=returnHome(next,i)
  if(next.ambient && demo && running && next.time>=next.nextWander && !next.meeting.length) {
    const i=next.turn%4
    next.nextWander=next.time+16;next.turn++
    if(!busy(agents[i]) && next.motions.every(m=>m.route.length===0) && next.motions[i].target===`home${i}`) next.motions[i]=moveTo(next.motions[i],next.turn%2?'rest':`exit${(i+1)%4}`)
  }
  for(let i=0;i<4;i++) {
    const m=next.motions[i], home=`home${i}`
    m.bubbleTime=Math.max(0,m.bubbleTime-delta);m.taskPulse=Math.max(0,m.taskPulse-delta)
    if(demo && !running && next.ambient && !next.meeting.includes(i) && !busy(agents[i]) && (m.target==='rest'||m.target.startsWith('exit'))){m.pose='standing';continue}
    const seated=!m.route.length&&(m.target===home||next.meeting.includes(i))
    m.lift+=( (seated?0:1)-m.lift)*(1-Math.exp(-8*delta))
    if(m.route.length && m.lift>.92) {
      const dest=nodes[m.route[0]], dx=dest[0]-m.position[0], dz=dest[1]-m.position[1], distance=Math.hypot(dx,dz)
      const step=Math.min(distance,delta*1.15)
      if(distance>.001){m.position[0]+=dx/distance*step;m.position[1]+=dz/distance*step;m.yaw+=Math.atan2(Math.sin(Math.atan2(dx,dz)-m.yaw),Math.cos(Math.atan2(dx,dz)-m.yaw))*(1-Math.exp(-10*delta))}
      m.pose='walking'
      if(distance<=step+.001){m.anchor=m.route.shift()!;m.position=[...nodes[m.anchor]]}
    } else if(m.route.length) m.pose='standing'
    else if(m.target===home){m.pose='seated';m.yaw+=Math.atan2(Math.sin(Math.PI-m.yaw),Math.cos(Math.PI-m.yaw))*(1-Math.exp(-6*delta))}
    else if(next.meeting.includes(i)) m.pose='talking'
    else {
      m.pose='standing';m.wait+=delta
      if(m.target.startsWith('exit')){const aim=nodes[`home${m.target.slice(4)}`];const yaw=Math.atan2(aim[0]-m.position[0],aim[1]-m.position[1]);m.yaw+=Math.atan2(Math.sin(yaw-m.yaw),Math.cos(yaw-m.yaw))*(1-Math.exp(-6*delta))}
      if(m.wait<delta*2){m.bubble='SIM · ¡Hola!';m.bubbleTime=2.5}
      if(m.wait>4 || !next.ambient || !demo) next.motions[i]=moveTo(m,home)
    }
  }
  const ready=next.meeting.length>=2 && next.meeting.every(i=>next.motions[i].route.length===0 && next.motions[i].pose==='talking')
  next.speaker=ready?next.meeting[Math.floor(next.time/4)%next.meeting.length]:null
  if(ready){
    const speaking=next.motions[next.speaker!]
    for(const i of next.meeting){const m=next.motions[i];const aim=i===next.speaker ? [3.55,1.5] : speaking.position;const yaw=Math.atan2(aim[0]-m.position[0],aim[1]-m.position[1]);m.yaw+=Math.atan2(Math.sin(yaw-m.yaw),Math.cos(yaw-m.yaw))*(1-Math.exp(-6*delta))}
  }
  return next
}

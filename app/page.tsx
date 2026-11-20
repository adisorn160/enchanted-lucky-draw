'use client';

import { csvNames } from './lib/roster';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { examplePrizes, exampleParticipants, money, maskName, MAX_PARTICIPANTS, nextPrizeIndex, drawPosition, type Award, type Prize, type Room, type Spin } from './lib/wheel';

const date = (at:number) => new Date(at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});

function DrawWheel({names, spin, now}: {names:string[]; spin:Spin|null; now:number}) {
  const count = Math.max(1, names.length);
  const step = 360 / count;
  const palette = ['#583973', '#755090', '#37346a', '#946137'];
  const gradient = count <= 64
    ? 'conic-gradient(' + Array.from({length:count}, (_, index) =>
      `${palette[index % palette.length]} ${index * step}deg ${(index + 1) * step}deg`).join(',') + ')'
    : `repeating-conic-gradient(#583973 0deg ${step}deg,#37346a ${step}deg ${step * 2}deg)`;
  const progress = spin ? Math.min(1, Math.max(0, (now - spin.start) / spin.duration)) : 0;
  const angle = spin ? spin.from + (spin.to - spin.from) * (1 - Math.pow(1 - progress, 3)) : 0;
  return <div className="party-wheel" aria-label="วงล้อจับฉลาก">
    <span className="pointer" aria-hidden="true"/>
    <div className="party-wheel-rotor" style={{background:gradient, transform:`rotate(${angle}deg)`}}>
      {count <= 24 && names.map((name, index) =>
        <span key={index} className="party-wheel-label" style={{transform:`rotate(${(index + .5) * step}deg)`}}>{maskName(name)}</span>
      )}
    </div>
    <span className="party-wheel-hub" aria-hidden="true">♜</span>
  </div>;
}

function PrizeImage({prize,large=false}:{prize:Prize;large?:boolean}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[prize.image]);
  return prize.image&&!failed?<img className={large?'prize-photo large':'prize-photo'} src={prize.image} alt={prize.name} onError={()=>setFailed(true)}/>:<span className={large?'prize-photo large prize-fallback':'prize-photo prize-fallback'} aria-label={prize.name}>🎁</span>;
}

function PrizeRibbon({prizes,selectedIndex}:{prizes:Prize[];selectedIndex:number}){
 const [paused,setPaused]=useState(false);
 const remaining=prizes.filter(p=>!p.awarded);
 const groups:Array<{prize:Prize;count:number;active:boolean}>=[];
 for(const [i,prize] of prizes.entries()){
  if(prize.awarded)continue;
  const group=groups.find(g=>g.prize.name===prize.name&&g.prize.value===prize.value&&g.prize.image===prize.image);
  if(group){group.count++;group.active ||= i===selectedIndex}else groups.push({prize,count:1,active:i===selectedIndex});
 }
 groups.sort((a,b)=>b.prize.value-a.prize.value);
 const moving=groups.length>1;
 const cards=groups.map(({prize,count,active},i)=><div className={'ribbon-card '+(active?'current':'')} key={prize.id||i} role="listitem"><PrizeImage prize={prize}/><div><span className="ribbon-name">{prize.name}</span><strong>฿{money(prize.value)}</strong><small>{count} รางวัล{active?' · กำลังแจกในรอบนี้':''}</small></div></div>);
 return <section className="prize-ribbon" aria-label="รางวัลที่ยังเหลืออยู่"><div className="ribbon-heading"><h3>ของรางวัลที่ยังมีให้ลุ้น <span>{remaining.length} รางวัล</span></h3>{moving&&<button className="ribbon-pause" aria-label={paused?'เลื่อนแถบรางวัลต่อ':'พักการเลื่อนแถบรางวัล'} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?'▶':'Ⅱ'}</button>}</div>{groups.length?<div className="ribbon-window" tabIndex={0}><div className={'ribbon-track '+(moving?'moving':'')} style={{animationPlayState:paused?'paused':'running'}}><div className="ribbon-group" role="list">{cards}</div>{moving&&<div className="ribbon-group ribbon-copy" aria-hidden="true">{cards}</div>}</div></div>:<p className="ribbon-complete">✓ แจกรางวัลครบแล้ว ขอบคุณทุกคนที่ร่วมลุ้น!</p>}</section>;
}

function DrawSound({spin,offset,finished,finaleKey}:{spin:Spin|null;offset:number;finished:boolean;finaleKey:string}){
 const wheel=useRef<HTMLAudioElement>(null),cheer=useRef<HTMLAudioElement>(null),finale=useRef<HTMLAudioElement>(null),played=useRef('');
 const unlocked=useRef(new Set<HTMLAudioElement>()),latest=useRef({spin,finished,finaleKey});
 latest.current={spin,finished,finaleKey};
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>{
  const unlock=()=>{
   for(const media of [wheel.current,cheer.current,finale.current]){
    if(!media||unlocked.current.has(media)||!media.paused)continue;
    media.volume=0;
    void media.play().then(()=>{
     // Stop only the silent unlock, never a newly started draw or celebration.
     const active=media===finale.current?!!latest.current.finaleKey:media===cheer.current?!!latest.current.spin&&latest.current.finished:!!latest.current.spin&&!latest.current.finished&&Date.now()+offset>=latest.current.spin.start;
     if(!active){media.pause();media.currentTime=0}
     media.volume=1;unlocked.current.add(media);setEnabled(true);
    }).catch(()=>{media.volume=1});
   }
  };
  document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);unlock();
  return()=>{document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);wheel.current?.pause();cheer.current?.pause();finale.current?.pause()};
 },[]);
 useEffect(()=>{
  const media=wheel.current;if(!media)return;
  if(!spin||finished){media.pause();media.currentTime=0;return;}
  if(!enabled)return;
  let timer:ReturnType<typeof setTimeout>;
  const start=()=>{
   const elapsed=(Date.now()+offset-spin.start)/1000;
   if(elapsed<0){timer=setTimeout(start,-elapsed*1000);return}
   if(elapsed>=spin.duration/1000)return;
   const rate=7000/spin.duration;media.playbackRate=rate;media.volume=.8;
   if(Math.abs(media.currentTime-elapsed*rate)>.2)media.currentTime=elapsed*rate;
   void media.play().catch(()=>{});
  };start();return()=>clearTimeout(timer);
 },[enabled,spin?.id,offset,finished]);
 useEffect(()=>{
  if(!spin||!finished||played.current===spin.id)return;
  wheel.current?.pause();played.current=spin.id;
  const media=cheer.current;if(!media)return;media.volume=1;media.currentTime=0;
  void media.play().catch(()=>{played.current=''});
 },[spin?.id,finished,enabled]);
 useEffect(()=>{
  if(!finaleKey)return;
  const key='lucky-finale-audio:'+finaleKey;
  try{if(sessionStorage.getItem(key))return}catch{}
  const media=finale.current;if(!media)return;
  cheer.current?.pause();wheel.current?.pause();media.pause();media.currentTime=0;media.volume=1;
  let cancelled=false;
  void media.play().then(()=>{if(!cancelled){try{sessionStorage.setItem(key,'1')}catch{}}}).catch(()=>{});
  return()=>{cancelled=true};
 },[finaleKey,enabled]);
 return <><audio ref={finale} src="/audio/finale-fanfare.m4a" preload="auto" aria-hidden="true"/><audio ref={wheel} src="/audio/wheel-mechanical-real.mp3" preload="auto" aria-hidden="true"/><audio ref={cheer} src="/audio/crowd-cheer-real.mp3" preload="auto" aria-hidden="true"/></>;
}

function ParticipantTable({names,spin,offset,drawing,slowing=false}:{names:string[];spin:Spin|null;offset:number;drawing:boolean;slowing?:boolean}){
  const scroller=useRef<HTMLDivElement>(null),rowNodes=useRef<Array<HTMLTableRowElement|null>>([]),ticker=useRef<HTMLSpanElement>(null);
  const offsetRef=useRef(offset);offsetRef.current=offset;
  const namesKey=JSON.stringify(names);
  const rows=useMemo(()=>names.map((name,index)=>({name,index})),[namesKey]);
  const peopleCount=new Set(names).size;
  useEffect(()=>{
    let frame=0,last=-1;
    rowNodes.current.forEach(node=>{node?.classList.remove('draw-active','draw-winner');node?.removeAttribute('aria-current')});
    if(!spin||!rows.length){if(ticker.current)ticker.current.textContent='รอเริ่มสุ่มผู้โชคดี';return;}
    const target=spin.winner;
    if(scroller.current&&Date.now()+offsetRef.current<spin.start)scroller.current.scrollTop=0;
    const tick=()=>{
      const now=Date.now()+offsetRef.current;
      const p=Math.max(0,Math.min(1,(now-spin.start)/spin.duration));
      const position=drawPosition(p,rows.length,target);
      const index=Math.max(0,Math.min(rows.length-1,Math.round(position)));
      if(now>=spin.start){
        const box=scroller.current;
        if(box){
          const lower=Math.floor(position),upper=Math.min(rows.length-1,lower+1);
          const a=rowNodes.current[lower],b=rowNodes.current[upper];
          if(a&&b){
            const top=box.getBoundingClientRect().top,scroll=box.scrollTop;
            const centerA=a.getBoundingClientRect().top-top+scroll+a.clientHeight/2;
            const centerB=b.getBoundingClientRect().top-top+scroll+b.clientHeight/2;
            box.scrollTop=centerA+(centerB-centerA)*(position-lower)-box.clientHeight/2;
          }
        }
        if(index!==last){
          const old=rowNodes.current[last];old?.classList.remove('draw-active','draw-winner');old?.removeAttribute('aria-current');
          const node=rowNodes.current[index];node?.classList.add(p===1?'draw-winner':'draw-active');node?.setAttribute('aria-current','true');
          if(ticker.current)ticker.current.textContent=maskName(rows[index]?.name||'');
          last=index;
        }
        if(p===1&&last>=0)rowNodes.current[last]?.classList.replace('draw-active','draw-winner');
      }
      if(p<1)frame=requestAnimationFrame(tick);
    };
    tick();return()=>cancelAnimationFrame(frame);
  },[spin?.id,namesKey]);
  return <section className="participant-table" aria-label="ตารางผู้ร่วมลุ้น">
    <div className="participant-table-heading"><div><h3>รายชื่อผู้ร่วมลุ้น</h3><p>{peopleCount} คน <span>·</span> {names.length} สิทธิ์</p></div><span className="table-draw-badge">{drawing?(slowing?'● กำลังชะลอ':'● กำลังสุ่ม'):'LIVE DRAW'}</span></div>
    <div className="draw-ticker"><span>{drawing?(slowing?'ค่อย ๆ ชะลอ… ใครจะเป็นผู้โชคดี?':'แถบสีกำลังสุ่มไปที่'):spin?'ผู้โชคดี':'สถานะ'}</span><strong ref={ticker}>รอเริ่มสุ่มผู้โชคดี</strong></div>
    <div className="participant-scroll" ref={scroller} tabIndex={0} aria-label="เลื่อนดูรายชื่อผู้ร่วมลุ้น"><table className="participant-grid"><thead><tr><th scope="col">สิทธิ์ที่</th><th scope="col">ชื่อผู้ใช้</th></tr></thead><tbody>{rows.map(row=><tr key={row.index} ref={node=>{rowNodes.current[row.index]=node}}><td>{String(row.index+1).padStart(2,'0')}</td><td><span className="draw-indicator" aria-hidden="true">▶</span><b>{maskName(row.name)}</b></td></tr>)}</tbody></table>{!rows.length&&<p className="participant-empty">เพิ่มรายชื่อผู้ร่วมลุ้นเพื่อเริ่มสุ่ม</p>}</div>
    <p className="participant-table-note">{drawing?'รายชื่อกำลังเลื่อนขึ้น–ลง และจะชะลอหยุดที่สิทธิ์ผู้ชนะ':'หนึ่งแถว = หนึ่งสิทธิ์'}</p>
  </section>;
}

function ViewerAwards({awards,prizes}:{awards:Award[];prizes:Prize[]}){
 return <section className="viewer-awards" aria-label="รางวัลที่แจกแล้วและผู้ได้รับรางวัล"><div className="viewer-awards-heading"><h3>🏆 รางวัลที่แจกแล้ว</h3><span>{awards.length} รางวัล</span></div><div className="viewer-awards-scroll">{awards.length?<ol>{awards.map(award=>{const prize=prizes.find(p=>p.name===award.prize&&p.value===award.value)||{name:award.prize,value:award.value};return <li key={award.spinId}><PrizeImage prize={prize}/><div className="viewer-award-prize"><span>{award.prize}</span><small>฿{money(award.value)}</small></div><strong>{maskName(award.participant)}</strong></li>})}</ol>:<p className="viewer-awards-empty">ผู้ชนะและรางวัลจะปรากฏที่นี่หลังสุ่มเสร็จ</p>}</div></section>;
}

function Celebration({finale=false}:{finale?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const el=canvas.current;if(!el||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const ctx=el.getContext('2d');if(!ctx)return;
  let frame=0,last=0;const start=performance.now();let w=innerWidth,h=innerHeight;
  const resize=()=>{w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,2);el.width=w*d;el.height=h*d;ctx.setTransform(d,0,0,d,0,0)};resize();window.addEventListener('resize',resize);
  const colors=['#ffd54a','#fff2ba','#50dccb','#ed7cb5','#9d9cff'];
  const particles:Array<{x:number;y:number;vx:number;vy:number;life:number;max:number;color:string;paper:boolean;angle:number}>=[];
  const burst=(x:number,y:number,paper:boolean)=>{for(let i=0;i<(paper?55:48);i++){const a=Math.random()*Math.PI*2,v=paper?3+Math.random()*8:2+Math.random()*5;const life=paper?180+Math.random()*90:55+Math.random()*35;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(paper?6:0),life,max:life,color:colors[i%colors.length],paper,angle:Math.random()*6})}};
  burst(w*.08,h*.8,true);burst(w*.92,h*.8,true);
  const tick=(time:number)=>{const elapsed=time-start,dt=Math.min((time-(last||time))/16.67,2);last=time;ctx.clearRect(0,0,w,h);
   if(elapsed<4000&&Math.floor(elapsed/650)!==Math.floor((elapsed-dt*16.67)/650))burst(w*(.15+Math.random()*.7),h*(.12+Math.random()*.35),false);
   for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.985,dt);p.vy+=(p.paper?.065:.035)*dt;p.angle+=.07*dt;ctx.globalAlpha=Math.min(1,p.life/30);ctx.fillStyle=p.color;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);if(p.paper)ctx.fillRect(-3,-5,6,10*Math.cos(p.angle));else{ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill()}ctx.restore()}
   if(elapsed<(finale?8500:7000))frame=requestAnimationFrame(tick);else ctx.clearRect(0,0,w,h);
  };frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize)};
 },[finale]);
 return <canvas ref={canvas} className="celebration-canvas" aria-hidden="true"/>;
}

function WinnerPopup({roomId,spin,onConfirm,busy,error,readOnly=false,controllerResult=false}:{roomId:string;spin:Spin;onConfirm?:()=>Promise<boolean>;busy:boolean;error:string;readOnly?:boolean;controllerResult?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null);
  const close=()=>dialog.current?.close();
  const confirm=async()=>{if(!onConfirm||await onConfirm())close()};
  const remember=()=>{try{sessionStorage.setItem('winner-dismissed:'+roomId,spin.id)}catch{}};
  useEffect(()=>{
    const node=dialog.current;if(!node)return;
    try{if(sessionStorage.getItem('winner-dismissed:'+roomId)===spin.id)return}catch{}
    node.showModal();
    return()=>{if(node.open)node.close()};
  },[roomId,spin.id]);
  return <dialog ref={dialog} className="winner-dialog" aria-labelledby="winner-popup-title" aria-describedby="winner-popup-details" onClose={remember} onCancel={e=>{if(busy||readOnly)e.preventDefault()}}>
    <Celebration/>
    <button className="winner-close" aria-label="ปิดป๊อปอัปผู้ชนะ" disabled={busy} onClick={close}>×</button>
    <div className="celebration-mark" aria-hidden="true"><span>✦</span>🏆<span>✧</span></div>
    <p className="eyebrow">{controllerResult?'DRAW RESULT':'WE HAVE A WINNER!'}</p>
    <h2 id="winner-popup-title">{controllerResult?'สรุปผลการสุ่มรอบนี้':'ยินดีกับผู้โชคดี!'}</h2>
    <strong className="popup-username">{maskName(spin.names[spin.winner])}</strong>
    <PrizeImage prize={spin.prize} large/><div id="winner-popup-details" className="popup-prize"><span>ได้รับรางวัล</span><h3>{spin.prize.name}</h3><strong>มูลค่า ฿{money(spin.prize.value)}</strong></div>
    <p className="popup-saved">✓ บันทึกชื่อผู้ชนะและรางวัลเรียบร้อยแล้ว</p>
    <p className="popup-saved">{onConfirm?'กดรับทราบเพื่อเริ่มนับเวลาเบรค':'เวลาเบรคจะเริ่มเมื่อผู้ควบคุมรับทราบผล'}</p>{error&&<p className="alert" role="alert">{error}</p>}<button className="primary popup-confirm" disabled={busy} autoFocus onClick={confirm}>{busy?'กำลังบันทึก…':onConfirm?'รับทราบและไปรางวัลถัดไป':'รับทราบ'}</button>
  </dialog>;
}

export default function Home(){
  const [id,setId]=useState(''),[room,setRoom]=useState<Room|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[networkError,setNetworkError]=useState(''),[notice,setNotice]=useState('');
  const [waitSeconds,setWaitSeconds]=useState(10);
  const [presentation,setPresentation]=useState(false);
  const [showHistory,setShowHistory]=useState(false),[historyLimit,setHistoryLimit]=useState(50),[viewOnly,setViewOnly]=useState(false);
  const [namesText,setNamesText]=useState(''),[title,setTitle]=useState(''),[prizes,setPrizes]=useState<Prize[]>(examplePrizes),[editing,setEditing]=useState(false),[search,setSearch]=useState('');
  const [offset,setOffset]=useState(0),[now,setNow]=useState(0),[ready,setReady]=useState(false),[hostRoom,setHostRoom]=useState('');
  const mutation=useRef(0),mutating=useRef(false),stage=useRef<HTMLElement>(null);
  const [liveConfigured,setLiveConfigured]=useState<boolean|null>(null);
  const [canCreateRoom,setCanCreateRoom]=useState(false);
  const [drawMode,setDrawMode]=useState<Room['drawMode']>('scroll');
  const [roomEnded,setRoomEnded]=useState(false);
  const [confirmClose,setConfirmClose]=useState(false);
  const host=!!room?.host&&!viewOnly,spin=room?.spin||null,spinning=!!spin&&now<spin.start+spin.duration;
  const secondsLeft=Math.max(0,Math.ceil(((room?.nextRoundAt||0)-now)/1000));
  const cooldown=!spinning&&secondsLeft>0;
  const awaitingAck=!!room?.breakPending&&!spinning;
  const locked=spinning||awaitingAck;
  const currentNames=spin?.names||room?.participants||exampleParticipants;
  const prizePool=room?.prizes||examplePrizes;
  const currentPrizeIndex=room?.selectedPrizeIndex??nextPrizeIndex(prizePool);
  const roundPrize=spin?.prize||prizePool[currentPrizeIndex];
  const followingPrizeIndex=currentPrizeIndex<0?-1:nextPrizeIndex(prizePool.map((p,i)=>i===currentPrizeIndex?{...p,awarded:true}:p));
  const followingPrize=prizePool[followingPrizeIndex];
  const winner=spin&&!spinning?spin.names[spin.winner]:null;
  const inputNames=namesText.split('\n').map(s=>s.trim()).filter(Boolean);
  const savedPrizes=JSON.stringify(room?.prizes),dirty=!!room&&(drawMode!==room.drawMode||waitSeconds!==room.roundWaitSeconds||title!==room.title||JSON.stringify(prizes)!==savedPrizes||JSON.stringify(inputNames)!==JSON.stringify(room.participants));
  const completed=(room?.history||[]).filter(h=>h.at<=now);
  const historyRows=completed.filter(h=>`${h.participant} ${h.prize}`.toLowerCase().includes(search.toLowerCase()));
  const formatSignature=room?JSON.stringify([room.title,room.prizes,room.participants,room.roundWaitSeconds,room.drawMode]):'';

  useEffect(()=>{
    const params=new URLSearchParams(location.search),rid=params.get('room')||'';
    setPresentation(params.get('present')==='1'||params.get('view')==='1');setId(rid);setShowHistory(params.get('history')==='1');setViewOnly(params.get('view')==='1');setNow(Date.now());setReady(true);
    try{setHostRoom(localStorage.getItem('last-host-room')||'');}catch{}
  },[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+offset),200);return()=>clearInterval(timer)},[offset]);
  useEffect(()=>{
    if(!id)return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 1500;
    const controller = new AbortController();
    const refresh = async () => {
      const generation = mutation.current;
      try {
        const start = Date.now();
        const query = new URLSearchParams({id, viewer: viewOnly ? '1' : '0', history: showHistory ? 'all' : ''});
        const response = await fetch('/api/room?' + query, {signal:controller.signal,cache:'no-store'});
        const data = await response.json() as Room & {error?:string};
        if (disposed) return;
        if (response.status === 404) {
          disposed = true;
          setRoom(null);
          setRoomEnded(true);
          setNetworkError(data.error || 'ห้องนี้ปิดแล้ว');
          return;
        }
        if (!response.ok) throw Error(data.error || 'เชื่อมต่อไม่สำเร็จ');
        if (!mutating.current && generation === mutation.current) {
          setRoom(data);
          setOffset(data.now - (start + Date.now()) / 2);
          setNetworkError('');
        }
        delay = 1500;
      } catch (e) {
        if (!disposed) setNetworkError((e as Error).message);
        delay = Math.min(delay * 2, 5000);
      } finally {
        if (!disposed) timer = setTimeout(refresh, delay);
      }
    };
    void refresh();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id,showHistory,viewOnly]);
  useEffect(()=>{
    if (id) return;
    const linkKey = new URLSearchParams(location.hash.slice(1)).get('admin');
    if (linkKey) window.history.replaceState({}, '', location.pathname + location.search);
    const request = linkKey
      ? fetch('/api/room', {method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({op:'unlock',linkKey})})
      : fetch('/api/room?status=1', {cache:'no-store'});
    request.then(async response=>{
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'เปิดสิทธิ์แอดมินไม่สำเร็จ');
      setLiveConfigured(result.configured === true);
      setCanCreateRoom(result.canCreate === true);
    }).catch(e=>setError((e as Error).message));
  },[id]);
  useEffect(()=>{if(!room)return;setWaitSeconds(room.roundWaitSeconds);setDrawMode(room.drawMode);setTitle(room.title);setPrizes(room.prizes.map(p=>({...p})));setNamesText(room.participants.join('\n'));},[formatSignature]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t)},[notice]);

  async function act(op:'create'|'config'|'select'|'spin'|'ack'|'close',prizeIndex?:number){
    setBusy(true);setError('');mutating.current=true;mutation.current++;
    try{
      const started=Date.now();
      const res=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,id,title,prizes,participants:inputNames,prizeIndex,roundWaitSeconds:waitSeconds,drawMode,spinId:spin?.id})});
      const data=await res.json() as Room & {id:string;error?:string};if(!res.ok)throw Error(data.error||'ดำเนินการไม่สำเร็จ');
      if(op==='close'){window.location.assign('/');return true;}
      setOffset(data.now-(started+Date.now())/2);setNow(data.now);setRoom(data);
      if(op==='create'){
        try{localStorage.setItem('last-host-room',data.id)}catch{}
        window.history.replaceState({},'','?room='+data.id+(presentation?'&present=1':''));setId(data.id);setHostRoom(data.id);
      }
      if(op==='config'){setNamesText(data.participants.join('\n'));setEditing(false);setNotice('บันทึกชื่อและของรางวัลแล้ว · ประวัติเดิมยังอยู่ครบ')}
      if(op==='spin'&&!presentation){stage.current?.scrollIntoView({behavior:'smooth',block:'start'});}
      return true;
    }catch(e){setError((e as Error).message);return false}finally{mutating.current=false;mutation.current++;setBusy(false)}
  }
  function togglePresentation(){
    const next=!presentation;setPresentation(next);
    const url=new URL(location.href);if(next)url.searchParams.set('present','1');else url.searchParams.delete('present');window.history.replaceState({},'',url);
    if(!next&&document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
  }
  async function share(){
    const link=location.origin+'/?room='+id+'&view=1&present=1';
    try{await navigator.clipboard.writeText(link);setNotice('คัดลอกลิงก์ผู้ชมแล้ว')}
    catch{setNotice(link)}
  }
  function updatePrize(i:number,key:'name'|'value'|'image',value:string){setPrizes(old=>old.map((p,index)=>index!==i?p:{...p,[key]:key==='value'?(value===''?0:Number(value)):value}))}
  const controller=host&&!presentation&&!showHistory;
  const viewerUrl='/?room='+encodeURIComponent(id)+'&view=1&present=1';
  function openViewer(event:MouseEvent<HTMLAnchorElement>){
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();window.open(viewerUrl,'_blank','popup=yes,width=1366,height=820,noopener');
  }
  const connected=!!room&&!networkError;
  const roomLink='/?room='+encodeURIComponent(id)+(viewOnly?'&view=1':'');
  const eventFinished=!!room&&room.prizes.length>0&&(room.prizes.every(p=>p.awarded)||room.participants.length===0)&&!room.breakPending&&!spin&&completed.length>0;
  const shownHistory=historyRows.slice(0,showHistory?historyLimit:5);

  return <main className={[showHistory?'history-page':'',presentation&&!showHistory?'zoom-mode':'',controller?'controller-mode':'',viewOnly?'viewer-screen':'',!id&&!presentation&&!showHistory?'landing-mode':''].filter(Boolean).join(' ')}>
    {!controller&&!showHistory&&<DrawSound spin={spin} offset={offset} finished={!!winner} finaleKey={eventFinished?id+':'+completed.map(a=>a.spinId).sort().join(','):''}/>}
    {!showHistory&&winner&&spin&&<WinnerPopup roomId={id} spin={spin} key={spin.id} onConfirm={host&&awaitingAck?()=>act('ack'):undefined} busy={busy} error={error} readOnly={viewOnly} controllerResult={controller}/>}
    <header><a className="brand" href="/"><span className="brand-symbol" aria-hidden="true">♜</span><span>Enchanted <span className="brand-yellow">Kingdom</span><small>LUCKY DRAW LIVE</small></span></a><div className="header-actions">{host&&id&&<a className="ghost open-viewer" href={viewerUrl} target="_blank" rel="noopener" onClick={openViewer}>↗ เปิดหน้าจอผู้ชม</a>}{!showHistory&&!viewOnly&&id&&<button className="ghost presentation-toggle" aria-pressed={presentation} onClick={togglePresentation}>{presentation?'← กลับหน้าควบคุม':'▣ โหมดแชร์จอ Zoom'}</button>}{presentation&&<button className="ghost fullscreen-button" onClick={()=>{void document.documentElement.requestFullscreen?.().catch(()=>{})}}>⛶ เต็มจอ</button>}<span className="role-pill"><i/>{id?(host?'ผู้ควบคุม':'รับชมอย่างเดียว'):''}</span>{id&&<button className="ghost" onClick={share}>↗ แชร์ลิงก์ผู้ชม</button>}</div></header>
    <section className="intro"><div><p className="eyebrow">A LITTLE SPIN. A BIG MOMENT.</p><h1>{showHistory?'ประวัติการรับรางวัล':room?.title||'สุ่มผู้โชคดี'}<span>✦</span></h1><p className="sub">{showHistory?room?.title||'รายชื่อผู้โชคดี รางวัล มูลค่า และเวลา':controller?'หน้าควบคุม · ส่งลิงก์ผู้ชมให้เพื่อนดูสด':'เลือกรางวัล หมุนสุ่มชื่อ แล้วลุ้นไปพร้อมกันทุกหน้าจอ'}</p></div><span className={'connection '+(connected?'online':'')}>{id?(connected?'● เชื่อมต่อสด':'○ กำลังเชื่อมต่อ…'):'✧ YOUR NEXT LUCKY MOMENT'}</span></section>
    {id&&<nav className="room-navigation" aria-label="หน้าห้องกิจกรรม"><a href={roomLink} aria-current={!showHistory?'page':undefined}>{host?'⚙ หน้าควบคุม':'◉ สุ่มสด'}</a><a href={roomLink+'&history=1'} aria-current={showHistory?'page':undefined}>☷ ประวัติรางวัล <span>{room?.totalCount||0}</span></a></nav>}
    {error&&<div role="alert" className="alert">{error}<button aria-label="ปิดข้อความ" onClick={()=>setError('')}>×</button></div>}
    {networkError&&<div className="alert" role="status">{networkError}{!roomEnded&&' · กำลังเชื่อมต่อใหม่'}</div>}
    {notice&&<div className="toast" role="status">{notice}</div>}
    {!id&&!presentation&&!showHistory&&ready&&<section className="room-start-panel"><div className="castle-horizon" aria-hidden="true"><i/><i/><i/><i/><i/></div><p className="eyebrow">ห้องจับฉลากสด</p><h2>เปิดประตูสู่อาณาจักรแห่งโชค</h2><p>กรอกรายชื่อแล้วส่งลิงก์ให้เพื่อนเปิดดูสดบนเครื่องของตัวเอง ห้องมีอายุสูงสุด 8 ชั่วโมง</p><div className="screen-explain"><div><b>01 · หน้าควบคุม</b><span>เพิ่มรายชื่อ · กดสุ่ม · รับทราบผล · ดาวน์โหลด CSV</span></div><div><b>02 · หน้าจอผู้ชม</b><span>รางวัล · รายชื่อกำลังสุ่ม · ประกาศผู้ชนะ · เสียงประกอบ</span></div></div>{liveConfigured===false&&<p role="status">อยู่ระหว่างตั้งค่าห้องจับฉลากสด</p>}{liveConfigured&& !canCreateRoom&&<p>เปิดลิงก์แอดมินส่วนตัวเพื่อสร้างห้อง ถ้ามีลิงก์ผู้ชม ให้เปิดลิงก์ห้องนั้นเพื่อดูสด</p>}{canCreateRoom&&<button className="primary" disabled={busy||!ready||!liveConfigured} onClick={()=>act('create')}>{busy?'กำลังสร้างห้อง…':'＋ สร้างห้องและเข้าหน้าควบคุม'}</button>}{hostRoom&&<a className="secondary" href={'/?room='+hostRoom}>กลับหน้าควบคุมห้องล่าสุด ↗</a>}</section>}
    {controller&&room&&<section className="control-screen-guide"><div className="control-guide-top"><div><h2>หน้าควบคุมสำหรับผู้ดำเนินรายการ</h2><p>ส่งลิงก์ผู้ชมให้เพื่อนเปิดบนมือถือหรือคอมพิวเตอร์ของตัวเอง</p></div><a className="primary open-viewer" href={viewerUrl} target="_blank" rel="noopener" onClick={openViewer}>↗ เปิดหน้าจอผู้ชม</a></div><div className="controller-live-summary" aria-live="polite"><div><span>{spinning?'กำลังสุ่ม':winner?'ผลรางวัลรอบล่าสุด':'รางวัลที่กำลังจะแจก'}</span><strong>{roundPrize?.name||'แจกรางวัลครบแล้ว'}</strong><b>฿{money(roundPrize?.value||0)}</b></div><div><span>{winner?'ผู้ได้รับรางวัล':'สถานะ'}</span><strong>{winner?maskName(winner):spinning?'กำลังสุ่มบนหน้าจอผู้ชม…':cooldown?`พักอีก ${secondsLeft} วินาที`:'พร้อมเริ่มสุ่ม'}</strong><small>{awaitingAck?'กดรับทราบด้านล่างเพื่อมาร์กรางวัลและไปรอบถัดไป':`${room.participants.length} สิทธิ์คงเหลือ`}</small></div><div><span>รางวัลรอบถัดไป</span><strong>{followingPrize?.name||'ไม่มีรางวัลถัดไป'}</strong>{followingPrize&&<b>฿{money(followingPrize.value)}</b>}</div></div><p className="controller-note">ทั้งสองหน้าซิงค์จากห้องเดียวกัน · เสียงประกอบเล่นที่หน้าจอผู้ชมเท่านั้น</p></section>}
    {!showHistory&&eventFinished&&<section className="event-finale panel" aria-label="สรุปผู้ชนะทั้งหมด"><Celebration finale/><div className="finale-heading"><p className="eyebrow">ALL OUR LUCKY WINNERS</p><h2>🏆 ยินดีกับผู้โชคดีทุกคน</h2><p>แจกรางวัลครบแล้ว · {completed.length} รางวัล · มูลค่ารวม ฿{money(room?.totalValue||0)}</p></div><ol className="finale-grid">{[...completed].sort((a,b)=>b.value-a.value||a.at-b.at).map(award=>{const prize=prizePool.find(p=>p.name===award.prize&&p.value===award.value)||{name:award.prize,value:award.value};return <li key={award.spinId}><PrizeImage prize={prize}/><div><h3>{award.prize}</h3><p>มูลค่า ฿{money(award.value)}</p><strong>{maskName(award.participant)}</strong></div></li>})}</ol><p className="finale-thanks">ขอบคุณทุกคนที่มาร่วมลุ้นด้วยกัน ✦</p>{host&&<a className="ghost download" href={'/api/room?id='+encodeURIComponent(id)+'&export=csv'}>↓ ดาวน์โหลดรายชื่อผู้ชนะ CSV</a>}</section>}
    {!showHistory&&!eventFinished&&!roomEnded&&<div className="main-grid">
      <section className="stage" ref={stage}>
        <div className="stage-top"><span className="live-label"><i/>{spinning?'LIVE DRAW':'THE LUCKY DRAW'}</span><span>{currentNames.length} สิทธิ์ · สุ่มจากทุกสิทธิ์ในตาราง</span></div>
        <PrizeRibbon prizes={room?.prizes||examplePrizes} selectedIndex={currentPrizeIndex}/><div className="round-display">{presentation&&roundPrize&&<div className="zoom-round-art"><PrizeImage prize={roundPrize}/></div>}<span>{spinning?'กำลังหมุนหาผู้รับรางวัล':winner?'รางวัลรอบล่าสุด':'รางวัลที่กำลังจะแจก'}</span><h2>{roundPrize?.name||(room?'แจกรางวัลครบแล้ว':'เลือกรางวัลสำหรับรอบนี้')}</h2><strong>มูลค่า ฿{money(roundPrize?.value||0)}</strong>{winner&&<div className="top-winner">ผู้ได้รับรางวัล <b>{maskName(winner)}</b></div>}</div>
        <div className="next-prize-preview" aria-live="polite">{followingPrize?<><PrizeImage prize={followingPrize}/><div><span>รางวัลรอบถัดไป <small>· รางวัลที่ {String(followingPrizeIndex+1).padStart(2,'0')}</small></span><strong>{followingPrize.name}</strong><b>มูลค่า ฿{money(followingPrize.value)}</b></div><span className="next-prize-arrow" aria-hidden="true">→</span></>:<p>{currentPrizeIndex<0?'✓ แจกรางวัลครบแล้ว':'✦ รอบนี้เป็นรางวัลสุดท้าย'}</p>}</div>
        {id&&<div className={'round-countdown '+(cooldown?'counting':'')} role="status" aria-live="polite">{spinning?<><span>พักระหว่างรอบ</span><strong>{room?.roundWaitSeconds||0} วินาทีหลังผู้ควบคุมรับทราบ</strong></>:awaitingAck?<><span>รอเริ่มเวลาเบรค</span><strong>รอผู้ควบคุมกดรับทราบผลรางวัล</strong></>:cooldown?<><span>เริ่มรอบถัดไปได้ใน</span><strong className="countdown-number">{String(Math.floor(secondsLeft/60)).padStart(2,'0')}:{String(secondsLeft%60).padStart(2,'0')}</strong><small>เตรียมรางวัลรอบถัดไปได้ระหว่างรอ</small></>:<><span>สถานะรอบถัดไป</span><strong>พร้อมเริ่มหมุน</strong></>}</div>}
        {viewOnly&&<ViewerAwards awards={completed} prizes={prizePool}/>}
        {room?.drawMode==='wheel'?<DrawWheel names={currentNames} spin={spin} now={now}/>:<ParticipantTable names={currentNames} spin={spin} offset={offset} drawing={spinning} slowing={!!spin&&spinning&&now>=spin.start+spin.duration*.65}/>}
        <div className={'result-banner '+(winner?'won':'')} aria-live="polite">
          {spinning?<><span>{now<spin!.start?'เตรียมตัวลุ้น…':'กำลังสุ่มผู้โชคดีจากรายชื่อร่วมลุ้น'}</span><strong>{roundPrize?.name} <em>฿{money(roundPrize?.value||0)}</em></strong></>:winner?<><span>ผู้โชคดีได้รับ {roundPrize?.name}</span><strong>{maskName(winner)}</strong><small>มูลค่า ฿{money(roundPrize?.value||0)} · ✓ บันทึกผลรางวัลแล้ว<br/>นำชื่อผู้ชนะออกแล้ว · เหลือ {room?.participants.length||0} สิทธิ์</small></>:<><span>สุ่มผู้โชคดี 1 คน · คนละหนึ่งสิทธิ์</span><strong>{host?'พร้อมลุ้นรางวัลนี้หรือยัง?':'ใครจะเป็นผู้โชคดีคนต่อไป?'}</strong></>}
        </div>
        {presentation&&id&&<div className="zoom-controls">{host&&room?<><span className="zoom-control-status">{dirty?'มีการแก้ไขที่ยังไม่บันทึก':room.selectedPrizeIndex<0?'✓ แจกรางวัลครบแล้ว':cooldown?`พักระหว่างรอบ ${secondsLeft} วินาที`:spinning?'กำลังสุ่มผู้โชคดี…':awaitingAck?'รับทราบเพื่อไปรางวัลถัดไป':'พร้อมสุ่มผู้โชคดี'}</span><button className="primary" disabled={busy||(!awaitingAck&&(locked||cooldown||room.participants.length<1||room.selectedPrizeIndex<0||dirty))||!connected} onClick={()=>act(awaitingAck?'ack':'spin')}>{busy?'กำลังดำเนินการ…':awaitingAck?'✓ รับทราบและไปรางวัลถัดไป':spinning?'กำลังสุ่ม…':cooldown?`รอ ${secondsLeft} วินาที`:'✳ สุ่มผู้โชคดี'}</button></>:<span>◉ รับชมสด · ผู้ควบคุมเป็นผู้เริ่มสุ่ม</span>}</div>}
        {id&&<div className="watch-note">{host?'⌑ คุณเป็นผู้ควบคุมห้องนี้':'◉ โหมดผู้ชม · รับชมการหมุนและผลรางวัลได้อย่างเดียว'}<small>อัปเดตสดจากห้องเดียวกับผู้ควบคุม</small></div>}
      </section>
      <aside>
        {host&&room?<section className="panel host-panel"><div className="panel-heading"><h2><span className="number">01</span> ควบคุมการหมุน</h2><span className="small-badge">HOST ONLY</span></div>
          <label htmlFor="round-prize">รางวัลที่แจกในรอบนี้</label><select id="round-prize" value={room.selectedPrizeIndex} disabled={locked||busy||dirty} onChange={e=>act('select',Number(e.target.value))}>{room.selectedPrizeIndex<0&&<option value={-1}>แจกรางวัลครบแล้ว</option>}{room.prizes.map((p,i)=><option key={i} value={i} disabled={p.awarded}>{p.awarded?'✓ แจกแล้ว · ':''}{p.name} — ฿{money(p.value)}</option>)}</select>
          <button className="primary spin-button" disabled={busy||locked||cooldown||room.participants.length<1||room.selectedPrizeIndex<0||dirty||!connected} onClick={()=>act('spin')}>{busy?'กำลังดำเนินการ…':spinning?'กำลังหมุน…':awaitingAck?'รอรับทราบผลรางวัล':room.selectedPrizeIndex<0?'แจกรางวัลครบแล้ว':cooldown?`รออีก ${secondsLeft} วินาที`:'✳ หมุนสุ่มผู้โชคดี'}</button>{awaitingAck&&<button className="secondary" disabled={busy||!connected} onClick={()=>act('ack')}>รับทราบผลและเริ่มเวลาเบรค</button>}<p className="hint">{dirty?'บันทึกการแก้ไขรายชื่อและรางวัลก่อนเริ่มหมุน':spinning?'รอสุ่มเสร็จก่อนเริ่มรอบถัดไป':'แจกจากมูลค่าน้อยไปหามาก · กดรับทราบเพื่อไปรางวัลถัดไป'}</p>
          <div className="roster-divider"/><label htmlFor="draw-mode">รูปแบบการสุ่ม</label><select id="draw-mode" value={drawMode} disabled={locked||busy} onChange={event=>setDrawMode(event.target.value as Room['drawMode'])}><option value="scroll">เลื่อนรายชื่อ</option><option value="wheel">วงล้อ</option></select><label htmlFor="round-wait">พักระหว่างรอบ (วินาที)</label><input id="round-wait" type="number" min="0" max="3600" step="1" value={waitSeconds} disabled={locked||busy} onChange={e=>setWaitSeconds(e.target.value===''?0:Number(e.target.value))}/><p className="hint">เริ่มนับหลังผู้ควบคุมกดรับทราบ · 0 = ไม่พักระหว่างรอบ<br/>เปลี่ยนเวลาแล้วกดบันทึก · ใช้กับการหมุนครั้งถัดไป</p><div className="roster-divider"/><label htmlFor="participants">รายชื่อร่วมลุ้น <span className="count">{inputNames.length} สิทธิ์</span></label><textarea id="participants" rows={6} placeholder={'@user_01\n@user_02\n@user_03'} value={namesText} disabled={locked||busy} onChange={e=>setNamesText(e.target.value)}/>
          <label htmlFor="roster-file">นำเข้ารายชื่อจาก CSV</label>
          <input id="roster-file" type="file" accept=".csv,text/csv" disabled={locked||busy} onChange={async event=>{
            const file=event.target.files?.[0];
            event.target.value='';
            if (!file) return;
            try {
              if (file.size > 300000) throw Error('ไฟล์ CSV มีขนาดใหญ่เกินไป');
              const imported=csvNames(await file.text());
              const combined=[...inputNames,...imported];
              if (combined.length>MAX_PARTICIPANTS) throw Error('ใส่รายชื่อได้ไม่เกิน 2,000 สิทธิ์');
              setNamesText(combined.join('\n'));
              setError('');
              setNotice(`อ่านรายชื่อ ${imported.length} รายการแล้ว · กดบันทึกเพื่อใช้ในห้อง`);
            } catch (e) { setError((e as Error).message); }
          }}/>

          <p className="hint" role={inputNames.length>MAX_PARTICIPANTS?'alert':undefined}>{inputNames.length>MAX_PARTICIPANTS?'เกิน 2,000 สิทธิ์ กรุณาลดจำนวนรายชื่อ · ':''}หนึ่งบรรทัด = 1 สิทธิ์ · ตัดชื่อซ้ำอัตโนมัติ · สูงสุด 2,000 สิทธิ์<br/>ผู้ที่ชนะแล้วจะไม่ถูกเพิ่มกลับเข้าห้องนี้</p><button className="secondary" disabled={busy||locked||!dirty||inputNames.length>MAX_PARTICIPANTS} onClick={()=>act('config')}>บันทึกรายชื่อและการตั้งค่า</button>
        </section>:<section className="panel welcome-panel"><span className="large-star">✦</span><h2>{id?'ลุ้นสดไปพร้อมกัน':'ใครจะเป็นผู้โชคดี?'}</h2><p>{id?'ตารางแสดงชื่อผู้ร่วมลุ้น ผู้ควบคุมเลือกรางวัลที่แจก แล้วกดหมุนหาผู้โชคดี ทุกคนเห็นผลเดียวกัน':'เพิ่มชื่อผู้ใช้ในตาราง กำหนดรางวัลและมูลค่า แล้วเลือกรางวัลที่จะหมุนแจกในแต่ละรอบ'}</p><div className="mini-steps"><span>01 เลือกรางวัล</span><b>→</b><span>02 สุ่มชื่อ</span><b>→</b><span>03 บันทึกผล</span></div></section>}
        <section className="panel prize-panel"><div className="panel-heading"><h2><span className="number">{host?'02':'✧'}</span> ของรางวัล <span className="count">{(room?.prizes||examplePrizes).length}</span></h2>{host&&<button className="text-button" disabled={locked||busy} onClick={()=>{if(editing){setPrizes(room!.prizes.map(p=>({...p})));setTitle(room!.title)}setEditing(!editing)}}>{editing?'ยกเลิก':'แก้ไข ✎'}</button>}</div>
          {editing?<div className="editor"><label htmlFor="event-title">ชื่อกิจกรรม</label><input id="event-title" value={title} maxLength={80} disabled={locked||busy} onChange={e=>setTitle(e.target.value)}/><div className="editor-head"><span>ชื่อรางวัล</span><span>มูลค่า (บาท)</span><span/></div><div className="editable-prizes">{prizes.map((p,i)=><div className="prize-editor-row" key={i}><input aria-label={`ชื่อรางวัล ${i+1}`} maxLength={60} value={p.name} disabled={locked||busy} onChange={e=>updatePrize(i,'name',e.target.value)}/><input aria-label={`มูลค่ารางวัล ${i+1}`} type="number" min="0" max="100000000" step="0.01" value={p.value} disabled={locked||busy} onChange={e=>updatePrize(i,'value',e.target.value)}/><button aria-label={`ลบรางวัล ${i+1}`} disabled={p.awarded||prizes.length<=1||locked||busy} onClick={()=>setPrizes(old=>old.filter((_,index)=>index!==i))}>×</button><input className="prize-image-input" aria-label={`ลิงก์รูปรางวัล ${i+1}`} placeholder="ลิงก์รูป HTTPS (ถ้ามี)" value={p.image||''} disabled={locked||busy} onChange={e=>updatePrize(i,'image',e.target.value)}/></div>)}</div><button className="add-prize" disabled={prizes.length>=30||locked||busy} onClick={()=>setPrizes(old=>[...old,{name:'รางวัลใหม่',value:0}])}>＋ เพิ่มรางวัล</button><p className="hint">1–30 รางวัล · กำหนดชื่อและมูลค่าได้<br/>เลือกรางวัลที่จะหมุนแจกก่อนเริ่มแต่ละรอบ</p><button className="secondary" disabled={busy||locked||!dirty} onClick={()=>act('config')}>บันทึกของรางวัล</button></div>:<><div className="prize-list">{(room?.prizes||examplePrizes).map((p,i)=>({p,i})).sort((a,b)=>b.p.value-a.p.value||a.i-b.i).map(({p,i})=><div className={'prize-row '+(p.awarded?'awarded':i===(room?.selectedPrizeIndex??9)?'selected':'')} key={i}><PrizeImage prize={p}/><span className="prize-index">{String(i+1).padStart(2,'0')}</span><span className="prize-name">{p.name}{p.awarded&&<small className="awarded-label">✓ แจกแล้ว</small>}</span><b>฿{money(p.value)}</b></div>)}</div><p className="hint">{!id?'รายการและมูลค่าตัวอย่าง · แก้ไขได้หลังสร้างห้อง':host?'กด “แก้ไข” เพื่อตั้งชื่อ มูลค่า และเพิ่มหรือลดรางวัล':'ของรางวัลที่ผู้ควบคุมกำหนด'}</p></>}
        </section>
      </aside>
    </div>}
    {(!eventFinished||showHistory)&&!roomEnded&&<section className="records panel"><div className="records-top"><div><p className="eyebrow">EVERY WIN, REMEMBERED</p><h2>บันทึกการแจกรางวัล <span className="count">{room?.totalCount||0}</span></h2></div><div className="records-tools">{id&&<>{showHistory&&<input aria-label="ค้นหาผลรางวัล" placeholder="ค้นหาชื่อ / รางวัล" value={search} onChange={e=>{setSearch(e.target.value);setHistoryLimit(50)}}/>}{host&&<a className="ghost download" href={'/api/room?id='+encodeURIComponent(id)+'&export=csv'}>↓ ดาวน์โหลด CSV</a>}</>}</div></div>
      <div className="summary-strip"><span>แจกแล้ว <b>{room?.totalCount||0}</b> ครั้ง</span><span>มูลค่ารวม <b>฿{money(room?.totalValue||0)}</b></span><span className="auto-save">ผลย้อนหลังของห้องนี้</span></div>
      {historyRows.length?<div className="table-wrap"><table><thead><tr><th>ผู้ร่วมลุ้น</th><th>รางวัลที่ได้รับ</th><th>มูลค่า (บาท)</th><th>วันเวลา (ไทย)</th></tr></thead><tbody>{shownHistory.map(h=><tr key={h.spinId}><td data-label="ผู้โชคดี"><span className="avatar">{Array.from(h.participant.replace(/^@/,''))[0]||'?'}</span><b>{maskName(h.participant)}</b></td><td data-label="รางวัล">{h.prize}</td><td data-label="มูลค่า" className="value-cell">฿{money(h.value)}</td><td data-label="วันเวลา" className="time-cell">{date(h.at)}</td></tr>)}</tbody></table></div>:<div className="empty-records"><span>♧</span><h3>{search?'ไม่พบรายการที่ค้นหา':'รอผู้โชคดีคนแรกของวันนี้'}</h3><p>{search?'ลองค้นหาด้วยชื่อหรือรางวัลอื่น':'เมื่อสุ่มเสร็จ ผู้โชคดีและรางวัลที่เลือกจะแสดงที่นี่โดยอัตโนมัติ'}</p></div>}
      {showHistory&&historyRows.length>historyLimit&&<button className="secondary history-more" onClick={()=>setHistoryLimit(n=>n+50)}>ดูเพิ่มอีก 50 รายการ</button>}
      {id&&!showHistory&&<a className="secondary history-link" href={roomLink+'&history=1'}>ดูประวัติรางวัลทั้งหมด →</a>}
      {!!room?.totalCount&&<p className="table-note">{showHistory?`แสดง ${shownHistory.length} จาก ${historyRows.length} รายการ${search?' ที่ค้นหา':''}`:'ผลรางวัลล่าสุด 5 รายการ'}{host&&' · ดาวน์โหลด CSV เพื่อเก็บประวัติทั้งหมด'}</p>}
    </section>}
    {host&&!viewOnly&&<section className="end-room">
      {confirmClose?<><p>ปิดห้องและล้างรายชื่อกับผลทั้งหมดใช่ไหม?</p><button className="ghost" disabled={busy} onClick={()=>act('close')}>ปิดห้องและล้างข้อมูล</button><button className="ghost" disabled={busy} onClick={()=>setConfirmClose(false)}>กลับไปห้อง</button></>:<button className="ghost" disabled={busy} onClick={()=>setConfirmClose(true)}>จบงานและปิดห้อง</button>}
    </section>}
    <footer><span><b>Enchanted Kingdom</b> Lucky Draw Live</span><span>ทุกคนลุ้นไปพร้อมกัน ✦</span></footer>
  </main>;
}

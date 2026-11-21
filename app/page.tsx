'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import LegacyDraw from './legacy-draw';
import { portraitForSlot } from './lib/avatars';
import { csvNames } from './lib/roster';
import { drawPosition, MAX_PARTICIPANTS } from './lib/wheel';
import { GIFT_SLOWDOWN_START, giftSpinProgress, recipientStatus, type GiftRoom, type GiftSpin } from './lib/gifts';

type MusicControl = {playing:boolean; unavailable:boolean; toggle:()=>void};

function GiftMusicButton({playing,unavailable,toggle}: MusicControl) {
  return <div className="gift-music">
    <button className="gift-music-button" type="button" aria-label="เพลงประกอบ" aria-pressed={playing} onClick={toggle}>
      <span aria-hidden="true">♫</span>{playing?'ปิดเพลง':'เปิดเพลง'}
    </button>
    {unavailable&&<span className="gift-music-error" role="status">เล่นเพลงไม่ได้ ลองแตะอีกครั้ง</span>}
  </div>;
}

type AvatarSlots = ReadonlyMap<string, number>;

function GiftAvatar({name,slot}: {name:string;slot:number|undefined}) {
  const portrait=portraitForSlot(slot);
  if (!portrait) return <span className="gift-avatar gift-avatar-letter" aria-hidden="true">{Array.from(name)[0]}</span>;
  const {source,x,y,size,width,height}=portrait;
  const left=Math.min(Math.max(0,x-size/2),width-size);
  const top=Math.min(Math.max(0,y-size/2),height-size);
  return <span className="gift-avatar" aria-hidden="true" data-portrait={slot} style={{
    backgroundImage:`url(${source})`,
    backgroundSize:`${width/size*100}% ${height/size*100}%`,
    backgroundPosition:`${left/(width-size)*100}% ${top/(height-size)*100}%`,
  }}/>;
}

function GiftPerson({name,avatars}: {name:string;avatars:AvatarSlots}) {
  return <span className="gift-person"><GiftAvatar name={name} slot={avatars.get(name)}/><strong>{name}</strong></span>;
}

function DisneyParkMusic({onChange}: {onChange:(expanded:boolean)=>void}) {
  const [open,setOpen]=useState(false);
  return <details className="gift-park-music" onToggle={event=>{
    const expanded=event.currentTarget.open;
    setOpen(expanded);
    onChange(expanded);
  }}>
    <summary>♫ เพลงจากสวนสนุกดิสนีย์</summary>
    {open&&<div className="gift-park-player">
      <p><strong>Starlight Anthem</strong> · ขบวนพาเหรด Disney Starlight ที่ Magic Kingdom</p>
      <iframe title="Music from Disney Starlight — Spotify"
        src="https://open.spotify.com/embed/album/6K3lw78IwRoSe9ZKqoKAdQ"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen/>
      <div className="gift-park-links">
        <a className="ghost" href="https://www.youtube.com/watch?v=Qh_rtS95oms" target="_blank" rel="noopener">เปิดบน YouTube</a>
        <a className="ghost" href="https://open.spotify.com/album/6K3lw78IwRoSe9ZKqoKAdQ" target="_blank" rel="noopener">เปิดอัลบั้มบน Spotify</a>
      </div>
    </div>}
  </details>;
}

function GiftAnimation({spin,now,mode,avatars}: {spin:GiftSpin;now:number;mode:GiftRoom['drawMode'];avatars:AvatarSlots}) {
  const progress = Math.max(0,Math.min(1,(now-spin.start)/spin.duration));
  if (mode === 'scroll') {
    const index = Math.round(drawPosition(progress,spin.names.length,spin.winner,giftSpinProgress));
    return <div className="gift-roller" aria-hidden="true"><span>✦</span><GiftPerson name={spin.names[index]} avatars={avatars}/><span>✦</span></div>;
  }
  const count = spin.names.length;
  const slice = 360/count;
  const palette = ['#603b85','#795098','#3c3a72','#98643b'];
  const background = count <= 64
    ? 'conic-gradient('+spin.names.map((_,i)=>`${palette[i%4]} ${i*slice}deg ${(i+1)*slice}deg`).join(',')+')'
    : `repeating-conic-gradient(#603b85 0deg ${slice}deg,#3c3a72 ${slice}deg ${2*slice}deg)`;
  const angle = (2160+360-(spin.winner+.5)*slice)*giftSpinProgress(progress);
  return <div className="party-wheel" aria-hidden="true">
    <span className="pointer"/>
    <div className="party-wheel-rotor" style={{background,transform:`rotate(${angle}deg)`}}>
      {count <= 24 && spin.names.map((name,i)=><span key={name} className="party-wheel-label gift-wheel-person" style={{transform:`rotate(${(i+.5)*slice}deg)`}}><GiftAvatar name={name} slot={avatars.get(name)}/><span className="gift-wheel-name">{name}</span></span>)}
    </div>
    <span className="party-wheel-hub">♜</span>
  </div>;
}

function StorybookGallery() {
  return <section className="gift-storybook-gallery" aria-label="ภาพตัวละคร">
    <figure>
      <img src="/art/storybook-characters.webp" width={850} height={446} loading="lazy" alt="ภาพรวมตัวละครดิสนีย์จากหลายเรื่อง"/>
    </figure>
    <figure>
      <img src="/art/storybook-princesses.webp" width={387} height={516} loading="lazy" alt="ภาพตัวละครเจ้าหญิงดิสนีย์"/>
    </figure>
    <p>ภาพตัวละคร © Disney</p>
  </section>;
}

function GiftDrawDialog({spin,mode,now,music,avatars}: {spin:GiftSpin;mode:GiftRoom['drawMode'];now:number;music:MusicControl|null;avatars:AvatarSlots}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const revealed = now >= spin.start + spin.duration;
  const slowing = !revealed&&now >= spin.start+spin.duration*GIFT_SLOWDOWN_START;
  useEffect(()=>{
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  },[]);

  return <dialog ref={dialog} className="gift-draw-dialog" aria-labelledby="gift-draw-heading">
    <button className="gift-draw-close" type="button" aria-label="ปิดหน้าต่างสุ่ม" onClick={()=>dialog.current?.close()}>×</button>
    {revealed
      ? <div className="gift-mouse-cheer" aria-hidden="true"><span/><span/><span/><i>✦</i><i>✧</i><i>✦</i></div>
      : <span className="gift-stage-spark" aria-hidden="true">✦</span>}
    <h2 id="gift-draw-heading">{revealed?'จับคู่ได้แล้ว':`${spin.giver} จะให้ของขวัญกับใคร?`}</h2>
    {revealed
      ? <div className="gift-pair-result" role="status"><GiftPerson name={spin.giver} avatars={avatars}/><span>ให้ของขวัญกับ</span><GiftPerson name={spin.names[spin.winner]} avatars={avatars}/></div>
      : <><GiftAnimation spin={spin} now={now} mode={mode} avatars={avatars}/><p className="gift-draw-phase" aria-live="polite">{slowing?'กำลังชะลอ…':now<spin.start?'เตรียมลุ้น':'กำลังสุ่ม'}</p></>}
    {music&&<GiftMusicButton {...music}/>}
  </dialog>;
}

function RecipientRoster({participants,pairs,avatars}: {participants:string[];pairs:GiftRoom['pairs'];avatars:AvatarSlots}) {
  const {received,waiting} = recipientStatus(participants,pairs);
  return <section className="panel gift-recipient-panel" aria-labelledby="gift-recipient-heading">
    <h2 id="gift-recipient-heading">สถานะผู้รับของขวัญ</h2>
    <div className="gift-recipient-columns">
      <details open>
        <summary>ยังไม่ได้รับ <span>{waiting.length} คน</span></summary>
        {waiting.length?<ul>{waiting.map(name=><li key={name}><GiftAvatar name={name} slot={avatars.get(name)}/><span>{name}</span></li>)}</ul>:<p>ได้ครบทุกคนแล้ว</p>}
      </details>
      <details open>
        <summary>ได้รับแล้ว <span>{received.length} คน</span></summary>
        {received.length?<ul>{received.map(name=><li key={name}><GiftAvatar name={name} slot={avatars.get(name)}/><span>{name}</span></li>)}</ul>:<p>ยังไม่มีผู้รับ</p>}
      </details>
    </div>
  </section>;
}

export default function GiftExchange() {
  const [route,setRoute]=useState<{id:string;viewer:boolean}|null>(null);
  const [room,setRoom]=useState<GiftRoom|null>(null);
  const [legacy,setLegacy]=useState(false);
  const [canCreate,setCanCreate]=useState(false);
  const [lastRoom,setLastRoom]=useState('');
  const [configured,setConfigured]=useState(true);
  const [names,setNames]=useState('');
  const [title,setTitle]=useState('');
  const [mode,setMode]=useState<GiftRoom['drawMode']>('wheel');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [closed,setClosed]=useState(false);
  const [confirmClose,setConfirmClose]=useState(false);
  const [now,setNow]=useState(0);
  const offset=useRef(0);
  const revision=useRef(0);
  const pending=useRef(false);
  const initialized=useRef(false);
  const audio=useRef<HTMLAudioElement>(null);
  const musicPausedByChoice=useRef(false);
  const [musicPlaying,setMusicPlaying]=useState(false);
  const [musicUnavailable,setMusicUnavailable]=useState(false);
  const [parkMusicOpen,setParkMusicOpen]=useState(false);

  function playMusic() {
    const track=audio.current;
    if (!track || !track.paused) return;
    track.volume=.72;
    setMusicUnavailable(false);
    void track.play().catch(error=>{
      if (error.name!=='AbortError') setMusicUnavailable(true);
    });
  }

  const music:MusicControl = {
    playing:musicPlaying,
    unavailable:musicUnavailable,
    toggle:()=>{
      const track=audio.current;
      if (!track) return;
      musicPausedByChoice.current=!track.paused;
      if (musicPausedByChoice.current) track.pause();
      else playMusic();
    },
  };

  useEffect(()=>{
    if (initialized.current) return;
    initialized.current=true;
    const params=new URLSearchParams(location.search);
    const id=params.get('room')||'';
    setRoute({id,viewer:params.get('view')==='1'});
    setNow(Date.now());
    if (id) return;
    try {setLastRoom(localStorage.getItem('last-host-room')||'');} catch {}

    const linkKey=new URLSearchParams(location.hash.slice(1)).get('admin');
    if (linkKey) window.history.replaceState({},'',location.pathname+location.search);
    const request=linkKey
      ? fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'unlock',linkKey})})
      : fetch('/api/room?status=1',{cache:'no-store'});
    request.then(async response=>{
      const data=await response.json();
      if (!response.ok) throw Error(data.error||'เปิดสิทธิ์แอดมินไม่สำเร็จ');
      setCanCreate(data.canCreate===true);
      setConfigured(data.configured===true);
    }).catch(error=>setError(error.message));
  },[]);

  useEffect(()=>{
    if (!route?.id || legacy || closed) return;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    let stopped=false;
    const poll=async()=>{
      const generation=revision.current;
      const started=Date.now();
      try {
        const query=new URLSearchParams({id:route.id,viewer:route.viewer?'1':'0'});
        const response=await fetch('/api/room?'+query,{signal:controller.signal,cache:'no-store'});
        const data=await response.json();
        if (stopped||generation!==revision.current||pending.current) return;
        if (response.status===404) {setClosed(true);setRoom(null);setError(data.error);return;}
        if (!response.ok) throw Error(data.error||'เชื่อมต่อห้องไม่สำเร็จ');
        if (data.kind!=='gift') {setLegacy(true);return;}
        offset.current=data.now-(started+Date.now())/2;
        setRoom(data);
        setError(previous=>previous==='เชื่อมต่อห้องไม่สำเร็จ กรุณาลองใหม่'?'':previous);
      } catch (error) {
        if (!stopped) setError((error as Error).message);
      } finally {
        if (!stopped) timer=setTimeout(poll,1500);
      }
    };
    void poll();
    return ()=>{stopped=true;clearTimeout(timer);controller.abort();};
  },[route,legacy,closed]);

  const active=Boolean(room?.spin&&now<room.spin.start+room.spin.duration);
  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()+offset.current),active?50:250);
    return ()=>clearInterval(timer);
  },[active]);

  const roster=room?.participants;
  const avatars=useMemo(()=>new Map(roster?.map((name,index)=>[name,index])),[roster]);
  const saved=room?JSON.stringify([room.participants,room.title,room.drawMode]):'';
  useEffect(()=>{
    if (!saved) return;
    const [roster,heading,drawMode]=JSON.parse(saved) as [string[],string,GiftRoom['drawMode']];
    setNames(roster.join('\n'));
    setTitle(heading);
    setMode(drawMode);
  },[saved]);

  const participants=names.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
  const dirty=!!room&&JSON.stringify([participants,title,mode])!==saved;
  const share=route?.id?`/?room=${encodeURIComponent(route.id)}&view=1`:'';
  const exportUrl=route?.id?`/api/room?id=${encodeURIComponent(route.id)}&export=csv`:'';
  const pairs=room?.pairs ?? [];
  const spin=room?.spin;
  const revealAt=spin?spin.start+spin.duration:0;
  const shownPairs=spin&&!active&&pairs.at(-1)?.at!==revealAt
    ? [...pairs,{giver:spin.giver,recipient:spin.names[spin.winner],at:revealAt}]
    : pairs;
  const lastPair=shownPairs.at(-1);
  const showDrawDialog=Boolean(spin&&now<revealAt+3000);
  const locked=active||shownPairs.length>0;

  async function act(op:'create'|'config'|'spin'|'close') {
    if (pending.current) return;
    if (op==='spin'&&!musicPausedByChoice.current) playMusic();
    pending.current=true;
    revision.current++;
    setBusy(true);setError('');
    try {
      const started=Date.now();
      const response=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({op,id:route?.id,title,participants,drawMode:mode,round:shownPairs.length})});
      const data=await response.json();
      if (!response.ok) throw Error(data.error||'ดำเนินการไม่สำเร็จ');
      if (op==='close') {
        try {
          if (localStorage.getItem('last-host-room')===route?.id) localStorage.removeItem('last-host-room');
        } catch {}
        window.location.assign('/');
        return;
      }
      offset.current=data.now-(started+Date.now())/2;
      setNow(data.now);setRoom(data);
      if(op==='create') {
        const id=data.id as string;
        window.history.replaceState({},'','?room='+encodeURIComponent(id));
        setRoute({id,viewer:false});
        try {localStorage.setItem('last-host-room',id);} catch {}
      }
      if(op==='config') setNames(data.participants.join('\n'));
    } catch (error) {setError((error as Error).message);}
    finally {pending.current=false;revision.current++;setBusy(false);}
  }

  async function copyViewer() {
    const url=location.origin+share;
    try {await navigator.clipboard.writeText(url);setNotice('คัดลอกลิงก์ผู้ชมแล้ว');}
    catch {setNotice(url);}
  }

  if (legacy) return <LegacyDraw/>;
  return <main className="gift-exchange">
    <audio ref={audio} src="/audio/lantern-waltz-clear.mp3" preload="none" loop
      onPlaying={()=>setMusicPlaying(true)} onPause={()=>setMusicPlaying(false)} onError={()=>setMusicUnavailable(true)}/>
    <header>
      <a className="brand" href="/"><span className="brand-symbol" aria-hidden="true">✦</span><span>Enchanted <span className="brand-yellow">Kingdom</span><small>GIFT EXCHANGE</small></span></a>
      <div className="gift-header-actions">{room&&<span className="gift-role">{room.host?'ผู้ควบคุม':'ผู้ชม'}</span>}{!parkMusicOpen&&<GiftMusicButton {...music}/>}</div>
    </header>
    <DisneyParkMusic onChange={expanded=>{
      setParkMusicOpen(expanded);
      if (expanded) {
        musicPausedByChoice.current=true;
        audio.current?.pause();
      }
    }}/>
    {error&&<p role="alert" className="alert">{error}</p>}
    {!route?.id&&<section className="gift-landing">
      <div className="gift-hero-copy">
        <span className="gift-ornament" aria-hidden="true">✧ ✦ ✧</span>
        <h1>จับฉลาก<br/>แลกของขวัญ</h1>
        <p>มาลุ้นด้วยกันว่าใครจะให้ของขวัญกับใคร</p>
        {!configured&&<p>อยู่ระหว่างตั้งค่าห้องสด</p>}
        {canCreate?<div className="gift-actions"><button className="primary" disabled={busy} onClick={()=>act('create')}>สร้างห้องแลกของขวัญ</button>{lastRoom&&<a className="ghost" href={'/?room='+encodeURIComponent(lastRoom)}>กลับห้องล่าสุด</a>}</div>:route&&<p className="gift-entry-note">เปิดลิงก์แอดมินส่วนตัวเพื่อสร้างห้อง หรือเปิดลิงก์ผู้ชมที่ได้รับเพื่อดูสด</p>}
      </div>
      <figure className="gift-hero-art gift-cinderella-art">
        <img src="/art/cinderella-castle-900.webp"
          srcSet="/art/cinderella-castle-520.webp 520w, /art/cinderella-castle-900.webp 900w"
          sizes="(max-width: 720px) 92vw, 560px"
          width={900} height={846} fetchPriority="high"
          alt="ภาพวาดปราสาทซินเดอเรลล่าหลังคาสีฟ้า พร้อมรถม้า"/>
        <figcaption>Cinderella Castle · © Disney</figcaption>
      </figure>
    </section>}
    {!route?.id&&<StorybookGallery/>}
    {route?.id&&!room&&!closed&&!error&&<p role="status">กำลังเปิดห้องจับฉลาก…</p>}
    {room&&<>
      {spin&&showDrawDialog&&<GiftDrawDialog key={spin.id} spin={spin} mode={room.drawMode} now={now} music={parkMusicOpen?null:music} avatars={avatars}/>}
      <div className="gift-room-heading">
        <div><h1>{room.title}</h1><p>จับคู่แล้ว {shownPairs.length} จาก {room.participants.length} คน</p></div>
        {room.host&&<div className="gift-actions"><button className="ghost" onClick={copyViewer}>คัดลอกลิงก์ผู้ชม</button><a className="ghost" href={share} target="_blank" rel="noopener">เปิดหน้าผู้ชม</a></div>}
      </div>
      {notice&&<p role="status" className="gift-notice">{notice}</p>}
      <div className={room.host?'gift-layout':'gift-layout viewer'}>
        <section className="stage gift-stage" aria-label="ผลจับฉลาก">
          <span className="gift-stage-spark" aria-hidden="true">✦</span>
          <p className="gift-stage-label">{active?'กำลังสุ่มผู้รับ':lastPair?'คู่ล่าสุด':'พร้อมจับคู่'}</p>
          {active&&room.spin?<h2>{room.spin.giver} จะให้ของขวัญกับใคร?</h2>:
            lastPair?<div className="gift-pair-result" aria-live="polite"><GiftPerson name={lastPair.giver} avatars={avatars}/><span>ให้ของขวัญกับ</span><GiftPerson name={lastPair.recipient} avatars={avatars}/></div>:
            <h2>{room.nextGiver?`ผู้ให้คนแรกคือ ${room.nextGiver}`:'รอรายชื่อผู้ร่วมแลกของขวัญ'}</h2>}
          {!active&&shownPairs.length>0&&<p>{room.nextGiver?`ผู้ให้คนถัดไปคือ ${room.nextGiver}`:'จับคู่ครบทุกคนแล้ว'}</p>}
          {room.host&&<button className="primary gift-spin" disabled={busy||active||dirty||room.participants.length<2||!room.nextGiver} onClick={()=>act('spin')}>สุ่มผู้รับ{room.nextGiver&&!active?`ให้ ${room.nextGiver}`:''}</button>}
        </section>
        {room.host&&<section className="panel gift-controls">
          <h2>ตั้งค่าห้อง</h2>
          <label htmlFor="event-title">ชื่อกิจกรรม</label><input id="event-title" maxLength={80} value={title} disabled={locked||busy} onChange={e=>setTitle(e.target.value)}/>
          <label htmlFor="draw-mode">รูปแบบการสุ่ม</label><select id="draw-mode" value={mode} disabled={locked||busy} onChange={e=>setMode(e.target.value as GiftRoom['drawMode'])}><option value="scroll">เลื่อนรายชื่อ</option><option value="wheel">วงล้อ</option></select>
          <label htmlFor="participants">รายชื่อผู้ร่วมแลกของขวัญ</label><textarea id="participants" placeholder={'หนึ่งชื่อต่อบรรทัด\nเช่น มินต์\nฟ้า'} value={names} disabled={locked||busy} onChange={e=>setNames(e.target.value)}/>
          <label htmlFor="roster-file">นำเข้าจาก CSV</label><input id="roster-file" type="file" accept=".csv,text/csv" disabled={locked||busy} onChange={async event=>{
            const file=event.target.files?.[0];
            event.target.value='';
            if(!file)return;
            try {
              if(file.size>300000)throw Error('ไฟล์ CSV มีขนาดใหญ่เกินไป');
              const combined=[...participants,...csvNames(await file.text())];
              if(combined.length>MAX_PARTICIPANTS)throw Error('รองรับสูงสุด 2,000 คน');
              setNames(combined.join('\n'));setError('');
            }catch(error){setError((error as Error).message);}
          }}/>
          <p>{locked?'รายชื่อถูกล็อกเมื่อเริ่มจับคู่':`${participants.length} รายชื่อ · อย่างน้อย 2 คน`}</p>
          <button className="secondary" disabled={locked||busy||!dirty||participants.length>MAX_PARTICIPANTS} onClick={()=>act('config')}>บันทึกรายชื่อ</button>
        </section>}
      </div>
      {room.participants.length>0&&<RecipientRoster participants={room.participants} pairs={shownPairs} avatars={avatars}/>}
      {shownPairs.length>0&&<section className="panel gift-pair-list">
        <div className="gift-room-heading"><h2>คู่แลกของขวัญ</h2>{room.host&&<a className="ghost" href={exportUrl}>ดาวน์โหลด CSV</a>}</div>
        <table><thead><tr><th scope="col">ผู้ให้</th><th scope="col">ผู้รับ</th></tr></thead><tbody>{shownPairs.map(pair=><tr key={pair.giver}><td><GiftPerson name={pair.giver} avatars={avatars}/></td><td><GiftPerson name={pair.recipient} avatars={avatars}/></td></tr>)}</tbody></table>
      </section>}
      {!room.host&&<StorybookGallery/>}
      {room.host&&<section className="end-room">{confirmClose?<><span>ปิดห้องและล้างผลทั้งหมด?</span><button className="ghost" disabled={busy} onClick={()=>act('close')}>ปิดห้อง</button><button className="ghost" onClick={()=>setConfirmClose(false)}>ยกเลิก</button></>:<button className="ghost" onClick={()=>setConfirmClose(true)}>จบงานและปิดห้อง</button>}</section>}
    </>}
  </main>;
}

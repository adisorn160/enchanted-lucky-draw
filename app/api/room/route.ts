import { createHash, timingSafeEqual } from 'node:crypto';
import { closeRoom, createRoom, roomServiceReady, readRoom, saveRoom } from '../../lib/store';
import { nameKey } from '../../lib/roster';
import { examplePrizes, MAX_PARTICIPANTS, maskName, nextPrizeIndex, type Prize, type Spin, type Award } from '../../lib/wheel';
export const dynamic = 'force-dynamic';
const reply = (data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
type Stored = {title:string; prizeCatalogVersion?:number; progressionVersion?:number; prizes?:Prize[]; items?:string[]; participants?:string[]; selectedPrizeIndex?:number; roundWaitSeconds?:number; drawMode?:'scroll'|'wheel'; nextRoundAt?:number; breakPending?:boolean; spin:Spin|null; history?:Array<Award & {label?:string}>};
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const matches = (left: string, right: string) =>
  timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));
const sessionName = (id: string) => 'enchanted-host-' + id;
const creatorSession = 'enchanted-creator';
const tokenFrom = (req: Request, name: string) =>
  (req.headers.get('cookie') || '').split(';').map(cookie => cookie.trim()).find(cookie =>
    cookie.startsWith(name + '='))?.slice(name.length + 1);

function creatorKey() {
  const value = process.env.ADMIN_ACCESS_KEY?.trim() || '';
  if (!value.startsWith('https://')) return value;
  try { return new URLSearchParams(new URL(value).hash.slice(1)).get('admin') || ''; }
  catch { return ''; }
}

const creatorToken = (key: string) => hash('enchanted-creator-session:' + key);
const canCreate = (req: Request, key: string) => {
  const token = tokenFrom(req, creatorSession);
  return key.length >= 24 && Boolean(token && matches(token, creatorToken(key)));
};

const cookie = (name: string, value: string) =>
  `${name}=${value}; Path=/api/room; HttpOnly; SameSite=Strict; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const isHost = (req: Request, id: string, secret: string) => {
  const token = tokenFrom(req, sessionName(id));
  return Boolean(token && matches(hash(token), secret));
};
const unavailable = () => reply({error:'กำลังตั้งค่าบริการห้องจับฉลากสด'},503);
type ReadyRoom=Stored & {prizes:Prize[];participants:string[];selectedPrizeIndex:number;roundWaitSeconds:number;drawMode:NonNullable<Stored['drawMode']>;nextRoundAt:number;breakPending:boolean};
function normalized(raw:string):ReadyRoom{
  const data=JSON.parse(raw);
  const prizes:Prize[]=(data.prizeCatalogVersion===2&&data.prizes?.length?data.prizes:examplePrizes).map((p:Prize,i:number)=>({...p,id:p.id||`prize-${i}`}));
  const spin=data.spin?.names&&data.spin?.prize?data.spin:null;
  const selected=data.progressionVersion===1?data.selectedPrizeIndex:spin&&data.breakPending?data.selectedPrizeIndex:nextPrizeIndex(prizes);
  return {...data,drawMode:data.drawMode==='wheel'?'wheel':'scroll',progressionVersion:1,prizeCatalogVersion:2,breakPending:data.breakPending??false,roundWaitSeconds:data.roundWaitSeconds??10,nextRoundAt:data.nextRoundAt??0,prizes,participants:data.participants||[],selectedPrizeIndex:typeof selected==='number'&&selected>=0&&selected<prizes.length&&!prizes[selected].awarded?selected:nextPrizeIndex(prizes),spin};
}
function legacyAwards(data:Stored):Award[]{return (data.history||[]).map(h=>({spinId:h.spinId,participant:h.participant||'ไม่ระบุชื่อ (ผลเดิม)',prize:h.prize||h.label||'รางวัลเดิม',value:h.value||0,at:h.at}));}
function roomView(data: ReadyRoom, host: boolean, allHistory = false) {
  const now = Date.now();
  const history = legacyAwards(data).filter(award => award.at <= now).sort((a, b) => b.at - a.at);
  const {spin, participants, title, prizes, selectedPrizeIndex, roundWaitSeconds, nextRoundAt, breakPending} = data;
  const active = spin && now < spin.start + spin.duration;
  const displayName = (name: string) => host ? name : maskName(name);
  return {
    host, drawMode:data.drawMode, title, prizes, selectedPrizeIndex, roundWaitSeconds, nextRoundAt, breakPending, now,
    participants: (active ? spin.names : participants).map(displayName),
    spin: spin && {...spin, participant: displayName(spin.participant), names: spin.names.map(displayName)},
    history: history.slice(0, allHistory ? undefined : 100)
      .map(award => ({...award, participant: displayName(award.participant)})),
    totalCount: history.length,
    totalValue: history.reduce((sum, award) => sum + award.value, 0),
  };
}
const csvCell=(v:unknown)=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
export async function GET(req:Request){try{
  const url=new URL(req.url),id=url.searchParams.get('id');
  if (url.searchParams.has('status')) {
    const key = creatorKey();
    return reply({configured: roomServiceReady() && key.length >= 24, canCreate: canCreate(req, key)});
  }
  if (!validId(id)) return reply({error:'ไม่พบห้อง'},404);
  if (!roomServiceReady()) return unavailable();
  const row = await readRoom<Stored>(id);
  if (!row) return reply({error:'ห้องนี้ปิดแล้ว หมดอายุ หรือไม่พบลิงก์'},404);
  const host = url.searchParams.get('viewer') !== '1' && isHost(req, id, row.secret);
  const data = normalized(JSON.stringify(row.data));
  if (url.searchParams.get('export') === 'csv') {
    if (!host) return reply({error:'สำหรับผู้ควบคุมเท่านั้น'},403);
    const history = roomView(data, true, true).history;
    const csv = '\uFEFF' + [['วันเวลา (ไทย)','ชื่อ / username (ชื่อเต็ม)','ชื่อที่แสดง','รางวัล','มูลค่า (บาท)'], ...history.map(h => [
      new Date(h.at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}), h.participant, maskName(h.participant), h.prize, h.value,
    ])].map(row => row.map(csvCell).join(',')).join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="enchanted-draw-results.csv"','Cache-Control':'no-store'}});
  }
  return reply(roomView(data, host, url.searchParams.get('history') === 'all'));
} catch { return reply({error:'เชื่อมต่อห้องไม่สำเร็จ กรุณาลองใหม่'},500); }}

export async function POST(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site' || !req.headers.get('content-type')?.startsWith('application/json')) {
    return reply({error:'คำขอไม่ถูกต้อง'},403);
  }
  if (!roomServiceReady()) return unavailable();
  try {
  const raw = await req.text();
  if (raw.length > 300000) return reply({error:'ข้อมูลมีขนาดใหญ่เกินไป'},413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return reply({error:'ข้อมูลไม่ถูกต้อง'},400);
  }
  if (body.op === 'unlock') {
    const key = creatorKey();
    if (key.length < 24 || typeof body.linkKey !== 'string' || !matches(body.linkKey, key)) {
      return reply({error:'ลิงก์แอดมินใช้ไม่ได้ กรุณาเปิดลิงก์ส่วนตัวล่าสุด'},403);
    }
    const response = reply({configured:true,canCreate:true});
    response.headers.set('Set-Cookie', cookie(creatorSession, creatorToken(key)));
    return response;
  }
  if (body.op === 'create') {
    if (!canCreate(req, creatorKey())) return reply({error:'เปิดลิงก์แอดมินส่วนตัวก่อนสร้างห้อง'},403);
    const id = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID();
    const data: ReadyRoom = {title:'Enchanted Kingdom Lucky Draw Live',prizeCatalogVersion:2,progressionVersion:1,prizes:[{id:'party-draw',name:'จับฉลาก',value:0,repeatable:true}],participants:[],selectedPrizeIndex:0,roundWaitSeconds:0,nextRoundAt:0,breakPending:false,drawMode:'scroll',spin:null};
    await createRoom(id, hash(token), data);
    const response = reply({id,...roomView(data,true)});
    response.headers.set('Set-Cookie', cookie(sessionName(id), token));
    return response;
  }
  if (!validId(body.id) || !tokenFrom(req, sessionName(body.id))) return reply({error:'ไม่มีสิทธิ์ควบคุม'},403);
  const row = await readRoom<Stored>(body.id);
  if (!row || !isHost(req, body.id, row.secret)) return reply({error:'ไม่มีสิทธิ์ควบคุมห้องนี้'},403);
  if (body.op === 'close') {
    if (!await closeRoom(body.id, row.revision)) return reply({error:'มีคำสั่งพร้อมกัน กรุณาลองใหม่'},409);
    const response = reply({closed:true});
    response.headers.set('Set-Cookie', sessionName(body.id) + '=; Path=/api/room; HttpOnly; SameSite=Strict; Max-Age=0');
    return response;
  }
  const data = normalized(JSON.stringify(row.data)), now = Date.now();
  if(data.spin&&now<data.spin.start+data.spin.duration)return reply({error:'รอให้วงล้อหยุดก่อน'},409);
  if(body.op==='ack'&&data.breakPending&&body.spinId!==data.spin?.id)return reply({error:'ผลรางวัลรอบนี้เปลี่ยนแล้ว กรุณารับทราบผลรอบล่าสุด'},409);
  if(data.breakPending&&body.op!=='ack')return reply({error:'กดรับทราบผลรางวัลเพื่อเริ่มเวลาเบรคก่อน'},409);
  if(body.op==='ack'&&!data.breakPending)return reply(roomView(data,true));
  const previousWinners = new Set(legacyAwards(data).map(award => nameKey(award.participant)));
  const eligible = (names: string[]) => {
    const seen = new Set(previousWinners);
    return names.filter(name => {
      const key = nameKey(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  data.participants = eligible(data.participants);
  if(body.op==='config'){
    const wait=body.roundWaitSeconds??data.roundWaitSeconds;
    if(typeof wait!=='number'||!Number.isInteger(wait)||wait<0||wait>3600)return reply({error:'ตั้งเวลาระหว่างรอบเป็นจำนวนเต็ม 0–3,600 วินาที'},400);
    data.roundWaitSeconds=wait;
    if (body.drawMode === 'scroll' || body.drawMode === 'wheel') data.drawMode = body.drawMode;
    const prizes=body.prizes;
    if(!Array.isArray(prizes)||prizes.length<1||prizes.length>30||prizes.some(p=>!p||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>60||typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<0||p.value>100000000||Math.abs(p.value*100-Math.round(p.value*100))>0.00001))return reply({error:'ใส่รางวัล 1–30 แบบ ชื่อไม่เกิน 60 ตัวอักษร และมูลค่า 0–100,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)'},400);
    if(!Array.isArray(body.participants)||body.participants.some(p=>typeof p!=='string'||!p.trim()||p.trim().length>80))return reply({error:'ใส่ชื่อผู้ร่วมลุ้นหนึ่งชื่อต่อบรรทัด ชื่อละไม่เกิน 80 ตัวอักษร'},400);
    if(body.participants.length>MAX_PARTICIPANTS)return reply({error:'ใส่รายชื่อได้ไม่เกิน 2,000 สิทธิ์'},400);
    data.participants = eligible((body.participants as string[]).map(name => name.trim()));
    data.selectedPrizeIndex=Math.min(data.selectedPrizeIndex,prizes.length-1);
    if(prizes.some(p=>p.image!==undefined&&(typeof p.image!=='string'||p.image.length>2000||!(/^(https:\/\/|\/prizes\/)/.test(p.image)))))return reply({error:'ลิงก์รูปต้องเป็น HTTPS'},400);
    const known=new Map(data.prizes.map(p=>[p.id,p]));
    const ids=new Set<string>();
    data.prizes=prizes.map(p=>{const existing=known.get(p.id);const id=existing?.id&&!ids.has(existing.id)?existing.id:crypto.randomUUID();ids.add(id);return {name:p.name.trim(),value:p.value,id,awarded:existing?.awarded||false,...(existing?.repeatable&&p.name.trim()===existing.name?{repeatable:true}:{}),...(p.image?{image:p.image}:{})}});
    data.selectedPrizeIndex=nextPrizeIndex(data.prizes);
    data.prizeCatalogVersion=2;
    data.title=typeof body.title==='string'&&body.title.trim()?body.title.trim().slice(0,80):'Lucky Live';
    data.spin=null; // Award records keep their original prize name and value.
  }else if(body.op==='ack'){
    const awardedIndex=data.prizes.findIndex(p=>p.id===data.spin?.prize.id);
    const selected = awardedIndex >= 0 ? awardedIndex : data.selectedPrizeIndex;
    if (selected >= 0 && !data.prizes[selected].repeatable) data.prizes[selected].awarded=true;
    data.selectedPrizeIndex=nextPrizeIndex(data.prizes);
    data.breakPending=false;
    data.nextRoundAt=now+data.roundWaitSeconds*1000;
    data.spin=null;
  }else if(body.op==='select'){
    if(typeof body.prizeIndex!=='number'||!Number.isInteger(body.prizeIndex)||body.prizeIndex<0||body.prizeIndex>=data.prizes.length||data.prizes[body.prizeIndex].awarded)return reply({error:'เลือกรางวัลที่ต้องการแจก'},400);
    data.selectedPrizeIndex=body.prizeIndex;
    data.spin=null;
  }else if(body.op==='spin'){
    if(data.selectedPrizeIndex<0||data.prizes[data.selectedPrizeIndex]?.awarded)return reply({error:'แจกรางวัลครบแล้ว'},409);
    if(now<data.nextRoundAt)return reply({error:`รอเคานต์ดาวน์อีก ${Math.ceil((data.nextRoundAt-now)/1000)} วินาทีก่อนเริ่มรอบถัดไป`},409);
    if(data.participants.length<1)return reply({error:'ไม่มีสิทธิ์ร่วมลุ้นเหลืออยู่ กรุณาเพิ่มรายชื่อก่อนหมุน'},400);
    const n=data.participants.length,max=Math.floor(4294967296/n)*n;
    let random;do{random=crypto.getRandomValues(new Uint32Array(1))[0]}while(random>=max);
    const winner=random%n,from=data.spin?.to||0,target=(360-(winner+.5)*360/n)%360;
    const prize=data.prizes[data.selectedPrizeIndex];
    const spin:Spin={id:crypto.randomUUID(),participant:data.participants[winner],start:now+2800,duration:7000,from,to:from+2160+((target-from%360+360)%360),winner,names:[...data.participants],prize:{...prize}};
    data.spin=spin;
    data.participants=data.participants.filter(name=>name!==spin.participant);
    data.nextRoundAt=0;
    data.breakPending=true;
    data.history = [...legacyAwards(data), {spinId:spin.id,participant:spin.participant,prize:prize.name,value:prize.value,at:spin.start+spin.duration}];
  }else return reply({error:'คำสั่งไม่ถูกต้อง'},400);
  if (!await saveRoom(body.id, row.revision, data)) {
    return reply({error:'มีคำสั่งพร้อมกัน กรุณาลองใหม่'},409);
  }
  return reply(roomView(data,true));
} catch { return reply({error:'บันทึกไม่สำเร็จ กรุณาลองใหม่'},500); }}

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import worker, { TemporaryRoom } from '../worker/rooms.ts';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !specifier.endsWith('.ts')) {
      return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  },
});

const { csvNames, nameKey } = await import('../app/lib/roster.ts');
const { GET, POST } = await import('../app/api/room/route.ts');
const { applyGiftAction, giftView } = await import('../app/api/room/gifts.ts');

const { giftSpinProgress, recipientStatus } = await import('../app/lib/gifts.ts');

const { portraits, portraitForSlot } = await import('../app/lib/avatars.ts');
test('twenty roster slots have distinct portrait crops and later slots fall back', () => {
  assert.equal(portraits.length,20);
  assert.equal(new Set(portraits.map(({source,x,y})=>[source,x,y].join(':'))).size,20);
  assert.equal(portraitForSlot(19),portraits[19]);
  assert.equal(portraitForSlot(20),undefined);
});

test('draw motion decelerates near the finish and reaches the exact final position', () => {
  const travel = (start,end) => giftSpinProgress(end)-giftSpinProgress(start);
  assert.equal(giftSpinProgress(-1),0);
  assert.equal(giftSpinProgress(1.1),1);
  assert(travel(.4,.5)>travel(.7,.8));
  assert(travel(.7,.8)>travel(.9,1));
  assert(travel(.9,1)>0);
});

test('recipient status uses revealed recipients rather than givers', () => {
  assert.deepEqual(recipientStatus(['หนึ่ง','สอง','สาม'],[{giver:'หนึ่ง',recipient:'สาม',at:1000}]),
    {received:['สาม'],waiting:['หนึ่ง','สอง']});
});

test('CSV accepts BOM, reordered headers, and quoted fields', () => {
  assert.deepEqual(csvNames('\ufeffignored,username\r\n1,"name, with ""quotes"""\r\n2,@ส้ม'), ['name, with "quotes"', '@ส้ม']);
  assert.deepEqual(csvNames('@Mint\n@Fah'), ['@Mint', '@Fah']);
  assert.throws(() => csvNames('name\n"unfinished'));
  assert.equal(nameKey(' ＠Ｍｉｎｔ '), nameKey('mint'));
});

test('the recipient takes the next turn and the chain ends at the first giver', () => {
  const state = {kind:'gift',title:'Gift exchange',participants:['หนึ่ง','สอง','สาม','สิบห้า'],
    drawMode:'wheel',assignments:[],pairs:[{giver:'หนึ่ง',recipient:'สิบห้า',at:1000}],spin:null};
  assert.equal(giftView(state,false,1001).nextGiver,'สิบห้า');
  for (let round=1; round<4; round++) {
    const previous = state.pairs.at(-1);
    assert.equal(applyGiftAction(state,{op:'spin',round},previous.at+1),undefined);
    assert.equal(state.spin.giver,previous.recipient);
    assert(!state.spin.names.includes(state.spin.giver));
    if (round<3) assert(!state.spin.names.includes('หนึ่ง'));
  }
  assert.equal(state.pairs.at(-1).recipient,'หนึ่ง');
  assert.equal(giftView(state,false,state.pairs.at(-1).at).nextGiver,null);
});

test('temporary Worker rooms share a single draw across 20 viewers and clear on close', async t => {
  let clock = 1800000000000;
  t.mock.method(Date, 'now', () => clock);
  process.env.ROOM_SERVICE_URL = 'https://worker.invalid';
  process.env.ROOM_SERVICE_KEY = 'test-server-only-key';
  const linkKey = 'test-private-admin-access-key';
  process.env.ADMIN_ACCESS_KEY = 'https://event.invalid/#admin=' + linkKey;
  const rooms = new Map();
  const env = {
    ROOM_SERVICE_KEY:process.env.ROOM_SERVICE_KEY,
    ROOMS: {getByName(id) {
      if (!rooms.has(id)) rooms.set(id, new TemporaryRoom());
      return rooms.get(id);
    }},
  };
  t.mock.method(globalThis, 'fetch', (input, init) => worker.fetch(new Request(input,init),env));

  const base = 'https://event.invalid/api/room';
  const send = (body, cookie = '') => POST(new Request(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  }));
  assert.equal((await send({op:'create'})).status,403);
  assert.equal((await send({op:'unlock',linkKey:'incorrect'})).status,403);
  const unlocked = await send({op:'unlock',linkKey});
  assert.equal(unlocked.status,200);
  const creator = unlocked.headers.get('set-cookie').split(';')[0];
  assert.match(unlocked.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const created = await send({op:'create'}, creator);
  assert.equal(created.status, 200);
  assert.match(created.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = created.headers.get('set-cookie').split(';')[0];
  const createdRoom = await created.json();
  assert.equal(createdRoom.kind,'gift');
  const {id} = createdRoom;
  const read = (suffix = '', headers = {}) => GET(new Request(base + '?id=' + id + suffix, { headers }));
  const participants = ['มินต์','ฟ้า','นุ่น','Mint','ｍｉｎｔ'];
  assert.equal((await send({op:'config',id,participants})).status,403);
  const configured = await send({op:'config',id,participants,drawMode:'wheel'},cookie);
  assert.equal(configured.status,200);
  assert.deepEqual((await configured.json()).participants,['มินต์','ฟ้า','นุ่น','Mint']);
  assert.equal((await read('&export=csv')).status,403);
  const attempted=await Promise.all([send({op:'spin',id,round:0},cookie),send({op:'spin',id,round:0},cookie)]);
  assert.deepEqual(attempted.map(res=>res.status).sort(),[200,409]);
  let {spin}=await attempted.find(res=>res.ok).json();
  const viewers=await Promise.all(Array.from({length:20},async()=>(await read('&viewer=1')).json()));
  for(const viewer of viewers){
    assert.equal(viewer.host,false);
    assert.equal(viewer.drawMode,'wheel');
    assert.equal(viewer.spin.id,spin.id);
    assert.equal(viewer.spin.start,spin.start);
    assert.equal(viewer.pairs.length,0);
    assert(!('assignments' in viewer));
    assert(!viewer.spin.names.includes(spin.giver));
  }
  clock=spin.start+spin.duration+1;
  assert.equal((await (await read('&viewer=1')).json()).pairs.length,1);
  assert.equal((await send({op:'config',id,participants},cookie)).status,409);
  for(let round=1;round<4;round++){
    assert.equal((await send({op:'spin',id,round:round-1},cookie)).status,409);
    const draw=await send({op:'spin',id,round},cookie);
    assert.equal(draw.status,200);
    ({spin}=await draw.json());
    clock=spin.start+spin.duration+1;
  }
  const final=await (await read('&viewer=1')).json();
  assert.equal(final.nextGiver,null);
  assert.equal(final.pairs.length,4);
  assert.equal(new Set(final.pairs.map(pair=>pair.recipient)).size,4);
  assert(final.pairs.every(pair=>pair.giver!==pair.recipient));
  assert(final.pairs.every((pair,index)=>pair.recipient===final.pairs[(index+1)%final.pairs.length].giver));
  assert.match(await (await read('&export=csv',{Cookie:cookie})).text(), /"ผู้ให้","ผู้รับ"/);
  assert.equal((await worker.fetch(new Request('https://worker.invalid/rooms/'+id),env)).status,403);
  assert.equal((await send({op:'close',id})).status,403);
  assert.equal((await send({op:'close',id},cookie)).status,200);
  assert.equal((await read('&viewer=1')).status,404);

  const another=await send({op:'create'},creator);
  const secondCookie=another.headers.get('set-cookie').split(';')[0];
  const second=await another.json();
  const other={id:second.id};
  assert.equal((await send({op:'spin',...other,round:0},cookie)).status,403);
  assert.equal((await send({op:'spin',...other,round:0},secondCookie)).status,400);
  assert.equal((await send({op:'config',...other,participants:['เอ','บี']},secondCookie)).status,200);
  const first=(await (await send({op:'spin',...other,round:0},secondCookie)).json()).spin;
  assert.equal(first.names[first.winner],'บี');
  clock=first.start+first.duration+1;
  const secondSpin=(await (await send({op:'spin',...other,round:1},secondCookie)).json()).spin;
  assert.equal(secondSpin.names[secondSpin.winner],'เอ');
  clock+=8*60*60*1000;
  assert.equal((await GET(new Request(base+'?id='+second.id+'&viewer=1'))).status,404);
});

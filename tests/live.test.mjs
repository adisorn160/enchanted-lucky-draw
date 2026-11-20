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

test('CSV accepts BOM, reordered headers, and quoted fields', () => {
  assert.deepEqual(csvNames('\ufeffignored,username\r\n1,"name, with ""quotes"""\r\n2,@ส้ม'), ['name, with "quotes"', '@ส้ม']);
  assert.deepEqual(csvNames('@Mint\n@Fah'), ['@Mint', '@Fah']);
  assert.throws(() => csvNames('name\n"unfinished'));
  assert.equal(nameKey(' ＠Ｍｉｎｔ '), nameKey('mint'));
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
  const {id} = await created.json();
  const read = (suffix = '', headers = {}) => GET(new Request(base + '?id=' + id + suffix, { headers }));
  const participants = ['@Mint-Guest', 'ｍｉｎｔ-guest', '@Fah-Guest', '@Nueng-Guest'];
  const prizes = [{name:'Silver Key', value:100}, {name:'Gold Key', value:200}];
  assert.equal((await send({op:'config',id,participants,prizes})).status, 403);
  const configured = await send({op:'config',id,participants,prizes,roundWaitSeconds:0,drawMode:'wheel'}, cookie);
  assert.equal(configured.status, 200);
  assert.deepEqual((await configured.json()).participants, ['@Mint-Guest','@Fah-Guest','@Nueng-Guest']);
  assert.equal((await read('&export=csv')).status, 403);
  assert.equal((await read('&viewer=1', {Cookie:cookie})).status, 200);
  const responses = await Promise.all([send({op:'spin',id},cookie),send({op:'spin',id},cookie)]);
  assert.deepEqual(responses.map(res => res.status).sort(), [200,409]);
  const {spin} = await responses.find(res => res.ok).json();
  const viewers = await Promise.all(Array.from({length:20}, async () => (await read('&viewer=1')).json()));
  for (const viewer of viewers) {
    assert.equal(viewer.host, false);
    assert.equal(viewer.drawMode, 'wheel');
    assert.equal(viewer.spin.id, spin.id);
    assert.equal(viewer.spin.start, spin.start);
    assert.equal(viewer.spin.winner, spin.winner);
    assert.equal(viewer.history.length, 0);
    assert(!viewer.spin.names.includes(spin.participant));
  }
  clock = spin.start + spin.duration + 1;
  assert.equal((await (await read('&viewer=1')).json()).history.length, 1);
  assert.match(await (await read('&export=csv', {Cookie:cookie})).text(), new RegExp(spin.participant));
  assert.equal((await send({op:'ack',id,spinId:spin.id},cookie)).status, 200);
  const reimported = await send({op:'config',id,participants,prizes,roundWaitSeconds:0}, cookie);
  assert.ok(reimported.ok);
  assert(!(await reimported.json()).participants.some(name => nameKey(name) === nameKey(spin.participant)));
  assert.equal((await worker.fetch(new Request('https://worker.invalid/rooms/' + id), env)).status, 403);
  assert.equal((await send({op:'close',id})).status, 403);
  assert.equal((await send({op:'close',id},cookie)).status, 200);
  assert.equal((await read('&viewer=1')).status, 404);

  const another = await send({op:'create'}, creator);
  const second = await another.json();
  assert.notEqual(second.id, id);
  assert.equal((await send({op:'spin',id:second.id},cookie)).status,403);
  assert.equal((await send({op:'close',id:second.id},creator)).status,403);
  assert.equal(second.prizes[0].repeatable,true);
  const readSecond = () => GET(new Request(base + '?id=' + second.id + '&viewer=1'));
  assert.equal((await readSecond()).status, 200);
  clock += 8*60*60*1000;
  assert.equal((await readSecond()).status, 404);
});

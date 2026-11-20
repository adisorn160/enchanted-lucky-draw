import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

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

test('SQL migration and HTTP handlers enforce admin access and sync one draw to 20 viewers', async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime;');
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));

  // Use a real Postgres engine behind a local adapter for the three PostgREST operations.
  const key = 'local-test-key-with-24-characters';
  t.mock.method(Date, 'now', () => clock);
  let clock = 1800000000000;
  process.env.SUPABASE_URL = 'https://database.invalid';
  process.env.SUPABASE_SECRET_KEY = 'test-server-only-key';
  process.env.ADMIN_ACCESS_KEY = key;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/rest/v1/enchanted_rooms');
    assert.equal(init.headers.apikey, process.env.SUPABASE_SECRET_KEY);
    const id = url.searchParams.get('id')?.slice(3);
    const revision = url.searchParams.get('revision')?.slice(3);
    let result;
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      result = await db.query('insert into enchanted_rooms(id,secret,data) values ($1,$2,$3) returning *',
        [body.id, body.secret, JSON.stringify(body.data)]);
    } else if (init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      result = await db.query('update enchanted_rooms set revision=$1,data=$2 where id=$3 and revision=$4 returning *',
        [body.revision, JSON.stringify(body.data), id, revision]);
    } else {
      result = await db.query('select * from enchanted_rooms where id=$1', [id]);
    }
    return Response.json(result.rows);
  });

  const base = 'https://event.invalid/api/room';
  const send = (body, cookie = '') => POST(new Request(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  }));
  assert.equal((await send({op:'create',accessKey:'wrong'})).status, 403);
  const created = await send({op:'create',accessKey:key});
  assert.equal(created.status, 200);
  assert.match(created.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = created.headers.get('set-cookie').split(';')[0];
  const {id} = await created.json();
  const read = (suffix = '', headers = {}) => GET(new Request(base + '?id=' + id + suffix, { headers }));
  const participants = ['@Mint', 'ｍｉｎｔ', '@Fah', '@Nueng'];
  const prizes = [{name:'Silver Key', value:100}, {name:'Gold Key', value:200}];
  assert.equal((await send({op:'config',id,participants,prizes})).status, 403);
  const configured = await send({op:'config',id,participants,prizes,roundWaitSeconds:0}, cookie);
  assert.equal(configured.status, 200);
  assert.deepEqual((await configured.json()).participants, ['@Mint','@Fah','@Nueng']);
  assert.equal((await read('&export=csv')).status, 403);
  assert.equal((await read('&viewer=1', {Cookie:cookie})).status, 200);
  const responses = await Promise.all([send({op:'spin',id},cookie),send({op:'spin',id},cookie)]);
  assert.deepEqual(responses.map(res => res.status).sort(), [200,409]);
  const {spin} = await responses.find(res => res.ok).json();
  const viewers = await Promise.all(Array.from({length:20}, async () => (await read('&viewer=1')).json()));
  for (const viewer of viewers) {
    assert.equal(viewer.host, false);
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
  const signal = createHash('sha256').update(id).digest('hex');
  const updated = await db.query('select id,revision from enchanted_room_updates');
  assert.deepEqual(updated.rows, [{id:signal,revision:4}]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from enchanted_rooms'), /permission denied/);
  assert.equal((await db.query('select * from enchanted_room_updates')).rows.length, 1);
  await assert.rejects(db.query('update enchanted_room_updates set revision=99'), /permission denied/);
});

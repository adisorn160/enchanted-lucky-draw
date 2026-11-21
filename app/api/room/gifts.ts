import { randomInt } from 'node:crypto';
import { nameKey } from '../../lib/roster';
import { MAX_PARTICIPANTS } from '../../lib/wheel';
import type { GiftRoom, GiftSpin } from '../../lib/gifts';

export type GiftState = Pick<GiftRoom, 'kind' | 'title' | 'participants' | 'drawMode' | 'spin'> & {
  assignments: string[];
  pairs: GiftRoom['pairs'];
};

function nextGiver(room: GiftState) {
  const index = room.pairs.length;
  if (index >= room.participants.length) return null;
  // Let a room started under the previous rules finish its existing assignments.
  if (room.assignments.length) return room.participants[index];
  return room.pairs.at(-1)?.recipient ?? room.participants[0] ?? null;
}

export function giftView(room: GiftState, host: boolean, now = Date.now()): GiftRoom {
  const {kind,title,participants,drawMode,spin} = room;
  return {
    kind,title,participants,drawMode,spin,host,now,
    pairs: room.pairs.filter(pair => pair.at <= now),
    nextGiver: nextGiver(room),
  };
}

export function applyGiftAction(room: GiftState, body: Record<string, unknown>, now: number) {
  if (room.spin && now < room.spin.start + room.spin.duration) {
    return {status:409,error:'รอให้การสุ่มรอบนี้เสร็จก่อน'};
  }
  if (body.op === 'config') {
    if (room.pairs.length) return {status:409,error:'เริ่มจับคู่แล้ว หากต้องการเปลี่ยนรายชื่อให้สร้างห้องใหม่'};
    const names = body.participants;
    if (!Array.isArray(names) || names.length > MAX_PARTICIPANTS || names.some(name =>
      typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\r\n]/.test(name)
    )) return {status:400,error:'ใส่รายชื่อหนึ่งชื่อต่อบรรทัด สูงสุด 2,000 คน'};
    const unique = new Map<string,string>();
    for (const name of names) {
      const key = nameKey(name);
      if (key && !unique.has(key)) unique.set(key,name.trim());
    }
    room.participants = [...unique.values()];
    if (typeof body.title === 'string' && body.title.trim()) room.title = body.title.trim().slice(0,80);
    if (body.drawMode === 'wheel' || body.drawMode === 'scroll') room.drawMode = body.drawMode;
    return;
  }
  if (body.op !== 'spin') return {status:400,error:'คำสั่งไม่ถูกต้อง'};
  if (room.participants.length < 2) return {status:400,error:'ต้องมีอย่างน้อย 2 คน'};
  const index = room.pairs.length;
  const giver = nextGiver(room);
  if (!giver) return {status:409,error:'จับคู่ครบทุกคนแล้ว'};
  if (body.round !== index) return {status:409,error:'รอบจับคู่เปลี่ยนแล้ว กรุณาลองใหม่'};

  const used = new Set(room.pairs.map(pair => pair.recipient));
  // Keep the first giver available for the final round, so the chain cannot
  // close while there are still people waiting to give a gift.
  const starter = room.participants[0];
  const lastRound = index === room.participants.length - 1;
  const names = room.participants.filter(name =>
    name !== giver && !used.has(name) && (room.assignments.length > 0 || lastRound || name !== starter)
  );
  const winner = room.assignments.length ? names.indexOf(room.assignments[index]) : randomInt(names.length);
  const recipient = names[winner];
  const spin: GiftSpin = {
    id:crypto.randomUUID(), giver, names, winner,
    start:now+2800, duration:7000,
  };
  room.spin = spin;
  room.pairs.push({giver,recipient,at:spin.start+spin.duration});
}

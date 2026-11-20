import { randomInt } from 'node:crypto';
import { nameKey } from '../../lib/roster';
import { MAX_PARTICIPANTS } from '../../lib/wheel';
import type { GiftRoom, GiftSpin } from '../../lib/gifts';

export type GiftState = Pick<GiftRoom, 'kind' | 'title' | 'participants' | 'drawMode' | 'spin'> & {
  assignments: string[];
  pairs: GiftRoom['pairs'];
};

export function giftView(room: GiftState, host: boolean, now = Date.now()): GiftRoom {
  const {kind,title,participants,drawMode,spin} = room;
  return {
    kind,title,participants,drawMode,spin,host,now,
    pairs: room.pairs.filter(pair => pair.at <= now),
    nextGiver: participants[room.pairs.length] ?? null,
  };
}

function assignRecipients(names: string[]) {
  // Reject permutations with a self-match. Each valid permutation is equally likely.
  for (;;) {
    const recipients = [...names];
    for (let i = recipients.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [recipients[i], recipients[j]] = [recipients[j], recipients[i]];
    }
    if (recipients.every((name, i) => name !== names[i])) return recipients;
  }
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
  const giver = room.participants[index];
  if (!giver) return {status:409,error:'จับคู่ครบทุกคนแล้ว'};
  if (body.round !== index) return {status:409,error:'รอบจับคู่เปลี่ยนแล้ว กรุณาลองใหม่'};

  if (!room.assignments.length) room.assignments = assignRecipients(room.participants);
  const recipient = room.assignments[index];
  const used = new Set(room.pairs.map(pair => pair.recipient));
  const names = room.participants.filter(name => name !== giver && !used.has(name));
  const spin: GiftSpin = {
    id:crypto.randomUUID(), giver, names, winner:names.indexOf(recipient),
    start:now+2800, duration:7000,
  };
  room.spin = spin;
  room.pairs.push({giver,recipient,at:spin.start+spin.duration});
}

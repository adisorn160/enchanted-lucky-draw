export type GiftPair = { giver: string; recipient: string; at: number };
export type GiftSpin = { id: string; giver: string; names: string[]; winner: number; start: number; duration: number };
export type GiftRoom = {
  kind: 'gift';
  title: string;
  host: boolean;
  participants: string[];
  drawMode: 'wheel' | 'scroll';
  nextGiver: string | null;
  spin: GiftSpin | null;
  pairs: GiftPair[];
  now: number;
};

// Hold a steady initial speed, then ease to zero without jumping at the transition.
export const GIFT_SLOWDOWN_START = .52;

export function giftSpinProgress(progress: number) {
  const time = Math.max(0,Math.min(1,progress));
  if (time === 1) return 1;
  const finalSpan = 1-GIFT_SLOWDOWN_START;
  const distance = GIFT_SLOWDOWN_START+finalSpan/3;
  if (time <= GIFT_SLOWDOWN_START) return time/distance;
  const tail = (time-GIFT_SLOWDOWN_START)/finalSpan;
  return (GIFT_SLOWDOWN_START+finalSpan*(tail-tail*tail+tail*tail*tail/3))/distance;
}

export function recipientStatus(participants: string[], pairs: GiftPair[]) {
  const picked = new Set(pairs.map(pair=>pair.recipient));
  return {
    received:participants.filter(name=>picked.has(name)),
    waiting:participants.filter(name=>!picked.has(name)),
  };
}

export const GIFT_COUNTDOWN_SECONDS = 3;
export const GIFT_START_LEAD_MS = GIFT_COUNTDOWN_SECONDS*1000+1800;

export function giftCountdown(start: number, now: number) {
  const remaining=start-now;
  if (remaining<=0 || remaining>GIFT_COUNTDOWN_SECONDS*1000) return null;
  return Math.ceil(remaining/1000);
}

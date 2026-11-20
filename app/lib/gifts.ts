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

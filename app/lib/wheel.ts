export type Prize = { name: string; value: number; image?: string; id?: string; awarded?: boolean; repeatable?: boolean };
export type Spin = { id: string; participant: string; start: number; duration: number; from: number; to: number; winner: number; names: string[]; prize: Prize };
export type Award = { spinId: string; participant: string; prize: string; value: number; at: number };
export type Room = { title: string; prizes: Prize[]; participants: string[]; host: boolean; drawMode: 'scroll' | 'wheel'; selectedPrizeIndex: number; roundWaitSeconds: number; nextRoundAt: number; breakPending: boolean; spin: Spin | null; history: Award[]; totalCount: number; totalValue: number; now: number };
export const MAX_PARTICIPANTS = 2000;
export const maskName = (name: string) => {
  const chars = Array.from(name);
  return chars.length > 7 ? chars.slice(0, -3).join('') + 'xxx' : name;
};
export const examplePrizes: Prize[] = [
  {name:'Samsung Galaxy S26',value:29900},
  {name:'Samsung Galaxy Watch 8 40mm',value:11900},
  {name:'Samsung Galaxy Buds 3 FE',value:4290},
  ...Array.from({length:2},()=>({name:'Trip.com Voucher',value:1000})),
  ...Array.from({length:5},()=>({name:'LINE Gift',value:500}))
];
export const exampleParticipants = ['@mint', '@bank', '@ploy', '@james', '@nam', '@ton', '@fah', '@beam'];
export const money = (value: number) => new Intl.NumberFormat('th-TH',{maximumFractionDigits:2}).format(value);

export const nextPrizeIndex = (prizes: Prize[]) => prizes.reduce((best,p,i)=>p.awarded?best:best<0||p.value<prizes[best].value||(p.value===prizes[best].value&&i>best)?i:best,-1);

// Unfolded travel always slows down; reflecting it keeps the real table in range.
export function drawPosition(progress:number,count:number,winner:number){
 if(count<2)return 0;
 const p=Math.max(0,Math.min(1,progress));if(p===1)return winner;
 const range=count-1,period=range*2,cycles=Math.max(3,Math.ceil(90/period));
 const distance=cycles*period+winner,travel=distance*(1-Math.pow(1-p,3)),phase=travel%period;
 return phase<=range?phase:period-phase;
}

type Portrait = { source: string; x: number; y: number; size: number; width: number; height: number };

const princess = (x:number,y:number,size=74):Portrait =>
  ({source:'/art/storybook-princesses.webp',x,y,size,width:387,height:516});
const cast = (x:number,y:number,size=45):Portrait =>
  ({source:'/art/storybook-characters.webp',x,y,size,width:650,height:341});

// Coordinates refer to separate faces within the two supplied contact sheets.
export const portraits: readonly Portrait[] = [
  princess(49,51), princess(145,60), princess(240,50), princess(337,58),
  princess(52,173), princess(143,181), princess(241,180), princess(335,179),
  princess(47,301), princess(145,309), princess(290,314,80), princess(46,441,84),
  princess(127,448,41), princess(164,424,43), princess(279,444,80),
  cast(149,270,40), cast(245,33,54), cast(491,37,44), cast(552,207,42), cast(576,23,43),
];

export function portraitForSlot(slot: number | undefined) {
  return slot === undefined ? undefined : portraits[slot];
}

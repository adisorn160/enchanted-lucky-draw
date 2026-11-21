'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { GiftSpin } from './gifts';

type Sound = [AudioBuffer | null, AudioBuffer | null];
type AudioSession = { context: AudioContext; sounds: Promise<Sound> };

async function loadSound(context: AudioContext, filename: string) {
  try {
    const response = await fetch('/audio/'+filename);
    if (!response.ok) return null;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch { return null; }
}

export function useDrawSound(spin: GiftSpin | null | undefined, clockOffset: RefObject<number>) {
  const session = useRef<AudioSession | null>(null);
  const [ready,setReady] = useState(0);

  function unlock() {
    try {
      if (!session.current) {
        const context = new AudioContext();
        session.current = {
          context,
          sounds:Promise.all([
            loadSound(context,'wheel-mechanical-real.mp3'),
            loadSound(context,'crowd-cheer-real.mp3'),
          ]),
        };
      }
      const {context} = session.current;
      if (context.state === 'running') {
        if (!ready) setReady(1);
      } else {
        void context.resume().then(()=>setReady(value=>value+1)).catch(()=>{});
      }
    } catch {}
  }

  const start = spin?.start;
  const duration = spin?.duration;
  const spinId = spin?.id;
  useEffect(()=>{
    if (!ready || start === undefined || duration === undefined || !session.current) return;
    const {context,sounds} = session.current;
    const sources:AudioBufferSourceNode[] = [];
    let cancelled = false;
    void sounds.then(([wheel,cheer])=>{
      if (cancelled || context.state !== 'running') return;

      const now = Date.now()+clockOffset.current;
      const finish = start+duration;
      function schedule(buffer:AudioBuffer, at:number, gain:number, rate=1) {
        const source=context.createBufferSource();
        const level=context.createGain();
        source.buffer=buffer;
        source.playbackRate.value=rate;
        level.gain.value=gain;
        source.connect(level).connect(context.destination);
        source.onended=()=>level.disconnect();
        sources.push(source);
        const elapsed=Math.max(0,(now-at)/1000);
        source.start(context.currentTime+Math.max(0,(at-now)/1000),elapsed*rate);
      }

      if (wheel && now<finish) schedule(wheel,start,.54,wheel.duration/(duration/1000));
      if (cheer && now<finish+300) schedule(cheer,finish,.42);
    });
    return ()=>{
      cancelled=true;
      for(const source of sources) source.stop();
    };
  },[ready,spinId,start,duration,clockOffset]);

  useEffect(()=>()=>{
    if (session.current) void session.current.context.close().catch(()=>{});
    session.current=null;
  },[]);

  return {unlock,enabled:ready>0};
}

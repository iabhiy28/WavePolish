import { describe, expect, it } from 'vitest';
import { fft, gain, loudness, processAudio, stats } from '../src/dsp';
import { effect } from '../src/model';
import { wave } from '../src/wav';
const rate=48000;
const sine=(hz:number,amp=1,n=rate)=>Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/rate));
const trim=(x:Float32Array)=>x.subarray(4800);
describe('AudioPure DSP',()=>{
 it('round trips a real FFT',()=>{
   const x=Float64Array.from({length:256},(_,i)=>Math.sin(i*0.5)),r=x.slice(),q=new Float64Array(x.length);
   fft(r,q);fft(r,q,true);
   expect(Math.max(...r.map((a,i)=>Math.abs(a-x[i])))).toBeLessThan(1e-10);
 });
 it.each([50,60])('suppresses %i Hz hum and preserves the source and channel layout',hz=>{
   const unit=effect('hum');unit.values.frequency=hz;
   const x=sine(hz,0.3), y=sine(400,0.2),original=x.slice();
   const out=processAudio([x,y],rate,[unit],null);
   expect(out).toHaveLength(2);expect(out[0]).toHaveLength(rate);expect(x).toEqual(original);
   expect(stats([trim(out[0])]).rms).toBeLessThan(stats([trim(x)]).rms*0.25);
   expect(stats([trim(out[1])]).rms).toBeCloseTo(stats([trim(y)]).rms,3);
 });
 it('attenuates rumble and hiss with practical cutoffs',()=>{
   const x=sine(30),y=sine(16000),high=effect('high'),low=effect('low');low.values.cutoff=5000;
   expect(stats([trim(processAudio([x],rate,[high],null)[0])]).rms).toBeLessThan(0.15);
   expect(stats([trim(processAudio([y],rate,[low],null)[0])]).rms).toBeLessThan(0.1);
 });
 it('improves reference SNR for a voiced signal in stationary white and pink noise',()=>{
   let seed=15,pink=0;
   const clean=Float32Array.from({length:rate},(_,i)=>i<rate/4?0:0.22*(0.7+0.3*Math.sin(i*0.001))*Math.sin(i*2*Math.PI*440/rate)+0.06*Math.sin(i*2*Math.PI*880/rate));
   const noisy=clean.map(value=>{seed=(1664525*seed+1013904223)>>>0;const white=seed/2**31-1;pink=0.93*pink+0.07*white;return value+0.04*white+0.1*pink;});
   const noise=effect('noise');noise.values.temporal=0.15;
   const actual=processAudio([noisy],rate,[noise],[0,0.2])[0];
   const error=(x:Float32Array)=>stats([x.subarray(rate/4+1024).map((v,i)=>v-clean[rate/4+1024+i])]).rms;
   expect(error(actual)).toBeLessThan(error(noisy)*0.85);
 });
 it('gates steady quiet noise and repairs an isolated impulse',()=>{
   const gate=effect('gate'),click=effect('click'),quiet=sine(400,0.001),x=sine(180,0.1);
   x[10800]+=0.9;
   expect(stats([processAudio([quiet],rate,[gate],null)[0].subarray(rate/2)]).rms).toBeLessThan(0.00015);
   const repaired=processAudio([x],rate,[click],null)[0];
   expect(Math.abs(repaired[10800]-x[10799])).toBeLessThan(0.01);
 });
 it('limits excessive peaks and targets gated loudness',()=>{
   const x=sine(1000,1.8), limiter=effect('limit'),norm=effect('norm');
   expect(stats(processAudio([x,x],rate,[limiter],null)).peak).toBeLessThanOrEqual(gain(-1)+1e-6);
   norm.values.mode=2;norm.values.target=-20;
   expect(loudness(processAudio([x],rate,[norm],null),rate)).toBeCloseTo(-20,3);
 });
 it.each([16,24])('writes valid %i-bit PCM WAV headers and signed endpoints',depth=>{
   const bytes=wave([Float32Array.of(-1,0,1)],rate,depth),view=new DataView(bytes);
   expect(new TextDecoder().decode(bytes.slice(8,12))).toBe('WAVE');
   expect(view.getUint16(34,true)).toBe(depth);expect(view.getUint32(24,true)).toBe(rate);
   expect(view.getUint32(40,true)).toBe(3*depth/8);
   expect(view.getUint32(4,true)).toBe(bytes.byteLength-8);
   expect(view.getInt16(depth===16?44:45,true)).toBe(-32768);
 });
});


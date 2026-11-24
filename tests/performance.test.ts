import { expect, it } from 'vitest';
import { processAudio } from '../src/dsp';
import { defaultRack } from '../src/model';

it('processes a 12-second stereo fixture within a broad time and buffer budget',()=>{
 const rate=48000;
 const left=Float32Array.from({length:12*rate},(_,i)=>0.1*Math.sin(2*Math.PI*220*i/rate)+0.01*Math.sin(2*Math.PI*60*i/rate));
 const right=left.slice();
 const before=process.memoryUsage();
 const started=performance.now();
 const samples=processAudio([left,right],rate,defaultRack(),[0,0.25]);
 const ms=performance.now()-started;
 const retainedArrayBuffers=Math.max(0,process.memoryUsage().arrayBuffers-before.arrayBuffers);
 expect(samples[0]).toHaveLength(left.length);
 expect(ms).toBeLessThan(8000);
 expect(retainedArrayBuffers).toBeLessThan(64*1024**2);
 console.info('12-second synthetic stereo, processor only', {
   elapsedMs:Math.round(ms), retainedArrayBufferMiB:Number((retainedArrayBuffers/1024**2).toFixed(2)),
 });
},10000);

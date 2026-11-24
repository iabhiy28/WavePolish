import { processAudio, stats, type Region } from './dsp';
import type { Effect } from './model';
import { wave } from './wav';
type Job={channels:Float32Array[];rate:number;rack:Effect[];profile:Region|null; output?:{depth:number}};
self.onmessage=({data}:MessageEvent<Job>)=>{
  try {
    if(data.output){const bytes=wave(data.channels,data.rate,data.output.depth);self.postMessage({bytes}, {transfer:[bytes]});return;}
    const compressorTrace=new Float32Array(Math.ceil(data.channels[0].length*20/data.rate));
    const channels=processAudio(data.channels,data.rate,data.rack,data.profile,progress=>self.postMessage({progress}),compressorTrace);
    self.postMessage({channels,stats:stats(channels),compressorTrace},{transfer:[...channels.map(channel=>channel.buffer),compressorTrace.buffer]});
  }catch(error){self.postMessage({error:String(error)});}
};


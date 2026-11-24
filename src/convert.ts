import type { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';

export async function convert(input:Uint8Array,extension:string,output:string,bitrate:number,signal:AbortSignal,onProgress:(value:number)=>void){
  const {FFmpeg}=await import('@ffmpeg/ffmpeg');
  signal.throwIfAborted();
  const ffmpeg:FFmpeg=new FFmpeg();
  let wasmURL:string|undefined;
  const cancel=()=>ffmpeg.terminate();
  signal.addEventListener('abort',cancel,{once:true});
  const source='source.'+extension.replace(/[^a-z0-9]/gi,'');
  const target='output.'+output;
  try{
    ffmpeg.on('progress',({progress})=>onProgress(Math.min(1,Math.max(0,progress))));
    const path=new URL(import.meta.env.BASE_URL+'codec/ffmpeg-core.gzip.bin',document.baseURI);
    const response=await fetch(path,{signal});
    if(!response.ok||!response.body)throw new Error('The local codec asset could not be loaded.');
    const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
    const binary=await new Response(stream).arrayBuffer();
    signal.throwIfAborted();
    wasmURL=URL.createObjectURL(new Blob([binary],{type:'application/wasm'}));
    await ffmpeg.load({coreURL,wasmURL});
    await ffmpeg.writeFile(source,input);
    const codec:Record<string,string[]>={mp3:['-c:a','libmp3lame','-b:a',bitrate+'k'],ogg:['-c:a','libvorbis'],flac:['-c:a','flac'],wav:['-c:a','pcm_s24le']};
    const status=await ffmpeg.exec(['-i',source,'-map','0:a:0',...(output==='wav'?['-t','1801']:[]),...codec[output],target]);
    if(status!==0)throw new Error('This audio format could not be converted.');
    const data=await ffmpeg.readFile(target);
    if(typeof data==='string')throw new Error('Audio conversion returned an invalid file.');
    return new Uint8Array(data).buffer;
  }finally{signal.removeEventListener('abort',cancel);ffmpeg.terminate();if(wasmURL)URL.revokeObjectURL(wasmURL);}
}




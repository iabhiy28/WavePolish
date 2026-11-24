import { Fragment, useEffect, useRef, useState } from 'react';
import { AudioLines, Download, FolderOpen, Mic, Play, Pause, ShieldCheck, SlidersHorizontal, Sun, Undo2, Redo2 } from 'lucide-react';
import { Switch } from './components/ui/switch';
import { db, stats, type Region } from './dsp';
import { defaultRack, effect, labels, presets, settings, type Effect, type Kind } from './model';
import { EqGraph, Spectrogram, Waveform } from './Visuals';
import { project } from './storage';
import './style.css';

type Clip={channels:Float32Array[];rate:number;name:string;size:number};
type Snapshot={clip:Clip|null;rack:Effect[];profile:Region|null};
type LocalProject={state:Snapshot;original:Clip;selection:Region|null};
type Result={source:Snapshot;channels:Float32Array[];compressorTrace:Float32Array};
const copy=(buffer:AudioBuffer)=>Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice());
const time=(n:number)=>n.toFixed(2)+' s';
const limit=192*1024**2;
const toggle=(name:string,checked:boolean,onCheckedChange:(value:boolean)=>void)=><label className="switch-label">{name}<Switch aria-label={name} {...{checked,onCheckedChange}}/></label>;
function job<T>(payload:object,signal:AbortSignal,onProgress:(progress:number)=>void){
 return new Promise<T>((resolve,reject)=>{
   signal.throwIfAborted();
   const worker=new Worker(new URL('./audio.worker.ts',import.meta.url),{type:'module'});
   function finish(){worker.terminate();signal.removeEventListener('abort',cancel);}
   function cancel(){finish();reject(new DOMException('Cancelled','AbortError'));}
   signal.addEventListener('abort',cancel,{once:true});
   worker.onerror=e=>{finish();reject(new Error(e.message||'Audio worker failed'));};
   worker.onmessage=({data})=>{if(typeof data.progress==='number'){onProgress(data.progress);return;}finish();data.error?reject(new Error(data.error)):resolve(data);};
   try{worker.postMessage(payload);}catch(error){finish();reject(error);}
 });
}
export default function App(){
 const [state,setState]=useState<Snapshot>({clip:null,rack:defaultRack(),profile:null});
 const {clip,rack,profile}=state;
 const history=useRef<Snapshot[]>([]),future=useRef<Snapshot[]>([]);
 const [result,setResult]=useState<Result|null>(null),[progress,setProgress]=useState<number|null>(null);
 const [collapsed,setCollapsed]=useState(false);
 const [active,setActive]=useState(2),[region,setRegion]=useState<Region|null>(null);
 const [advanced,setAdvanced]=useState(false),[light,setLight]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [mode,setMode]=useState('Processed'),[wet,setWet]=useState(100),[match,setMatch]=useState(false),[bypass,setBypass]=useState(false);
 const [pos,setPos]=useState(0),[speed,setSpeed]=useState(1),[playing,setPlaying]=useState(false),[zoom,setZoom]=useState(1),[pan,setPan]=useState(0);
 const [meter,setMeter]=useState({peak:0,rms:0}),[bins,setBins]=useState<number[]>([]);
 const [editing,setEditing]=useState(false),[editValue,setEditValue]=useState(0);
 const [exporting,setExporting]=useState(false),[format,setFormat]=useState('wav'),[rate,setRate]=useState(48000),[depth,setDepth]=useState(24),[bitrate,setBitrate]=useState(192),[mono,setMono]=useState(false),[only,setOnly]=useState(false),[download,setDownload]=useState<{url:string;name:string}|null>(null);
 const [savedMessage,setSavedMessage]=useState('');
 const recordingPending=useRef(false);
 const [recording,setRecording]=useState(false),[preset,setPreset]=useState('');
 const [custom,setCustom]=useState<Record<string,Effect[]>>(()=>{try{return JSON.parse(localStorage.getItem('audiopure-presets')||'{}');}catch{return {};}});
 const input=useRef<HTMLInputElement>(null),ctx=useRef<AudioContext|null>(null),processing=useRef<AbortController|null>(null),operation=useRef<AbortController|null>(null);
 const imported=useRef<Clip|null>(null);
 const recorder=useRef<MediaRecorder|null>(null),mic=useRef<MediaStream|null>(null),drag=useRef<number|null>(null),select=useRef<{at:number;x:number}|null>(null);
 const playRequest=useRef(0);
 const playState=useRef<{sources:AudioBufferSourceNode[];gains:GainNode[];analyser:AnalyserNode;meter:AudioWorkletNode|null;when:number;offset:number;speed:number}|null>(null);
 const duration=clip?clip.channels[0].length/clip.rate:0, visible=duration/zoom, left=(duration-visible)*pan,right=left+visible;
 const valid=result?.source===state?result.channels:null, after=valid??clip?.channels??null, selected=rack[active];
 const [originalStats,setOriginalStats]=useState<ReturnType<typeof stats>|null>(null),[processedStats,setProcessedStats]=useState<ReturnType<typeof stats>|null>(null);
 const context=()=>ctx.current??=new AudioContext();
 function stop(){
   playRequest.current++;
   const session=playState.current;playState.current=null;
   if(session){for(const source of session.sources){try{source.stop();}catch{}source.disconnect();}session.gains.forEach(g=>g.disconnect());session.analyser.disconnect();session.meter?.disconnect();}
   setPlaying(false);setMeter({peak:0,rms:0});setBins([]);
 }
 function currentPosition(){const s=playState.current;return s?Math.min(duration,s.offset+(context().currentTime-s.when)*s.speed):pos;}
 function commit(next:Snapshot){
   const buffers=new Set<Float32Array[]>();
   if(next.clip)buffers.add(next.clip.channels);
   let bytes=next.clip?next.clip.channels.length*next.clip.channels[0].byteLength:0;
   history.current=[...history.current,state].slice(-20).reverse().filter(item=>{
     const channels=item.clip?.channels;if(!channels||buffers.has(channels))return true;
     const size=channels.length*channels[0].byteLength;
     if(bytes+size>2*limit)return false;
     bytes+=size;buffers.add(channels);return true;
   }).reverse();
   future.current=[];setState(next);
 }
 function undo(redo=false){
   const from=redo?future:history,to=redo?history:future,next=from.current.pop();if(!next)return;
   to.current.push(state);
   if(next.clip!==clip){stop();setRegion(null);setPos(0);setZoom(1);setPan(0);}
   setState(next);
 }
 function updateRack(next:Effect[]){commit({...state,rack:next});}
 function update(values:Record<string,number>){updateRack(rack.map((unit,i)=>i===active?{...unit,values:{...unit.values,...values}}:unit));}
 useEffect(()=>{
   setOriginalStats(clip?stats(clip.channels):null);
 },[clip]);
 useEffect(()=>{
   if(!clip){setResult(null);setProgress(null);setProcessedStats(null);return;}
   const controller=new AbortController();processing.current=controller;setProgress(0);
   const timer=setTimeout(()=>{
     job<{channels:Float32Array[];stats:ReturnType<typeof stats>;compressorTrace:Float32Array}>({channels:clip.channels,rate:clip.rate,rack,profile},controller.signal,setProgress)
     .then(({channels,stats,compressorTrace})=>{
       if(controller.signal.aborted)return;
       if(playState.current){const s=playState.current;setPos(s.offset+(context().currentTime-s.when)*s.speed);stop();}
       setResult({source:state,channels,compressorTrace});setProcessedStats(stats);setProgress(null);
     }).catch(cause=>{if(!controller.signal.aborted){setError(String(cause));setProgress(null);}});
   },240);
   return ()=>{clearTimeout(timer);controller.abort();};
 },[state]);
 useEffect(()=>{setDownload(null);},[state,region,wet,bypass]);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url);},[download]);
 useEffect(()=>()=>{operation.current?.abort();mic.current?.getTracks().forEach(track=>track.stop());void ctx.current?.close();},[]);
 function applyMix(){
   const s=playState.current;if(!s)return;
   const mix=wet/100, matchGain=match&&processedStats?.rms&&originalStats?.rms?Math.min(4,originalStats.rms/processedStats.rms):1;
   const gains=bypass||mode==='Original'?[1,0]:mode==='Residual'?[mix,-mix]:[1-mix,mix*matchGain];
   s.gains.forEach((gain,i)=>gain.gain.setTargetAtTime(gains[i],context().currentTime,0.006));
 }
 useEffect(applyMix,[mode,wet,match,bypass,processedStats,originalStats]);

 async function play(at=pos,velocity=speed){
   if(!clip||!after)return;
   stop();const request=playRequest.current;
   try{
     const audio=context();
     await audio.resume();
     let meterNode:AudioWorkletNode|null=null;
     try{
       await audio.audioWorklet.addModule(import.meta.env.BASE_URL+'meter.js');
       meterNode=new AudioWorkletNode(audio,'studio-meter',{outputChannelCount:[Math.min(2,clip.channels.length)]});
       meterNode.port.onmessage=({data})=>setMeter({peak:data[0],rms:data[1]});
     }catch{}
     if(request!==playRequest.current){meterNode?.disconnect();return;}
     const analyser=audio.createAnalyser();analyser.fftSize=256;
     if(meterNode)analyser.connect(meterNode).connect(audio.destination);else analyser.connect(audio.destination);
     const gains=[audio.createGain(),audio.createGain()];
     const sources=[clip.channels,after].map((channels,index)=>{
       const buffer=audio.createBuffer(channels.length,channels[0].length,clip.rate);
       channels.forEach((channel,i)=>buffer.getChannelData(i).set(channel));
       const source=audio.createBufferSource();source.buffer=buffer;source.playbackRate.value=velocity;source.connect(gains[index]).connect(analyser);return source;
     });
     const offset=at>=duration?0:at, when=audio.currentTime+0.02;
     playState.current={sources,gains,analyser,meter:meterNode,when,offset,speed:velocity};
     gains.forEach(g=>g.gain.value=0);applyMix();
     sources[0].onended=()=>{if(playState.current?.sources===sources){stop();setPos(duration);}};
     sources.forEach(source=>source.start(when,offset));setPos(offset);setPlaying(true);
   }catch(cause){setError(String(cause));stop();}
 }
 function togglePlayback(){if(playing){setPos(currentPosition());stop();}else void play();}
 useEffect(()=>{
   if(!playing)return;
   const timer=setInterval(()=>{
     const s=playState.current;if(!s)return;
     setPos(Math.max(s.offset,currentPosition()));
     const values=new Uint8Array(s.analyser.frequencyBinCount);s.analyser.getByteFrequencyData(values);
     setBins(Array.from({length:32},(_,i)=>values[Math.floor(127*(i/32)**2)]/255));
     if(!s.meter){const data=new Float32Array(256);s.analyser.getFloatTimeDomainData(data);setMeter(stats([data]));}
   },64);
   return ()=>clearInterval(timer);
 },[playing,duration]);
 useEffect(()=>{
   const key=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.closest('input,select,textarea,button,a')||e.repeat)return;
     if(e.code==='Space'&&clip){e.preventDefault();togglePlayback();}
     if(e.key.toLowerCase()==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();undo(e.shiftKey);}
   };
   document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);
 });
 function begin(label:string){
   operation.current?.abort();const controller=new AbortController();operation.current=controller;
   setError('');setBusy(label);return controller;
 }
 async function open(file:File){
   stop();
   const controller=begin('Decoding audio');
   try{
     if(file.size>limit)throw new Error('Choose a file under 192 MiB.');
     const bytes=await file.arrayBuffer();let audio:AudioBuffer;
     try{audio=await context().decodeAudioData(bytes.slice(0));}
     catch{
       controller.signal.throwIfAborted();setBusy('Converting audio locally');
       const {convert}=await import('./convert');
       audio=await context().decodeAudioData(await convert(new Uint8Array(bytes),file.name.split('.').pop()??'audio','wav',192,controller.signal,()=>{}));
     }
     controller.signal.throwIfAborted();
     if(audio.length*audio.numberOfChannels*4>limit||audio.duration>1800)throw new Error('This recording exceeds the 30-minute or 192 MiB decoded-audio limit.');
     history.current=[];future.current=[];setRegion(null);setPos(0);setZoom(1);setPan(0);setDownload(null);
     const loaded={channels:copy(audio),rate:audio.sampleRate,name:file.name,size:file.size};
     imported.current=loaded;
     setState(previous=>({...previous,clip:loaded,profile:null}));
   }catch(cause){if(!controller.signal.aborted)setError(String(cause));}
   finally{if(operation.current===controller)setBusy('');}
 }
 async function record(){
   if(recorder.current?.state==='recording'){recorder.current.stop();return;}
   if(recordingPending.current)return;
   recordingPending.current=true;
   try{
     if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Microphone recording requires HTTPS or localhost.');
     const stream=await navigator.mediaDevices.getUserMedia({audio:{noiseSuppression:false,echoCancellation:false,autoGainControl:false}});mic.current=stream;
     const rec=new MediaRecorder(stream);recorder.current=rec;const chunks:Blob[]=[];let bytes=0;
     rec.ondataavailable=({data})=>{chunks.push(data);bytes+=data.size;if(bytes>limit&&rec.state==='recording')rec.stop();};
     rec.onstop=()=>{stream.getTracks().forEach(track=>track.stop());mic.current=null;setRecording(false);if(chunks.length)void open(new File(chunks,'Microphone recording.'+(rec.mimeType.includes('mp4')?'m4a':rec.mimeType.includes('ogg')?'ogg':'webm'),{type:rec.mimeType}));};
     rec.start(1000);setRecording(true);
   }catch(cause){mic.current?.getTracks().forEach(track=>track.stop());setError(String(cause));}
   finally{recordingPending.current=false;}
 }
 async function storeProject(save:boolean){
   setError('');setSavedMessage('');
   try{
     if(save&&clip&&imported.current){
       await project<LocalProject>({state,original:imported.current,selection:region});
       setSavedMessage('Project saved on this device.');
     }else{
       const local=await project<LocalProject>();
       if(!local?.state.clip){setSavedMessage('No local project has been saved.');return;}
       operation.current?.abort();stop();imported.current=local.original;
       history.current=[];future.current=[];setRegion(local.selection);setPos(0);setZoom(1);setPan(0);setActive(0);setDownload(null);
       setState(local.state);setSavedMessage('Local project opened.');
     }
   }catch(cause){setError(String(cause));}
 }
 function choosePreset(name:string){
   setPreset(name);if(custom[name]){updateRack(custom[name].map(unit=>({...unit,values:{...effect(unit.kind).values,...unit.values}})));setActive(0);return;}
   if(!presets[name])return;
   const next=defaultRack();
   for(const [kind,values] of Object.entries(presets[name]) as [Kind,Effect['values']][]){
     const unit=next.find(item=>item.kind===kind)??effect(kind);if(!next.includes(unit))next.push(unit);Object.assign(unit.values,values);
   }
   setActive(2);updateRack(next);
 }
 function savePreset(){
   const name=window.prompt('Name this preset')?.trim();if(!name)return;
   const next={...custom,[name]:rack};
   try{localStorage.setItem('audiopure-presets',JSON.stringify(next));setCustom(next);setPreset(name);}catch(cause){setError(String(cause));}
 }
 function edit(action:string){
   if(!clip)return;
   const length=clip.channels[0].length,[start,end]=region??[0,duration],a=Math.round(start*clip.rate),b=Math.round(end*clip.rate);
   if(b<=a)return;
   if(['Trim','Cut','Delete','Silence','Fade in','Fade out'].includes(action)&&!region){setError('Select an audio region first.');return;}
   if(['Cut','Delete'].includes(action)&&b-a===length){setError('Select less than the whole recording.');return;}
   let channels:Float32Array[];
   if(action==='Remove silence'){
     const step=Math.max(1,Math.round(clip.rate*0.02)), keep:Region[]=[];let previous=0,quietStart=-1,total=0;
     for(let i=0;i<=length;i+=step){
       const quiet=i<length&&stats(clip.channels.map(c=>c.subarray(i,i+step))).rms<0.01;
       if(quiet&&quietStart<0)quietStart=i;
       if((!quiet||i+step>=length)&&quietStart>=0){
         const end=quiet?length:i;
         if(end-quietStart>=clip.rate*0.3){keep.push([previous,quietStart]);total+=quietStart-previous;previous=end;}
         quietStart=-1;
       }
     }
     keep.push([previous,length]);total+=length-previous;
     if(total===length||total===0){setError(total?'No qualifying silence was detected.':'The entire recording is below the silence threshold.');return;}
     if(!window.confirm(time((length-total)/clip.rate)+' of silence is below −40 dBFS. Remove it?'))return;
     channels=clip.channels.map(c=>{const next=new Float32Array(total);let offset=0;for(const [l,r] of keep){next.set(c.subarray(l,r),offset);offset+=r-l;}return next;});
   }else if(action==='Stereo to mono'){
     const out=new Float32Array(length);for(const channel of clip.channels)for(let i=0;i<length;i++)out[i]+=channel[i]/clip.channels.length;channels=[out];
   }else channels=clip.channels.map((channel,index)=>{
     if(action==='Trim')return channel.slice(a,b);
     if(action==='Cut'||action==='Delete'){const next=new Float32Array(length-b+a);next.set(channel.subarray(0,a));next.set(channel.subarray(b),a);return next;}
     const next=channel.slice();
     for(let i=a;i<b;i++){
       const t=(i-a)/Math.max(1,b-a-1);
       if(action==='Silence')next[i]=0;
       if(action==='Fade in')next[i]*=t;
       if(action==='Fade out')next[i]*=1-t;
       if(action==='Volume')next[i]*=10**(Math.max(-60,Math.min(24,editValue))/20);
       if(action==='Balance'&&clip.channels.length>1&&index<2)next[i]*=1-Math.min(1,Math.max(0,(index===0?editValue:-editValue)/100));
     }
     return next;
   });
   stop();setRegion(null);setPos(0);setZoom(1);setPan(0);setDownload(null);setError('');
   commit({...state,clip:{...clip,channels},profile:null});
 }
 async function renderExport(){
   if(!clip||(!valid&&!bypass))return;
   const controller=begin('Rendering export');setDownload(null);
   try{
     const [a,b]=only&&region?region:[0,duration],from=Math.round(a*clip.rate),frames=Math.round(b*clip.rate)-from;
     if(frames<1)throw new Error('Select a longer region.');
     const input=bypass?clip.channels:valid!,count=mono?1:2;
     const render=new OfflineAudioContext(count,Math.max(1,Math.round(frames*rate/clip.rate)),rate);
     const buffer=render.createBuffer(count,frames,clip.rate), mix=bypass?1:wet/100;
     for(let c=0;c<count;c++){
       const targets=buffer.getChannelData(c);
       const indices=mono?input.map((_,i)=>i):input.length===1?[0]:input.map((_,i)=>i).filter(i=>i%2===c);
       for(let i=0;i<frames;i++)for(const index of indices)targets[i]+=(mix*input[index][i+from]+(1-mix)*clip.channels[index][i+from])/indices.length;
     }
     const node=render.createBufferSource();node.buffer=buffer;node.connect(render.destination);node.start();
     const rendered=await render.startRendering();controller.signal.throwIfAborted();
     let {bytes}=await job<{bytes:ArrayBuffer}>({channels:copy(rendered),rate,output:{depth:format==='wav'?depth:24}},controller.signal,()=>{});
     if(format!=='wav'){
       setBusy('Encoding '+format.toUpperCase());
       const {convert}=await import('./convert');
       bytes=await convert(new Uint8Array(bytes),'wav',format,bitrate,controller.signal,p=>setBusy('Encoding '+format.toUpperCase()+' · '+Math.round(p*100)+'%'));
     }
     controller.signal.throwIfAborted();
     setDownload({url:URL.createObjectURL(new Blob([bytes],{type:'audio/'+(format==='mp3'?'mpeg':format)})),name:clip.name.replace(/\.[^.]+$/,'')+'-clean.'+format});
   }catch(cause){if(!controller.signal.aborted)setError(String(cause));}
   finally{if(operation.current===controller)setBusy('');}
 }
 const at=(e:React.PointerEvent<HTMLDivElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return left+visible*Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));};
 const percent=(s:number)=>Math.max(0,Math.min(100,(s-left)/visible*100));
 function moveEffect(from:number,to:number){
   if(!rack[to]||from===to)return;
   const next=rack.slice();next.splice(to,0,next.splice(from,1)[0]);updateRack(next);setActive(to);
 }
 return <div className={'app'+(light?' light':'')} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();void open(e.dataTransfer.files[0]);}}}>
 <header>
  <div className="brand"><AudioLines size={26}/><span>AudioPure <b>Studio</b></span></div>
  <nav aria-label="Project actions">
   <input ref={input} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void open(file);e.target.value='';}}/>
   <button onClick={()=>input.current?.click()}><FolderOpen size={17}/> Import</button>
   <button onClick={record} disabled={!!busy}><Mic size={16}/>{recording?'Stop recording':'Record'}</button>
   <button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.current.length} onClick={()=>undo()}><Undo2 size={17}/></button>
   <button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!future.current.length} onClick={()=>undo(true)}><Redo2 size={17}/></button>
  </nav>
  <div className="header-end"><button aria-label={light?'Use dark theme':'Use light theme'} onClick={()=>setLight(!light)}><Sun size={17}/></button><button className="primary" disabled={!clip} onClick={()=>setExporting(!exporting)}><Download size={17}/> Export</button></div>
 </header>
 <div className="layout">
  <aside className="rack">
   <h2><SlidersHorizontal size={17}/> Effects Rack</h2>
   {rack.map((item,index)=><div className={'effect'+(index===active?' selected':'')} key={index} draggable onDragStart={()=>{drag.current=index;}} onDragEnd={()=>{drag.current=null;}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(drag.current!==null)moveEffect(drag.current,index);drag.current=null;}}>
    <button onClick={()=>{setActive(index);setCollapsed(false);}} aria-pressed={index===active}>{labels[item.kind]}</button><Switch aria-label={'Enable '+labels[item.kind]} checked={item.enabled} onCheckedChange={enabled=>updateRack(rack.map((unit,i)=>i===index?{...unit,enabled}:unit))}/>
   </div>)}
   <select aria-label="Add effect" value="" onChange={e=>{updateRack([...rack,effect(e.target.value as Kind)]);setActive(rack.length);}}><option value="" disabled>Add effect</option>{Object.entries(labels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
   <h2 className="presets">Presets</h2>
   <select aria-label="Processing preset" value={preset} onChange={e=>choosePreset(e.target.value)}><option value="">Choose a preset</option>{[...new Set([...Object.keys(presets),...Object.keys(custom)])].map(name=><option key={name}>{name}</option>)}</select>
   <div className="row"><button onClick={savePreset}>Save preset</button><button onClick={()=>{updateRack(defaultRack());setPreset('');setActive(2);}}>Reset rack</button></div>
   <div className="row"><button disabled={!clip||!!busy} onClick={()=>storeProject(true)}>Save local project</button><button disabled={!!busy} onClick={()=>storeProject(false)}>Open local project</button></div>
  </aside>
  <main>
   <div className="workspace-head"><div><h1>{clip?.name??'Audio workspace'}</h1><p>{clip?clip.name.split('.').pop()?.toUpperCase()+' · '+(clip.size/1024**2).toFixed(2)+' MiB · '+time(duration):'Import or record audio to start editing'}</p></div><button onClick={()=>setEditing(!editing)} disabled={!clip} aria-expanded={editing}>Edit audio</button></div>
   {savedMessage&&<p className="notice" role="status">{savedMessage}<button onClick={()=>setSavedMessage('')} aria-label="Dismiss status">×</button></p>}
   {error&&<p className="notice error" role="alert">{error} <button onClick={()=>setError('')} aria-label="Dismiss error">×</button></p>}
   {busy&&<p className="notice" role="status">{busy} <button onClick={()=>{operation.current?.abort();setBusy('');}}>Cancel</button></p>}
   {editing&&clip&&<div className="edit-tools">{['Trim','Cut','Delete','Silence','Fade in','Fade out','Stereo to mono','Remove silence'].map(action=><button key={action} onClick={()=>edit(action)}>{action}</button>)}<button disabled={imported.current===clip} onClick={()=>{stop();setRegion(null);setPos(0);setZoom(1);setPan(0);setDownload(null);commit({...state,clip:imported.current,profile:null});}}>Restore imported audio</button><label>Adjustment <input type="number" min="-100" max="100" value={editValue} onChange={e=>setEditValue(+e.target.value)}/></label><button onClick={()=>edit('Volume')}>Apply volume (dB)</button><button onClick={()=>edit('Balance')}>Apply balance (%)</button></div>}
   {exporting&&clip&&<section className="export" aria-label="Export settings"><h2>Export audio</h2><div className="form-grid">
    <label>Format<select aria-label="Format" value={format} onChange={e=>{setFormat(e.target.value);if(e.target.value==='mp3'&&rate<32000&&bitrate>160)setBitrate(160);setDownload(null);}}>{['wav','mp3','flac','ogg'].map(value=><option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
    <label>Sample rate<select value={rate} onChange={e=>{const next=+e.target.value;setRate(next);if(next<32000&&bitrate>160)setBitrate(160);setDownload(null);}}>{[16000,22050,44100,48000].map(value=><option key={value} value={value}>{value} Hz</option>)}</select></label>
    {format==='wav'&&<label>Bit depth<select value={depth} onChange={e=>{setDepth(+e.target.value);setDownload(null);}}><option value={16}>16-bit</option><option value={24}>24-bit</option></select></label>}
    {format==='mp3'&&<label>Bitrate<select value={bitrate} onChange={e=>{setBitrate(+e.target.value);setDownload(null);}}>{(rate<32000?[128,160]:[128,192,256,320]).map(value=><option key={value} value={value}>{value} kbps</option>)}</select></label>}
    {toggle('Mono output',mono,value=>{setMono(value);setDownload(null);})}
    {region&&toggle('Selected region only',only,value=>{setOnly(value);setDownload(null);})}
    <button className="primary" disabled={!!busy||(!valid&&!bypass)} onClick={renderExport}>Render export</button>
    {download&&<a className="button primary" href={download.url} download={download.name}>Download {download.name}</a>}
   </div></section>}
   {!clip?<div className="dropzone"><div className="drop-icon"><AudioLines size={38}/></div><h2>Drop an audio file here</h2><p>WAV, MP3, M4A, OGG, FLAC, AAC or WebM</p><button className="primary" onClick={()=>input.current?.click()}><FolderOpen size={17}/> Browse files</button><small>Up to 30 minutes or 192 MiB</small></div>:<>
    <div className="timeline" aria-hidden="true">{Array.from({length:6},(_,i)=><span key={i}>{time(left+visible*i/5)}</span>)}</div>
    <div className="tracks"><Waveform audio={clip.channels} rate={clip.rate} start={left} end={right} color="#40b8ff" label="Original"/><Waveform audio={after} rate={clip.rate} start={left} end={right} color="#b38cff" label="Processed"/><Spectrogram audio={after} rate={clip.rate} start={left} end={right}/>
    <div className="timeline-overlay" onPointerDown={e=>{select.current={at:at(e),x:e.clientX};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!select.current||Math.abs(e.clientX-select.current.x)<4)return;const a=select.current.at,b=at(e);setRegion([Math.min(a,b),Math.max(a,b)]);}} onPointerCancel={()=>{select.current=null;}} onPointerUp={e=>{if(select.current&&Math.abs(e.clientX-select.current.x)<4){setPos(at(e));if(playing)void play(at(e));}select.current=null;}}>
    {region&&<div className="selection" style={{left:percent(region[0])+'%',width:(percent(region[1])-percent(region[0]))+'%'}}/>}
    {pos>=left&&pos<=right&&<div className="playhead" style={{left:percent(pos)+'%'}}/>}
    </div></div>
    <div className="workspace-controls">
      <label>Zoom <input type="range" min="1" max="16" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
      {zoom>1&&<label>Pan <input type="range" min="0" max="1" step=".01" value={pan} onChange={e=>setPan(+e.target.value)}/></label>}
      <label>Selection start <input type="number" min="0" max={region?.[1]??duration} step=".001" value={region?+region[0].toFixed(3):''} onChange={e=>setRegion([Math.max(0,Math.min(+e.target.value,region?.[1]??duration)),region?.[1]??duration])}/></label>
      <label>Selection end <input type="number" min={region?.[0]??0} max={duration} step=".001" value={region?+region[1].toFixed(3):''} onChange={e=>setRegion([region?.[0]??0,Math.min(duration,Math.max(region?.[0]??0,+e.target.value))])}/></label>
      {region&&<button onClick={()=>setRegion(null)}>Clear</button>}
    </div>
    {progress!==null&&<div className="notice" role="status"><span>Processing effects</span><progress max={1} value={progress}/><button onClick={()=>{processing.current?.abort();setProgress(null);}}>Cancel</button></div>}
   </>}
  </main>
  <aside className="inspector">
   <div className='inspector-head'><h2>{selected?labels[selected.kind]:'Effect controls'}</h2>{selected&&<button aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'Show':'Hide'}</button>}</div>
   {toggle('Advanced mode',advanced,setAdvanced)}
   {selected&&!collapsed&&<>
    {selected.kind==='noise'&&<><button className="capture" disabled={!region||region[1]<=region[0]} onClick={()=>commit({...state,profile:region})}>Capture noise profile</button><p className="subtle">{profile?'Profile captured · '+time(profile[1]-profile[0]):'Select a region with background noise only.'}</p></>}
    {selected.kind==='hum'&&<div className="row">{[50,60].map(hz=><button key={hz} onClick={()=>update({frequency:hz})}>{hz} Hz</button>)}</div>}
    {selected.kind==='eq'&&<EqGraph values={selected.values} rate={clip?.rate??48000} update={update}/>}
    {selected.kind==='comp'&&<p className='subtle'>Gain reduction {playing&&mode==='Processed'&&!bypass&&valid?((result?.compressorTrace[Math.floor(pos*20)]??0).toFixed(1)+' dB'):'—'}</p>}
    <div className="controls">{Object.entries(settings[selected.kind]).filter((_,i)=>advanced||i<3).map(([key,[min,max,,step]])=>{
      const value=selected.values[key],label=parameterLabels[key]||key[0].toUpperCase()+key.slice(1);
      if(key==='lowType'||key==='highType')return <label className='setting' key={key}>{key==='lowType'?'Low band type':'High band type'}<select value={value??0} onChange={e=>update({[key]:+e.target.value})}><option value={0}>Shelf</option><option value={1}>{key==='lowType'?'High pass':'Low pass'}</option></select></label>;
      if(key==='mode'||key==='window')return <label className="setting" key={key}>{label}<select value={value} onChange={e=>update({[key]:+e.target.value})}>{(key==='mode'?['Peak','RMS','LUFS']:[256,512,1024,2048,4096]).map((item,i)=><option key={item} value={key==='mode'?i:item}>{item}</option>)}</select></label>;
      const change=(value:number)=>{if(Number.isFinite(value))update({[key]:Math.max(min,Math.min(max,value))});};
      return <div className="setting" key={key}><div><label htmlFor={'parameter-'+key} title={parameterTips[key]||label}>{label}</label><input type="number" aria-label={label+' value'} min={min} max={max} step={step} value={value} onChange={e=>change(e.target.valueAsNumber)}/></div><input id={'parameter-'+key} type="range" min={min} max={max} step={step} value={value} onChange={e=>change(e.target.valueAsNumber)}/></div>;
    })}</div>
    <div className="row"><button onClick={()=>update(effect(selected.kind).values)}>Reset effect</button><button onClick={()=>{updateRack(rack.filter((_,i)=>i!==active));setActive(Math.max(0,active-1));}}>Remove</button></div>
    {advanced&&<div className="row"><button disabled={!rack[active-1]} onClick={()=>moveEffect(active,active-1)}>Move up</button><button disabled={!rack[active+1]} onClick={()=>moveEffect(active,active+1)}>Move down</button></div>}
   </>}
   <div className="statistics"><h2>Audio statistics</h2><dl>
     <dt>Sample rate</dt><dd>{clip?clip.rate.toLocaleString()+' Hz':'—'}</dd><dt>Channels</dt><dd>{clip?.channels.length??'—'}</dd>
     {([['Original',originalStats],['Processed',valid?processedStats:null]] as const).map(([label,values])=><Fragment key={label}><dt>Peak · {label}</dt><dd>{values?db(values.peak).toFixed(1)+' dBFS':'—'}</dd><dt>RMS · {label}</dt><dd>{values?db(values.rms).toFixed(1)+' dBFS':'—'}</dd></Fragment>)}
   </dl></div>
   <p className="subtle">Results depend on the recording. Overlapping voices, music and reverberation can be difficult to remove with traditional filters.</p>
  </aside>
 </div>
 <footer>
  <div className="transport">
   <div className="playback"><button className="play primary" aria-label={playing?'Pause':'Play'} title="Play or pause (Space)" disabled={!clip} onClick={togglePlayback}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><span className="time">{time(pos)} <small>/ {time(duration)}</small></span><label>Speed <select value={speed} onChange={e=>{const value=+e.target.value;setSpeed(value);if(playing)void play(currentPosition(),value);}}>{[0.5,0.75,1,1.25,1.5,2].map(value=><option value={value} key={value}>{value}×</option>)}</select></label></div>
   <div className="compare" aria-label="Playback source">{['Original','Processed','Residual'].map(option=><button key={option} aria-pressed={mode===option} disabled={option!=='Original'&&!valid} onClick={()=>setMode(option)}>{option}</button>)}</div>
   <div className="meter" aria-label="Playback meters"><div className="spectrum" aria-label="Real-time frequency spectrum">{bins.map((value,i)=><i key={i} style={{height:Math.max(2,100*value)+'%'}}/>)}</div><div className="meter-bars">{(['peak','rms'] as const).map(key=><div key={key}><span>{key.toUpperCase()}</span><meter aria-label={key} min={-60} max={0} low={-45} high={-3} optimum={-15} value={Math.max(-60,Math.min(0,db(meter[key])))}/></div>)}</div>{meter.peak>=1&&<strong className="record">CLIP</strong>}</div>
  </div>
  <div className="monitor-options"><label>Processing mix <input type="range" min="0" max="100" value={wet} onChange={e=>setWet(+e.target.value)}/> {wet}%</label>{toggle('Loudness match',match,setMatch)}{toggle('Bypass all',bypass,setBypass)}</div>
  <p className="privacy"><ShieldCheck size={16}/>Your audio never leaves your device. All audio enhancement happens locally in your browser.</p>
 </footer>
 </div>;
}
const parameterLabels:Record<string,string>={cutoff:'Cutoff (Hz)',slope:'Slope (12 dB/oct per stage)',q:'Resonance / Q',frequency:'Frequency (Hz)',bandwidth:'Bandwidth (Hz)',strength:'Strength (dB)',smoothing:'Frequency smoothing',temporal:'Temporal smoothing',floor:'Noise floor (dB)',mix:'Wet / dry mix (%)',window:'FFT window size',threshold:'Threshold (dB)',attack:'Attack (ms)',hold:'Hold (ms)',release:'Release (ms)',hysteresis:'Hysteresis (dB)',range:'Attenuation range (dB)',low:'Low shelf gain (dB)',mid:'Mid gain (dB)',high:'High shelf gain (dB)',lowHz:'Low shelf frequency (Hz)',midHz:'Mid frequency (Hz)',highHz:'High shelf frequency (Hz)',makeup:'Makeup gain (dB)',reduction:'Reduction (dB)',lookahead:'Lookahead (ms)',duration:'Max. repair duration (ms)',ceiling:'Peak ceiling (dBFS)',target:'Target level (dB / LUFS)',input:'Input gain (dB)'};
const parameterTips:Record<string,string>={sensitivity:'How aggressively the effect distinguishes a disturbance from the signal.',strength:'Maximum attenuation per frequency bin.',smoothing:'Average neighboring frequency bins to reduce musical noise.',temporal:'Blend gain estimates across successive frames.'};







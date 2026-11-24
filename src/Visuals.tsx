import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { coefficients, db, eqBands, hann, spectrum } from './dsp';
type Props={audio:Float32Array[]|null;rate:number;start:number;end:number;color:string;label:string};
export function Waveform({audio,rate,start,end,color,label}:Props){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   if(!audio||!ref.current||end<=start)return;
   const width=Math.min(1600,Math.max(1,Math.floor((end-start)*rate)));
   const peak=new Float32Array(width*2);
   for(let x=0;x<width;x++){
     const from=Math.floor((start+(end-start)*x/width)*rate);
     const to=Math.max(from+1,Math.floor((start+(end-start)*(x+1)/width)*rate));
     let min=0,max=0;
     for(let i=from;i<to&&i<audio[0].length;i++)for(const channel of audio){min=Math.min(min,channel[i]);max=Math.max(max,channel[i]);}
     peak[x*2]=min;peak[x*2+1]=max;
   }
   const chart=WaveSurfer.create({container:ref.current,peaks:[peak],duration:end-start,waveColor:color,height:104,interact:false,cursorWidth:0,normalize:false});
   return ()=>chart.destroy();
 },[audio,rate,start,end,color]);
 return <div className="track"><span>{label}</span><div className="wave" ref={ref}/></div>;
}
export function Spectrogram({audio,rate,start,end}:Omit<Props,'color'|'label'>){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
   if(!audio||!ref.current||end<=start)return;
   const canvas=ref.current, ctx=canvas.getContext('2d');
   if(!ctx)return;
   const w=canvas.width,h=canvas.height,n=1024, frame=hann(n), re=new Float64Array(n),im=new Float64Array(n);
   const pixels=ctx.createImageData(w,h);
   for(let x=0;x<w;x++){
     spectrum(audio[0],Math.round((start+(end-start)*x/w)*rate)-n/2,re,im,frame);
     for(let y=0;y<h;y++){
       const hz=50*(rate/100)**(1-y/(h-1)), k=Math.min(n/2,Math.max(1,Math.round(hz*n/rate)));
       const level=Math.min(1,Math.max(0,(20*Math.log10(Math.hypot(re[k],im[k])/n+1e-9)+83)/66));
       const offset=(y*w+x)*4;
       pixels.data[offset]=12+243*level;
       pixels.data[offset+1]=14+215*level**3;
       pixels.data[offset+2]=24+115*Math.sin(Math.PI*level*0.87);
       pixels.data[offset+3]=255;
     }
   }
   ctx.putImageData(pixels,0,0);
 },[audio,rate,start,end]);
 return <div className="track spectrogram"><span>Spectrogram</span><canvas ref={ref} width={640} height={144} aria-label="Log frequency spectrogram from 50 Hz to Nyquist"/></div>;
}

export function EqGraph({values,rate,update}:{values:Record<string,number>;rate:number;update:(values:Record<string,number>)=>void}){
 const xFor=(hz:number)=>Math.log(hz/20)/Math.log(1000)*300;
 const yFor=(gain:number)=>55-gain*2.7;
 const bands=eqBands(values).map(([kind,hz,q,amount])=>coefficients(kind,hz,rate,q,amount));
 const points=Array.from({length:121},(_,i)=>{
   const x=i*2.5, angle=2*Math.PI*Math.min(rate*0.495,20*1000**(x/300))/rate;
   const magnitude=(a:number,b:number,c:number)=>Math.hypot(a+b*Math.cos(angle)+c*Math.cos(2*angle),b*Math.sin(angle)+c*Math.sin(2*angle));
   const response=bands.reduce((sum,[b0,b1,b2,a0,a1,a2])=>sum+db(magnitude(b0,b1,b2)/magnitude(a0,a1,a2)),0);
   return x+','+Math.max(0,Math.min(110,yFor(response)));
 }).join(' ');
 return <svg className="eq" viewBox="0 0 300 110" aria-label="Equalizer frequency response. Advanced mode provides keyboard frequency and gain controls.">
   <path d="M0 27H300 M0 55H300 M0 82H300 M75 0V110 M150 0V110 M225 0V110" stroke="var(--border)" />
   <polyline points={points} fill="none" stroke="var(--blue)" strokeWidth="2"/>
   {(['low','mid','high'] as const).map((key,index)=>{
     const hzKey=key+'Hz', [min,max]=[[30,600],[200,8000],[1000,18000]][index];
     return <circle key={key} cx={xFor(values[hzKey])} cy={yFor(values[key])} r="7" fill="var(--purple)"
      onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e=>{
        if(!e.currentTarget.hasPointerCapture(e.pointerId))return;
        const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();
        const hz=20*1000**((e.clientX-rect.left)/rect.width);
        const gain=(55-(e.clientY-rect.top)/rect.height*110)/2.7;
        update({[hzKey]:Math.round(Math.max(min,Math.min(max,hz))),[key]:Math.round(Math.max(-18,Math.min(18,gain))*10)/10});
      }}/>;
   })}
 </svg>;
}

import type { Effect } from './model';
export const gain = (db:number) => 10 ** (db/20);
export const db = (amplitude:number) => 20*Math.log10(Math.max(1e-9,amplitude));
export function stats(channels:Float32Array[]) {
  let peak=0, energy=0, count=0;
  for (const channel of channels) {
    count+=channel.length;
    for (const value of channel) { peak=Math.max(peak,Math.abs(value)); energy+=value*value; }
  }
  return {peak, rms:Math.sqrt(energy/Math.max(1,count))};
}
export function fft(real:Float64Array, imag:Float64Array, inverse=false) {
  const n=real.length;
  for (let i=1,j=0;i<n;i++) {
    let bit=n>>1;
    for (;j&bit;bit>>=1) j^=bit;
    j^=bit;
    if(i<j) { [real[i],real[j]]=[real[j],real[i]]; [imag[i],imag[j]]=[imag[j],imag[i]]; }
  }
  for(let size=2;size<=n;size*=2) {
    const angle=(inverse?2:-2)*Math.PI/size, stepR=Math.cos(angle), stepI=Math.sin(angle);
    for(let start=0;start<n;start+=size) {
      let wr=1,wi=0;
      for(let j=start;j<start+size/2;j++) {
        const k=j+size/2, tr=wr*real[k]-wi*imag[k], ti=wr*imag[k]+wi*real[k];
        real[k]=real[j]-tr; imag[k]=imag[j]-ti; real[j]+=tr; imag[j]+=ti;
        const next=wr*stepR-wi*stepI; wi=wr*stepI+wi*stepR; wr=next;
      }
    }
  }
  if(inverse) for(let i=0;i<n;i++){real[i]/=n;imag[i]/=n;}
}
export function spectrum(input:Float32Array, start:number, real:Float64Array, imag:Float64Array, window:Float64Array) {
  for(let i=0;i<window.length;i++){real[i]=(input[start+i]??0)*window[i];imag[i]=0;}
  fft(real,imag);
}
export const hann=(n:number)=>Float64Array.from({length:n},(_,i)=>0.5-0.5*Math.cos(2*Math.PI*i/n));
export type Region=[number,number];
export function spectral(input:Float32Array, reference:Float32Array, rate:number, p:Record<string,number>, region:Region) {
  if(!p.strength || !p.mix)return;
  const n=2**Math.round(Math.log2(p.window)), hop=n/4, bins=n/2+1, window=hann(n);
  const re=new Float64Array(n), im=new Float64Array(n), profile=new Float64Array(bins);
  const begin=Math.max(0,Math.floor(region[0]*rate)), end=Math.min(reference.length,Math.floor(region[1]*rate));
  if(end<=begin)return;
  let frames=0;
  for(let start=begin;start<end;start+=hop){
    if(start>begin && start+n>end)break;
    for(let i=0;i<n;i++){re[i]=(start+i<end?reference[start+i]:0)*window[i];im[i]=0;}
    fft(re,im); frames++;
    for(let k=0;k<bins;k++)profile[k]+=re[k]**2+im[k]**2;
  }
  for(let k=0;k<bins;k++)profile[k]/=frames;
  const output=new Float32Array(input.length), weight=new Float32Array(input.length);
  const raw=new Float64Array(bins), last=new Float64Array(bins).fill(1);
  const minimum=gain(-p.strength), floor=gain(p.floor)**2*n, mix=p.mix/100;
  for(let start=-n+hop;start<input.length;start+=hop){
    spectrum(input,start,re,im,window);
    for(let k=0;k<bins;k++){
      const power=re[k]**2+im[k]**2;
      raw[k]=Math.max(minimum,Math.sqrt(Math.max(0,1-p.sensitivity*profile[k]/Math.max(floor,power))));
    }
    for(let k=0;k<bins;k++){
      let total=0,count=0;
      for(let j=Math.max(0,k-p.smoothing);j<=Math.min(bins-1,k+p.smoothing);j++){total+=raw[j];count++;}
      const g=last[k]=p.temporal*last[k]+(1-p.temporal)*total/count;
      re[k]*=g;im[k]*=g;
      if(k>0 && k<n/2){re[n-k]*=g;im[n-k]*=g;}
    }
    fft(re,im,true);
    for(let i=0;i<n;i++){
      const j=start+i;
      if(j>=0 && j<input.length){output[j]+=re[i]*window[i];weight[j]+=window[i]**2;}
    }
  }
  for(let i=0;i<input.length;i++)input[i]=input[i]*(1-mix)+mix*output[i]/Math.max(1e-8,weight[i]);
}
type Filter='highpass'|'lowpass'|'notch'|'bandpass'|'peak'|'lowshelf'|'highshelf';
export function coefficients(type:Filter, hz:number, rate:number, q:number, amount=0) {
  const angle=2*Math.PI*Math.min(rate*0.495,hz)/rate, c=Math.cos(angle), s=Math.sin(angle), alpha=s/(2*q), a=gain(amount/2);
  switch(type){
    case 'highpass':return [(1+c)/2,-(1+c),(1+c)/2,1+alpha,-2*c,1-alpha];
    case 'lowpass':return [(1-c)/2,1-c,(1-c)/2,1+alpha,-2*c,1-alpha];
    case 'notch':return [1,-2*c,1,1+alpha,-2*c,1-alpha];
    case 'bandpass':return [alpha,0,-alpha,1+alpha,-2*c,1-alpha];
    case 'peak':return [1+alpha*a,-2*c,1-alpha*a,1+alpha/a,-2*c,1-alpha/a];
    case 'lowshelf':{
      const t=2*Math.sqrt(a)*alpha;
      return [a*((a+1)-(a-1)*c+t),2*a*((a-1)-(a+1)*c),a*((a+1)-(a-1)*c-t),(a+1)+(a-1)*c+t,-2*((a-1)+(a+1)*c),(a+1)+(a-1)*c-t];
    }
    case 'highshelf':{
      const t=2*Math.sqrt(a)*alpha;
      return [a*((a+1)+(a-1)*c+t),-2*a*((a-1)+(a+1)*c),a*((a+1)+(a-1)*c-t),(a+1)-(a-1)*c+t,2*((a-1)-(a+1)*c),(a+1)-(a-1)*c-t];
    }
  }
}
export function biquad(samples:Float32Array, type:Filter,hz:number,rate:number,q:number,amount=0) {
  const [b0,b1,b2,a0,a1,a2]=coefficients(type,hz,rate,q,amount).map((value,_,all)=>value/all[3]);
  let z1=0,z2=0;
  for(let i=0;i<samples.length;i++){
    const x=samples[i], y=b0*x+z1;
    z1=b1*x-a1*y+z2; z2=b2*x-a2*y;
    samples[i]=y;
  }
}
export const eqBands=(p:Record<string,number>):[Filter,number,number,number][]=>[
 [p.lowType?'highpass':'lowshelf',p.lowHz,0.707,p.low],['peak',p.midHz,p.q,p.mid],[p.highType?'lowpass':'highshelf',p.highHz,0.707,p.high],
];
const smoothing=(ms:number,rate:number)=>Math.exp(-1/(rate*ms/1000));
function dynamics(x:Float32Array, rate:number,p:Record<string,number>, kind:'gate'|'comp'|'deess'|'plosive',trace?:Float32Array) {
  const attack=smoothing(p.attack??5,rate),release=smoothing(p.release??90,rate);
  const threshold=gain(p.threshold);
  let band=x;
  if(kind==='deess'||kind==='plosive'){
    band=x.slice();
    biquad(band,kind==='deess'?'bandpass':'lowpass',p.frequency,rate,kind==='deess'?p.frequency/p.bandwidth:0.707);
  }
  let envelope=0, g=1, hold=0, open=false;
  const makeup=kind==='comp'?gain(p.makeup):1, closeThreshold=gain(p.threshold-p.hysteresis), range=gain(-p.range);
  for(let i=0;i<x.length;i++){
    const level=Math.abs(band[i]);
    const pole=level>envelope?attack:release;
    envelope=pole*envelope+(1-pole)*level;
    let target=1;
    if(kind==='gate'){
      if(envelope>=threshold){open=true;hold=Math.round(p.hold*rate/1000);}
      else if(envelope<closeThreshold){if(hold>0)hold--;else open=false;}
      target=open?1:range;
    } else if(kind==='comp'){
      const over=db(envelope)-p.threshold;
      const knee=over<=-p.knee/2?0:over>=p.knee/2?over:(over+p.knee/2)**2/(2*p.knee);
      target=gain(-knee*(1-1/p.ratio));
    } else target=gain(-Math.min(p.reduction,Math.max(0,db(envelope)-p.threshold)));
    const poleGain=(kind==='gate'?target>g:target<g)?attack:release;
    g=poleGain*g+(1-poleGain)*target;
    if(trace){const frame=Math.floor(i*20/rate);trace[frame]=Math.max(trace[frame],-db(g));}
    x[i]=band===x?x[i]*g*makeup:x[i]+(g-1)*band[i];
  }
}
export function loudness(channels:Float32Array[],rate:number){
  const block=Math.round(rate*0.4), hop=Math.round(rate*0.1), energies:number[]=[];
  const weighted=channels.map((channel,index)=>{
    const copy=channel.slice();
    biquad(copy,'highshelf',1681.974,rate,0.707175,3.999844);
    biquad(copy,'highpass',38.135,rate,0.500327);
    const factor=channels.length===6&&index===3?0:channels.length>=5&&index>=channels.length-2?1.41:1;
    return {copy,factor};
  });
  const length=channels[0].length;
  let energy=0;
  const at=(i:number)=>weighted.reduce((sum,{copy,factor})=>sum+factor*(copy[i]??0)**2,0);
  for(let i=0;i<Math.min(block,length);i++)energy+=at(i);
  for(let start=0; start+block<=length; start+=hop){
    energies.push(Math.max(0,energy/block));
    for(let i=0;i<hop&&start+block+hop<=length;i++)energy+=at(start+block+i)-at(start+i);
  }
  if(!energies.length)energies.push(energy/Math.max(1,length));
  const toLufs=(e:number)=>-0.691+10*Math.log10(e);
  const absolute=energies.filter(e=>toLufs(e)>=-70);
  const mean=(list:number[])=>list.reduce((sum,e)=>sum+e,0)/Math.max(1,list.length);
  const relative=toLufs(mean(absolute))-10;
  return toLufs(mean(absolute.filter(e=>toLufs(e)>=relative)));
}
function limiter(channels:Float32Array[],rate:number,p:Record<string,number>){
  const length=channels[0].length, ceiling=gain(p.ceiling), input=gain(p.input);
  const look=Math.round(p.lookahead*rate/1000), release=smoothing(p.release,rate);
  const queue=new Int32Array(look+2), peaks=new Float32Array(look+2), capacity=queue.length;
  let head=0, count=0, next=0, g=1;
  for(let i=0;i<length;i++){
    if(count&&queue[head]<i){head=(head+1)%capacity;count--;}
    while(next<length&&next<=i+look){
      let peak=0;
      for(const channel of channels)peak=Math.max(peak,Math.abs(channel[next]*input));
      while(count&&peaks[(head+count-1)%capacity]<=peak)count--;
      const tail=(head+count)%capacity;
      queue[tail]=next++;peaks[tail]=peak;count++;
    }
    const target=Math.min(1,ceiling/Math.max(1e-9,peaks[head]));
    g=Math.min(target,release*g+1-release);
    for(const channel of channels)channel[i]*=g*input;
  }
}
function declick(x:Float32Array,rate:number,p:Record<string,number>){
  const maxRun=Math.max(1,Math.round(p.duration*rate/1000));
  let average=0.002;
  for(let i=1;i<x.length-1;i++){
    const delta=Math.abs(x[i]-x[i-1]);
    const threshold= Math.max(0.015,average*p.sensitivity);
    if(delta>threshold){
      const limit=Math.min(x.length-1,i+maxRun);
      for(let end=i+1;end<=limit;end++){
        if(Math.abs(x[end]-x[i-1])>threshold*0.45 || Math.abs(x[end]-x[end-1])<threshold*0.5)continue;
        const left=x[i-1],right=x[end], span=end-i+1;
        for(let j=i;j<end;j++)x[j]=left+(right-left)*(j-i+1)/span;
        i=end;
        break;
      }
    }
    average=0.995*average+0.005*Math.min(delta,threshold);
  }
}
export function processAudio(original:Float32Array[],rate:number,rack:Effect[],profile:Region|null,onProgress=(fraction:number)=>{void fraction;},compressorTrace?:Float32Array){
  const channels=original.map(channel=>channel.slice());
  const enabled=rack.filter(effect=>effect.enabled);
  for(const [index,{kind,values:p}] of enabled.entries()){
    if(kind==='limit')limiter(channels,rate,p);
    else if(kind==='norm'){
      const {peak,rms}=stats(channels);
      const level=p.mode===2?loudness(channels,rate):db(p.mode===1?rms:peak);
      const factor=peak&&Number.isFinite(level)?Math.min(gain(p.target-level),gain(p.ceiling)/peak):1;
      for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=factor;
    }else for(const [index,channel] of channels.entries()){
      switch(kind){
        case 'high':case 'low':
          for(let stage=0;stage<p.slope;stage++)biquad(channel,kind==='high'?'highpass':'lowpass',p.cutoff,rate,p.q);
          break;
        case 'hum':
          for(let h=1;h<=p.harmonics&&h*p.frequency<rate/2;h++)biquad(channel,'notch',h*p.frequency,rate,p.q);
          break;
        case 'noise':
          if(profile)spectral(channel,original[index],rate,p,profile);
          break;
        case 'eq':
          for(const [type,hz,q,amount] of eqBands(p))biquad(channel,type,hz,rate,q,amount);
          break;
        case 'gate':case 'comp':case 'deess':case 'plosive':dynamics(channel,rate,p,kind,kind=== 'comp'?compressorTrace:undefined);break;
        case 'click':declick(channel,rate,p);break;
      }
    }
    onProgress((index+1)/enabled.length);
  }
  return channels;
}



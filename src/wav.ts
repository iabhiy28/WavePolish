export function wave(channels:Float32Array[],rate:number,depth:number){
  const width=depth/8, frames=channels[0].length, bytes=frames*channels.length*width, padding=bytes%2;
  const output=new ArrayBuffer(44+bytes+padding), view=new DataView(output);
  const write=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+bytes+padding,true);write(8,'WAVE');write(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels.length,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*channels.length*width,true);
  view.setUint16(32,channels.length*width,true);view.setUint16(34,depth,true);
  write(36,'data');view.setUint32(40,bytes,true);
  let cursor=44;
  for(let i=0;i<frames;i++)for(const channel of channels){
    const sample=Math.max(-1,Math.min(1,channel[i]));
    const value=Math.round(sample*(sample<0?2**(depth-1):2**(depth-1)-1));
    if(depth===16)view.setInt16(cursor,value,true);
    else{view.setUint8(cursor,value&255);view.setInt16(cursor+1,value>>8,true);}
    cursor+=width;
  }
  return output;
}

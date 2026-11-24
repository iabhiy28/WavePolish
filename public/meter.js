class MeterProcessor extends AudioWorkletProcessor {
  frames=0;
  peak=0;
  energy=0;
  count=0;
  process(inputs,outputs){
    const input=inputs[0];
    for(let c=0;c<outputs[0].length;c++){if(input[c])outputs[0][c].set(input[c]);else outputs[0][c].fill(0);}
    for(const channel of input)for(const value of channel){
      this.peak=Math.max(this.peak,Math.abs(value));
      this.energy+=value*value;
      this.count++;
    }
    this.frames++;
    if(this.frames>=16){
      this.port.postMessage([this.peak,Math.sqrt(this.energy/Math.max(1,this.count))]);
      this.frames=this.peak=this.energy=this.count=0;
    }
    return true;
  }
}
registerProcessor('studio-meter',MeterProcessor);


export const settings = {
  high: {cutoff:[20,500,80,1], slope:[1,4,1,1], q:[0.3,4,0.707,0.001]},
  hum: {frequency:[45,70,50,1], harmonics:[1,10,3,1], q:[2,80,25,1]},
  noise: {strength:[0,40,18,1], sensitivity:[0,3,1,0.05], smoothing:[0,12,2,1], temporal:[0,0.95,0.35,0.01], floor:[-80,-10,-60,1], mix:[0,100,100,1], window:[256,4096,1024,256]},
  gate: {threshold:[-80,0,-46,1], attack:[0.1,100,5,0.1], hold:[0,500,40,1], release:[1,500,100,1], hysteresis:[0,15,4,1], range:[0,80,18,1]},
  eq: {low:[-18,18,0,0.1], lowHz:[30,600,180,1], mid:[-18,18,1,0.1], midHz:[200,8000,1800,1], q:[0.2,10,1,0.1], high:[-18,18,0,0.1], highHz:[1000,18000,6500,1], lowType:[0,1,0,1], highType:[0,1,0,1]},
  deess: {frequency:[2000,12000,6500,10], bandwidth:[300,6000,2700,10], threshold:[-70,0,-28,1], reduction:[0,24,7,1], attack:[0.1,100,2,0.1], release:[1,300,60,1]},
  comp: {threshold:[-60,0,-18,1], ratio:[1,20,2.5,0.1], attack:[0.1,150,10,0.1], release:[1,600,100,1], knee:[0,24,6,1], makeup:[-12,24,1,0.1]},
  norm: {mode:[0,2,0,1], target:[-40,0,-16,0.1], ceiling:[-12,0,-1,0.1]},
  limit: {ceiling:[-12,0,-1,0.1], release:[1,500,75,1], lookahead:[0,20,5,0.1], input:[-12,24,0,0.1]},
  low: {cutoff:[1000,20000,11500,10], slope:[1,4,1,1], q:[0.3,4,0.707,0.001]},
  click: {sensitivity:[2,25,8,0.1], duration:[0.1,5,0.6,0.1]},
  plosive: {frequency:[40,300,120,1], threshold:[-60,0,-20,1], reduction:[0,24,10,1]},
} satisfies Record<string, Record<string,number[]>>;
export type Kind = keyof typeof settings;
export type Effect = {kind:Kind; enabled:boolean; values:Record<string,number>};
export const labels:Record<Kind,string> = {high:'High-Pass Filter',hum:'Hum Removal',noise:'Noise Reduction',gate:'Noise Gate',eq:'Equalizer',deess:'De-Esser',comp:'Compressor',norm:'Normalization',limit:'Limiter',low:'Low-Pass Filter',click:'Click & Pop Removal',plosive:'Plosive Reduction'};
export const effect = (kind:Kind):Effect => ({kind, enabled:true, values:Object.fromEntries(Object.entries(settings[kind]).map(([key,range])=>[key,range[2]]))});
export const defaultRack = ():Effect[] => (['high','hum','noise','gate','eq','deess','comp','norm','limit'] as Kind[]).map(effect);
export const presets:Record<string,Partial<Record<Kind,Record<string,number>>>> = {
 'YouTube Voiceover':{norm:{mode:2,target:-14},comp:{ratio:3}},
 'Podcast Cleanup':{norm:{mode:2,target:-16},noise:{strength:18}},
 'Microphone Hiss':{low:{cutoff:10500},noise:{strength:15}},
 'Ceiling Fan Noise':{high:{cutoff:130},noise:{strength:24}},
 'AC Background Noise':{high:{cutoff:100},noise:{strength:22,temporal:0.65}},
 'Electrical Hum':{hum:{harmonics:6,q:35}},
 'Outdoor Recording':{high:{cutoff:160,slope:2},plosive:{reduction:12}},
 'Lecture Recording':{comp:{ratio:3.5},noise:{strength:14}},
 'Interview Recording':{comp:{ratio:2},gate:{range:8}},
 'Voice Clarity':{eq:{mid:3,midHz:2400},deess:{reduction:9}},
 'Gentle Cleanup':{noise:{strength:7},gate:{range:8}},
 'Aggressive Noise Reduction':{noise:{strength:34,sensitivity:1.6},gate:{range:35}},
};


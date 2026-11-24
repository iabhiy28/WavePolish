import { test, expect } from '@playwright/test';
import { wave } from '../src/wav';
test('imports, edits the rack, captures a profile and exports audio locally',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Drop an audio file here'})).toBeVisible();
 const audio=Float32Array.from({length:48000},(_,i)=>i<12000?0.01*Math.sin(i*0.055):0.24*Math.sin(i*0.04));
 const file=Buffer.from(wave([audio],48000,16));
 await page.locator('input[type=file]').setInputFiles({name:'voice.wav',mimeType:'audio/wav',buffer:file});
 await expect(page.getByRole('heading',{name:'voice.wav'})).toBeVisible();
 await page.getByLabel('Selection end').fill('0.20');
 await page.getByRole('button',{name:'Capture noise profile'}).click();
 await expect(page.getByText('Profile captured',{exact:false})).toBeVisible();
 await page.getByLabel('Strength (dB) value',{exact:true}).fill('25');
 await expect(page.getByLabel('Strength (dB)',{exact:true})).toHaveValue('25');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByLabel('Strength (dB) value',{exact:true})).toHaveValue('18');
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await page.getByRole('button',{name:'Render export'}).click();
 const link=page.getByRole('link',{name:'Download voice-clean.wav'});
 await expect(link).toBeVisible();
 const bytes=await link.evaluate(async a=>Array.from(new Uint8Array(await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer()).slice(0,12)));
 expect(Buffer.from(bytes).toString('ascii',8,12)).toBe('WAVE');
 for(const format of ['mp3','flac','ogg']){
   await page.getByLabel('Format',{exact:true}).selectOption(format);
   await page.getByRole('button',{name:'Render export'}).click();
   const download=page.getByRole('link',{name:'Download voice-clean.'+format});
   await expect(download).toBeVisible({timeout:12000});
   const header=await download.evaluate(async a=>Array.from(new Uint8Array(await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer()).slice(0,4)));
   expect(Buffer.from(header).toString('ascii').slice(0,format==='mp3'?3:4)).toBe({mp3:'ID3',flac:'fLaC',ogg:'OggS'}[format]);
 }
 await page.getByRole('button',{name:'Save local project'}).click();
 await expect(page.getByText('Project saved on this device.')).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:'Open local project'}).click();
 await expect(page.getByRole('heading',{name:'voice.wav'})).toBeVisible();
 expect(errors).toEqual([]);
});
test('mobile workspace and local privacy notice',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Browse files'})).toBeVisible();
 await expect(page.getByText('Your audio never leaves your device. All audio enhancement happens locally in your browser.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});



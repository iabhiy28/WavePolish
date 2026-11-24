import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

function codecAsset():Plugin{
 const require=createRequire(import.meta.url);
 let compressed:Buffer|undefined;
 const asset=()=>compressed??=gzipSync(readFileSync(require.resolve('@ffmpeg/core/wasm')),{level:6});
 return {
   name:'local-codec-asset',
   configureServer(server){
     server.middlewares.use('/codec/ffmpeg-core.gzip.bin',(_,response)=>{
       response.setHeader('Content-Type','application/gzip');response.end(asset());
     });
   },
   generateBundle(){this.emitFile({type:'asset',fileName:'codec/ffmpeg-core.gzip.bin',source:asset()});},
 };
}
export default defineConfig({base:'./', optimizeDeps:{exclude:['@ffmpeg/ffmpeg']}, plugins:[react(), tailwind(), codecAsset()]});



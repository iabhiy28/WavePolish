# AudioPure Studio

AudioPure Studio is a browser-based audio editor and restoration tool. Import or record audio, apply a traditional DSP effects rack, compare the result, and export a copy. Audio and project settings are processed locally.

## Run locally

Use Node.js 22 or 24 and npm.

```sh
npm ci
npm run dev
```

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

## Workflow

1. Import a recording or select **Record** and allow microphone access.
2. Drag across a noise-only section or enter the selection endpoints. Select **Noise Reduction** and capture the profile.
3. Choose a preset or edit the rack. Toggle **Advanced mode** to see every parameter. Drag effects to reorder them, or use the inspector's move buttons.
4. Use **Original**, **Processed**, and **Residual** to audition at the same position. Residual plays the difference signal, including changes from the whole rack.
5. Select **Export**, choose format, sample rate, channels, and range, then render and download.

Space toggles playback outside controls. Ctrl or Command + Z undoes a change. Add Shift to redo. The editing panel can restore the audio as originally decoded after edits. Custom presets are stored on the device. Save or reopen one project, including its audio, on the same browser and origin through the local project controls.

## Architecture

- `src/App.tsx` connects the editor, playback graph, file input, rack, and export controls.
- `src/model.ts` defines parameter ranges, defaults, order, and presets.
- `src/dsp.ts` contains deterministic processing and measurement routines.
- `src/audio.worker.ts` runs the effects pipeline and PCM encoding off the UI thread.
- `src/Visuals.tsx` renders decimated WaveSurfer tracks, a selection-linked spectrogram, and EQ response.
- `public/meter.js` measures peak and RMS during AudioWorklet playback. An analyser supplies the spectrum and fallback metering.
- `src/convert.ts` loads the bundled single-thread FFmpeg.wasm codec when native decoding fails or when a compressed export is requested.

## Static deployment

Run `npm run build` and deploy the entire `dist/` directory to any HTTPS static host. For a free static host, create a Cloudflare Pages Direct Upload project and upload `dist/`. Keep the `assets/` and `codec/` directories beside `index.html`. The compressed WASM is served as an ordinary gzip asset, which the browser decompresses on demand. [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## Compatibility and limits

- Use a recent desktop Chromium, Firefox, or Safari with Web Audio, Web Workers, and WebAssembly. Microphone recording requires HTTPS or localhost. Chromium is the automated browser target. Other browsers and mobile hardware require manual verification.
- Native decoding support varies. The fallback requires DecompressionStream and the same-origin codec asset. Native decoding can resample the file to the AudioContext rate, so the displayed rate describes the decoded working buffer.
- The editor accepts up to 192 MiB of encoded input and rejects a decoded clip above 30 minutes or 192 MiB. Browser decoders, playback, and exports can temporarily allocate several PCM buffers. Long files and compressed codecs can require more memory than shorter native workflows. The 8 GB target is unverified on actual 8 GB hardware.
- Cancellation terminates DSP and FFmpeg workers. Native decoding and OfflineAudioContext rendering finish internally after cancellation, although their results are discarded.
- Processing uses whole decoded PCM buffers, with overlapped FFT frames and stateful sample-by-sample filters. It does not stream very large files from disk.
- Classical processing works best on stationary noise and distinct disturbances. Shared frequency content, speech over speech, music, and room reverberation can remain audible. Strong settings can color or distort speech.
- Normalization uses a sample-peak ceiling, and a ceiling can prevent the requested loudness from being reached. Lossy encoding and sample-rate conversion can introduce new peaks.
- FFmpeg.wasm core is distributed under GPL-2.0-or-later. Review the upstream distribution terms and corresponding source before redistributing the bundled codec. [FFmpeg.wasm core source](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10).

See [DSP.md](DSP.md) for signal-processing details.


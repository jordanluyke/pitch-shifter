# AGENTS.md

## Project

Small Node ESM script that pitch-shifts audio from A440 to A444 (C528). Ratio is `444/440` (~15.67 cents). Duration is preserved via `asetrate` + `atempo`. FFmpeg comes from `ffmpeg-static`. Input extension selects the output: `.mp3` → MP3, `.wav` → WAV, `.m4a` → M4A.

## Commands

```bash
npm i
npm run shift            # input/ → output/; skip existing
npm run shift:overwrite  # replace existing outputs
node shift.js [in] [out]      # optional dirs; --overwrite anywhere
```

## Layout

- `shift.js` — only app code
- `input/` — source MP3s (gitignored)
- `output/` — shifted MP3s (gitignored)

## Conventions

- ESM (`"type": "module"`): use `import`, not `require`.
- Keep the script small. Spawn `ffmpeg-static` directly; no wrapper libs.
- Filter: `aresample=48000,asetrate=48000*(444/440),aresample=48000,atempo=440/444`
- Copy tags with `-map_metadata 0`.
- Encode by extension: MP3 and M4A at `-b:a 320k` (M4A as AAC); WAV as `pcm_s16le`.
- Top-level of the input dir only (`.mp3`, `.wav`, `.m4a`, any case).

## Boundaries

- Do not commit `input/`, `output/`, or `node_modules/`.
- Do not recreate `input/` or `output/` unless missing at runtime.
- Prefer small, focused changes over extra packages or refactors.

# AGENTS.md

## Project

Small Node ESM script that pitch-shifts MP3s from A440 to A444 (C528). Ratio is `444/440` (~15.67 cents). Duration is preserved via `asetrate` + `atempo`. FFmpeg comes from `ffmpeg-static`.

## Commands

```bash
npm i
npm run shift              # input/ → output/
node shift.js [in] [out]   # optional dirs
```

## Layout

- `shift.js` — only app code
- `input/` — source MP3s (gitignored)
- `output/` — shifted MP3s (gitignored)

## Conventions

- ESM (`"type": "module"`): use `import`, not `require`.
- Keep the script small. Spawn `ffmpeg-static` directly; no wrapper libs.
- Filter: `aresample=48000,asetrate=48000*(444/440),aresample=48000,atempo=440/444`
- Encode at `-b:a 320k`, copy tags with `-map_metadata 0`.
- Top-level of the input dir only (`.mp3` / `.MP3`).

## Boundaries

- Do not commit `input/`, `output/`, or `node_modules/`.
- Do not recreate `input/` or `output/` unless missing at runtime.
- Prefer small, focused changes over extra packages or refactors.

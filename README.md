# Pitch Shifter

Pitch-shifts MP3s from A440 to A444 (C528, ~15.67 cents).

## Setup

```bash
npm i
```

Uses `ffmpeg-static` — no system FFmpeg install.

## Usage

Drop `.mp3` files in `input/`, then:

```bash
npm run shift
```

Writes same-named files to `output/`. Optional dirs:

```bash
node shift.js ./songs ./out
```

## Output

- MP3, 320 kbps CBR, 48 kHz
- Channels and tags copied from the source
- Duration unchanged

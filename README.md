# Pitch Shifter

Pitch-shifts audio from A440 to A444 (C528, ~15.67 cents). Output format follows the input extension: MP3, WAV, or M4A.

## Setup

```bash
npm i
```

Uses `ffmpeg-static` — no system FFmpeg install.

## Usage

Drop `.mp3`, `.wav`, or `.m4a` files in `input/`, then:

```bash
npm run shift
```

Writes same-named files to `output/`. Optional dirs:

```bash
node shift.js ./songs ./out
```

## Output

- Same container as the source, 48 kHz
- MP3 and M4A at 320 kbps; WAV as 16-bit PCM
- Channels and tags copied from the source
- Duration unchanged

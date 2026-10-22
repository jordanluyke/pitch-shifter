# Pitch Shifter

Pitch-shifts audio from A440 to A444 (C528, ~15.67 cents). Output format follows the input extension: MP3, WAV, M4A, or MP4.

## Setup

```bash
npm i
```

Uses `ffmpeg-static` — no system FFmpeg install.

## Usage

Drop `.mp3`, `.wav`, `.m4a`, or `.mp4` files in `input/`, then:

```bash
npm run shift
```

Writes same-named files to `output/`. Existing files are left in place. To replace them:

```bash
npm run shift:overwrite
```

Optional dirs:

```bash
node shift.js ./songs ./out
```

## Output

- Same container as the source, audio at 48 kHz
- MP3, M4A, and MP4 audio at 320 kbps; WAV as 16-bit PCM
- MP4 video is copied unchanged
- Channels and tags copied from the source
- Duration unchanged

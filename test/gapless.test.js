import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const shiftScript = path.join(root, 'shift.js')

// 2s at 44.1 kHz. Players that honor iTunSMPB stop after this many output samples.
const SOURCE_SAMPLES = 2 * 44100
const STALE_SMPB = ` 00000000 00000840 000001C0 ${SOURCE_SAMPLES.toString(16).padStart(16, '0')} 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000`

function run(cmd, args) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => {
            stdout += chunk
        })
        child.stderr.on('data', (chunk) => {
            stderr += chunk
        })
        child.on('close', (code) => resolve({ code, stdout, stderr }))
    })
}

async function ffmpeg(args) {
    const result = await run(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args])
    assert.equal(result.code, 0, result.stderr)
}

function metadata(file) {
    return run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'ffmetadata', '-'])
}

function durationSeconds(stderr) {
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    assert.ok(match, stderr)
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

test('mp3 iTunSMPB is dropped and the full shifted audio is kept', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-smpb-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(inputDir)

    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2:sample_rate=44100',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-metadata',
        'title=Keep Me',
        '-metadata',
        'artist=Kept Artist',
        '-metadata',
        `iTunSMPB=${STALE_SMPB}`,
        path.join(inputDir, 'song.mp3'),
    ])

    const result = await run(process.execPath, [shiftScript, inputDir, outputDir])
    assert.equal(result.code, 0, result.stderr)

    const out = path.join(outputDir, 'song.mp3')
    const meta = await metadata(out)
    assert.equal(meta.code, 0, meta.stderr)
    assert.match(meta.stdout, /title=Keep Me/)
    assert.match(meta.stdout, /artist=Kept Artist/)
    assert.doesNotMatch(meta.stdout, /iTunSMPB/i)

    const probed = await run(ffmpegPath, ['-hide_banner', '-i', out, '-f', 'null', '-'])
    assert.match(probed.stderr, /Audio: mp3/)
    assert.match(probed.stderr, /48000 Hz/)
    const duration = durationSeconds(probed.stderr)
    assert.ok(duration > 1.9 && duration < 2.15, `duration ${duration}`)
})

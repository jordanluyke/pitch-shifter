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

function shift(inputDir, outputDir) {
    return run(process.execPath, [shiftScript, inputDir, outputDir])
}

async function ffmpeg(args) {
    const result = await run(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args])
    assert.equal(result.code, 0, result.stderr)
}

function inspect(file) {
    return run(ffmpegPath, ['-hide_banner', '-i', file, '-f', 'null', '-'])
}

async function sourceWithCover(inputDir, filename, audioArgs) {
    const dir = path.dirname(inputDir)
    const cover = path.join(dir, 'cover.jpg')
    await ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', cover])
    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1:sample_rate=44100',
        '-i',
        cover,
        '-map',
        '0:a',
        '-map',
        '1:v',
        ...audioArgs,
        '-c:v',
        'mjpeg',
        '-disposition:v:0',
        'attached_pic',
        path.join(inputDir, filename),
    ])
}

test('m4a album art is copied and audio is shifted', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-art-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(inputDir)
    await sourceWithCover(inputDir, 'song.m4a', ['-c:a', 'aac', '-b:a', '128k'])

    const result = await shift(inputDir, outputDir)
    assert.equal(result.code, 0, result.stderr)

    const out = path.join(outputDir, 'song.m4a')
    assert.ok(fs.statSync(out).size > 0)
    const probed = await inspect(out)
    assert.equal(probed.code, 0, probed.stderr)
    assert.match(probed.stderr, /Audio: aac/)
    assert.match(probed.stderr, /48000 Hz/)
    assert.match(probed.stderr, /Video: mjpeg/)
    assert.match(probed.stderr, /attached pic/)

    const again = await shift(inputDir, outputDir)
    assert.equal(again.code, 0, again.stderr)
    assert.match(again.stdout, /Skipping song\.m4a/)
})

test('mp3 album art is copied and audio is shifted', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-mp3-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(inputDir)
    await sourceWithCover(inputDir, 'song.mp3', ['-c:a', 'libmp3lame', '-b:a', '192k'])

    const result = await shift(inputDir, outputDir)
    assert.equal(result.code, 0, result.stderr)
    const probed = await inspect(path.join(outputDir, 'song.mp3'))
    assert.equal(probed.code, 0, probed.stderr)
    assert.match(probed.stderr, /Audio: mp3/)
    assert.match(probed.stderr, /48000 Hz/)
    assert.match(probed.stderr, /Video: mjpeg/)
    assert.match(probed.stderr, /attached pic/)
})

test('mp3, wav, and plain m4a still shift', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-plain-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(inputDir)
    const wav = path.join(inputDir, 'tone.wav')

    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1:sample_rate=44100',
        '-c:a',
        'pcm_s16le',
        wav,
    ])
    await ffmpeg(['-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(inputDir, 'tone.mp3')])
    await ffmpeg(['-i', wav, '-c:a', 'aac', '-b:a', '128k', path.join(inputDir, 'tone.m4a')])

    const result = await shift(inputDir, outputDir)
    assert.equal(result.code, 0, result.stderr)

    for (const name of ['tone.wav', 'tone.mp3', 'tone.m4a']) {
        const out = path.join(outputDir, name)
        assert.ok(fs.statSync(out).size > 0, name)
        const probed = await inspect(out)
        assert.equal(probed.code, 0, probed.stderr)
        assert.match(probed.stderr, /48000 Hz/, name)
        assert.doesNotMatch(probed.stderr, /Video:/, name)
    }
})

test('a zero-byte output is shifted instead of skipped', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-empty-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(inputDir)
    fs.mkdirSync(outputDir)
    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1:sample_rate=44100',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        path.join(inputDir, 'song.m4a'),
    ])
    const out = path.join(outputDir, 'song.m4a')
    fs.writeFileSync(out, Buffer.alloc(0))

    const result = await shift(inputDir, outputDir)
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Shifting song\.m4a/)
    assert.doesNotMatch(result.stdout, /Skipping song\.m4a/)
    assert.ok(fs.statSync(out).size > 0)
    assert.equal(
        fs.readdirSync(outputDir).filter((name) => name.includes('.tmp')).length,
        0,
    )
})

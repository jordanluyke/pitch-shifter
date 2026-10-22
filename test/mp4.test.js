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

async function ffmpeg(args) {
    const result = await run(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args])
    assert.equal(result.code, 0, result.stderr)
}

function probe(file) {
    return run(ffmpegPath, ['-hide_banner', '-i', file, '-f', 'null', '-'])
}

async function videoMd5(file) {
    const result = await run(ffmpegPath, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        file,
        '-map',
        '0:v:0',
        '-c',
        'copy',
        '-f',
        'md5',
        '-',
    ])
    assert.equal(result.code, 0, result.stderr)
    return result.stdout.trim()
}

test('mp4 with a timecode track shifts and does not abort the batch', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-mp4-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(inputDir)

    const srt = path.join(dir, 'subs.srt')
    fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:01,000\nHello\n')

    const timedSrc = path.join(inputDir, 'a-timed.mp4')
    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=160x120:rate=30',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100:duration=1',
        '-i',
        srt,
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-map',
        '2:s',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-c:s',
        'mov_text',
        '-timecode',
        '01:02:03:04',
        '-shortest',
        timedSrc,
    ])
    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=160x120:rate=30',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100:duration=1',
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        path.join(inputDir, 'b-plain.mp4'),
    ])

    const result = await run(process.execPath, [shiftScript, inputDir, outputDir])
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Done\. 2 file\(s\) written/)

    const timed = path.join(outputDir, 'a-timed.mp4')
    const plain = path.join(outputDir, 'b-plain.mp4')
    assert.ok(fs.statSync(timed).size > 0)
    assert.ok(fs.statSync(plain).size > 0)

    const timedProbe = await probe(timed)
    assert.equal(timedProbe.code, 0, timedProbe.stderr)
    assert.match(timedProbe.stderr, /Video: h264/)
    assert.match(timedProbe.stderr, /Audio: aac/)
    assert.match(timedProbe.stderr, /48000 Hz/)
    assert.match(timedProbe.stderr, /timecode\s*:\s*01:02:03:04/)
    assert.match(timedProbe.stderr, /Subtitle: mov_text/)
    assert.equal(await videoMd5(timed), await videoMd5(timedSrc))

    const plainProbe = await probe(plain)
    assert.equal(plainProbe.code, 0, plainProbe.stderr)
    assert.match(plainProbe.stderr, /Video: h264/)
    assert.match(plainProbe.stderr, /48000 Hz/)
})

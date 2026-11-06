import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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

function shift(inputDir, outputDir, extra = []) {
    return run(process.execPath, [shiftScript, ...extra, inputDir, outputDir])
}

async function ffmpeg(args) {
    const result = await run(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args])
    assert.equal(result.code, 0, result.stderr)
}

function hash(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function probe(file) {
    return run(ffmpegPath, ['-hide_banner', '-i', file, '-f', 'null', '-'])
}

function durationSeconds(stderr) {
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    assert.ok(match, stderr)
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

async function sourceMp3(dir, name, seconds) {
    fs.mkdirSync(dir, { recursive: true })
    await ffmpeg([
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${seconds}:sample_rate=44100`,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '320k',
        path.join(dir, name),
    ])
}

test('overwrite of a hard-linked output keeps the full source', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-hl-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(outputDir)
    await sourceMp3(inputDir, 'song.mp3', 10)
    const input = path.join(inputDir, 'song.mp3')
    const output = path.join(outputDir, 'song.mp3')
    fs.linkSync(input, output)
    const before = hash(input)

    const result = await shift(inputDir, outputDir, ['--overwrite'])
    assert.equal(result.code, 0, result.stderr)
    assert.equal(hash(input), before)

    const inputProbe = await probe(input)
    assert.match(inputProbe.stderr, /44100 Hz/)
    const outputProbe = await probe(output)
    assert.equal(outputProbe.code, 0, outputProbe.stderr)
    assert.match(outputProbe.stderr, /48000 Hz/)
    const duration = durationSeconds(outputProbe.stderr)
    assert.ok(duration > 8 && duration < 12, `duration ${duration}`)
    assert.notEqual(fs.statSync(input).ino, fs.statSync(output).ino)
    assert.equal(
        fs.readdirSync(outputDir).filter((name) => name.includes('.tmp')).length,
        0,
    )
})

test('overwrite through a symlink does not truncate the source', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-sy-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(outputDir)
    await sourceMp3(inputDir, 'song.mp3', 10)
    const input = path.join(inputDir, 'song.mp3')
    const output = path.join(outputDir, 'song.mp3')
    fs.symlinkSync(input, output)
    const before = hash(input)

    const result = await shift(inputDir, outputDir, ['--overwrite'])
    assert.equal(result.code, 0, result.stderr)
    assert.equal(hash(input), before)
    assert.equal(fs.lstatSync(output).isSymbolicLink(), false)

    const outputProbe = await probe(output)
    assert.equal(outputProbe.code, 0, outputProbe.stderr)
    assert.match(outputProbe.stderr, /48000 Hz/)
    const duration = durationSeconds(outputProbe.stderr)
    assert.ok(duration > 8 && duration < 12, `duration ${duration}`)
})

test('overwrite in the same directory replaces the file in full', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-same-'))
    await sourceMp3(dir, 'song.mp3', 10)

    const result = await shift(dir, dir, ['--overwrite'])
    assert.equal(result.code, 0, result.stderr)

    const output = path.join(dir, 'song.mp3')
    const probed = await probe(output)
    assert.equal(probed.code, 0, probed.stderr)
    assert.match(probed.stderr, /48000 Hz/)
    const duration = durationSeconds(probed.stderr)
    assert.ok(duration > 8 && duration < 12, `duration ${duration}`)
    assert.equal(
        fs.readdirSync(dir).filter((name) => name.includes('.tmp')).length,
        0,
    )
})

test('without overwrite, an existing hard link is left untouched', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-skip-'))
    const inputDir = path.join(dir, 'in')
    const outputDir = path.join(dir, 'out')
    fs.mkdirSync(outputDir)
    await sourceMp3(inputDir, 'song.mp3', 2)
    const input = path.join(inputDir, 'song.mp3')
    const output = path.join(outputDir, 'song.mp3')
    fs.linkSync(input, output)
    const before = hash(input)

    const result = await shift(inputDir, outputDir)
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Skipping song\.mp3/)
    assert.equal(hash(input), before)
    assert.equal(fs.statSync(input).ino, fs.statSync(output).ino)
})

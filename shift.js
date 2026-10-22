import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import ffmpegPath from 'ffmpeg-static'

const RATIO = 444 / 440
const FILTER = `aresample=48000,asetrate=48000*${RATIO},aresample=48000,atempo=${1 / RATIO}`

const ENCODE = {
    '.mp3': ['-b:a', '320k'],
    '.wav': ['-c:a', 'pcm_s16le'],
    '.m4a': ['-c:a', 'aac', '-b:a', '320k'],
    // Copy video, audio, and subtitles, but not input data streams. A timecode
    // (tmcd) or mebx track is codec "none", and the mp4 muxer rejects that copy.
    '.mp4': ['-map', '0', '-dn', '-c', 'copy', '-c:a', 'aac', '-b:a', '320k'],
}

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const overwrite = args.includes('--overwrite')
const dirs = args.filter((arg) => arg !== '--overwrite')
const inputDir = path.resolve(dirs[0] || 'input')
const outputDir = path.resolve(dirs[1] || 'output')

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'inherit'] })
        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`ffmpeg exited with code ${code}`))
        })
    })
}

async function main() {
    if (!fs.existsSync(inputDir)) {
        console.error(`Input folder not found: ${inputDir}`)
        process.exit(1)
    }

    fs.mkdirSync(outputDir, { recursive: true })

    const files = fs
        .readdirSync(inputDir)
        .filter((name) => ENCODE[path.extname(name).toLowerCase()])
        .sort()

    if (files.length === 0) {
        console.log(`No MP3, WAV, M4A, or MP4 files in ${inputDir}`)
        return
    }

    let written = 0

    for (const name of files) {
        const inputPath = path.join(inputDir, name)
        const outputPath = path.join(outputDir, name)
        if (!overwrite && fs.existsSync(outputPath)) {
            console.log(`Skipping ${name} (already exists)`)
            continue
        }
        const encode = ENCODE[path.extname(name).toLowerCase()]
        console.log(`Shifting ${name}...`)
        await runFfmpeg([
            '-y',
            '-i',
            inputPath,
            '-map_metadata',
            '0',
            '-af',
            FILTER,
            ...encode,
            outputPath,
        ])
        console.log(`Wrote ${outputPath}`)
        written++
    }

    console.log(`Done. ${written} file(s) written to ${outputDir}`)
}

main().catch((err) => {
    console.error(err.message)
    process.exit(1)
})

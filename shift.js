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
}

const inputDir = path.resolve(process.argv[2] || 'input')
const outputDir = path.resolve(process.argv[3] || 'output')

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
        console.log(`No MP3, WAV, or M4A files in ${inputDir}`)
        return
    }

    for (const name of files) {
        const inputPath = path.join(inputDir, name)
        const outputPath = path.join(outputDir, name)
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
    }

    console.log(`Done. ${files.length} file(s) written to ${outputDir}`)
}

main().catch((err) => {
    console.error(err.message)
    process.exit(1)
})

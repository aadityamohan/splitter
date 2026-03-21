import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'public', 'favicon.svg')
const tmpPath = join(tmpdir(), 'splitter-icon-base.png')

// Step 1: Render SVG → full-size PNG on disk
const meta = await sharp(svgPath).png().toFile(tmpPath)
const { width: W, height: H } = meta
console.log(`SVG rendered at ${W}×${H}`)

// Center-square crop at the shorter dimension
const side = Math.min(W, H)
const left = Math.floor((W - side) / 2)
const top  = Math.floor((H - side) / 2)

for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  await sharp(tmpPath)
    .extract({ left, top, width: side, height: side })
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', name))
  console.log(`✓  public/${name}`)
}

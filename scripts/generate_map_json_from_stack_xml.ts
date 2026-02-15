import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

import { MAP_ICON_INDEX } from '../packs/ootmm/src/data/maps/mapIconIndex.ts'
import type { MapDef } from '../packs/ootmm/src/data/maps/types.ts'

type XmlTag = {
  kind: 'stack' | 'layer'
  closing: boolean
  selfClosing: boolean
  attrs: Record<string, string>
}

type LayerEntry = {
  path: string[]
  layerName: string
  src: string
  x: number
  y: number
}

type LayerCandidate = LayerEntry & {
  visible: boolean
}

type MapMeta = {
  id: string
  title: string
  image: string
}

const DEFAULT_MARKER_CENTER_OFFSET = 8

const ICON_SET = new Set<string>(MAP_ICON_INDEX)
const FALLBACK_ICON = ICON_SET.has('collectible') ? 'collectible' : MAP_ICON_INDEX[0]

const HEURISTIC_RULES: Array<{ icon: string; terms: string[]; weight: number }> = [
  { icon: 'gold_skulltula', terms: ['skulltula', 'skull'], weight: 90 },
  { icon: 'business_scrub_oot', terms: ['scrub', 'scrubs'], weight: 85 },
  { icon: 'big_fairy_spot', terms: ['big fairy'], weight: 85 },
  { icon: 'fairy', terms: ['fairy'], weight: 80 },
  { icon: 'butterfly', terms: ['butterfly'], weight: 80 },
  { icon: 'soft_soil', terms: ['soil', 'soils'], weight: 80 },
  { icon: 'song', terms: ['song', 'songs'], weight: 75 },
  { icon: 'shop', terms: ['shop'], weight: 75 },
  { icon: 'cow', terms: ['cow'], weight: 75 },
  { icon: 'pot', terms: ['pot', 'pots'], weight: 75 },
  { icon: 'beehive', terms: ['beehive', 'beehives'], weight: 75 },
  { icon: 'grass', terms: ['grass'], weight: 70 },
  { icon: 'green_rupee', terms: ['rupee', 'rupees'], weight: 70 },
  { icon: 'heart', terms: ['heart', 'hearts'], weight: 70 },
  { icon: 'wonder_item_random', terms: ['wonder'], weight: 70 },
  { icon: 'rock', terms: ['rock', 'rocks'], weight: 68 },
  { icon: 'npc', terms: ['gossip'], weight: 68 },
  { icon: 'overworld_entrance', terms: ['entrance', 'entrances'], weight: 66 },
  { icon: 'interior_entrance', terms: ['interior', 'int.'], weight: 64 },
  { icon: 'chest', terms: ['check', 'checks', 'chest', 'chests'], weight: 62 },
]

type CliArgs = {
  inputOra: string
  markerCenterOffset: number
}

type ZipEntry = {
  name: string
  compressedSize: number
  uncompressedSize: number
  compressionMethod: number
  localHeaderOffset: number
}

function usageMessage(): string {
  return [
    'Usage:',
    '  node scripts/generate_map_json_from_stack_xml.ts <file.ora> [--marker-center-offset <number>]',
  ].join('\n')
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: {
    inputOra: string | null
    markerCenterOffset: number
  } = {
    inputOra: null,
    markerCenterOffset: DEFAULT_MARKER_CENTER_OFFSET,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (!arg.startsWith('--')) {
      if (args.inputOra) {
        throw new Error(`Unexpected extra positional argument: ${arg}\n${usageMessage()}`)
      }
      args.inputOra = path.resolve(arg)
      continue
    }

    if (arg === '--marker-center-offset' && next) {
      const parsed = Number(next)
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid --marker-center-offset: ${next}`)
      }
      args.markerCenterOffset = parsed
      i += 1
      continue
    }

    if (arg === '--marker-center-offset') {
      throw new Error(`Missing value for --marker-center-offset.\n${usageMessage()}`)
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n${usageMessage()}`)
    }
  }

  if (!args.inputOra) {
    throw new Error(`Input .ora file is required.\n${usageMessage()}`)
  }

  if (path.extname(args.inputOra).toLowerCase() !== '.ora') {
    throw new Error(`Input must be a .ora file: ${args.inputOra}`)
  }

  return {
    inputOra: args.inputOra,
    markerCenterOffset: args.markerCenterOffset,
  }
}

function normalizeZipEntryName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function decodeZipName(nameBytes: Buffer): string {
  return new TextDecoder('utf-8').decode(nameBytes)
}

function parseZipEntries(zipBuffer: Buffer): ZipEntry[] {
  const EOCD_SIGNATURE = 0x06054b50
  const CENTRAL_DIR_SIGNATURE = 0x02014b50
  const minEocdSize = 22
  const scanStart = Math.max(0, zipBuffer.length - 0x10000 - minEocdSize)

  let eocdOffset = -1
  for (let i = zipBuffer.length - minEocdSize; i >= scanStart; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Could not locate ZIP end-of-central-directory record')
  }

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10)
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16)

  if (entryCount === 0xffff || centralDirOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported')
  }

  const entries: ZipEntry[] = []
  let cursor = centralDirOffset

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > zipBuffer.length) {
      throw new Error('Central directory entry exceeds archive length')
    }

    if (zipBuffer.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Invalid central directory entry at offset ${cursor}`)
    }

    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10)
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20)
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24)
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28)
    const extraFieldLength = zipBuffer.readUInt16LE(cursor + 30)
    const fileCommentLength = zipBuffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42)

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error('ZIP64 archives are not supported')
    }

    const nameStart = cursor + 46
    const nameEnd = nameStart + fileNameLength
    if (nameEnd > zipBuffer.length) {
      throw new Error('ZIP entry filename exceeds archive length')
    }

    const rawName = zipBuffer.subarray(nameStart, nameEnd)
    entries.push({
      name: normalizeZipEntryName(decodeZipName(rawName)),
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    })

    cursor = nameEnd + extraFieldLength + fileCommentLength
  }

  return entries
}

function extractZipEntry(zipBuffer: Buffer, entry: ZipEntry): Buffer {
  const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
  const localHeaderOffset = entry.localHeaderOffset
  if (localHeaderOffset + 30 > zipBuffer.length) {
    throw new Error(`Local file header exceeds archive length for ${entry.name}`)
  }

  if (zipBuffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid local file header for ${entry.name}`)
  }

  const fileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26)
  const extraFieldLength = zipBuffer.readUInt16LE(localHeaderOffset + 28)
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength
  const dataEnd = dataStart + entry.compressedSize

  if (dataEnd > zipBuffer.length) {
    throw new Error(`ZIP entry data exceeds archive length for ${entry.name}`)
  }

  const compressedData = zipBuffer.subarray(dataStart, dataEnd)
  if (entry.compressionMethod === 0) {
    return Buffer.from(compressedData)
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressedData)
  }

  throw new Error(
    `Unsupported compression method ${entry.compressionMethod} for ${entry.name}; expected stored(0) or deflate(8)`,
  )
}

function findRootStackXmlEntry(entries: ZipEntry[]): ZipEntry | null {
  return (
    entries.find((entry) => {
      const normalizedName = normalizeZipEntryName(entry.name)
      return !normalizedName.includes('/') && normalizedName.toLowerCase() === 'stack.xml'
    }) ?? null
  )
}

function findLargestPngEntry(entries: ZipEntry[]): ZipEntry | null {
  const pngEntries = entries.filter((entry) => {
    const lowerName = entry.name.toLowerCase()
    if (!lowerName.startsWith('data/')) return false
    if (!lowerName.endsWith('.png')) return false
    return path.basename(lowerName) !== 'mergedimage.png'
  })
  if (pngEntries.length === 0) {
    return null
  }

  return pngEntries.reduce((largest, current) => {
    if (current.uncompressedSize > largest.uncompressedSize) return current
    if (current.uncompressedSize < largest.uncompressedSize) return largest
    return current.name.localeCompare(largest.name) < 0 ? current : largest
  })
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([A-Za-z_:][-A-Za-z0-9_:.]*)=(['"])(.*?)\2/g

  for (const match of raw.matchAll(attrRe)) {
    const key = match[1]
    const value = match[3]
    attrs[key] = value
  }

  return attrs
}

function parseXmlTags(xml: string): XmlTag[] {
  const tags: XmlTag[] = []
  const re = /<\s*(\/?)\s*(stack|layer)\b([^>]*?)(\/?)\s*>/g

  for (const match of xml.matchAll(re)) {
    const closing = match[1] === '/'
    const kind = match[2] as 'stack' | 'layer'
    const attrsRaw = match[3] ?? ''
    const selfClosing = !closing && (match[4] === '/' || /\/\s*$/.test(attrsRaw))

    tags.push({
      kind,
      closing,
      selfClosing,
      attrs: parseAttributes(attrsRaw),
    })
  }

  return tags
}

function parseImageSize(xml: string): { width: number; height: number } {
  const imageMatch = xml.match(/<image\b([^>]*)>/)
  if (!imageMatch) {
    throw new Error('Could not find <image ...> root tag in XML')
  }

  const attrs = parseAttributes(imageMatch[1] ?? '')
  const width = Number(attrs.w)
  const height = Number(attrs.h)

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid root image size attributes: w=${attrs.w ?? '?'} h=${attrs.h ?? '?'}`)
  }

  return { width, height }
}

function isVisible(attrs: Record<string, string>): boolean {
  return (attrs.visibility ?? 'visible').toLowerCase() !== 'hidden'
}

function shouldSkipLayer(layerName: string, src: string): boolean {
  const normalizedName = normalizeText(layerName)
  const normalizedSrc = normalizeText(src)

  return (
    normalizedName.startsWith('map ') ||
    normalizedName.includes(' bg') ||
    normalizedName.endsWith('bg') ||
    normalizedName === 'bg' ||
    normalizedSrc.endsWith('/001-001.png') ||
    normalizedSrc.endsWith('/001-001-015-013.png')
  )
}

function pathContainsInteriorStack(pathSegments: string[]): boolean {
  return pathSegments.some((segment) => /int\.$/i.test(segment.trim()))
}

function parseLayers(xml: string): LayerEntry[] {
  const tags = parseXmlTags(xml)
  const stackPath: string[] = []
  const stackVisibility: boolean[] = []
  const layers: LayerCandidate[] = []

  for (const tag of tags) {
    if (tag.kind === 'stack') {
      if (tag.closing) {
        stackPath.pop()
        stackVisibility.pop()
      } else {
        const name = tag.attrs.name?.trim() || 'unnamed_stack'
        const parentVisible = stackVisibility.at(-1) ?? true
        const visible = parentVisible && isVisible(tag.attrs)
        stackPath.push(name)
        stackVisibility.push(visible)
        if (tag.selfClosing) {
          stackPath.pop()
          stackVisibility.pop()
        }
      }
      continue
    }

    if (tag.kind !== 'layer' || tag.closing) {
      continue
    }

    const layerName = tag.attrs.name?.trim() || 'unnamed_layer'
    const src = tag.attrs.src?.trim() || ''
    const x = Number(tag.attrs.x)
    const y = Number(tag.attrs.y)
    const parentVisible = stackVisibility.at(-1) ?? true
    const visible = parentVisible && isVisible(tag.attrs)

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue
    }

    if (shouldSkipLayer(layerName, src)) {
      continue
    }

    if (pathContainsInteriorStack(stackPath)) {
      continue
    }

    layers.push({
      path: [...stackPath],
      layerName,
      src,
      x,
      y,
      visible,
    })
  }

  const visibleLayers = layers.filter((layer) => layer.visible)
  const selectedLayers = visibleLayers.length > 0 ? visibleLayers : layers

  return selectedLayers.map(({ path, layerName, src, x, y }) => ({
    path,
    layerName,
    src,
    x,
    y,
  }))
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/\\]+/g, ' ')
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value)
  if (!normalized) return []
  return normalized.split(' ').filter((part) => part.length > 0)
}

function guessIcon(layer: LayerEntry): string {
  const context = normalizeText([...layer.path, layer.layerName, layer.src].join(' '))

  let bestIcon = FALLBACK_ICON
  let bestScore = -1

  for (const rule of HEURISTIC_RULES) {
    if (!ICON_SET.has(rule.icon)) continue
    let score = 0
    for (const term of rule.terms) {
      if (context.includes(term)) {
        score += rule.weight
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIcon = rule.icon
    }
  }

  if (bestScore > 0) {
    return bestIcon
  }

  const contextTokens = new Set(tokenize(context))
  let overlapBestIcon = FALLBACK_ICON
  let overlapBestScore = 0

  for (const icon of MAP_ICON_INDEX) {
    const iconTokens = tokenize(icon)
    const overlap = iconTokens.reduce((count, token) => count + Number(contextTokens.has(token)), 0)
    if (overlap > overlapBestScore) {
      overlapBestScore = overlap
      overlapBestIcon = icon
    }
  }

  return overlapBestScore > 0 ? overlapBestIcon : FALLBACK_ICON
}

function makePlaceholderCode(layer: LayerEntry, index: number): string {
  const pathText = layer.path.join(' > ')
  const srcTail = layer.src.split('/').at(-1) ?? layer.src
  return `TODO KF ${String(index).padStart(3, '0')} :: ${pathText} :: ${layer.layerName} :: ${srcTail}`
}

function toTitleCaseWord(word: string, index: number): string {
  const normalized = word.trim()
  if (!normalized) return ''
  if (index === 0 && ['oot', 'mm', 'ootmm'].includes(normalized.toLowerCase())) {
    return normalized.toUpperCase()
  }
  if (/^[a-z]{1,4}$/.test(normalized) && index === 0) {
    return normalized.toUpperCase()
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

function inferMapMetaFromBaseName(baseName: string): MapMeta {
  const titleWords = baseName
    .split('_')
    .map((word, index) => toTitleCaseWord(word, index))
    .filter((word) => word.length > 0)

  return {
    id: baseName,
    image: baseName,
    title: titleWords.join(' '),
  }
}

function toMapDef(
  meta: MapMeta,
  width: number,
  height: number,
  layers: LayerEntry[],
  markerCenterOffset: number,
): MapDef {
  return {
    id: meta.id,
    title: meta.title,
    image: meta.image,
    width,
    height,
    markers: layers.map((layer, index) => ({
      coords: [layer.x + markerCenterOffset, layer.y + markerCenterOffset],
      image: guessIcon(layer),
      codes: makePlaceholderCode(layer, index + 1),
    })),
  }
}

async function generate(): Promise<void> {
  const { inputOra, markerCenterOffset } = parseCliArgs(process.argv.slice(2))
  const mapBaseName = path.basename(inputOra, path.extname(inputOra))
  const outputJsonPath = path.resolve(`packs/ootmm/src/data/maps/${mapBaseName}.json`)
  const outputImagePath = path.resolve(`public/images/maps/${mapBaseName}.png`)

  const oraBytes = await readFile(inputOra)
  const zipEntries = parseZipEntries(oraBytes)
  const stackXmlEntry = findRootStackXmlEntry(zipEntries)
  if (!stackXmlEntry) {
    throw new Error(`Could not find root-level stack.xml in ${path.basename(inputOra)}`)
  }

  const largestPngEntry = findLargestPngEntry(zipEntries)
  if (!largestPngEntry) {
    throw new Error(`Could not find any .png files in ${path.basename(inputOra)}`)
  }

  const xml = extractZipEntry(oraBytes, stackXmlEntry).toString('utf8')
  const { width, height } = parseImageSize(xml)
  const layers = parseLayers(xml)
  const mapMeta = inferMapMetaFromBaseName(mapBaseName)

  const mapDef = toMapDef(mapMeta, width, height, layers, markerCenterOffset)
  const mapImageBytes = extractZipEntry(oraBytes, largestPngEntry)

  await mkdir(path.dirname(outputJsonPath), { recursive: true })
  await mkdir(path.dirname(outputImagePath), { recursive: true })
  await writeFile(outputImagePath, mapImageBytes)
  await writeFile(outputJsonPath, `${JSON.stringify(mapDef, null, 2)}\n`, 'utf8')

  const iconCounts = new Map<string, number>()
  mapDef.markers.forEach((marker) => {
    iconCounts.set(marker.image, (iconCounts.get(marker.image) ?? 0) + 1)
  })

  const iconSummary = [...iconCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([icon, count]) => `${icon}:${count}`)
    .join(', ')

  console.log(
    `Generated ${mapDef.markers.length} markers -> ${path.relative(process.cwd(), outputJsonPath)}`,
  )
  console.log(`Image size: ${mapDef.width}x${mapDef.height}`)
  console.log(
    `Selected PNG: ${largestPngEntry.name} (${largestPngEntry.uncompressedSize} bytes) -> ${path.relative(
      process.cwd(),
      outputImagePath,
    )}`,
  )
  console.log(`Icon distribution: ${iconSummary}`)
}

generate().catch((error) => {
  console.error('Failed to generate map JSON from .ora:', error)
  process.exitCode = 1
})

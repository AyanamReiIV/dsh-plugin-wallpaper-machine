/**
 * dsh-plugin-wallpaper-machine — host half.
 *
 * Finds the WallpaperMachine library on this Mac, exposes it as a small
 * same-origin HTTP API, and serves the wallpaper payloads (scene.pkg, video,
 * images) plus the WebWallGL live-render page used by the browser half.
 *
 * Everything is read-only: this plugin never writes to the WallpaperMachine
 * application support folder or to the user's library.
 */
import { createReadStream, existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root, for serving our own scene-live page and the vendored engine. */
const PKG_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** HTTP mount point; must match the client half. */
export const BASE_PATH = '/wallpaper-machine'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi'])
const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pkg': 'application/octet-stream',
  '.tex': 'application/octet-stream',
  '.dds': 'application/octet-stream',
}))

const CACHE_CONTROL_SELF = 'public, max-age=31536000, immutable'
const CACHE_CONTROL_MEDIA = 'no-cache'

/**
 * Library resolution for WallpaperMachine.
 *
 * The app keeps its data under `WALLPAPER_MACHINE_HOME` or
 * `~/Library/Application Support/WallpaperMachine`. `StorageLocation.json`
 * may point at a user-moved library; it is valid only while the target
 * contains `.WallpaperMachineStorage` with the matching id.
 * @param {string} [override] - explicit library directory from plugin config.
 * @returns {{ root: string, source: 'config'|'custom'|'default', support: string }}
 */
export function resolveLibraryRoot(override) {
  const support = process.env.WALLPAPER_MACHINE_HOME
    || join(homedir(), 'Library', 'Application Support', 'WallpaperMachine')
  if (typeof override === 'string' && override.trim() !== '') {
    return { root: resolve(override), source: 'config', support }
  }
  const location = readJson(join(support, 'StorageLocation.json'))
  if (location && typeof location.path === 'string' && location.path !== '' && typeof location.id === 'string') {
    const candidate = join(location.path, 'Library')
    const marker = readText(join(candidate, '.WallpaperMachineStorage'))
    if (marker !== null && marker.trim() === location.id) {
      return { root: candidate, source: 'custom', support }
    }
  }
  return { root: join(support, 'Library'), source: 'default', support }
}

/**
 * Enumerate the library. Tolerant by design: a broken project.json never
 * hides the rest of the collection.
 * @param {string} root - library directory.
 * @returns {{ root: string, exists: boolean, items: object[] }}
 */
export function scanLibrary(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return { root, exists: false, items: [] }
  }
  const items = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = join(root, entry.name)
    const item = readEntry(dir, entry.name)
    if (item) items.push(item)
  }
  items.sort((a, b) => b.mtime - a.mtime || a.title.localeCompare(b.title, 'zh-CN'))
  return { root, exists: true, items }
}

/**
 * Build one inventory row from a library entry directory.
 * @param {string} dir - entry directory.
 * @param {string} id - entry id (directory name).
 * @returns {object|null}
 */
function readEntry(dir, id) {
  let files
  try {
    files = readdirSync(dir)
  } catch {
    return null
  }
  const fileSet = new Set(files)
  const project = readJson(join(dir, 'project.json')) || {}
  const declared = typeof project.file === 'string' ? project.file : ''
  const declaredAbs = declared !== '' ? safeJoin(dir, declared) : null
  const declaredExists = declaredAbs !== null && isFile(declaredAbs)

  const pkg = fileSet.has('scene.pkg') ? 'scene.pkg' : null
  const videoFile = firstWithExt(files, VIDEO_EXT)
  const imageFile = firstWithExt(files, IMAGE_EXT)
  const htmlFile = firstWithExt(files, new Set(['.html', '.htm']))
  const sceneJson = fileSet.has('scene.json') ? 'scene.json' : null

  const declaredExt = declared ? extname(declared).toLowerCase() : ''
  const type = String(project.type || '').toLowerCase()

  let kind = 'unknown'
  let main = null
  if (type.includes('scene') || pkg !== null || (sceneJson !== null && declaredExt === '.json')) {
    kind = 'scene'
    main = pkg ?? (declaredExists && declaredExt === '.json' ? declared : sceneJson)
  } else if (type.includes('video') || VIDEO_EXT.has(declaredExt)) {
    kind = 'video'
    main = declaredExists && VIDEO_EXT.has(declaredExt) ? declared : videoFile
  } else if (type.includes('web') || declaredExt === '.html' || declaredExt === '.htm') {
    kind = 'web'
    main = declaredExists ? declared : htmlFile
  } else if (type.includes('image') || type.includes('picture') || IMAGE_EXT.has(declaredExt)) {
    kind = 'image'
    main = declaredExists && IMAGE_EXT.has(declaredExt) ? declared : imageFile
  } else if (declaredExists) {
    if (IMAGE_EXT.has(declaredExt)) { kind = 'image'; main = declared }
    else if (VIDEO_EXT.has(declaredExt)) { kind = 'video'; main = declared }
    else if (declaredExt === '.html' || declaredExt === '.htm') { kind = 'web'; main = declared }
  }
  // `main` is relative to the entry directory, so only direct children are
  // accepted (declared paths may legally contain a subdirectory).
  if (main !== null && !isFile(join(dir, main))) main = null

  const previewName = typeof project.preview === 'string' && isFile(join(dir, project.preview))
    ? project.preview
    : firstWithExt(files.filter(name => name.startsWith('preview')), IMAGE_EXT) ?? imageFile ?? null

  // A directory with neither a playable payload nor a preview has nothing to
  // show; dropping it keeps the picker honest about broken downloads.
  if (main === null && previewName === null) return null

  const mainAbs = main !== null ? join(dir, main) : null
  let stat = null
  try { stat = statSync(mainAbs ?? join(dir, 'project.json')) } catch { /* keep null */ }
  const projectStat = statSafe(join(dir, 'project.json'))

  const enc = encodeURIComponent
  const fileUrl = (rel) => `${BASE_PATH}/files/${enc(id)}/${String(rel).split('/').map(enc).join('/')}`
  const previewUrl = previewName !== null ? fileUrl(previewName) : null

  return {
    id,
    title: typeof project.title === 'string' && project.title.trim() !== '' ? project.title.trim() : id,
    kind,
    type: typeof project.type === 'string' ? project.type : kind,
    description: typeof project.description === 'string' ? project.description : '',
    tags: Array.isArray(project.tags) ? project.tags.filter(tag => typeof tag === 'string').slice(0, 24) : [],
    contentRating: typeof project.contentrating === 'string' ? project.contentrating : '',
    file: main,
    pkg: pkg,
    preview: previewName,
    size: stat ? stat.size : 0,
    mtime: projectStat ? projectStat.mtimeMs : (stat ? stat.mtimeMs : 0),
    urls: {
      preview: previewUrl,
      media: kind === 'video' || kind === 'image' || kind === 'web' ? (main !== null ? fileUrl(main) : null) : null,
      scene: kind === 'scene' ? `${BASE_PATH}/scene-live/?id=${enc(id)}${previewUrl ? `&poster=${enc(previewUrl)}` : ''}` : null,
    },
  }
}

/**
 * Create the HTTP handler used by the Cordis row. Exported separately so the
 * dev server in `test/serve.mjs` can exercise the exact production routes.
 * @param {{ libraryRoot?: string }} [options]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createWallpaperHandler(options = {}) {
  let cache = null
  let cacheAt = 0
  const ttlMs = 2000
  const selfCache = new Map()

  const library = (force = false) => {
    const now = Date.now()
    if (!force && cache !== null && now - cacheAt < ttlMs) return cache
    const resolved = resolveLibraryRoot(options.libraryRoot)
    const scanned = scanLibrary(resolved.root)
    cache = {
      root: scanned.root,
      support: resolved.support,
      source: resolved.source,
      exists: scanned.exists,
      count: scanned.items.length,
      items: scanned.items,
      scannedAt: now,
    }
    cacheAt = now
    return cache
  }

  return async function handler(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = url.pathname
      if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
        redirect(res, `${BASE_PATH}/scene-live/`)
        return
      }
      if (!pathname.startsWith(`${BASE_PATH}/`)) {
        notFound(res)
        return
      }
      const rest = pathname.slice(BASE_PATH.length)

      if (rest === '/api/library') {
        const libraryData = library(url.searchParams.has('refresh'))
        sendJson(res, {
          ok: true,
          ...libraryData,
        })
        return
      }

      if (rest === '/api/status') {
        const libraryData = library(false)
        sendJson(res, {
          ok: true,
          root: libraryData.root,
          support: libraryData.support,
          source: libraryData.source,
          exists: libraryData.exists,
          count: libraryData.count,
        })
        return
      }

      if (rest === '/scene-live' || rest === '/scene-live/' || rest === '/scene-live/index.html') {
        sendSelf(res, 'scene-live/index.html', 'text/html; charset=utf-8', CACHE_CONTROL_MEDIA)
        return
      }
      if (rest === '/scene-live/renderer.js') {
        sendSelf(res, 'scene-live/renderer.js', 'text/javascript; charset=utf-8', CACHE_CONTROL_MEDIA)
        return
      }
      if (rest === '/engine/webwallgl.global.min.js') {
        sendSelf(res, 'vendor/webwallgl/webwallgl.global.min.js', 'text/javascript; charset=utf-8', CACHE_CONTROL_SELF)
        return
      }

      if (rest.startsWith('/files/')) {
        serveLibraryFile(req, res, rest.slice('/files/'.length), library(false).root)
        return
      }

      notFound(res)
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      }
      if (!res.writableEnded) res.end('wallpaper-machine: internal error')
      void error
    }
  }

  function sendSelf(res, rel, type, cacheControl) {
    let buf = selfCache.get(rel)
    if (buf === undefined) {
      try {
        buf = readFileSync(join(PKG_ROOT, rel))
      } catch {
        notFound(res)
        return
      }
      selfCache.set(rel, buf)
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': cacheControl,
    })
    if (res.req?.method === 'HEAD') res.end()
    else res.end(buf)
  }
}

/**
 * Serve one library file with Range support. Paths are fenced to the resolved
 * entry directory, so a crafted URL cannot escape the library.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} rawRest - path after `/files/`.
 * @param {string} root - library root.
 */
function serveLibraryFile(req, res, rawRest, root) {
  let segments
  try {
    segments = rawRest.split('/').map(segment => decodeURIComponent(segment))
  } catch {
    badRequest(res, 'invalid path encoding')
    return
  }
  if (segments.length < 2) {
    notFound(res)
    return
  }
  const [id, ...relParts] = segments
  if (id === '' || id === '.' || id === '..' || relParts.some(part => part === '' || part === '.' || part === '..' || part.includes('\0'))) {
    notFound(res)
    return
  }
  let dir
  try {
    dir = realpathSync(join(root, id))
    if (!dir.startsWith(realpathSync(root) + sep)) {
      notFound(res)
      return
    }
  } catch {
    notFound(res)
    return
  }
  if (!isDir(dir)) {
    notFound(res)
    return
  }
  const target = join(dir, ...relParts)
  const normalizedTarget = normalize(target)
  if (!normalizedTarget.startsWith(dir + sep)) {
    notFound(res)
    return
  }
  let real
  try {
    real = realpathSync(normalizedTarget)
    if (!real.startsWith(dir + sep)) {
      notFound(res)
      return
    }
  } catch {
    notFound(res)
    return
  }
  let stat
  try {
    stat = statSync(real)
  } catch {
    notFound(res)
    return
  }
  if (!stat.isFile()) {
    notFound(res)
    return
  }
  const type = MIME.get(extname(real).toLowerCase()) ?? 'application/octet-stream'
  const total = stat.size
  const etag = `W/"${total.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': CACHE_CONTROL_MEDIA,
    'ETag': etag,
    'Last-Modified': new Date(stat.mtimeMs).toUTCString(),
  }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }

  const range = req.headers.range
  if (typeof range === 'string' && range.trim() !== '') {
    const parsed = parseRange(range, total)
    if (parsed === null) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    const { start, end } = parsed
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1,
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    streamRange(real, start, end, res)
    return
  }

  res.writeHead(200, { ...headers, 'Content-Length': total })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(real)
  stream.on('error', () => { res.destroy() })
  stream.pipe(res)
}

/**
 * Parse a single-range `Range` header.
 * @param {string} header
 * @param {number} total
 * @returns {{ start: number, end: number } | null}
 */
function parseRange(header, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null
  let start
  let end
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? total - 1 : Number(rawEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  }
  if (start >= total || end < start) return null
  return { start, end: Math.min(end, total - 1) }
}

function streamRange(file, start, end, res) {
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => { res.destroy() })
  stream.pipe(res)
}

function sendJson(res, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  })
  if (res.req?.method === 'HEAD') res.end()
  else res.end(body)
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('not found')
}

function badRequest(res, message) {
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(message)
}

function redirect(res, location) {
  res.writeHead(302, { Location: location })
  res.end()
}

function readJson(path) {
  const text = readText(path)
  if (text === null) return null
  try { return JSON.parse(text) } catch { return null }
}

function readText(path) {
  try { return readFileSync(path, 'utf8') } catch { return null }
}

function isFile(path) {
  try { return statSync(path).isFile() } catch { return false }
}

function isDir(path) {
  try { return statSync(path).isDirectory() } catch { return false }
}

function statSafe(path) {
  try { return statSync(path) } catch { return null }
}

function firstWithExt(names, allowed) {
  const match = names.find(name => allowed.has(extname(name).toLowerCase()))
  return match ?? null
}

function safeJoin(dir, rel) {
  const joined = normalize(join(dir, rel))
  return joined.startsWith(dir + sep) ? joined : null
}

/** Services this row needs before apply() runs. */
export const inject = ['webServer']

/**
 * Cordis host row.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ libraryRoot?: string }} [config]
 */
export function apply(ctx, config) {
  const handler = createWallpaperHandler({ libraryRoot: config?.libraryRoot })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: BASE_PATH, handler }),
    'wallpaper-machine: local library routes',
  )
}

import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { createWallpaperHandler, resolveLibraryRoot, scanLibrary } from '../index.js'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

let root
let home
let server
let origin

async function writeEntry(id, project, files) {
  const dir = join(root, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'project.json'), JSON.stringify(project), 'utf8')
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body)
  }
}

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'wm-test-'))
  root = join(home, 'Library')
  await mkdir(root, { recursive: true })

  await writeEntry('scene-1', {
    title: 'Scene One', type: 'Scene', file: 'scene.json', preview: 'preview.jpg',
    tags: ['night', 'demo'], contentrating: 'Everyone',
  }, {
    'scene.pkg': Buffer.concat([Buffer.from('PKGV0021'), Buffer.alloc(64, 1)]),
    'preview.jpg': PNG_1PX,
  })

  await writeEntry('video-1', {
    title: '视频 壁纸', type: 'video', file: 'clip.mp4', preview: 'preview.png',
  }, {
    'clip.mp4': Buffer.from('fake-mp4-bytes'),
    'preview.png': PNG_1PX,
  })

  await writeEntry('photo-1', {
    title: 'Photo One', type: 'image', file: 'photo.png',
  }, {
    'photo.png': PNG_1PX,
  })

  await writeEntry('broken-1', {
    title: 'Broken', type: 'Scene',
  }, {})

  process.env.WALLPAPER_MACHINE_HOME = home
  server = createServer(createWallpaperHandler())
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  delete process.env.WALLPAPER_MACHINE_HOME
  await new Promise(resolve => server.close(resolve))
  await rm(home, { recursive: true, force: true })
})

test('resolveLibraryRoot honours WALLPAPER_MACHINE_HOME', () => {
  const resolved = resolveLibraryRoot()
  assert.equal(resolved.root, root)
  assert.equal(resolved.source, 'default')
})

test('scanLibrary classifies Scene, Video and Image entries', () => {
  const { exists, items } = scanLibrary(root)
  assert.equal(exists, true)
  const byId = new Map(items.map(item => [item.id, item]))

  assert.equal(byId.get('scene-1').kind, 'scene')
  assert.match(byId.get('scene-1').urls.scene, /\/scene-live\/\?id=scene-1/)
  assert.equal(byId.get('scene-1').urls.media, null)
  assert.deepEqual(byId.get('scene-1').tags, ['night', 'demo'])

  assert.equal(byId.get('video-1').kind, 'video')
  assert.equal(byId.get('video-1').title, '视频 壁纸')
  assert.match(byId.get('video-1').urls.media, /clip\.mp4$/)

  assert.equal(byId.get('photo-1').kind, 'image')
  assert.match(byId.get('photo-1').urls.media, /photo\.png$/)

  // An entry without any recognisable payload is not shown at all.
  assert.equal(byId.has('broken-1'), false)
})

test('GET /api/library lists entries with encoded urls', async () => {
  const response = await fetch(`${origin}/wallpaper-machine/api/library`)
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.exists, true)
  assert.equal(payload.count, 3)
  const video = payload.items.find(item => item.id === 'video-1')
  assert.equal(video.title, '视频 壁纸')
  assert.ok(video.urls.media.includes('video-1'))
})

test('file route serves bytes and supports HEAD and Range', async () => {
  const full = await fetch(`${origin}/wallpaper-machine/files/scene-1/scene.pkg`)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('accept-ranges'), 'bytes')
  assert.equal((await full.arrayBuffer()).byteLength, 72)

  const head = await fetch(`${origin}/wallpaper-machine/files/scene-1/scene.pkg`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '72')

  const ranged = await fetch(`${origin}/wallpaper-machine/files/scene-1/scene.pkg`, {
    headers: { Range: 'bytes=0-7' },
  })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('content-range'), 'bytes 0-7/72')
  assert.equal(await ranged.text(), 'PKGV0021')

  const invalid = await fetch(`${origin}/wallpaper-machine/files/scene-1/scene.pkg`, {
    headers: { Range: 'bytes=999-1000' },
  })
  assert.equal(invalid.status, 416)
})

test('file route refuses traversal and unknown ids', async () => {
  const traversal = await fetch(`${origin}/wallpaper-machine/files/scene-1/%2e%2e%2fsecret.txt`)
  assert.equal(traversal.status, 404)

  const escape = await fetch(`${origin}/wallpaper-machine/files/%2e%2e%2fetc%2fpasswd`)
  assert.equal(escape.status, 404)

  const missing = await fetch(`${origin}/wallpaper-machine/files/nope/file.txt`)
  assert.equal(missing.status, 404)
})

test('unknown routes and methods are rejected', async () => {
  const missing = await fetch(`${origin}/wallpaper-machine/nope`)
  assert.equal(missing.status, 404)

  const post = await fetch(`${origin}/wallpaper-machine/api/library`, { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
})

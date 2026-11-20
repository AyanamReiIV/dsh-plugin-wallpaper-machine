/**
 * scene-live/renderer.js — WebWallGL adapter page for dsh-plugin-wallpaper-machine.
 *
 * The page is loaded in an <iframe> behind the DSH shell. It receives the
 * WallpaperMachine library id, poster URL and render options via the query
 * string, then mounts a WebWallGL scene. All assets are same-origin, served by
 * the host half of this plugin.
 */
(function () {
  'use strict'

  const params = new URLSearchParams(location.search)
  const id = params.get('id') || ''
  const posterUrl = params.get('poster') || ''
  const fit = params.get('fit') === 'contain' ? 'contain' : params.get('fit') === 'stretch' ? 'stretch' : 'cover'
  const fps = clampNumber(params.get('fps'), 60, 10, 144)
  const muted = params.get('muted') !== 'false'
  const paused = params.get('paused') === '1'
  const renderDpr = clampNumber(params.get('dpr'), 1, 0.5, 2)
  const mediaBase = '/wallpaper-machine/files/' + encodeURIComponent(id)

  const poster = document.getElementById('poster')
  const host = document.getElementById('wp')
  const errorBox = document.getElementById('error')

  let inst = null
  let ready = false
  let disposed = false
  let loadTimer = null
  let hasFrame = false

  function clampNumber(raw, fallback, min, max) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return fallback
    return Math.min(max, Math.max(min, value))
  }

  function post(message) {
    try {
      parent.postMessage({ source: 'wm-scene', ...message }, '*')
    } catch {
      /* parent may already be gone */
    }
  }

  function showError(message) {
    errorBox.textContent = String(message || '场景加载失败')
    errorBox.classList.add('visible')
    post({ type: 'error', message: String(message || '') })
  }

  function settlePoster() {
    if (!posterUrl) return
    poster.classList.add('visible')
    poster.classList.toggle('cover-fit', fit === 'cover')
    poster.classList.toggle('contain-fit', fit !== 'cover')
    poster.src = posterUrl
  }

  function reveal() {
    if (disposed || hasFrame) return
    hasFrame = true
    ready = true
    host.classList.add('visible')
    poster.classList.remove('visible')
    post({ type: 'ready' })
  }

  function dispose() {
    disposed = true
    if (loadTimer !== null) {
      clearTimeout(loadTimer)
      loadTimer = null
    }
    try { inst?.destroy() } catch { /* already gone */ }
    inst = null
  }

  function start() {
    const engine = globalThis.WebWallGL
    if (!engine || typeof engine.createScene !== 'function' || typeof engine.httpSource !== 'function') {
      showError('WebWallGL 引擎不可用')
      return
    }
    if (!id) {
      showError('缺少壁纸 id')
      return
    }
    settlePoster()

    try {
      inst = engine.createScene(host, {
        fit,
        fps,
        volume: muted ? 0 : 1,
        renderDpr,
        onDiagnostic(diagnostic) {
          if (diagnostic && diagnostic.level === 'error') {
            console.warn('[wallpaper-machine] scene diagnostic', diagnostic)
          }
        },
      })
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error))
      return
    }

    inst.on('error', (error) => {
      if (disposed) return
      // Load-time rejections are surfaced through load() below; only wake the
      // UI when a live instance dies after its first frame.
      if (ready) showError(error instanceof Error ? error.message : String(error))
    })

    loadTimer = window.setTimeout(() => {
      loadTimer = null
      if (!ready && !disposed) {
        showError('场景加载超时')
        post({ type: 'timeout' })
      }
    }, 30000)

    inst
      .load(engine.httpSource(mediaBase))
      .then(() => {
        if (disposed) return
        if (loadTimer !== null) {
          clearTimeout(loadTimer)
          loadTimer = null
        }
        try { inst.setVolume(muted ? 0 : 1) } catch { /* no audio in this scene */ }
        if (paused) {
          try { inst.pause() } catch { /* nothing to pause yet */ }
        }
        // WebWallGL paints asynchronously; reveal on the first rendered frame
        // when the API exposes a frame counter, otherwise after a short beat.
        waitForFrame()
      })
      .catch((error) => {
        if (disposed) return
        if (loadTimer !== null) {
          clearTimeout(loadTimer)
          loadTimer = null
        }
        showError(error instanceof Error ? error.message : String(error))
      })
  }

  function waitForFrame() {
    let attempts = 0
    const probe = () => {
      if (disposed) return
      attempts += 1
      let frames = 0
      try {
        frames = Number(inst?.stats?.frames ?? inst?.stats?.frame ?? 0)
      } catch {
        frames = 0
      }
      if (frames > 0 || attempts >= 20) {
        reveal()
        return
      }
      window.requestAnimationFrame(probe)
    }
    window.requestAnimationFrame(probe)
  }

  // ── Parent control face ────────────────────────────────────────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== parent) return
    const data = event.data
    if (!data || data.source !== 'wm-host') return
    if (disposed) return
    try {
      switch (data.type) {
        case 'setFit':
          if (inst && (data.fit === 'cover' || data.fit === 'contain' || data.fit === 'stretch')) {
            inst.setFit(data.fit)
            poster.classList.toggle('cover-fit', data.fit === 'cover')
            poster.classList.toggle('contain-fit', data.fit !== 'cover')
          }
          break
        case 'setPaused':
          if (data.paused) inst?.pause()
          else inst?.resume()
          break
        case 'setVolume':
          inst?.setVolume(clampNumber(data.volume, 0, 0, 1))
          break
        case 'setFps':
          inst?.setFps(clampNumber(data.fps, 60, 10, 144))
          break
        case 'destroy':
          dispose()
          break
        default:
          break
      }
    } catch (error) {
      console.warn('[wallpaper-machine] scene control failed', error)
    }
  })

  window.addEventListener('pagehide', dispose)
  start()
})()

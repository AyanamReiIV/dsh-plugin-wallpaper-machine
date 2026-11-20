/**
 * dsh-plugin-wallpaper-machine — browser half.
 *
 * Two jobs:
 *  1. A body-level wallpaper layer (scene via WebWallGL iframe, video, image)
 *     that sits behind the DSH shell, with a scrim for readability.
 *  2. A "Wallpaper Machine" page in Settings that lists the local
 *     WallpaperMachine library and controls the layer.
 *
 * State is client-local (localStorage); the host half only reads the library.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-wallpaper-machine',
  factory: (require) => {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/wallpaper-machine'
    const NS = 'wallpaper-machine'
    const STORAGE_KEY = 'dsh-plugin-wallpaper-machine:state:v1'
    const SETTINGS_SLOT = 'settings.section'
    const SETTINGS_ICON_SLOT = 'settings.section.icon'
    const SETTINGS_ID = 'wallpaper-machine'

    // ── i18n ────────────────────────────────────────────────────────────────
    const DICTS = {
      zh: {
        'nav.title': '壁纸机',
        'page.title': '壁纸机',
        'page.subtitle': '把 WallpaperMachine 里的壁纸放进 DSH：场景壁纸实时渲染，视频与图片直接播放。',
        'page.library': '本地壁纸库',
        'page.count': '{count} 张壁纸',
        'page.refresh': '刷新',
        'page.copyPath': '复制路径',
        'page.copied': '已复制',
        'page.root': '资源库',
        'page.source.default': '默认位置',
        'page.source.custom': '自定义位置',
        'page.source.config': '插件配置',
        'page.loading': '正在读取 WallpaperMachine 资源库…',
        'page.error': '读取壁纸库失败：{message}',
        'page.missing.title': '没有找到 WallpaperMachine 壁纸库',
        'page.missing.body': '请先安装并打开 WallpaperMachine，至少下载一张壁纸。插件会读取：',
        'page.empty.title': '壁纸库是空的',
        'page.empty.body': '在 WallpaperMachine 里下载壁纸后点“刷新”。',
        'page.search': '搜索壁纸…',
        'page.filter.all': '全部',
        'page.filter.scene': '场景',
        'page.filter.video': '视频',
        'page.filter.image': '图片',
        'page.noMatch': '没有匹配的壁纸',
        'page.current': '当前壁纸',
        'page.none': '还没有启用壁纸',
        'page.apply': '使用',
        'page.applied': '使用中',
        'page.clear': '关闭壁纸',
        'page.missingItem': '这张壁纸已从资源库移除',
        'page.kind.scene': '场景',
        'page.kind.video': '视频',
        'page.kind.image': '图片',
        'page.kind.web': '网页',
        'page.kind.unknown': '未知',
        'page.fit': '填充方式',
        'page.fit.cover': '铺满',
        'page.fit.contain': '完整显示',
        'page.fit.stretch': '拉伸',
        'page.opacity': '壁纸不透明度',
        'page.scrim': '暗化遮罩',
        'page.muted': '静音',
        'page.fps': '场景帧率',
        'page.pause': '暂停渲染',
        'page.resume': '继续渲染',
        'page.enable': '启用壁纸',
        'page.paused': '已暂停',
        'page.quality': '性能',
        'page.quality.hint': '场景壁纸由 WebWallGL 在后台 iframe 中实时渲染。若机器发热或掉帧，可降低帧率或关闭壁纸。',
        'page.footer': '只读访问本地 WallpaperMachine 资源库；不会修改任何壁纸文件。',
        'page.settingsHint': '选择后立即生效，并会记住到下次启动。',
        'page.running': '实时渲染中',
        'page.ready': '已就绪',
        'page.loadingScene': '场景加载中…',
        'page.sceneError': '场景渲染失败，已保留预览图。',
      },
      en: {
        'nav.title': 'Wallpaper Machine',
        'page.title': 'Wallpaper Machine',
        'page.subtitle': 'Bring your WallpaperMachine library into DSH: scene wallpapers render live, videos and images play directly.',
        'page.library': 'Local library',
        'page.count': '{count} wallpapers',
        'page.refresh': 'Refresh',
        'page.copyPath': 'Copy path',
        'page.copied': 'Copied',
        'page.root': 'Library',
        'page.source.default': 'Default location',
        'page.source.custom': 'Custom location',
        'page.source.config': 'Plugin config',
        'page.loading': 'Reading the WallpaperMachine library…',
        'page.error': 'Could not read the library: {message}',
        'page.missing.title': 'WallpaperMachine library not found',
        'page.missing.body': 'Install and open WallpaperMachine, then download at least one wallpaper. This plugin reads:',
        'page.empty.title': 'The library is empty',
        'page.empty.body': 'Download a wallpaper in WallpaperMachine, then press Refresh.',
        'page.search': 'Search wallpapers…',
        'page.filter.all': 'All',
        'page.filter.scene': 'Scenes',
        'page.filter.video': 'Videos',
        'page.filter.image': 'Images',
        'page.noMatch': 'No matching wallpapers',
        'page.current': 'Current wallpaper',
        'page.none': 'No wallpaper enabled',
        'page.apply': 'Use',
        'page.applied': 'In use',
        'page.clear': 'Turn off',
        'page.missingItem': 'This wallpaper was removed from the library',
        'page.kind.scene': 'Scene',
        'page.kind.video': 'Video',
        'page.kind.image': 'Image',
        'page.kind.web': 'Web',
        'page.kind.unknown': 'Unknown',
        'page.fit': 'Fit',
        'page.fit.cover': 'Cover',
        'page.fit.contain': 'Contain',
        'page.fit.stretch': 'Stretch',
        'page.opacity': 'Wallpaper opacity',
        'page.scrim': 'Dim overlay',
        'page.muted': 'Mute',
        'page.fps': 'Scene frame rate',
        'page.pause': 'Pause rendering',
        'page.resume': 'Resume rendering',
        'page.enable': 'Enable wallpaper',
        'page.paused': 'Paused',
        'page.quality': 'Performance',
        'page.quality.hint': 'Scene wallpapers render live through WebWallGL in a background iframe. Lower the frame rate or turn the wallpaper off if the machine gets hot or drops frames.',
        'page.footer': 'Read-only access to the local WallpaperMachine library; no wallpaper files are modified.',
        'page.settingsHint': 'Changes apply immediately and are remembered for next launch.',
        'page.running': 'Rendering live',
        'page.ready': 'Ready',
        'page.loadingScene': 'Loading scene…',
        'page.sceneError': 'Scene rendering failed; showing the preview image instead.',
      },
    }

    const localeService = () => {
      try {
        return (typeof window !== 'undefined' && window.__WM_LOCALE__) || null
      } catch {
        return null
      }
    }

    let locale = null
    try {
      // The service is assigned in apply(); components read it afterwards.
      locale = null
    } catch {
      locale = null
    }

    function activeLocaleId() {
      try {
        const snapshot = locale?.getSnapshot?.()
        if (snapshot && typeof snapshot.active === 'string' && snapshot.active !== '') return snapshot.active
      } catch {
        /* fall through */
      }
      try {
        const lang = (navigator.language || 'zh').toLowerCase()
        return lang.startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'zh'
      }
    }

    function dict() {
      const id = activeLocaleId()
      if (id.startsWith('zh')) return DICTS.zh
      return DICTS.en
    }

    function translate(key, vars) {
      const table = dict()
      let text = table[key] ?? DICTS.en[key] ?? key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value))
        }
      }
      return text
    }

    function useTranslate() {
      const [, force] = useState(0)
      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => force(value => value + 1))
      }, [])
      return translate
    }

    // ── Persistent state ────────────────────────────────────────────────────
    const DEFAULTS = {
      enabled: false,
      selected: null,
      fit: 'cover',
      muted: true,
      fps: 60,
      opacity: 1,
      scrim: 0.3,
      paused: false,
    }

    function sanitizeSelected(raw) {
      if (!raw || typeof raw !== 'object') return null
      if (typeof raw.id !== 'string' || raw.id === '') return null
      const kind = ['scene', 'video', 'image', 'web', 'unknown'].includes(raw.kind) ? raw.kind : 'unknown'
      const urls = raw.urls && typeof raw.urls === 'object' ? raw.urls : {}
      return {
        id: raw.id,
        title: typeof raw.title === 'string' ? raw.title : raw.id,
        kind,
        urls: {
          preview: typeof urls.preview === 'string' ? urls.preview : null,
          media: typeof urls.media === 'string' ? urls.media : null,
          scene: typeof urls.scene === 'string' ? urls.scene : null,
        },
      }
    }

    function loadState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...DEFAULTS }
        const parsed = JSON.parse(raw)
        return {
          enabled: parsed.enabled === true,
          selected: sanitizeSelected(parsed.selected),
          fit: parsed.fit === 'contain' || parsed.fit === 'stretch' ? parsed.fit : 'cover',
          muted: parsed.muted !== false,
          fps: [30, 45, 60].includes(parsed.fps) ? parsed.fps : 60,
          opacity: clamp(Number(parsed.opacity), 0.2, 1, 1),
          scrim: clamp(Number(parsed.scrim), 0, 0.85, 0.22),
          paused: parsed.paused === true,
        }
      } catch {
        return { ...DEFAULTS }
      }
    }

    function clamp(value, min, max, fallback) {
      if (!Number.isFinite(value)) return fallback
      return Math.min(max, Math.max(min, value))
    }

    let state = loadState()
    const listeners = new Set()

    function getState() {
      return state
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }

    function update(patch) {
      state = { ...state, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        /* private mode: state still lives for this session */
      }
      syncLayer()
      for (const listener of listeners) {
        try { listener() } catch { /* one bad subscriber must not break others */ }
      }
    }

    function useWallpaperState() {
      return React.useSyncExternalStore(subscribe, getState, getState)
    }

    // ── Wallpaper layer (lives outside React, on <body>) ────────────────────
    const layer = {
      root: null,
      media: null,
      poster: null,
      live: null,
      scrim: null,
      iframe: null,
      video: null,
      img: null,
      builtId: null,
      ready: false,
      timer: null,
      disposers: [],
    }

    function ensureLayer() {
      if (layer.root || typeof document === 'undefined' || !document.body) return
      const root = document.createElement('div')
      root.className = 'wm-layer'
      root.setAttribute('aria-hidden', 'true')
      root.dataset.on = '0'
      root.dataset.ready = '0'

      const media = document.createElement('div')
      media.className = 'wm-media'
      const poster = document.createElement('img')
      poster.className = 'wm-poster'
      poster.alt = ''
      poster.draggable = false
      poster.decoding = 'async'
      const live = document.createElement('div')
      live.className = 'wm-live'
      media.append(poster, live)

      const scrim = document.createElement('div')
      scrim.className = 'wm-scrim'

      root.append(media, scrim)
      document.body.appendChild(root)
      layer.root = root
      layer.media = media
      layer.poster = poster
      layer.live = live
      layer.scrim = scrim
    }

    function clearTimer() {
      if (layer.timer !== null) {
        window.clearTimeout(layer.timer)
        layer.timer = null
      }
    }

    function clearLive(kind) {
      clearTimer()
      if (layer.iframe) {
        try { layer.iframe.remove() } catch { /* already gone */ }
        layer.iframe = null
      }
      if (layer.video) {
        try {
          layer.video.pause()
          layer.video.removeAttribute('src')
          layer.video.load()
          layer.video.remove()
        } catch { /* already gone */ }
        layer.video = null
      }
      if (layer.img) {
        try { layer.img.remove() } catch { /* already gone */ }
        layer.img = null
      }
      if (layer.live) layer.live.replaceChildren()
      if (layer.poster) layer.poster.removeAttribute('src')
      if (layer.root) layer.root.dataset.ready = '0'
      layer.ready = false
      void kind
    }

    function markReady() {
      layer.ready = true
      clearTimer()
      if (layer.root) layer.root.dataset.ready = '1'
    }

    function showLayerError(message) {
      console.warn('[wallpaper-machine]', message)
      if (layer.root) layer.root.dataset.error = '1'
      if (layer.poster && layer.poster.getAttribute('src')) {
        if (layer.root) layer.root.dataset.ready = '0'
      }
    }

    function buildScene(selected) {
      clearLive('scene')
      const poster = selected.urls.preview
      if (poster && layer.poster) {
        layer.poster.src = poster
        layer.poster.style.objectFit = state.fit === 'contain' ? 'contain' : 'cover'
      }
      if (!selected.urls.scene) {
        showLayerError('scene url missing')
        return
      }
      const frame = document.createElement('iframe')
      frame.className = 'wm-frame'
      frame.setAttribute('allow', 'autoplay')
      frame.setAttribute('scrolling', 'no')
      frame.setAttribute('title', 'WallpaperMachine scene')
      // Carry the current options in the URL so the first painted frame already
      // matches the settings (a control message sent before load would be lost).
      try {
        const sceneUrl = new URL(selected.urls.scene, window.location.origin)
        sceneUrl.searchParams.set('fit', state.fit)
        sceneUrl.searchParams.set('fps', String(state.fps))
        sceneUrl.searchParams.set('muted', state.muted ? 'true' : 'false')
        sceneUrl.searchParams.set('paused', state.paused ? '1' : '0')
        frame.src = sceneUrl.pathname + sceneUrl.search
      } catch {
        frame.src = selected.urls.scene
      }
      layer.live.appendChild(frame)
      layer.iframe = frame
      layer.root.dataset.ready = '0'
      layer.timer = window.setTimeout(() => {
        if (!layer.ready) {
          if (layer.poster && layer.poster.getAttribute('src')) {
            if (layer.root) layer.root.dataset.ready = '0'
          }
        }
      }, 15000)
    }

    function buildVideo(selected) {
      clearLive('video')
      const video = document.createElement('video')
      video.className = 'wm-video'
      video.loop = true
      video.autoplay = true
      video.muted = state.muted
      video.playsInline = true
      video.preload = 'auto'
      video.src = selected.urls.media
      video.addEventListener('loadeddata', markReady, { once: true })
      video.addEventListener('error', () => showLayerError('video failed to load'))
      layer.live.appendChild(video)
      layer.video = video
      if (state.paused) {
        /* autoplay is intentionally skipped while paused */
      } else {
        const played = video.play()
        if (played && typeof played.catch === 'function') played.catch(() => { /* autoplay blocked; first frame still shows */ })
      }
      if (selected.urls.preview && layer.poster) {
        layer.poster.src = selected.urls.preview
      }
    }

    function buildImage(selected) {
      clearLive('image')
      const img = document.createElement('img')
      img.className = 'wm-image'
      img.alt = ''
      img.draggable = false
      img.addEventListener('load', markReady, { once: true })
      img.addEventListener('error', () => showLayerError('image failed to load'))
      img.src = selected.urls.media
      layer.live.appendChild(img)
      layer.img = img
    }

    function buildWeb(selected) {
      clearLive('web')
      const frame = document.createElement('iframe')
      frame.className = 'wm-frame'
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
      frame.setAttribute('scrolling', 'no')
      frame.setAttribute('title', 'WallpaperMachine web wallpaper')
      frame.src = selected.urls.media
      frame.addEventListener('load', markReady, { once: true })
      layer.live.appendChild(frame)
      layer.iframe = frame
    }

    function postToScene(message) {
      if (!layer.iframe || !layer.iframe.contentWindow) return
      try {
        layer.iframe.contentWindow.postMessage({ source: 'wm-host', ...message }, '*')
      } catch { /* frame not ready */ }
    }

    function syncLayer() {
      ensureLayer()
      if (!layer.root) return
      const selected = state.selected
      const active = state.enabled && selected !== null
      layer.root.dataset.on = active ? '1' : '0'
      if (layer.root.dataset.error === '1' && !active) delete layer.root.dataset.error

      if (typeof document !== 'undefined' && document.body) {
        if (active) document.body.setAttribute('data-wm-wallpaper', 'on')
        else document.body.removeAttribute('data-wm-wallpaper')
      }

      if (!active) {
        // Keep the payload warm but stop paying for frames while disabled.
        postToScene({ type: 'setPaused', paused: true })
        if (layer.video) {
          try { layer.video.pause() } catch { /* ignore */ }
        }
        layer.root.style.opacity = '0'
        return
      }
      layer.root.style.opacity = '1'
      layer.media.style.opacity = String(state.opacity)
      layer.scrim.style.opacity = String(state.scrim)

      const needsBuild = layer.builtId !== selected.id
      if (needsBuild) {
        layer.builtId = selected.id
        delete layer.root.dataset.error
        if (selected.kind === 'scene') buildScene(selected)
        else if (selected.kind === 'video') buildVideo(selected)
        else if (selected.kind === 'image') buildImage(selected)
        else if (selected.kind === 'web') buildWeb(selected)
        else {
          clearLive('unknown')
          if (selected.urls.preview && layer.poster) layer.poster.src = selected.urls.preview
          showLayerError('unsupported wallpaper kind')
        }
        return
      }

      // Same wallpaper: apply live parameter changes without a reload.
      if (selected.kind === 'scene') {
        postToScene({ type: 'setFit', fit: state.fit })
        postToScene({ type: 'setFps', fps: state.fps })
        postToScene({ type: 'setVolume', volume: state.muted ? 0 : 1 })
        postToScene({ type: 'setPaused', paused: state.paused || !active })
      } else if (selected.kind === 'video' && layer.video) {
        layer.video.muted = state.muted
        layer.video.style.objectFit = state.fit === 'contain' ? 'contain' : state.fit === 'stretch' ? 'fill' : 'cover'
        if (state.paused) {
          try { layer.video.pause() } catch { /* ignore */ }
        } else {
          const played = layer.video.play()
          if (played && typeof played.catch === 'function') played.catch(() => {})
        }
      } else if (selected.kind === 'image' && layer.img) {
        layer.img.style.objectFit = state.fit === 'contain' ? 'contain' : state.fit === 'stretch' ? 'fill' : 'cover'
      }
    }

    function bindMessages() {
      const onMessage = (event) => {
        const data = event.data
        if (!data || data.source !== 'wm-scene') return
        if (layer.iframe && event.source !== layer.iframe.contentWindow) return
        if (data.type === 'ready') markReady()
        else if (data.type === 'error') showLayerError(String(data.message || 'scene failed'))
        else if (data.type === 'timeout') showLayerError('scene timed out')
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }

    // ── Shared UI bits ──────────────────────────────────────────────────────
    function Icon({ name }) {
      const paths = {
        scene: React.createElement('path', {
          d: 'M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 14.5v-9Zm2.5-1A1 1 0 0 0 4.5 5.5v9a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-13ZM4 17.5h16V19H4v-1.5Z',
          fill: 'currentColor',
        }),
        video: React.createElement('path', {
          d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v.6l3.4-1.9A1 1 0 0 1 21 6.1v11.8a1 1 0 0 1-1.6.9L16 16.9v.6a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 17.5v-11Zm9.5 1h-7a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1Zm3.5 2.2v4.6l2.5 1.4V8.3L17 9.7Z',
          fill: 'currentColor',
        }),
        image: React.createElement('path', {
          d: 'M5.5 3A2.5 2.5 0 0 0 3 5.5v13A2.5 2.5 0 0 0 5.5 21h13a2.5 2.5 0 0 0 2.5-2.5v-13A2.5 2.5 0 0 0 18.5 3h-13Zm-1 2.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v8.6l-3.2-3.2a1.5 1.5 0 0 0-2.2 0l-3 3-.9-.9a1.5 1.5 0 0 0-2.1 0L3.5 16V5.5Zm0 12.6 4.2-4.2 1.3 1.3-2.9 2.9h-2.6Zm7.3 1.9 4.2-4.2 3.5 3.5v.7a1 1 0 0 1-1 1h-6.7Z',
          fill: 'currentColor',
        }),
        web: React.createElement('path', {
          d: 'M12 2.5c2.6 0 4.9 1 6.7 2.8l.8.8A9.5 9.5 0 1 1 12 2.5Zm0 1.5a8 8 0 0 0-7.6 5.5h4.1a12.6 12.6 0 0 1 1.5-4.6A7.9 7.9 0 0 0 12 4Zm-3.4 1.5a11 11 0 0 0-1.3 4H4.4a8 8 0 0 1 4.2-4Zm6.8 0a8 8 0 0 1 4.2 4h-2.9a11 11 0 0 0-1.3-4Zm1.9 5.5a12.5 12.5 0 0 1-1.1 4h2.4a8 8 0 0 0 1-4h-2.3Zm-3.9 0h-2.8a11 11 0 0 0 1.2 4h1.6a11 11 0 0 1 0-4Zm-4.3 0H4.7a8 8 0 0 0 1 4h2.4a12.5 12.5 0 0 1-1-4Zm2.9-1.5h3.9a11 11 0 0 0-1.3-4h-1.3a11 11 0 0 0-1.3 4Z',
          fill: 'currentColor',
        }),
        check: React.createElement('path', {
          d: 'M9.6 16.3 5.3 12l1.4-1.4 2.9 2.9 7-7L18 7.9l-8.4 8.4Z',
          fill: 'currentColor',
        }),
        refresh: React.createElement('path', {
          d: 'M12 4a8 8 0 1 0 7.7 10h-2.1A6 6 0 1 1 12 6c1.7 0 3.2.7 4.3 1.8L13 11h7V4l-2.6 2.6A7.9 7.9 0 0 0 12 4Z',
          fill: 'currentColor',
        }),
        folder: React.createElement('path', {
          d: 'M3 6.5A2.5 2.5 0 0 1 5.5 4h3.2c.5 0 1 .2 1.4.6L11.6 6h6.9A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Zm2.5-1a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-7.3l-1.7-1.7a.5.5 0 0 0-.3-.3H5.5Z',
          fill: 'currentColor',
        }),
        power: React.createElement('path', {
          d: 'M11 3h2v9h-2V3Zm-4.2 2.3 1.4 1.4a6 6 0 1 0 7.6 0l1.4-1.4a8 8 0 1 1-10.4 0Z',
          fill: 'currentColor',
        }),
      }
      return React.createElement('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true', className: 'wm-icon' }, paths[name] || paths.image)
    }

    function Toggle({ checked, onChange, label }) {
      return React.createElement('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        'aria-label': label,
        className: `wm-toggle${checked ? ' is-on' : ''}`,
        onClick: () => onChange(!checked),
      }, React.createElement('span', { className: 'wm-toggle-thumb' }))
    }

    /** Navigation glyph for the settings row; the host supplies its size. */
    function NavIcon({ size = 16 }) {
      return React.createElement('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        React.createElement('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }),
        React.createElement('circle', { cx: 8.6, cy: 9.2, r: 1.3, fill: 'currentColor', stroke: 'none' }),
        React.createElement('path', { d: 'm4.2 17 3.9-3.9a1.6 1.6 0 0 1 2.3 0l4.2 4.2' }),
        React.createElement('path', { d: 'm13.4 15.1 1.7-1.7a1.6 1.6 0 0 1 2.3 0l2.4 2.4' }),
      )
    }

    // ── Settings page ───────────────────────────────────────────────────────
    function WallpaperSettingsPage() {
      const t = useTranslate()
      const current = useWallpaperState()
      const [library, setLibrary] = useState({ loading: true, items: [], root: '', source: 'default', exists: false, error: null })
      const [query, setQuery] = useState('')
      const [filter, setFilter] = useState('all')
      const [copied, setCopied] = useState(false)
      const copiedTimer = useRef(null)
      const alive = useRef(true)

      useEffect(() => () => {
        alive.current = false
        if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
      }, [])

      const loadLibrary = useCallback(async (force) => {
        setLibrary(prev => ({ ...prev, loading: true, error: null }))
        try {
          const response = await fetch(`${API}/api/library${force ? '?refresh=1' : ''}`, { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (!alive.current) return
          setLibrary({
            loading: false,
            items: Array.isArray(payload.items) ? payload.items : [],
            root: typeof payload.root === 'string' ? payload.root : '',
            source: typeof payload.source === 'string' ? payload.source : 'default',
            exists: payload.exists === true,
            error: null,
          })
        } catch (error) {
          if (!alive.current) return
          setLibrary(prev => ({ ...prev, loading: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }, [])

      useEffect(() => { loadLibrary(false) }, [loadLibrary])

      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return library.items.filter(item => {
          if (filter !== 'all' && item.kind !== filter) return false
          if (needle === '') return true
          const haystack = `${item.title} ${item.id} ${(item.tags || []).join(' ')}`.toLowerCase()
          return haystack.includes(needle)
        })
      }, [library.items, filter, query])

      const selectedId = current.selected?.id ?? null
      const selectedItem = selectedId === null ? null : library.items.find(item => item.id === selectedId) ?? null
      const selectedMissing = selectedId !== null && !library.loading && library.exists && selectedItem === null && library.items.length > 0

      const apply = (item) => update({ enabled: true, selected: sanitizeSelected(item), paused: false })
      const clear = () => update({ enabled: false })
      const copyPath = async () => {
        try {
          await navigator.clipboard.writeText(library.root)
          setCopied(true)
          if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
          copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }

      const counts = useMemo(() => {
        const map = { all: library.items.length, scene: 0, video: 0, image: 0 }
        for (const item of library.items) {
          if (map[item.kind] !== undefined) map[item.kind] += 1
        }
        return map
      }, [library.items])

      return React.createElement('div', { className: 'wm-settings' },
        React.createElement('header', { className: 'wm-head' },
          React.createElement('div', null,
            React.createElement('h1', { className: 'wm-title' }, t('page.title')),
            React.createElement('p', { className: 'wm-subtitle' }, t('page.subtitle')),
          ),
          React.createElement('div', { className: `wm-status${library.exists ? ' is-ok' : ' is-off'}` },
            React.createElement('span', { className: 'wm-dot' }),
            library.loading ? t('page.loading') : t('page.count', { count: library.items.length }),
          ),
        ),

        current.selected !== null
          ? React.createElement('section', { className: 'wm-now' },
              React.createElement('div', { className: 'wm-now-thumb' },
                current.selected.urls.preview
                  ? React.createElement('img', { src: current.selected.urls.preview, alt: '' })
                  : React.createElement('div', { className: 'wm-thumb-fallback' }, React.createElement(Icon, { name: current.selected.kind })),
                current.enabled && React.createElement('span', { className: 'wm-live-pill' },
                  React.createElement('span', { className: 'wm-live-dot' }),
                  current.paused ? t('page.paused') : t('page.running'),
                ),
              ),
              React.createElement('div', { className: 'wm-now-body' },
                React.createElement('div', { className: 'wm-now-label' }, t('page.current')),
                React.createElement('div', { className: 'wm-now-title', title: current.selected.title }, current.selected.title),
                selectedMissing && React.createElement('div', { className: 'wm-warn' }, t('page.missingItem')),
                selectedItem && selectedItem.contentRating
                  ? React.createElement('div', { className: 'wm-now-meta' }, selectedItem.contentRating)
                  : null,
              ),
              React.createElement('div', { className: 'wm-now-actions' },
                current.enabled
                  ? React.createElement('button', {
                      type: 'button',
                      className: 'wm-btn',
                      onClick: () => update({ paused: !current.paused }),
                    }, t(current.paused ? 'page.resume' : 'page.pause'))
                  : React.createElement('button', {
                      type: 'button',
                      className: 'wm-btn',
                      onClick: () => update({ enabled: true, paused: false }),
                    }, t('page.enable')),
                React.createElement('button', { type: 'button', className: 'wm-btn wm-btn-danger', onClick: clear }, t('page.clear')),
              ),
            )
          : React.createElement('section', { className: 'wm-now wm-now-empty' },
              React.createElement('div', { className: 'wm-now-body' },
                React.createElement('div', { className: 'wm-now-label' }, t('page.current')),
                React.createElement('div', { className: 'wm-now-title' }, t('page.none')),
              ),
            ),

        React.createElement('section', { className: 'wm-controls' },
          React.createElement('div', { className: 'wm-control' },
            React.createElement('span', { className: 'wm-control-label' }, t('page.fit')),
            React.createElement('div', { className: 'wm-seg' },
              ['cover', 'contain', 'stretch'].map(fit => React.createElement('button', {
                key: fit,
                type: 'button',
                className: `wm-seg-btn${current.fit === fit ? ' is-active' : ''}`,
                onClick: () => update({ fit }),
              }, t(`page.fit.${fit}`))),
            ),
          ),
          React.createElement('label', { className: 'wm-control wm-control-range' },
            React.createElement('span', { className: 'wm-control-label' }, `${t('page.opacity')} ${Math.round(current.opacity * 100)}%`),
            React.createElement('input', {
              type: 'range', min: 0.2, max: 1, step: 0.02, value: current.opacity,
              onChange: event => update({ opacity: clamp(Number(event.target.value), 0.2, 1, 1) }),
            }),
          ),
          React.createElement('label', { className: 'wm-control wm-control-range' },
            React.createElement('span', { className: 'wm-control-label' }, `${t('page.scrim')} ${Math.round(current.scrim * 100)}%`),
            React.createElement('input', {
              type: 'range', min: 0, max: 0.85, step: 0.01, value: current.scrim,
              onChange: event => update({ scrim: clamp(Number(event.target.value), 0, 0.85, 0.22) }),
            }),
          ),
          React.createElement('div', { className: 'wm-control' },
            React.createElement('span', { className: 'wm-control-label' }, t('page.fps')),
            React.createElement('div', { className: 'wm-seg' },
              [30, 45, 60].map(fps => React.createElement('button', {
                key: fps,
                type: 'button',
                className: `wm-seg-btn${current.fps === fps ? ' is-active' : ''}`,
                onClick: () => update({ fps }),
              }, `${fps}`)),
            ),
          ),
          React.createElement('div', { className: 'wm-control' },
            React.createElement('span', { className: 'wm-control-label' }, t('page.muted')),
            React.createElement(Toggle, { checked: current.muted, onChange: muted => update({ muted }), label: t('page.muted') }),
          ),
        ),

        React.createElement('section', { className: 'wm-lib' },
          React.createElement('div', { className: 'wm-lib-head' },
            React.createElement('div', null,
              React.createElement('h2', { className: 'wm-h2' }, t('page.library')),
              React.createElement('div', { className: 'wm-root', title: library.root },
                React.createElement('span', { className: 'wm-root-text' }, library.root || '—'),
                React.createElement('span', { className: 'wm-root-source' }, t(`page.source.${library.source}`)),
              ),
            ),
            React.createElement('div', { className: 'wm-lib-tools' },
              React.createElement('button', { type: 'button', className: 'wm-btn wm-btn-ghost', onClick: copyPath, disabled: !library.root },
                React.createElement(Icon, { name: 'folder' }),
                copied ? t('page.copied') : t('page.copyPath'),
              ),
              React.createElement('button', { type: 'button', className: 'wm-btn wm-btn-ghost', onClick: () => loadLibrary(true), disabled: library.loading },
                React.createElement(Icon, { name: 'refresh' }),
                t('page.refresh'),
              ),
            ),
          ),

          library.error !== null
            ? React.createElement('div', { className: 'wm-note wm-note-error' }, t('page.error', { message: library.error }))
            : null,
          !library.loading && !library.exists
            ? React.createElement('div', { className: 'wm-note' },
                React.createElement('strong', null, t('page.missing.title')),
                React.createElement('p', null, t('page.missing.body')),
                React.createElement('code', null, library.root),
              )
            : null,
          !library.loading && library.exists && library.items.length === 0
            ? React.createElement('div', { className: 'wm-note' },
                React.createElement('strong', null, t('page.empty.title')),
                React.createElement('p', null, t('page.empty.body')),
              )
            : null,

          library.items.length > 0 && React.createElement('div', { className: 'wm-lib-bar' },
            React.createElement('div', { className: 'wm-filters' },
              ['all', 'scene', 'video', 'image'].map(kind => React.createElement('button', {
                key: kind,
                type: 'button',
                className: `wm-chip${filter === kind ? ' is-active' : ''}`,
                onClick: () => setFilter(kind),
              }, `${t(`page.filter.${kind}`)} ${counts[kind] ?? 0}`)),
            ),
            React.createElement('input', {
              className: 'wm-search',
              type: 'search',
              value: query,
              placeholder: t('page.search'),
              onChange: event => setQuery(event.target.value),
            }),
          ),

          filtered.length > 0
            ? React.createElement('div', { className: 'wm-grid' },
                filtered.map(item => {
                  const active = item.id === selectedId && current.enabled
                  return React.createElement('article', {
                    key: item.id,
                    className: `wm-card${active ? ' is-active' : ''}`,
                    onClick: () => apply(item),
                    role: 'button',
                    tabIndex: 0,
                    onKeyDown: event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        apply(item)
                      }
                    },
                    title: item.title,
                  },
                    React.createElement('div', { className: 'wm-thumb' },
                      item.urls.preview
                        ? React.createElement('img', { src: item.urls.preview, alt: '', loading: 'lazy', decoding: 'async' })
                        : React.createElement('div', { className: 'wm-thumb-fallback' }, React.createElement(Icon, { name: item.kind })),
                      React.createElement('span', { className: `wm-badge wm-badge-${item.kind}` }, t(`page.kind.${item.kind}`)),
                      active && React.createElement('span', { className: 'wm-check' }, React.createElement(Icon, { name: 'check' })),
                    ),
                    React.createElement('div', { className: 'wm-card-body' },
                      React.createElement('div', { className: 'wm-card-title' }, item.title),
                      React.createElement('div', { className: 'wm-card-meta' },
                        React.createElement('span', null, active ? t('page.applied') : t('page.apply')),
                        item.contentRating ? React.createElement('span', { className: 'wm-rating' }, item.contentRating) : null,
                      ),
                    ),
                  )
                }),
              )
            : library.items.length > 0 && React.createElement('div', { className: 'wm-note wm-note-small' }, t('page.noMatch')),
        ),

        React.createElement('p', { className: 'wm-footer' },
          t('page.quality.hint'),
          React.createElement('br'),
          t('page.footer'),
        ),
      )
    }

    // ── Styles ──────────────────────────────────────────────────────────────
    const CSS = `
      html:has(body[data-wm-wallpaper="on"]) { background-color: #080a0f; }
      body[data-wm-wallpaper="on"] { background: transparent !important; --dsw-alias-bg-base: transparent !important; }
      body[data-wm-wallpaper="on"] :has(> [data-shell-overlay]) { background: transparent !important; }
      body[data-wm-wallpaper="on"] [data-shell-overlay] { background: transparent !important; }
      /* Full-window skins paint an opaque room behind the chat. Clear only that
         painted stage while a wallpaper is active; the skin's chrome, frames and
         character cut-outs stay exactly where the skin put them. */
      body[data-wm-wallpaper="on"] { --maid-palace-art: none; }
      body[data-wm-wallpaper="on"] [data-skin-chrome="character-stage"] { background-image: none !important; }

      .wm-layer {
        position: fixed; inset: 0; z-index: -2; overflow: hidden;
        pointer-events: none; opacity: 0; transition: opacity .5s ease;
        background: #080a0f; -webkit-app-region: initial !important;
        --wm-scrim: .22;
      }
      .wm-layer[data-on="1"] { opacity: 1; }
      .wm-media { position: absolute; inset: 0; opacity: 1; transition: opacity .25s ease; }
      .wm-poster, .wm-live { position: absolute; inset: 0; width: 100%; height: 100%; }
      .wm-poster { object-fit: cover; opacity: 1; transition: opacity .55s ease; }
      .wm-layer[data-ready="1"] .wm-poster { opacity: 0; }
      .wm-frame, .wm-video, .wm-image { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
      .wm-video, .wm-image { object-fit: cover; }
      .wm-scrim {
        position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(120% 90% at 30% 10%, rgba(0,0,0,.12), rgba(0,0,0,.72));
        opacity: var(--wm-scrim, .22); transition: opacity .2s ease;
      }

      .wm-settings { display: flex; flex-direction: column; gap: 18px; width: 100%; min-width: 0; color: var(--dsw-alias-label-primary, #e9edf5); font-size: 13px; line-height: 1.5; }
      .wm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .wm-title { margin: 0; font-size: 20px; line-height: 1.25; font-weight: 650; letter-spacing: .2px; }
      .wm-subtitle { margin: 6px 0 0; max-width: 62ch; color: var(--dsw-alias-label-secondary, rgba(233,237,245,.62)); font-size: 12.5px; }
      .wm-status { display: inline-flex; align-items: center; gap: 7px; flex: none; margin-top: 3px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12)); background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.05)); color: var(--dsw-alias-label-secondary, rgba(233,237,245,.62)); font-size: 11.5px; white-space: nowrap; }
      .wm-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8a93a6); }
      .wm-status.is-ok .wm-dot { background: #42c98a; box-shadow: 0 0 0 3px rgba(66,201,138,.16); }
      .wm-status.is-off .wm-dot { background: #e0a33a; }

      .wm-now { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12)); background: linear-gradient(180deg, var(--dsw-alias-bg-layer-2, rgba(255,255,255,.07)), var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04))); }
      .wm-now-empty { opacity: .9; }
      .wm-now-thumb { position: relative; flex: none; width: 132px; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,.09)); }
      .wm-now-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .wm-live-pill { position: absolute; left: 6px; bottom: 6px; display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 999px; background: rgba(8,10,15,.66); color: #fff; font-size: 10px; backdrop-filter: blur(6px); }
      .wm-live-dot { width: 5px; height: 5px; border-radius: 50%; background: #42c98a; }
      .wm-now-body { min-width: 0; flex: 1; }
      .wm-now-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--dsw-alias-label-tertiary, rgba(233,237,245,.45)); }
      .wm-now-title { margin-top: 3px; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wm-now-meta { margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, rgba(233,237,245,.6)); }
      .wm-warn { margin-top: 4px; color: #e0a33a; font-size: 11.5px; }
      .wm-now-actions { display: flex; gap: 8px; flex: none; }

      .wm-btn { appearance: none; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.14)); background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.08)); color: var(--dsw-alias-label-primary, #e9edf5); font: inherit; font-size: 12.5px; cursor: pointer; transition: background .15s ease, border-color .15s ease, opacity .15s ease; }
      .wm-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.13)); }
      .wm-btn:disabled { opacity: .45; cursor: default; }
      .wm-btn-ghost { background: transparent; }
      .wm-btn-danger { color: #ff8f8f; border-color: rgba(255,120,120,.28); }
      .wm-icon { flex: none; opacity: .9; }

      .wm-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 16px; padding: 14px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1)); background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.035)); }
      .wm-control { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 30px; }
      .wm-control-label { color: var(--dsw-alias-label-secondary, rgba(233,237,245,.65)); font-size: 12px; white-space: nowrap; }
      .wm-control-range { flex-direction: column; align-items: stretch; gap: 4px; }
      .wm-control-range input { width: 100%; accent-color: var(--dsw-alias-brand-primary, #7c9cff); }
      .wm-control input[type="range"] { height: 18px; }
      .wm-seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.07)); border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .wm-seg-btn { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, rgba(233,237,245,.6)); border-radius: 6px; padding: 4px 9px; font: inherit; font-size: 11.5px; cursor: pointer; }
      .wm-seg-btn.is-active { background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,.14)); color: var(--dsw-alias-label-primary, #e9edf5); box-shadow: 0 1px 2px rgba(0,0,0,.25); }
      .wm-toggle { position: relative; width: 34px; height: 20px; flex: none; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16)); background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,.12)); cursor: pointer; padding: 0; transition: background .18s ease, border-color .18s ease; }
      .wm-toggle.is-on { background: var(--dsw-alias-brand-primary, #6d8dff); border-color: transparent; }
      .wm-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .18s ease; }
      .wm-toggle.is-on .wm-toggle-thumb { transform: translateX(14px); }

      .wm-lib { display: flex; flex-direction: column; gap: 12px; }
      .wm-lib-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .wm-h2 { margin: 0; font-size: 14px; font-weight: 600; }
      .wm-root { display: flex; align-items: center; gap: 8px; margin-top: 3px; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary, rgba(233,237,245,.42)); }
      .wm-root-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: min(60vw, 520px); direction: rtl; text-align: left; }
      .wm-root-source { flex: none; padding: 1px 6px; border-radius: 5px; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.07)); }
      .wm-lib-tools { display: flex; gap: 8px; }
      .wm-lib-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .wm-filters { display: flex; gap: 6px; flex-wrap: wrap; }
      .wm-chip { appearance: none; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12)); background: transparent; color: var(--dsw-alias-label-secondary, rgba(233,237,245,.62)); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 11.5px; cursor: pointer; }
      .wm-chip.is-active { background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,.14)); color: var(--dsw-alias-label-primary, #e9edf5); }
      .wm-search { appearance: none; width: min(240px, 42vw); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12)); background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); color: inherit; font: inherit; font-size: 12px; outline: none; }
      .wm-search:focus { border-color: var(--dsw-alias-brand-primary, #6d8dff); }

      .wm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
      .wm-card { display: flex; flex-direction: column; min-width: 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1)); background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.035)); cursor: pointer; outline: none; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
      .wm-card:hover, .wm-card:focus-visible { border-color: var(--dsw-alias-border-l3, rgba(255,255,255,.24)); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,.22); }
      .wm-card.is-active { border-color: var(--dsw-alias-brand-primary, #6d8dff); box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary, #6d8dff) inset; }
      .wm-thumb { position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,.08)); }
      .wm-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s ease; }
      .wm-card:hover .wm-thumb img { transform: scale(1.03); }
      .wm-thumb-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--dsw-alias-label-tertiary, rgba(233,237,245,.4)); background: radial-gradient(120% 120% at 30% 10%, rgba(124,156,255,.18), transparent 70%), var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06)); }
      .wm-badge { position: absolute; top: 6px; left: 6px; padding: 1px 7px; border-radius: 999px; font-size: 10px; line-height: 1.6; color: #fff; background: rgba(8,10,15,.6); backdrop-filter: blur(6px); }
      .wm-badge-scene { background: rgba(92,74,214,.72); }
      .wm-badge-video { background: rgba(32,120,190,.72); }
      .wm-badge-image { background: rgba(32,150,110,.72); }
      .wm-badge-web { background: rgba(190,120,40,.72); }
      .wm-check { position: absolute; top: 6px; right: 6px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--dsw-alias-brand-primary, #6d8dff); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
      .wm-card-body { padding: 8px 10px 9px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .wm-card-title { font-size: 12.5px; font-weight: 550; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.7em; }
      .wm-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-tertiary, rgba(233,237,245,.42)); }
      .wm-card.is-active .wm-card-meta { color: var(--dsw-alias-link, #9db4ff); }
      .wm-rating { flex: none; padding: 0 5px; border-radius: 4px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.14)); font-size: 9.5px; }

      .wm-note { padding: 16px; border-radius: 12px; border: 1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.16)); color: var(--dsw-alias-label-secondary, rgba(233,237,245,.66)); font-size: 12.5px; }
      .wm-note p { margin: 6px 0; }
      .wm-note code { display: inline-block; margin-top: 4px; padding: 2px 6px; border-radius: 5px; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.08)); font-size: 11px; word-break: break-all; }
      .wm-note-small { padding: 10px 12px; font-size: 12px; }
      .wm-note-error { border-style: solid; border-color: rgba(255,120,120,.3); color: #ffb0b0; }
      .wm-footer { margin: 2px 0 8px; color: var(--dsw-alias-label-tertiary, rgba(233,237,245,.42)); font-size: 11px; line-height: 1.65; }

      @media (max-width: 720px) {
        .wm-now { flex-wrap: wrap; }
        .wm-now-actions { width: 100%; justify-content: flex-end; }
        .wm-root-text { max-width: 70vw; }
        .wm-search { width: 100%; }
      }
    `

    // ── Plugin entry ────────────────────────────────────────────────────────
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        locale = ctx.locale ?? null
        try { window.__WM_LOCALE__ = locale } catch { /* non-browser */ }

        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, { zh: DICTS.zh, en: DICTS.en }), 'wallpaper-machine: locale dictionaries')
        }

        const style = document.createElement('style')
        style.dataset.wmStyles = '1'
        style.textContent = CSS
        document.head.appendChild(style)

        ensureLayer()

        const disposers = []
        disposers.push(bindMessages())
        disposers.push(() => {
          style.remove()
          clearLive()
          if (layer.root) layer.root.remove()
          layer.root = null
          if (document.body) document.body.removeAttribute('data-wm-wallpaper')
          try { delete window.__WM_LOCALE__ } catch { /* ignore */ }
        })

        // The layer is plain DOM; paint it once now and after every state change.
        syncLayer()

        if (ctx.slots && typeof ctx.slots.inject === 'function') {
          ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.register(
            { name: SETTINGS_SLOT, id: SETTINGS_ID, order: 520, label: () => translate('nav.title') },
            () => React.createElement(WallpaperSettingsPage),
          ))
          // Optional nav glyph, addressed by the matching section id; the host
          // keeps its default gear when no icon is registered. Older hosts do
          // not declare this slot, so a failure here must not break the page.
          try {
            ctx.slots.inject(SETTINGS_ICON_SLOT, () => ctx.slots.register(
              { name: SETTINGS_ICON_SLOT, id: SETTINGS_ID, order: 520, label: () => translate('nav.title') },
              () => React.createElement(NavIcon),
            ))
          } catch { /* host without settings.section.icon */ }
        }

        ctx.effect(() => () => {
          for (const dispose of disposers) {
            try { dispose() } catch { /* best effort */ }
          }
        }, 'wallpaper-machine: layer and listeners')
      },
    }
  },
})

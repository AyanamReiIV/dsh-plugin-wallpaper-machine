// Small dev server used while developing the plugin: serves the exact host
// routes from ../index.js so the browser half and the Scene page can be
// exercised without installing into DSH.
import { createServer } from 'node:http'
import { createWallpaperHandler } from '../index.js'

const port = Number(process.env.PORT || 7799)
const handler = createWallpaperHandler({ libraryRoot: process.env.WM_LIBRARY_ROOT })

createServer((req, res) => { handler(req, res) }).listen(port, '127.0.0.1', () => {
  console.log(`wallpaper-machine dev server: http://127.0.0.1:${port}/wallpaper-machine/api/library`)
})

# dsh-plugin-wallpaper-machine

Use your local [WallpaperMachine](https://github.com/WallpaperMachine/WallpaperMachine) library as the
DeepSeek Harness background on macOS — no Wallpaper Engine, no Steam, no conversion step.

Open **Settings → Wallpaper Machine**, pick a wallpaper, and it is applied immediately behind the chat:
Scene wallpapers render live through WebWallGL, Video wallpapers play with `loop`, Image wallpapers are
shown as a still background, and Web wallpapers run in a sandboxed iframe.

![Wallpaper Machine settings page inside DeepSeek Harness](docs/preview.svg)

## Features

- Reads the real WallpaperMachine library (`project.json`, `scene.pkg`, preview image, video file).
- Scene wallpapers are rendered live by the vendored [WebWallGL](https://www.npmjs.com/package/webwallgl)
  3.0.1 runtime (MIT), parsed in the browser; the host only serves bytes with HTTP Range support.
- Video wallpapers use a native `<video>` (hardware decode, no WebGL texture upload).
- Fit (cover / contain / stretch), wallpaper opacity, dim overlay, frame rate, mute, pause.
- State is local (`localStorage`), so the wallpaper comes back on the next launch.
- Read-only: the plugin never writes to the WallpaperMachine folder or the user's library.
- Coexists with full-window skins: while a wallpaper is active, the plugin clears only the skin's
  painted stage so the wallpaper shows through, and keeps the skin's chrome and character cut-outs.

## Requirements

- macOS.
- DeepSeek Harness `0.2.0-rc.1` or newer (tested with `0.2.2-rc.5`).
- [WallpaperMachine](https://github.com/WallpaperMachine/WallpaperMachine) installed, with at least one
  wallpaper downloaded.

The plugin finds the library automatically:

1. `$WALLPAPER_MACHINE_HOME/Library` when `WALLPAPER_MACHINE_HOME` is set.
2. The library moved through WallpaperMachine's own storage settings, recorded in
   `~/Library/Application Support/WallpaperMachine/StorageLocation.json` (validated by the
   `.WallpaperMachineStorage` marker file).
3. `~/Library/Application Support/WallpaperMachine/Library` by default.

## Install

### From the DSH desktop app

1. Open **Plugins** in the sidebar.
2. Click **Add plugin** and enter `dsh-plugin-wallpaper-machine`.
3. Wait for the install to finish, then restart DeepSeek Harness if the app asks for it.
4. Open the account menu at the bottom-left → **Settings** → **Wallpaper Machine**.

### From the CLI

```bash
dsh plugin --profile desktop add dsh-plugin-wallpaper-machine
```

The `dsh` CLI prints the profile it changed. Restart DeepSeek Harness afterwards.

### From a local checkout (development)

```bash
cd ~/.dsh/profiles/desktop
pnpm add link:/absolute/path/to/dsh-plugin-wallpaper-machine
```

Add `"dsh-plugin-wallpaper-machine"` to `dsh.profile.bundles` in that profile's `package.json`, run
`pnpm install`, then restart DSH. A separate test profile works the same way:

```bash
dsh plugin --profile wmt add link:/absolute/path/to/dsh-plugin-wallpaper-machine
dsh --profile wmt --port 50599 --no-open
```

## Use

- Choose a wallpaper card to apply it. The setting takes effect immediately.
- **Pause** stops scene/video frames without unloading the wallpaper; **Turn off** hides the layer.
- **Dim overlay** is the readability knob: raise it for bright scenes, lower it for dark ones.
- Scene frame rate defaults to 60; 30 or 45 reduces GPU load on laptops.
- The wallpaper layer is behind the whole app, including the sidebar, when the active theme uses
  transparent surfaces. Full-window skins keep their own sidebar color by design.

## How it works

```
client.js                    body-level wallpaper layer + Settings page (React, slots)
index.js                     host: resolve library → scan → HTTP routes
scene-live/                  WebWallGL adapter page loaded in the layer iframe
vendor/webwallgl/            pinned WebWallGL 3.0.1 runtime (MIT)
```

Host routes under `/wallpaper-machine`:

| Route | Purpose |
| --- | --- |
| `/api/library` | scanned inventory (id, title, kind, preview URL, scene URL) |
| `/api/status` | resolved root, source, existence, count |
| `/files/<id>/<path>` | wallpaper bytes, `ETag` + `Range` (206/416), path-fenced |
| `/scene-live/` | transparent WebWallGL page for one scene |
| `/engine/webwallgl.global.min.js` | vendored engine |

Video and image payloads go straight to the browser; `scene.pkg` is fetched with Range requests and
decoded by WebWallGL. Nothing leaves the machine.

## Development

```bash
# standalone host + scene page, no DSH needed
node scripts/serve.mjs        # http://127.0.0.1:7799

# syntax check
node --check index.js
node --check client.js
node --check scene-live/renderer.js
```

`scripts/serve.mjs` uses the same `createWallpaperHandler()` as production. To test the client against a
running DSH, use a separate profile as shown above and open the printed `?token=` URL.

## Known limitations

- macOS only; the library paths and WallpaperMachine itself are macOS-specific.
- Scene rendering depends on WebGL2. If the GPU refuses a context, the plugin keeps the preview image
  and reports the error in the console.
- Web wallpapers are third-party HTML; they run sandboxed but are not otherwise audited.
- The plugin does not download wallpapers; manage the library in WallpaperMachine.

## License

MIT. WebWallGL is MIT and is redistributed under `vendor/webwallgl/` with its license.

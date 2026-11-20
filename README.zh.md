# dsh-plugin-wallpaper-machine

把 macOS 上 [WallpaperMachine](https://github.com/WallpaperMachine/WallpaperMachine) 的壁纸库接进
DeepSeek Harness——不需要 Wallpaper Engine，不需要 Steam，也不用转换格式。

打开 **设置 → 壁纸机**，选一张壁纸就会立刻铺到聊天界面后面：场景壁纸由 WebWallGL 实时渲染，
视频壁纸循环播放，图片壁纸作为静态背景，网页壁纸在沙箱 iframe 里运行。

![播放 WallpaperMachine 壁纸的 DeepSeek Harness 界面](docs/preview.svg)

## 功能

- 直接读取 WallpaperMachine 的壁纸库（`project.json`、`scene.pkg`、预览图、视频文件）。
- 场景壁纸由内置的 [WebWallGL](https://www.npmjs.com/package/webwallgl) 3.0.1（MIT）实时渲染，
  解析在浏览器里完成；宿主只负责带 HTTP Range 的只读文件服务。
- 视频壁纸使用原生 `<video>`，走硬件解码，不做 WebGL 纹理上传。
- 填充方式（铺满 / 完整显示 / 拉伸）、不透明度、暗化遮罩、场景帧率、静音、暂停。
- 状态保存在本地 `localStorage`，下次启动自动恢复。
- 只读：不会修改 WallpaperMachine 目录或壁纸库里的任何文件。
- 与整窗皮肤共存：壁纸启用时只清掉皮肤的背景画布，保留边框、侧栏和立绘。

## 要求

- macOS。
- DeepSeek Harness `0.2.0-rc.1` 或更新版本（已在 `0.2.2-rc.5` 上测试）。
- 已安装 [WallpaperMachine](https://github.com/WallpaperMachine/WallpaperMachine)，并至少下载了一张壁纸。

插件会自动定位壁纸库，顺序如下：

1. 设置了 `WALLPAPER_MACHINE_HOME` 时，读 `$WALLPAPER_MACHINE_HOME/Library`。
2. 在 WallpaperMachine 里移动过存储位置时，读
   `~/Library/Application Support/WallpaperMachine/StorageLocation.json` 指向的库
   （用 `.WallpaperMachineStorage` 标记文件校验）。
3. 默认 `~/Library/Application Support/WallpaperMachine/Library`。

## 安装

### 在 DSH 桌面版里安装

1. 打开左侧栏的 **插件**。
2. 点 **添加插件**，输入 `dsh-plugin-wallpaper-machine`。
3. 安装完成后，如果应用提示需要重启，就重启 DeepSeek Harness。
4. 点左下角账号菜单 → **设置** → **壁纸机**。

### 用命令行安装

```bash
dsh plugin --profile desktop add dsh-plugin-wallpaper-machine
```

命令会打印实际改动的 profile。安装完重启 DeepSeek Harness。

### 本地目录安装（开发）

```bash
cd ~/.dsh/profiles/desktop
pnpm add link:/absolute/path/to/dsh-plugin-wallpaper-machine
```

把 `"dsh-plugin-wallpaper-machine"` 加进该 profile `package.json` 的 `dsh.profile.bundles`，
执行 `pnpm install`，然后重启 DSH。也可以另建测试 profile：

```bash
dsh plugin --profile wmt add link:/absolute/path/to/dsh-plugin-wallpaper-machine
dsh --profile wmt --port 50599 --no-open
```

## 使用

- 点壁纸卡片即可启用，立即生效。
- **暂停渲染** 只停帧、不卸载壁纸；**关闭壁纸** 隐藏整个图层。
- **暗化遮罩** 是可读性旋钮：亮色壁纸调高，暗色壁纸调低。
- 场景帧率默认 60；笔记本发热时可以降到 30 或 45。
- 当前主题的侧栏/主区域是半透明时，壁纸会透过整个应用显示；整窗皮肤会保留自己的侧栏底色。

## 工作原理

```
client.js                    贴在 body 上的壁纸图层 + 设置页（React，slots）
index.js                     宿主：定位壁纸库 → 扫描 → HTTP 路由
scene-live/                  图层 iframe 里加载的 WebWallGL 适配页
vendor/webwallgl/            固定版本的 WebWallGL 3.0.1 运行时（MIT）
```

`/wallpaper-machine` 下的宿主路由：

| 路由 | 用途 |
| --- | --- |
| `/api/library` | 扫描结果（id、标题、类型、预览地址、场景地址） |
| `/api/status` | 解析出的目录、来源、是否存在、数量 |
| `/files/<id>/<path>` | 壁纸文件，支持 `ETag` 与 `Range`（206/416），路径围栏 |
| `/scene-live/` | 单张场景的透明 WebWallGL 页面 |
| `/engine/webwallgl.global.min.js` | 内置引擎 |

视频和图片直接交给浏览器；`scene.pkg` 通过 Range 请求读取，由 WebWallGL 在本地解码。
所有数据都只在本机流转。

## 开发

```bash
# 脱离 DSH，单独起宿主和场景页
node scripts/serve.mjs        # http://127.0.0.1:7799

# 语法检查
node --check index.js
node --check client.js
node --check scene-live/renderer.js
```

`scripts/serve.mjs` 与生产环境使用同一个 `createWallpaperHandler()`。要在真实 DSH 里测客户端，
按上面的方式另起一个 profile，打开命令打印的 `?token=` 地址即可。

## 已知限制

- 仅支持 macOS；壁纸库路径和 WallpaperMachine 本身都是 macOS 专属。
- 场景渲染依赖 WebGL2。GPU 拒绝创建上下文时，插件会保留预览图并在控制台报告错误。
- 网页壁纸是第三方 HTML，运行在沙箱里，但没有做额外审计。
- 插件不负责下载壁纸；壁纸库请在 WallpaperMachine 里管理。

## 许可

MIT。WebWallGL 也是 MIT，按 `vendor/webwallgl/` 中的许可证一起分发。

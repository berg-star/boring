# 无聊研究所：PWA 使用和维护

网站继续使用 C++ / Crow 和原生 HTML、CSS、JavaScript。PWA 提供安装到主屏幕、独立窗口打开、静态页面离线回退；游戏规则、房间匹配、API、WebSocket 协议没有改动。

## 手机添加到主屏幕

1. Android 手机使用 Chrome 或支持安装的系统浏览器访问 [无聊研究所](https://boring-lab-play.up.railway.app/)。微信里先选择“在浏览器打开”。
2. 首页出现“添加到主屏幕”按钮时可以点击；也可以打开浏览器菜单，选择“安装应用”或“添加到主屏幕”，按系统提示确认。按钮是否出现还由浏览器决定。
3. 主屏幕会出现青柠色标志，应用名为“无聊研究所”。从图标启动时，支持的浏览器会按 `standalone` 模式打开。

安装 UI 和实际呈现因浏览器、Android 设备及 Google 服务支持而不同；部分设备提供主屏幕快捷方式。iPhone 可使用 Safari 的“分享 → 添加到主屏幕”。实际手机的安装、触控和全面屏显示仍需真机确认。

微信内置浏览器、外部浏览器和不同浏览器各自有存档。请从原来有记录的浏览器安装；若要换浏览器，先用“我的行李箱”的复制/粘贴方式搬家。安装本身不会帮你同步其他浏览器的记录。

## 本地测试

先按照 [README 的构建说明](README.md#windows-构建与运行) 编译并启动 Crow。已配置的 VS 构建目录可运行：

```powershell
cmake --build build --config Release --parallel 2
.\build\Release\boring_lab.exe
```

若当前使用 MinGW 或其他构建目录，按该目录的现有方式构建和启动，不要混用生成器。修改 JSON 后要重启服务；修改 C++ 前先停止旧进程。

用 Chrome 打开 `http://127.0.0.1:18080/`。localhost / 127.0.0.1 是 PWA 本地开发的安全来源；手机访问电脑的普通 HTTP 局域网地址不等同于它，手机安装测试请使用 Railway 的 HTTPS 地址。

打开开发者工具的 Application 面板：

- Manifest：应用名、`standalone`、启动地址 `/` 和图标应正确，没有资源加载错误。
- Service Workers：脚本地址 `/sw.js`，状态 activated，作用域覆盖站点根目录。
- Cache Storage：有 `boring-lab-pwa-v3` 静态缓存，内容不应包含 `/api/`、`/ws/` 或 `/healthz`。

首次安装缓存完成后，刷新一次，再启用开发者工具的 Offline 模式，打开首页、转盘或宠物等页面；恢复网络后再试联机建房。浏览器的网络模拟和系统连接状态可能不同，离线提示主要随系统 online/offline 状态显示；缓存是否成功应以实际页面和请求结果判断。

自动验收需要 Node.js、Playwright 和 Chrome：

```powershell
npm install --prefix tools
$env:BASE_URL = "http://127.0.0.1:18080"
node tools/check-pwa.cjs
```

检查使用独立的普通浏览器测试配置，而非禁止安装的无痕模式；结束后删除它自己创建的临时配置。验证 manifest、PNG 尺寸、实际 Chromium 可安装性、SW 根作用域、静态离线回退、API 网络直连、SW 控制下的 WebSocket 实时计分、更新等待和所有页面的 320 / 390 / 844 / 1440 像素布局。测试会创建临时联机房间；不要指向无权测试的服务。

## 缓存边界和更新

`static/sw.js` 首次安装缓存白名单中的静态 HTML、CSS、JavaScript、图标和 manifest；现有站点的这些资源约半兆。在线访问优先请求服务器，成功后更新静态缓存；网络失败时回退到缓存。无法离线打开的导航会显示 `/offline.html`。HTML 邀请链接中的 `room` 参数仍会交给原有页面读取，缓存键只保留静态页面路径。

所有 `/api/`、`/ws/`、`/healthz`、POST 请求和外站请求都不由 SW 缓存或伪造响应。联机建房、匹配、对局和服务器抽取需要网络。仅缓存页面外壳不会让服务器功能变成离线游戏；转盘、宠物、涂鸦等已有本地逻辑可以继续按自身规则运行。

PWA 缓存与 localStorage 存档分开。激活新版本时只清理 `boring-lab-pwa-` 前缀的旧缓存，不清除游戏记录或其他缓存。没有 `skipWaiting`、强制刷新或自动重连改动；新的 SW 等旧页面关闭后再接管，以免打断正在玩的对局。

以后添加页面或资源，需要同时更新 C++ 白名单和 `static/sw.js` 中的 `STATIC_PATHS`；调整缓存结构时递增 `CACHE_NAME` 的版本。在线请求优先策略可以让普通访问取到服务器新版，但离线内容以最近成功保存的版本为准。

## 文件与 Railway 部署

| 文件 | 用途 |
| --- | --- |
| `static/manifest.json` | 应用名称、根启动地址、根作用域、独立窗口、主题色和图标配置 |
| `static/sw.js` | 从根地址 `/sw.js` 提供的 Service Worker，静态缓存与离线回退 |
| `static/pwa.js` | 注册 SW、可选安装按钮、系统离线提示 |
| `static/themes.js`、`static/themes.css` | 四种界面主题、保存选择、更新当前窗口主题色 |
| `static/pwa.css` | 全面屏安全区域、手机触摸目标、PWA 提示样式 |
| `static/offline.html` | 无缓存页面的离线备用页 |
| `static/app-icon.svg`、四个 PNG | 复用原有青柠色“✳”标志；192 / 512 普通图标、512 maskable、180 Apple 图标 |
| `static/*.html` | 统一链接 manifest、主题色、Apple 图标、PWA 脚本样式和 `viewport-fit=cover` |
| `src/main.cpp` | manifest / SW 根路由、静态白名单和正确的 manifest / PNG / SVG MIME 类型 |
| `tools/check-pwa.cjs`、`tools/check-http.py` | PWA 专项验收和基础资源检查 |
| `.github/workflows/docker-check.yml` | 在现有 Linux Docker 和联机检查前增加 PWA 验收 |

Dockerfile 已复制整个 `static/` 目录，无需修改 Railway 构建或端口配置。Railway 公网 HTTPS 提供安全来源，浏览器注册的是同域根地址 `/sw.js`，不是容器内部地址。响应声明根作用域；manifest MIME 为 `application/manifest+json`，SW 为 JavaScript，图标为 `image/png`。

部署后核对 `/manifest.json`、`/sw.js` 和图标均返回 200，再在普通 Chrome 验证安装条件及 SW。测试通过说明技术条件达标，不等同于每种手机、内置浏览器都会出现同样的安装入口。

参考：[MDN 可安装 PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)、[MDN Service Worker 注册和作用域](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)。

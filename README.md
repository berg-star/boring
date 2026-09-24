# 无聊研究所

一个打开就能玩几分钟的娱乐小站：反应速度测试、命运转盘、今日抽卡、奇怪问题、随机整活、真心话。深色背景，少量霓虹配色，支持电脑和手机。

技术栈：**C++17 + Crow 1.2.1 + CMake + JSON**；前端为原生 HTML / CSS / JavaScript。没有数据库，没有前端框架，没有 Node.js 后端。

**准备公网部署：阅读 [Render 上线说明](DEPLOY_RENDER.md)**。Dockerfile 和 render.yaml 已准备好，Render 自动完成 Linux 编译；你的电脑仍然可以用现有 Windows 方式运行。

## 项目结构

```text
boring-lab/
├── CMakeLists.txt          # 自动获取固定版本 Crow / Asio，构建并复制资源
├── README.md
├── Dockerfile             # Linux 多阶段编译和非 root 运行
├── .dockerignore          # 只上传必需源码到 Docker 构建上下文
├── render.yaml            # Render 免费 Web Service 配置
├── DEPLOY_RENDER.md       # GitHub / Render 操作与填写项
├── src/main.cpp           # HTTP 服务、静态文件、JSON 校验、随机接口
├── static/
│   ├── index.html         # 首页和分类
│   ├── style.css          # 共用样式及响应式布局
│   ├── main.js            # 随机入口、首页筛选
│   ├── reaction.html / reaction.js
│   ├── wheel.html / wheel.js
│   ├── card.html
│   ├── question.html
│   ├── fun.html
│   └── random.js          # 三个随机页面共用请求、展示及错误处理
├── data/
│   ├── cards.json         # 12 张娱乐卡片
│   ├── questions.json     # 18 个奇怪问题
│   └── activities.json    # 10 份随机状态
└── tools/                 # 可选验收工具，不参与网站运行
    ├── package.json
    └── check-browser.cjs
```

## Windows 构建与运行

准备：安装 **Visual Studio 2022 Community**，选择“使用 C++ 的桌面开发”（包含 MSVC 和 Windows SDK）；安装 **CMake 3.20+** 和 **Git**，确保终端能找到 `cmake`、`git`。首次配置需要连接 GitHub 下载依赖。

在项目根目录打开 PowerShell：

```powershell
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --parallel
.\build\Release\boring_lab.exe
```

浏览器打开 **http://localhost:18080**。终端保持开启，按 Ctrl+C 停止服务。

本机已经生成可执行文件；可以直接执行第三条命令。也可双击 `build\Release\boring_lab.exe`，程序会从自身所在目录查找资源。

若提示端口占用，先关闭此前运行的网站服务。重新编译前也应停止旧程序，避免 Windows 锁住可执行文件。不要在同一个 build 目录混用不同的编译器或 CMake 生成器。

## Linux 构建与运行

Ubuntu / Debian 安装工具：

```bash
sudo apt update
sudo apt install build-essential cmake git
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
./build/boring_lab
```

浏览器同样访问 **http://localhost:18080**。要求支持 C++17 的编译器，例如 GCC 9+。本地使用 Windows / MSVC 验收，Linux Docker 构建由 GitHub Actions 验证。

## Crow 如何配置

`CMakeLists.txt` 使用 CMake FetchContent 自动下载 **Crow v1.2.1** 和 **standalone Asio 1.30.2**，链接 `Crow::Crow`。本地 HTTP 第一版关闭了 SSL、压缩、Crow 示例与测试，因此不用额外配置 OpenSSL 或 zlib。Windows 所需的 socket 系统库已加入链接配置。

依赖缓存在 `build/_deps/`。首次下载失败时，检查 GitHub 网络连接后重试配置；不需要把依赖手工复制到 `include/`。完全离线时可准备同版本源码：

```bash
cmake -S . -B build -DFETCHCONTENT_SOURCE_DIR_CROW=/path/to/Crow -DFETCHCONTENT_SOURCE_DIR_ASIO=/path/to/asio
```

Asio 路径应指向含 `asio/include/asio.hpp` 的仓库根目录。参考：[Crow 官方安装说明](https://crowcpp.org/1.2.1/getting_started/setup/)。

## 页面入口

| 地址 | 玩法 |
| --- | --- |
| `/` | 首页，分类筛选，“随便给我来一个” |
| `/reaction.html` | 反应速度，抢跑提示，当前浏览器会话最佳成绩 |
| `/wheel.html` | 两种模板、添加 / 删除选项、真实旋转和结果 |
| `/card.html` | 点击抽卡，由 C++ 接口返回数据 |
| `/question.html` | 随机问题，再来一个 |
| `/fun.html` | 随机状态、行动力、工作欲望和玩笑 |

静态网页也可以通过 `/static/页面名.html` 访问。所有资源从本站加载，不依赖外部字体或 CDN。不要直接双击 HTML：三个随机玩法需要从 Crow 服务访问。

## 后端接口与数据

| GET 接口 | 返回字段 |
| --- | --- |
| `/api/hello` | `message: "Hello from C++"` |
| `/healthz` | `status: "ok"`，供平台检查服务健康状态 |
| `/api/random-card` | `keyword`, `lazyIndex`, `luck`, `message` |
| `/api/random-question` | `question` |
| `/api/random-fun` | `mood`, `energy`, `workIndex`, `sentence` |

JSON 文件最外层是非空数组；字符串字段不能为空，指数必须为 0～100 的数字。启动时读取并校验数据：文件丢失、格式错误、字段错误会打印原因并退出，而不是悄悄生成错误结果。启动后每次请求等概率抽一条；允许重复，点击“今日抽卡”也不限于每天一次，所有内容仅供娱乐。

随机数采用 `<random>`，每个线程拥有自己的引擎。API 设置 `Cache-Control: no-store`，前端也禁用随机请求缓存，并提供等待、超时、失败和重试反馈。只允许访问显式列出的静态文件，避免任意读取磁盘路径。

## 修改与扩展

默认运行使用可执行文件旁的 `static/`、`data/`，每次构建自动复制。**改动前端文件或 JSON 后，重新构建再运行**；JSON 在启动时读取，修改后需要重启。

开发时也可以直接使用项目根目录的资源，前端改完刷新即可：

```powershell
.\build\Release\boring_lab.exe "L:\boring-lab"
```

其他机器将参数替换成实际项目根目录。Linux 示例：`./build/boring_lab "$PWD"`。

增加前端小游戏时，添加 HTML / JS，在 `main.cpp` 的 `pages` / `assets` 白名单和首页卡片、随机入口列表中登记即可。暂时不需要拆出复杂的类或服务层。下一步最适合加 **记忆翻牌**：代码量适中，能沿用当前卡片风格，也不需要数据库。

## 可选自动验收

网站运行不需要 Node.js。`tools/` 中的 Playwright 脚本仅用于开发验收；需要 Node.js 和已安装的 Chrome。先启动 Crow 服务，再在另一个终端执行：

```powershell
npm install --prefix tools
node tools/check-browser.cjs
```

覆盖真实接口、资源、异常 JSON、反应测试、转盘指针与结果一致性、请求失败重试，以及 320 / 390 / 768 像素宽度的布局。截图保存在被忽略的 `.qa/`。

部署改动另有 Python 标准库检查：运行中的服务可执行 `python tools/check-http.py http://127.0.0.1:18080`；停止本地服务后，可执行 `python tools/check-startup.py`，自动验证默认端口、自定义 HOST / PORT 和错误配置，并在结束时关闭测试进程。后一个检查要求本机 18080、18081 端口空闲。

## 本地与上线

本地默认监听 `127.0.0.1:18080`，无需设置环境变量。部署到 Render 时，Docker 配置设置 `HOST=0.0.0.0`、`PORT=10000`；运行时可更改 PORT，程序不会写死平台端口。PORT 必须是 1～65535 的整数；HOST 只接受 `127.0.0.1` 或 `0.0.0.0`。错误配置会明确报错并退出。

Render 会从源码构建 Linux 容器，不运行 Windows `.exe`。具体操作见 [Render 上线说明](DEPLOY_RENDER.md)。线上 HTTPS 由 Render 提供，不需要自行配置证书。目前网站已部署到 Railway：https://boring-lab-production.up.railway.app/ 。Railway 同样从 Dockerfile 构建，使用 `/healthz` 检查健康状态。

浏览器支持 WebMCP 时，首页共用脚本还会注册“打开指定玩法”的可选导航动作；普通浏览器无此能力时自动跳过，不影响游戏。

## 本次验收结果

- Windows / Visual Studio 2022 Release 构建成功，真实 Crow 服务响应正常。
- Render 适配已在 Windows 验证默认地址、自定义监听地址与端口、`/healthz` 和错误配置；Linux Docker 构建已由 GitHub Actions 验证，网站已部署到 Railway。
- 健康检查、五个 API、七个页面及其资源、未知路径 404、随机结果变化已验证。
- 浏览器交互已验证：分类和随机跳转、反应测试抢跑 / 计时 / 键盘 / 最佳成绩、转盘增删选项 / 模板 / 指针结果一致 / 减少动画、抽卡和其他随机页面、真心话分类 / 同轮不重复 / 跳过 / 切换保留进度、网络失败后重试。
- 320 / 390 / 768 像素宽度无水平溢出；已人工查看桌面首页、手机首页和手机转盘截图。
- 缺失数据、错误 JSON、空数组和越界指数均能清楚报错并退出。
- 当前 Chrome 无原生 WebMCP 上下文，此可选能力未做真实代理调用验证；常规浏览器功能已通过。Linux 尚未在本机实际编译。

## 真心话

入口 `/truth.html`，轻松和走心各 20 题。每类独立洗牌，同一轮不重复；切换分类保留当前进度，刷新页面重新开始。支持直接跳过，不收集答案。题库位于 `data/truths.json`，接口为 `/api/truth-questions`。

## 奇怪小宠物

入口 `/pet.html`。外形随机生成，支持跟随视线、喂食、戳一戳、陪玩和起名。饱腹感、心情和体型随时间变化，离开超过 6 小时再回来会出现散步纸条，1 分钟后回家，也可立即召回；不会死亡。

全部逻辑在原生前端执行，C++ 只提供页面和资源。存档使用当前网站的 `localStorage`（键 `boring-lab-pet-v1`），不同浏览器各自独立；清除网站数据会丢失。不上传名字或状态，不需要数据库。支持 JSON 导出与导入，导入需确认替换；损坏的旧存档不会被自动覆盖。浏览器无法保存时会提示备份。刷新保留宠物，多标签页同步存档变化。

宠物专项验收：服务启动后执行 `node tools/check-pet.cjs`，覆盖保存恢复、互动、离线时间、导入导出、损坏存档和移动布局。

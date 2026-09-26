# 无聊研究所

想学习项目实现：先读 [HTML 入门教学](HTML入门教学.md)，再读 [核心代码教学](核心代码教学.md)。

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
│   └── random.js          # 抽卡和奇怪问题共用请求、展示及错误处理
├── data/
│   ├── cards.json         # 36 张六系列主题卡片
│   ├── questions.json     # 18 个奇怪问题
│   └── activities.json    # 24 份整活小节目
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
| `/card.html` | 抽取后翻面揭晓、收藏册、生成分享图 |
| `/question.html` | 随机问题，再来一个 |
| `/fun.html` | 六类随机小节目及复制分享 |

静态网页也可以通过 `/static/页面名.html` 访问。所有资源从本站加载，不依赖外部字体或 CDN。不要直接双击 HTML：三个随机玩法需要从 Crow 服务访问。

## 后端接口与数据

| GET 接口 | 返回字段 |
| --- | --- |
| `/api/hello` | `message: "Hello from C++"` |
| `/healthz` | `status: "ok"`，供平台检查服务健康状态 |
| `/api/random-card` | `id`, `series`, `rarity`, `keyword`, `tagline`, `message`, `skill`, `skillText`, `good`, `avoid`, `luckyItem`, `bonusLabel`, `bonus`, `luck` |
| `/api/random-question` | `question` |
| `/api/random-fun` | `kind`, `title`, `intro`, `label1..3`, `value1..3`, `footer` |

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

## 无聊星球

入口 `/planet.html`。原生 Canvas 绘制的可旋转小星球，无第三方绘图库、额外接口或数据库。鼠标和手指拖动旋转，轻点探索；也可选择种树、下雨或火山喷嚏，切换昼夜。方向键旋转，回车或空格触发事件。拖动不会误触种树，支持减少动态效果设置，隐藏页面暂停动画，最多保留 100 棵树和 12 个短暂效果。刷新后重新开始，不写入宠物存档。

专项验收：`node tools/check-planet.cjs`，覆盖拖动与点击区分、事件、昼夜、键盘、触摸及手机布局。

星球音效由浏览器 Web Audio 实时合成：种树、下雨、火山喷嚏、海面和小树回应各有短音效，无外部音频文件。第一次互动后播放，声音开关会记住选择，切到后台或关闭声音会停止当前音效；浏览器不支持时可继续无声游玩。

随机整活现有六种节目，每种四份：胡闹报告、脑内公告、离谱通缉令、人生补丁、小广告、无用发明。C++ 随机返回一份完整节目，前端按类型展示，避免无关联拼接。复制失败时显示可手动复制的文字。专项验收：`node tools/check-fun.cjs`。

## 答案之书

入口 `/book.html`。200 句原创短句保存在 `data/answers.json`，C++ 启动时校验，通过 `/api/book-answers` 一次提供题库。前端随机洗牌，同一轮不重复，跨轮避免紧接着抽到同一句；刷新重新开始。不输入、不保存问题，不需要 AI 或数据库。

深色书封、暖白内页，支持翻开和合上、复制答案、复制失败时手动选择文字、减少动态效果、可关闭的合成翻页声。音效只在用户交互后触发，开关偏好存于当前浏览器。随机回应仅供娱乐。

专项验收：`node tools/check-book.cjs`，覆盖 200 条唯一答案、完整不重复轮次、翻页和关闭状态、音效、复制及降级、接口失败/非法数据后的重试和手机布局。

## 荒谬成就

成就册入口 `/achievements.html`，首页和各页页脚均可进入。共 12 个成就，涵盖探索九种玩法、转盘停留与完成、反应测试、抽卡、整活类型收集、跳过真心话、宠物起名、种树及翻书。成功事件才计数；解锁提示排队展示，可关闭，不发声，不抢焦点；未解锁仅显示线索。

记录从功能上线后开始，保存在 `localStorage` 的 `boring-lab-achievements-v1`。累计次数和解锁日期跨刷新保留，连续抢跑在成功测试或离开页面后清零。转盘只累计页面可见时间，定期记录，浏览器突然关闭可能丢失最后几秒。现代浏览器使用 Web Locks 串行写入，跨标签页同步；不支持锁的旧浏览器建议只开一个标签页。损坏存档不自动覆盖，无法保存时成就册明确提示；无数据库、账号或用户回答收集。

专项验收：`node tools/check-achievements.cjs`，验证全部触发条件、失败不计数、刷新去重、前台计时、多标签页同时写入、异常存储与手机布局。

## 六系列主题卡片

今日抽卡升级为 36 张原创主题卡，松弛、勇气、灵感、好运、陪伴、搞怪各六张。每张卡包含寄语、专属技能、宜忌、幸运物和主题彩蛋。去掉摸鱼指数，幸运值仅作娱乐装饰；R / SR / SSR 是趣味标记，36 张卡等概率抽取。

`/api/random-card` 返回随机一张，`/api/cards` 提供完整卡册。点击抽取后需翻面，成功翻面才计入收集与抽卡成就。重复卡不重复计数；收藏册支持系列、已收集、爱心收藏筛选和旧卡查看，查看旧卡不计入成就。收藏键为 `boring-lab-cards-v1`，与宠物和成就记录独立；清理网站数据会丢失。不支持跨设备同步，不使用数据库。

分享图由本地 Canvas 生成完整 PNG，可下载或在手机上长按保存，不依赖外部图像服务。专项测试 `node tools/check-cards.cjs` 覆盖全部卡片与图片导出、翻面统计、收藏恢复、筛选、失败重试、手机布局和异常存储。旧版 12 张卡没有收藏存档需要迁移，已有抽卡成就计数继续保留。


### 命运转盘：生活分类与饮品店

九类场景：早餐、午饭、晚饭、饮品、夜宵、零食甜点、休闲活动、周末去哪、动一动。饮品可先抽店铺再抽饮品，也可直接指定店铺或抽通用品类。内置四家品牌，支持另外添加最多八家自定义店。

每组独立维护 2–12 个选项，每项最多 12 个字；勾选参与抽取，至少保留两个。支持排除刚抽中的结果、恢复当前默认、自定义店删除。当前选择和菜单保存到本浏览器 `boring-lab-wheel-v1`，不需要数据库，也不跨设备同步；清除网站数据会重置。多标签页同时编辑时以最后保存为准。存储不可用或记录损坏时可以继续玩，但不覆盖原记录。

预设数据位于 `static/wheel-presets.js`。品牌菜单为参考示例，不包含实时供应、价格或推荐糖冰。2026-09-26 参考官方资料：
- 霸王茶姬（香港菜单，实际地区供应可能不同）：https://chagee.com.hk/product/fresh-milk-tea-series
- 蜜雪冰城：https://www.mxbc.com/product_strength.html
- 瑞幸咖啡：https://www.lkcoffee.com/products/44
- 星巴克：https://www.starbucks.com.cn/menu/beverages/espresso/caramel-macchiato/

专项检查：`node tools/check-wheel.cjs`；可设置 `BASE_URL` 验证已部署网站。


## 涂鸦活了

`doodle.html` / `doodle.js` / `doodle.css` 提供鼠标与触屏绘画、五种颜色、三档笔尖、撤销、清空和示例小怪物。完成后将整幅画裁出并缩放到舞台，通过 Canvas 变换实现果冻、蹦跳、倒下及随机动作；支持戳一下、暂停和返回编辑。不会识别肢体，不使用 AI 或上传画作。

笔画以坐标保存于 `boring-lab-doodle-v1`，最多 100 笔、16000 个点；读取时校验存档，损坏或存储不可用时保留旧记录并提示。减少动态效果设置下保持静态；隐藏页面时停止动画。首页现有 10 个玩法，成就“常驻人口”仍保持访问九个不同玩法即可解锁，已有解锁不会撤销。

专项检查：`node tools/check-doodle.cjs`；支持 `BASE_URL` 指向线上。这里的 Node 仅用于浏览器验收。


## 桌面破坏王

`smash.html` / `smash.js` / `smash.css` 提供玻璃、积木、气泡三个场景，无分数和时间限制。玻璃每块随机生成 6–14 的耐久，集中敲同一区域会累积额外损伤，但至少六次才破碎。积木在小塔、阶梯、墙、偏斜堆叠四种布局中随机生成，不连续重复同一类；尺寸、颜色和层数也有变化，碰撞和拖拽按实际宽高计算（不模拟旋转刚体）。气泡按滑动轨迹采样，默认等待 0.5–1.2 秒后用 0.25 秒重新鼓起，可关闭自动再生。每个场景均支持重置和键盘/按钮操作。

Web Audio 实时合成音效，限制音量、发声频率和并发数量；关闭音效立即停止现有声音。震动默认关闭，仅支持的浏览器可开启，实际反馈取决于设备。偏好存于 `boring-lab-smash-settings-v1`，自动再生偏好也会保存；不保存破坏进度。页面隐藏时暂停动画并停止声振；减少动态效果设置下跳过玻璃飞散和气泡扩散动画，积木保留核心物理交互。首页现有 11 个玩法。

验收：`node tools/check-smash.cjs` 和 `node tools/check-smash-variety.cjs`，可用 `BASE_URL` 检查公网版本。浏览器测试验证音频节点生成和开关，不等于对扬声器音质或真机马达强度的实测。

### 涂鸦工作室扩展

随机造型库在 `static/doodle-presets.js`：20 个基础线稿，分生物、物品、抽象三类，随机比例、镜像、颜色；仍是普通笔画，可补画、撤销或整幅换色。`doodle-toy.js` 处理抓取、释放速度、边界碰撞和落地回弹，桌面、蹦床、月球使用不同重力/回弹参数。键盘用户也可使用“抛起来试试”。遵循暂停、减少动态效果和页面隐藏状态。

收藏夹在 `doodle-shelf.js`，使用独立存储 `boring-lab-doodle-shelf-v1`，最多 12 幅，支持命名、另存、打开、改名、删除。每幅保存笔画快照，打开编辑不覆盖原收藏；替换画纸与删除前提示。读取时校验内容，写入失败不覆盖旧记录。支持 Web Locks 时串行更新跨标签页收藏；旧画纸键 `boring-lab-doodle-v1` 和格式不变。收藏只在当前浏览器，不上传，不是宠物养成。

新增检查：`node tools/check-doodle-studio.cjs`，覆盖默认造型、收藏隔离、鼠标/触控拖抛、舞台物理差异与移动布局。
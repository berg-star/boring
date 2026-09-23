# 把无聊研究所部署到 Render

本项目已经包含 Docker 和 Render 配置。你不需要自己租服务器、安装 Linux 或配置 VS2022；Render 会在 Linux 容器里自动编译 C++ 并运行网站。上线后使用平台分配的 HTTPS 地址。

## 1. 把项目放到 GitHub

登录 GitHub，创建一个仓库（公开或私有均可），将本项目源码放在仓库根目录。建议使用 Git 或 GitHub Desktop 上传，确保隐藏文件也一起上传。

根目录应当能直接看到：

```text
CMakeLists.txt
Dockerfile
.dockerignore
render.yaml
src/main.cpp
static/...
data/...
```

README、本文档和 tools 可以一起上传。`.github/workflows/docker-check.yml` 用于在 GitHub Actions 自动验证 Linux Docker 构建，也建议保留。不要上传本机 `build/`、`.qa/`、`tools/node_modules/` 或 Windows `.exe`；`.gitignore` 已排除这些内容。

## 2. 在 Render 创建服务（推荐 Blueprint）

1. 登录 Render，点击 **New → Blueprint**。
2. 连接 GitHub，并授权访问刚刚的仓库。
3. 选择仓库和实际存放代码的分支。
4. Render 会读取仓库根目录的 `render.yaml`。确认预览只有一个 `boring-lab` Web Service，方案为 **Free**，再按页面提示创建。
5. 等待下载依赖、C++ 编译和健康检查完成。

配置没有数据库、磁盘或付费附加服务。如果页面要求改成付费方案，先核对账号的免费服务资格和提示，不必直接开通付费资源。

### 如果你选择 New → Web Service

也可以不用 Blueprint，按下面填写；手动创建 Web Service 时，不要假设它会自动套用 `render.yaml` 的所有设置。

| 选项 | 填写内容 |
| --- | --- |
| Repository / Branch | 你上传代码的仓库和分支 |
| Name | `boring-lab`，或你喜欢的名称 |
| Language / Runtime | **Docker** |
| Root Directory | 留空（代码在仓库根目录时） |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.`（若界面显示此项） |
| Docker Command | 留空，使用 Dockerfile 中的启动命令 |
| Instance Type | **Free** |
| Health Check Path | `/healthz` |
| Environment Variables | `HOST=0.0.0.0`；`PORT=10000` |
| Region | 按你和使用者所在位置选择可用区域 |

Docker 部署不用另填 CMake 的 Build Command 或普通 Start Command；这些已经写在 Dockerfile 里。

## 3. 判断是否成功

服务状态变为 **Live** 后，打开 Render 页面实际给出的网址（通常以 `.onrender.com` 结尾，不要按服务名自行猜网址）。

- 首页能打开，分类和随机入口可点击。
- `/healthz` 返回 `{"status":"ok"}`。
- `/api/random-card` 返回卡片 JSON。
- 打开抽卡、问题、整活页面，确认能得到结果。

平台处理外部 HTTPS，Crow 在容器内部提供 HTTP，不需要在 C++ 里配置 SSL，也不需要自行安装 Caddy。

## 4. 常见部署日志

| 日志或现象 | 处理 |
| --- | --- |
| 找不到 Dockerfile | 确认 Dockerfile 在选定分支的仓库根目录，Root Directory 留空 |
| GitHub 下载 Crow / Asio 失败 | 依赖下载可能暂时失败；查看错误后重试部署，保留完整构建日志 |
| No open ports / 健康检查超时 | 检查 `HOST=0.0.0.0`、PORT 是合法数字、健康检查路径为 `/healthz` |
| Cannot open file / static/index.html is missing | 检查 `data/`、`static/` 是否完整上传，文件名大小写是否一致 |
| 编译器报错 | 复制从第一条 `error:` 开始的日志和结尾错误信息，便于定位 |
| 打开免费站点先等待一会儿 | 可能是休眠后的唤醒，查看 Render 状态，不要立刻重复部署 |

本项目不需要密码、API Key 或数据库连接。不要把账号密码、访问令牌放进仓库。

## 免费方案与数据

根据 Render 官方文档，免费 Web Service 在 15 分钟无入站流量后会休眠，下一次请求唤醒通常约一分钟；免费额度和资格以账号页面为准。

当前 JSON 是随镜像打包的只读初始内容，重新部署和唤醒后仍然存在。本版没有写入磁盘的用户数据，反应测试最佳成绩存在用户浏览器里。以后如果加入排行榜或 SQLite，需要单独设计持久化，不能依赖 Render 临时文件系统保存记录。

修改内容后提交到所连接的 Git 分支，再查看 Render 的自动部署设置或手动执行 Deploy latest commit。修改本机文件而不上传，不会影响线上网站。

## 可选：在安装 Docker 的电脑上验证

无需为了上线专门给当前电脑装 Docker；Render 可以直接构建。已有 Docker 时可执行：

```bash
docker build -t boring-lab .
docker run --rm -p 127.0.0.1:18080:10000 boring-lab
```

先停止占用本机 18080 端口的旧服务。浏览器打开 `http://localhost:18080`。另开终端运行 `python tools/check-http.py http://127.0.0.1:18080` 可检查页面和接口。

## 当前验证范围

Windows / MSVC 已重新编译通过，并实际验证：默认 `127.0.0.1:18080`、部署设置 `0.0.0.0:18081`、健康检查、全部页面与资源、三个随机接口、未知地址 404、资源目录定位和错误 HOST / PORT 拒绝启动。

本机没有 Docker 或可用的 Linux 环境，尚未实际运行这个镜像或在 Render 上部署。已提供 GitHub Actions 工作流：推送到 `main` / `master` 或手动运行后，自动构建 Linux 镜像，用不同于默认值的 PORT 启动，并检查健康接口、网页、静态资源和 JSON API。GitHub Actions 与 Render 的部署是独立的；Actions 通过不代表 Render 已上线。

官方参考：[Docker 部署](https://render.com/docs/docker)、[Blueprint 配置](https://render.com/docs/blueprint-spec)、[端口要求](https://render.com/docs/web-services#port-binding)、[健康检查](https://render.com/docs/health-checks)、[免费服务限制](https://render.com/docs/free)。

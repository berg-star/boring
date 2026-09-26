# 从无聊研究所学习 HTML

这份文档写给刚接触 HTML 的你。例子取自当前网站，按“看懂一个标签 → 看懂反应测试页面 → 看懂其他交互控件”的顺序阅读。部分片段为了教学删去了无关属性，会明确说明。

第一遍只需要读到第 5 节。不要急着记住所有标签，能在自己的网页里找到它们就够了。

主要对照文件：[反应测试](static/reaction.html)、[首页](static/index.html)、[命运转盘](static/wheel.html)、[宠物](static/pet.html)。想了解 C++ 和完整运行过程，再读 [核心代码教学](核心代码教学.md)。

## 1. HTML 负责什么

HTML 的全称是 HyperText Markup Language（超文本标记语言）。这里的“标记”，就是通过标签说明一段内容是什么：标题、段落、链接、按钮、输入框……

以反应测试为例：

| 技术 | 在这个页面里负责什么 |
|---|---|
| HTML | 放置“反应速度测试”标题、点击区域、成绩文字 |
| CSS | 设置深色背景、按钮大小、绿色状态、布局 |
| JavaScript | 等待随机时间、切换状态、计算反应速度 |
| C++ 后端 | 把网页文件发送给浏览器 |

HTML 本身不会计算反应时间。它先提供可以显示和操作的元素，JavaScript 再根据玩家的操作更新这些元素。

## 2. 先学会读一个标签

### 2.1 开始标签、内容、结束标签

反应测试页面中有：

```html
<h1>反应速度测试</h1>
```

- `<h1>`：开始标签，表示一个一级标题。
- `反应速度测试`：内容。
- `</h1>`：结束标签，多了一个 `/`。

这整个部分称为一个 HTML 元素。浏览器把它作为标题显示，而不是把尖括号原样显示。

再看一个段落：

```html
<p>眼睛说会了，手跟上了吗？等区域变绿，立刻点击。</p>
```

`p` 表示段落。标签名说明内容的作用，不是我们随便起的变量名。

### 2.2 属性写在开始标签里

```html
<button id="spin" class="primary" type="button">开始旋转 ↻</button>
```

逐项看：

| 部分 | 含义 |
|---|---|
| `button` | 这是按钮 |
| `id="spin"` | 这个元素的唯一标识是 `spin` |
| `class="primary"` | 这个元素属于 `primary` 样式类 |
| `type="button"` | 普通按钮，不默认提交表单 |
| `开始旋转 ↻` | 按钮上显示的文字 |

`id`、`class`、`type` 是属性名，引号里面是属性值。属性之间用空格分隔，没有 C++ 那样的逗号和分号。

长标签可以把属性分行，含义相同：

```html
<button
  id="spin"
  class="primary"
  type="button"
>
  开始旋转 ↻
</button>
```

### 2.3 有些标签没有结束标签

本网站中的 `meta`、`link`、`input`、`img`、`br` 属于空元素，不包围子内容：

```html
<br />
<input id="option-input" maxlength="12" />
```

在 HTML 中也可以写成 `<br>`、`<input ...>`。这里末尾的 `/` 是格式风格，不是“所有标签都可以自闭合”的意思。不要把 `<div></div>` 或 `<script></script>` 改成 `<div />`、`<script />`。

### 2.4 缩进表示包含关系，真正决定结构的是标签

```html
<div class="game-heading">
  <h1>反应速度测试</h1>
  <p>等区域变绿，立刻点击。</p>
</div>
```

`h1` 和 `p` 都在 `div` 里面，它们是兄弟元素；`div` 是它们的父元素。

理解成树形结构：

```text
div.game-heading
├── h1：反应速度测试
└── p：等区域变绿，立刻点击。
```

缩进方便人阅读，但浏览器主要看标签的开始、结束和嵌套关系。通常的连续空格与源码换行会折叠成空白，不会直接变成页面上的换行；不过行内文字之间的空白仍可能影响间距，所以格式化也要检查。

## 3. 每个网页的完整骨架

从 `reaction.html` 提取出的简化结构是：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>反应速度测试 · 无聊研究所</title>
    <link rel="stylesheet" href="/static/style.css" />
    <script defer src="/static/reaction.js"></script>
  </head>
  <body>
    <header>网站顶部</header>
    <main>这个玩法的主要内容</main>
    <footer>网站底部</footer>
  </body>
</html>
```

这个例子省略了实际页面中的容器、其他样式与公共脚本，只用来说明结构。

### 3.1 最外层两行

`<!doctype html>` 告诉浏览器按现代 HTML 的标准模式解析文档，不是一个需要结束标签的普通元素。

`<html lang="zh-CN">` 是整个文档的根元素。`lang` 表示主要语言是简体中文，有助于浏览器和屏幕阅读器理解内容；它不会自动把英文翻译成中文。

### 3.2 head：页面说明与资源入口

| 实际代码 | 作用 |
|---|---|
| `<meta charset="utf-8" />` | 声明文字编码；文件本身也应保存为 UTF-8 |
| `<meta name="viewport" content="width=device-width, initial-scale=1" />` | 告诉手机浏览器按设备宽度设置视口，初始缩放为 1 |
| `<meta name="description" content="..." />` | 页面的简短说明，搜索引擎等可能使用 |
| `<title>...</title>` | 浏览器标签页标题，不是页面正文的大标题 |
| `<link rel="stylesheet" href="..." />` | 加载 CSS 样式文件 |
| `<link rel="icon" href="..." />` | 设置浏览器标签页的小图标 |
| `<script defer src="..."></script>` | 加载并稍后执行 JavaScript |

手机适配不只是加 `viewport`：实际布局还需要 CSS 配合，例如窄屏时把左右两列改成上下排列。

图标的 `href` 在这个项目里是一长串 `data:image/svg+xml,...`，它把一个很小的 SVG 图形直接编码放进属性，不是损坏的乱码。初学时可以跳过，不必逐字研究。

### 3.3 为什么 script 写了 defer

例如：

```html
<script defer src="/static/wheel-presets.js"></script>
<script defer src="/static/wheel.js"></script>
```

对这里这种外部普通脚本，`defer` 使浏览器在解析 HTML 时下载脚本，等文档解析完成后按顺序执行。

所以玩法脚本执行时，页面里的按钮通常已经能找到；同时先执行预设脚本，再执行依赖这些预设的转盘脚本。不要随意调换它们的顺序。

### 3.4 body：实际页面内容

`body` 中放用户看到或操作的内容。不是每一个元素都一定可见：有些元素带 `hidden`，要等 JavaScript 在合适的时候显示。

## 4. 用反应测试认识布局和文字标签

对应 [reaction.html](static/reaction.html)。

### 4.1 header、main、footer 给区域起明确的身份

```text
body
└── div.site-shell
    ├── header：站名、回首页的链接
    ├── main：玩法标题、点击按钮、成绩、说明
    └── footer：底部文案
```

这些语义标签说明区域用途。`header` 不会自动固定在顶部，`footer` 也不会自动贴住窗口底部；位置仍由内容顺序和 CSS 决定。

首页还用了 `section` 表示内容区域，例如游乐场区域；抽卡页用 `article` 表示一张相对独立的卡片内容。没有特别语义、只是为了分组或排版时，可以用 `div`。

### 4.2 div 和 span 有什么区别

```html
<div class="stats">
  <span>本次成绩 <b id="last-score">—</b></span>
  <span>会话最佳 <b id="best-score">还没有成绩</b></span>
</div>
```

- `div` 是通用容器，把整组成绩放在一起。
- `span` 是通用的行内容器，把一小段文字或图标包起来，方便单独设置样式。
- 默认情况下，`div` 表现为块级元素，`span` 为行内元素；CSS 可以改变它们的显示方式，不能只靠标签名判断最终是否并排。

这几个标签本身不会计算成绩。它们只是先给成绩留位置。

### 4.3 标题、段落、强调和换行

| 标签 | 本项目里的用途 |
|---|---|
| `h1` | 当前页面主标题，例如“反应速度测试” |
| `h2` | 次一级标题，例如首页“今天，玩点什么？” |
| `h3` | 首页各张玩法卡片的标题 |
| `p` | 一段说明文字 |
| `strong` | 强调，例如反应区的状态提示 |
| `b` | 引起注意的文字，例如成绩数值；本身不表示同样的语义强调 |
| `small` | 小字补充，例如站名下的英文 |
| `br` | 明确换行，例如帮助说明中的两句话 |

标题级别表达结构，不应该只因为“想让字小一点”就把 `h1` 换成 `h3`。大小可以交给 CSS。

源码里按回车不等于页面强制换行；需要独立段落时用 `p`，确实需要同一段中换行时用 `br`。不要靠堆积很多 `br` 制造布局间距。

## 5. id、class 和 HTML 与代码的连接

反应测试的大按钮：

```html
<button
  id="reaction-pad"
  class="reaction-pad idle"
  type="button"
  aria-describedby="reaction-help"
>
  <span class="pad-icon" aria-hidden="true">ϟ</span>
  <strong id="reaction-title" aria-live="polite">点击开始</strong>
  <span id="reaction-hint">先稳住，再出手。</span>
</button>
```

先只关注 `id`、`class` 和 `type`，后面的 `aria-*` 在第 9 节解释。

### 5.1 id：在页面里找到特定元素

一个页面内的 `id` 应保持唯一。`reaction.js` 中这样找到按钮：

```js
const pad = document.querySelector("#reaction-pad");
```

选择器前面的 `#` 表示按 ID 查找，不是 HTML 属性值的一部分。HTML 写 `id="reaction-pad"`，不要把 `#` 写进去。

如果只把 HTML 中的 ID 改名，却没同步改 JavaScript，脚本就可能找不到按钮。

### 5.2 class：给元素分组，可以重复，也可以同时有多个

`class="reaction-pad idle"` 有两个类名：`reaction-pad` 和 `idle`。

- `reaction-pad` 表示它是反应测试区域。
- `idle` 表示它处在初始状态。

CSS 用 `.reaction-pad` 这样的选择器给它设置样式。前面的 `.` 表示类选择器。不同按钮都可以有 `class="primary"`，共用主要按钮样式。

`id` 不只给 JavaScript 用，CSS 也能用它；`class` 不只给 CSS 用，JavaScript 也能查找和修改它们。

### 5.3 JavaScript 改的是浏览器里的 DOM

DOM 可以理解为浏览器把 HTML 解析后建立的元素树。

```js
title.textContent = "就是现在！";
```

这会修改浏览器里的标题文字。源码文件中的“点击开始”不会因此被永久改写，所以刷新时先重新读取初始页面，再执行脚本。

反应测试的 `setPad()` 还会修改按钮的 `className`：状态变化后，CSS 便用对应样式显示它。这就是 HTML、CSS、JavaScript 配合的一个完整例子。

## 6. 链接和按钮：什么时候用哪个

### 6.1 a 表示导航或链接

```html
<a href="/reaction.html">反应速度测试</a>
<a href="/#playground">← 回游乐场</a>
```

- `/reaction.html`：当前网站根路径下的反应测试页面。
- `/#playground`：当前网站首页里 ID 为 `playground` 的位置。
- 首页的 `href="#playground"`：跳到当前页的对应位置。

`#playground` 是片段标识，常用于页内定位，不是服务器目录。

`href` 是链接目标。CSS 文件也有 `href`，JavaScript 文件使用 `src`，两者不能随便互换。

### 6.2 button 表示执行动作

抽卡、喂宠物、开始旋转这些动作使用 `button`。它自带可聚焦、禁用等行为，比给普通 `div` 随意绑定点击更合适。

`type="button"` 表示普通按钮；`type="submit"` 表示提交所属表单。表单里的按钮如果省略类型，通常默认会提交，所以项目中很多地方明确写了类型。

### 6.3 为什么不建议直接双击 HTML

`/static/style.css` 指的是网站根路径下的资源，不是 Windows 的项目路径。双击文件会使用 `file://`，这些根路径和 `/api/...` 请求不能按当前网站的服务方式工作。

学习时在编辑器看源码，同时通过本地 C++ 服务提供的 `http://127.0.0.1:18080/reaction.html` 看页面。网页网址和磁盘上的 `L:\boring-lab\static\reaction.html` 是两种不同的路径。

## 7. 转盘页面中的表单与下拉菜单

### 7.1 form 把一次输入操作组织起来

下面是 `wheel.html` 中“添加选项”的简化结构：

```html
<form id="add-option">
  <label for="option-input">再加一个自己的选项</label>
  <input
    id="option-input"
    maxlength="12"
    placeholder="比如：螺蛳粉"
    autocomplete="off"
  />
  <button type="submit">添加 +</button>
</form>
```

- `form` 包围一次提交相关的输入和按钮。
- `label` 是输入框的正式说明。
- `for="option-input"` 对应输入框的 `id`，建立关联；点击说明文字通常也能聚焦输入框。
- `input` 没写 `type` 时默认是文本输入框。
- `maxlength` 限制输入长度；严格说按 UTF-16 代码单元计数，某些 emoji 不等于一个单位。
- `placeholder` 是空输入框里的提示，不是已经填写的值，也不能替代 `label`。
- `autocomplete="off"` 是关闭自动补全的提示，浏览器不一定在所有情况下遵从。

宠物起名输入框还写了 `required`，表示提交时不能留空。不过只有空格的名字等业务问题仍要由 JavaScript 校验。

### 7.2 为什么点击添加后页面没有刷新

`wheel.js` 监听表单的 `submit`，并调用：

```js
e.preventDefault();
```

它取消表单默认提交行为，改为在当前页面检查输入、更新转盘并保存。表单不等于一定向服务器上传数据；要看是否被脚本接管，以及脚本实际做了什么。

### 7.3 select 和 option

HTML 中只放了：

```html
<label for="template">今天纠结什么？</label>
<select id="template"></select>
```

选项由 `wheel.js` 根据预设动态添加。如果写成静态 HTML，大致相当于：

```html
<select id="template">
  <option value="food">🍜 午饭吃什么</option>
  <option value="drink">☕ 今天喝什么</option>
</select>
```

上面的两项是等价结构示例，不是源码中完整的九项列表。

`value` 给程序使用，标签里的文字给用户看。选择“今天喝什么”后，脚本读取到的是 `drink`。所以改显示文字一般不影响分类识别，改 `value` 就可能影响逻辑。

这里也解释了之前的图标问题：原生下拉菜单的选项是文字，外面叠放的 SVG 图标不会自动进入选项列表。现在把兼容性更好的 ☕ 放在文字里，展开时也能显示；它的具体外观仍由系统字体决定。

### 7.4 复选框、文件选择和多行输入

| 元素 | 本项目中的用途 |
|---|---|
| `input type="checkbox"` | 转盘是否参与抽取，由 JavaScript 动态创建 |
| `input type="file"` | 宠物导入存档，用户选择本地文件 |
| `textarea` | 答案之书复制失败时，显示可手动复制的多行文字 |

文件输入的 `accept="application/json,.json"` 是给文件选择器的提示，不是可靠的数据校验。`pet.js` 仍会检查文件大小、JSON 格式和字段内容。选中文件也不表示已经上传；当前宠物页面在浏览器中读取存档。

## 8. 隐藏、禁用、折叠和进度显示

### 8.1 hidden、disabled、readonly 的区别

| 属性 | 效果 | 项目例子 |
|---|---|---|
| `hidden` | 普通情况下不显示该元素 | 转盘的“去抽这家的饮品”初始隐藏 |
| `disabled` | 控件不可操作，通常也不能用 Tab 聚焦 | 卡片还没准备好时禁止翻开 |
| `readonly` | 内容只读，但仍可聚焦、选择和复制 | 答案之书手动复制文本框 |

这些都是布尔属性。出现就表示开启：**`hidden="false"` 仍然是隐藏，`disabled="false"` 仍然是禁用。** 要关闭，应移除属性，或在 JavaScript 中设置 `element.hidden = false` 等对应属性。

隐藏不是保密：内容仍可能留在 DOM 中。当前页面使用它只是控制显示时机。

### 8.2 details 和 summary 自带折叠功能

宠物页面使用：

```html
<details class="pet-backup">
  <summary>它的行李箱 · 备份与搬家</summary>
  <p>宠物保存在当前浏览器。</p>
</details>
```

这是简化内容。`summary` 是折叠标题，点击后显示内部内容；添加 `open` 属性可默认展开。这部分基本展开收起行为由浏览器提供，不必自己重新写一套。

### 8.3 meter 和 progress 表达不同含义

宠物饱食度使用：

```html
<meter id="pet-food" min="0" max="100"></meter>
```

`meter` 表示已知范围内的一个数值。成就页面使用 `progress` 表示已完成多少目标，例如 12 个成就中解锁了几个。

JavaScript 更新它们的 `value`，HTML 控件与 CSS 再将数值显示出来。两者看起来都可能像一条横条，但语义不同。

## 9. 本网站的无障碍属性，先知道用途即可

无障碍支持让使用键盘、屏幕阅读器等方式的用户也更容易操作页面。这里先认几个实际出现的属性，不需要一开始背全。

| 属性 | 用途 | 项目例子 |
|---|---|---|
| `aria-label` | 提供可访问名称 | “戳一戳小宠物”、画布说明 |
| `aria-describedby` | 用另一元素的 ID 关联补充说明 | 反应区关联 `reaction-help` |
| `aria-live="polite"` | 请求辅助技术在合适时机播报更新 | 反应状态、转盘结果 |
| `aria-hidden="true"` | 对辅助技术隐藏装饰内容 | 反应区闪电、星星图案 |
| `aria-pressed` | 表示开关按钮是否处于按下状态 | 音效开关、玩法筛选 |
| `role="status"` | 把一块内容声明为状态消息 | 错误与保存提示 |
| `tabindex="0"` | 让通常不能聚焦的元素进入键盘 Tab 顺序 | 可互动星球画布 |

`aria-hidden` 不等于视觉上的 `hidden`；加 `aria-pressed` 也不会自动开启音效，仍要由脚本处理点击并同步状态。

不要只加属性名就认为交互完整，例如给画布加 `tabindex` 后，还要有键盘事件处理。本项目的星球脚本另外实现了方向键等操作。

## 10. Canvas、图片与 data-*：页面不是只有文字

### 10.1 canvas 是一块可供脚本绘图的区域

转盘页面中：

```html
<canvas id="wheel" width="600" height="600" role="img" aria-label="命运转盘">
  转盘选项见右侧列表。
</canvas>
```

HTML 创建画布，`wheel.js` 负责画扇区和文字。没有绘图脚本，画布不会自己变成转盘。

`width`、`height` 设置画布的绘图尺寸；CSS 可以把它显示得更小以适应手机。两者不同，只改 CSS 尺寸可能影响清晰度或比例。Canvas 中绘制的字也不是一个个普通 HTML 文字元素，因此还需要文字说明和其他可操作控件配合。

### 10.2 img 用于显示图片

卡片分享区域使用 `img` 显示生成的图片。通常：

- `src` 指定图片来源；本项目可以由 JavaScript 设置为本地生成图片的对象 URL。
- `alt` 提供替代文字，说明图片内容。
- 下载链接的 `href`、`download` 也由脚本在生成图片后设置。

所以查看原始 HTML 时找不到完整图片地址，不代表功能缺失；要结合脚本和运行后的 DOM 看。

### 10.3 data-* 是留给程序使用的自定义信息

首页里有：

```html
<button data-filter="game" aria-pressed="false">🎮 小游戏</button>
```

卡片上则有 `data-category="game test"`。`main.js` 读取按钮的 `dataset.filter` 和卡片的 `dataset.category`，决定筛选后隐藏哪些卡片。

`data-filter` 不会让浏览器自动筛选，它只是保存一段信息。`data-mode="reaction"` 等也是自定义标记，不是 HTML 自带的玩法模式。

## 11. 学习时怎么查，怎么改

### 11.1 从可见文字出发，不要从第一行硬读到最后

比如想研究“开始旋转”：

1. 在 `wheel.html` 搜索“开始旋转”，找到按钮。
2. 记下 `id="spin"`。
3. 在 `wheel.js` 搜索 `spin`，找到点击处理。
4. 想看按钮外观，再去 CSS 查 `primary`。

对于“看起来很大但不知道是哪块”的页面元素，可以在浏览器里右键检查，查看 Elements（元素）面板。它显示的是运行中的 DOM；和编辑器里的源文件不同，脚本可能已经添加了元素、修改了文字。

### 11.2 三个小练习，按难度递增

**练习一：改一行说明。** 在 `reaction.html` 中找到标题下面的 `p`，改成一句你自己的提示。保持标签不变，只改文字。

**练习二：添加一个普通段落。** 在反应测试帮助文字之后添加：

```html
<p class="help">先试三次，再看看自己的状态。</p>
```

它复用了已有样式，不需要新的 JavaScript，也没有重复 ID。

**练习三：追踪一个动态位置。** 找到 `id="last-score"`，再去 `reaction.js` 搜索 `last-score`，解释为什么初始是 `—`，完成一次测试后会变成毫秒数。

修改的是项目根目录下的 `static/`。本地程序通常读取复制到 `build/Release/static/` 的资源，所以修改后执行项目构建来复制资源，再刷新页面；不要只在构建产物里改文件。服务启动方式见 README。

### 11.3 初学时最容易遇到的问题

- 改了 ID，没改脚本里的选择器：程序找不到元素。
- 漏写或错写结束标签：浏览器可能自动修补，页面结构与预期不同。
- 在 `button` 里再放 `button` 或另一个交互控件：结构不合适，容易影响操作。
- 把一大块布局放进 `p`：段落不是可以随便容纳所有元素的容器，需要分组时通常用 `div`。
- 把 `placeholder` 当标签：输入后提示消失，用户不知道这一项是什么。
- 认为 HTML 换行必然使页面换行：正常排版中并非如此。
- 编辑器里改好就认为线上已经变化：本地修改、资源复制、Git 提交、线上部署是不同步骤。

如果要在正文里显示代码中的尖括号，可用字符引用：`&lt;` 表示 `<`，`&gt;` 表示 `>`，`&amp;` 表示 `&`。否则浏览器可能把你想显示的文字当成标签。

## 12. 第一阶段只要求你会这些

读完后，先确认自己能做到：

1. 分清 `head` 和 `body`，以及 `title` 和 `h1`。
2. 看出元素的父子关系，能找到对应结束标签。
3. 解释 `id` 与 `class` 的区别。
4. 分清链接 `a` 和按钮 `button`。
5. 找到一个输入框的 `label`、ID 和提交按钮。
6. 知道页面结构来自 HTML，外观来自 CSS，动态变化往往来自 JavaScript。

建议先打开 [reaction.html](static/reaction.html)，对照第 2–5 节阅读。能看懂这一个页面的骨架，再读转盘的表单部分，比同时翻十几个文件更容易入门。

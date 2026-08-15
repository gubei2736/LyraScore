# 🎼 LyraScore (天琴乐谱)

> **专业级平板乐谱阅读与手写批注工作站 (Professional Tablet Sheet Music Workstation)**  
> 专为平板大屏演奏、视奏练琴与舞台演出深度打造。融合**古典艺术美学**与**现代高性能工程**，兼具 **120Hz 满帧丝滑**、**0ms 瞬时翻页** 与 **绿色超低功耗**。

---

## 📖 项目概述与命名起源

**LyraScore**（中文名：**天琴乐谱**）由两大核心意象融合而成：
- **`Lyra`（里拉琴 / 天琴座）**：西方古典音乐之祖、古希腊阿波罗神乐器，象征纯粹旋律、诗意与和谐律动；
- **`Score`（乐谱 / 总谱）**：专为演奏家、音乐学子打造的现代化全功能数字乐谱载体。

---

## 🚀 核心技术栈与系统架构

- **前端核心**：Vite 5 + Vanilla JavaScript (ES Next) + 纯 CSS3 现代水晶设计系统
- **乐谱渲染引擎**：
  - **PDF 引擎**：Mozilla PDF.js 4.x 本地 Worker 离线光栅化 + **LRU 3页位图双缓冲池**
  - **MusicXML 引擎**：OpenSheetMusicDisplay (OSMD) 矢量渲染 + JSZip 自动解压与 XML 自愈清洗
  - **图像乐谱**：无损高保真图像适配器
- **手写笔墨引擎**：Perfect Freehand 矢量压感拟真 + 硬件直通低延迟 Canvas (`desynchronized: true`) + 原生智能防手掌误触 (Palm Rejection)
- **时钟与声学引擎**：Web Audio API 硬件级微秒 Lookahead 时钟调度
- **本地存储**：IndexedDB 零网络依赖、纯本地安全结构化二进制存储
- **Android 原生客户端**：原生 Android WebView 硬件光栅化直通管道（`LAYER_TYPE_HARDWARE`），全面适配 Android 7.0 至 Android 16 (API 24 ~ 35)

---

## 🌟 六大核心功能体系

### 1. 📑 多格式乐谱高清渲染与视口排版
- **全格式支持**：原生支持 `.pdf`、`.xml`、`.mxl`、`.png`、`.jpg` 等主流乐谱格式；
- **智能单/双页排版**：
  - **横屏模式**：支持单页居中与**双页并排视奏**，完美呈现开本跨页大谱；
  - **竖屏模式**：自动锁定单页大屏视奏，界面紧凑流式自适应；
- **双通道触控缩放（Pinch-to-Zoom）**：支持双指自由缩放（50% ~ 280%），配合 `[ 100% ]` 百分比徽标一键秒回复位。

### 2. ✍️ 拟真手写批注与音乐印章工具箱
- **专业笔刷体系**：钢笔（拟真压感）、圆珠笔、荧光笔（半透明高亮）、智能橡皮擦；
- **出版级音乐印章（Musical Stamps）**：
  - 变音记号（`♯`, `♭`, `♮`, `𝄪`, `𝄫`）；
  - 力度记号（`p`, `pp`, `f`, `ff`, `mf`, `mp`, 渐强/渐弱）；
  - 演奏法记号（延长音、跳音、保持音、颤音、踏板记号 `Ped.`）；
  - 钢琴指法（1~5 指高对比度标记）；
  - 练习与反复记号（`✓`, `★`, 前后反复记号）；
- **相对屏幕百分比坐标记忆（Relative Percentage Coordinates）**：彻底解决平板横竖屏旋转时批注工具栏跑位或丢失问题，自动视口钳位；
- **智能防误触（Palm Rejection）**：精准区分压感笔落笔与手指手势，支持手写笔专注书写、双指双击撤销与双指缩放和谐共存。

### 3. ⏱️ 硬件级高精度专业节拍器
- **微秒级硬件时钟调度**：基于 Web Audio API 独立音频线程调度，彻底杜绝主线程渲染卡顿导致的时钟漂移；
- **40 ~ 240 BPM 调速 & Tap Tempo 测速**：轻拍屏幕快速测定曲目速度；
- **全自由自定义重拍点阵（Accents Customization）**：
  - 支持 1~12 任意拍数自由增减；
  - 轻触点阵小药丸循环切换 `🔴 重拍`、`🔵 弱拍`、`⚪ 休止静音`，完美支持 5/4 拍、7/8 拍等复合拍型；
- **顶部工具栏全景闪烁（Topbar Flash）**：开启后随节拍律动，顶部工具栏边缘产生柔和呼吸光芒（重拍金红脉冲 / 弱拍科技蓝脉冲），演奏者用余光即可精准对拍；
- **静音视觉对拍** 与独立音量调节。

### 4. 🔄 智能自动翻页与平滑滚动
- **高辨识度模式选择卡片**：
  - **📄 定时整页翻页**：倒计时结束瞬间秒切下一页，顶部胶囊即时反馈 `[ ▶ 定时翻页: 15s ]`；
  - **📜 匀速平滑滚动**：视口自上而下匀速平稳下滚，顶部胶囊即时反馈 `[ ▶ 平滑滚动: 30px/s ]`；
- **精确手动数字输入**：单页停留时长不仅支持滑动条调节，还配备直接手动数字输入框（支持输入任意具体秒数）；
- **顶部胶囊进度实时联动**：运行时显示实时剩余倒计时与暂停按钮。

### 5. ⚡ 极致流畅度与绿色低功耗协同体系
- **0ms 翻页（Zero Latency Page Flip）**：利用 `requestIdleCallback` 在系统空闲时悄悄预光栅化下一页并存入 LRU 3页位图缓存池，翻页瞬间直通贴图，等待时间彻底归零；
- **120Hz 电竞级双指缩放**：手势发生时动态激活 GPU 独立合成纹理层（`will-change: transform`），手势停止 200ms 后自动卸载释放显存与 GPU 算力；
- **丝滑横竖屏切换（Cross-Fade）**：0ms 瞬时几何比例自适应 + 60ms 后台离屏重绘 + 180ms 硬件级交叉淡入，彻底消除白屏闪烁；
- **静止视奏 0% CPU 占用**：无常驻轮询定时器，长时间演奏（2~4 小时以上）平板机身冰凉、持久省电。

### 6. 📚 离线乐谱库与多维分类管理
- **纯本地安全隐私存储**：所有乐谱文件与批注笔迹全量保存在平板本地 IndexedDB 数据库中，离线无网环境下 100% 正常运行；
- **多维度检索与过滤**：支持按格式（PDF/XML/图片/带批注）、分类标签（古典/爵士/流行/考级/练习曲等）快速筛选，支持拼音与关键词模糊搜索；
- **最近阅读与智能排序**：支持按最近阅读时间、标题、添加时间正反排序；
- **元数据快速编辑**：随时修改曲目名称、作曲家、调号、速度标注与标签。

---

## 📂 项目目录结构说明

```
G:\Project\
├── index.html                      # Web 应用主入口 HTML
├── manifest.webmanifest            # PWA 渐进式应用清单
├── vite.config.js                  # Vite 构建与打包配置
├── package.json                    # 项目依赖与编译指令
├── build_apk.bat                   # 一键触发 Android APK 构建脚本
├── README.md                       # 项目全景说明与技术文档
│
├── src\                            # 前端核心源码
│   ├── main.js                     # 全局单页应用主入口与视图生命周期管理
│   ├── components\                 # UI 业务组件
│   │   ├── FlipBar.js              # 自动翻页控制器与设置面板 (高辨识度卡片+手动数字输入)
│   │   ├── Metronome.js            # 专业节拍器 UI 组件 (自定义重拍点阵+全景闪烁开关)
│   │   ├── PenToolbox.js           # 悬浮手写批注工具栏 (相对坐标定位+防跑位)
│   │   ├── ScoreLibrary.js         # 乐谱书架视图与导入/分类检索管理
│   │   └── ScoreViewer.js          # 乐谱主阅读器视口与顶部工具栏
│   ├── core\                       # 核心业务逻辑与驱动引擎
│   │   ├── db.js                   # IndexedDB 本地数据库存储核心 (乐谱与笔迹持久化)
│   │   ├── metronome.js            # Web Audio 高精度节拍器微秒调度引擎
│   │   ├── reader.js               # 乐谱视口调度中心 (0ms预渲染/GPU动态合成/丝滑旋转)
│   │   ├── state.js                # 全局响应式状态机
│   │   └── penEngine\              # 手写笔墨与批注子系统
│   │       ├── palmRejection.js    # 智能防误触手势分流核心
│   │       ├── strokeRenderer.js   # 硬件直通低延迟 Canvas 笔迹渲染器
│   │       ├── perfectFreehand.js  # 矢量压感拟真曲线算法
│   │       └── stamps.js           # 音乐符号与表情记号印章库
│   ├── renderers\                  # 多格式乐谱渲染器
│   │   ├── pdfRenderer.js          # Mozilla PDF.js 渲染器 (LRU 3页位图缓存池)
│   │   ├── xmlRenderer.js          # OSMD MusicXML 矢量排版渲染器
│   │   └── imgRenderer.js          # 高清图片乐谱渲染器
│   ├── styles\                     # 纯 CSS3 现代水晶设计系统
│   │   ├── base.css                # 全局主题变量 (羊皮纸护眼/深色/浅色) 与基础控件
│   │   ├── library.css             # 书架、曲目卡片与侧边栏样式
│   │   ├── reader.css              # 乐谱视口、顶部工具栏、节拍器与自动翻页样式
│   │   ├── canvas.css              # 悬浮手写工具箱样式
│   │   └── modals.css              # 现代高保真弹窗与对话框样式
│   └── utils\                      # 通用工具函数
│
└── android\                        # Android 原生客户端工程
    ├── LyraScore.apk               # 最新编译并签名的安装包 (3.24 MB)
    ├── build_apk.ps1               # 自动化独立打包构建与签名 PowerShell 脚本
    ├── build_apk.bat               # 批处理一键构建入口
    ├── app\
    │   └── src\main\
    │       ├── AndroidManifest.xml # 应用清单配置 (Android 14/15/16 深度适配)
    │       ├── assets\dist\        # 前端构建产物同步目录
    │       ├── java\com\lyrascore\app\
    │       │   └── MainActivity.java # 原生宿主 Activity (GPU硬件直通/沉浸式常亮/返回拦截)
    │       └── res\                # 原生资源与全套自适应应用图标
    │           ├── mipmap-mdpi ~ xxxhdpi # 新版高保真方形与圆角图标
    │           └── values\strings.xml
    └── tools\                      # Android 独立编译工具链 (AAPT2, D8, ZipAlign, Apksigner)
```

---

## 🛠️ 构建与运行指南

### 1. Web 本地开发调试
```powershell
# 安装依赖
npm install

# 启动本地热重载开发服务器
npm run dev
```

### 2. 生产打包与生成 Android APK
本项目配备了**完全独立的无 Gradle 快速打包工具链**，秒级完成编译与签名：
```powershell
# 方式一：直接在项目根目录运行批处理
.\build_apk.bat

# 方式二：运行 PowerShell 独立构建脚本
powershell -ExecutionPolicy Bypass -File "G:\Project\android\build_apk.ps1"
```
构建成功后，将在 `G:\Project\android\LyraScore.apk` 生成已通过 v1/v2/v3 签名的标准 APK。

### 3. 一键安装到平板设备
```powershell
adb install -r "G:\Project\android\LyraScore.apk"
```

---

## 📜 关键版本演进记录 (Changelog Highlights)

- **`Commit 43e7231`**: 横竖屏切换丝滑化改造（0ms 即时几何缩放过渡 + 60ms 后台离屏重绘 + 180ms 硬件级 Cross-Fade 交叉淡入，彻底杜绝白屏闪烁）；
- **`Commit 17c1488`**: 落地高性能低功耗协同体系（`requestIdleCallback` 离屏预光栅化 0ms 翻页、GPU 动态合成纹理加速、Android 原生 GPU 硬件直通）；
- **`Commit cf2d26a`**: 竖屏模式排版优化（隐藏长滑动条仅保留 `100%` 复位徽标，一行流式紧凑排布）；
- **`Commit 191bf2c`**: 升级自动翻页模式为高辨识度选择卡片组（带图标/说明/勾选徽标/选中边框），顶部胶囊实时同步展示当前模式；
- **`Commit b7a388c`**: 节拍器支持自由自定义重拍点阵与顶部工具栏全景闪烁，自动翻页支持精确手动输入单页停留时长；
- **`Commit 0d7fed0`**: 顶部工具栏挂载内置高精度专业节拍器（Web Audio 硬件时钟调度核心）；
- **`Commit 93bed65 / 4b2b50d`**: 重构防误触引擎，彻底放行触控手势，实现 120Hz 双指捕获缩放与多指手势；
- **`Commit 0229a84`**: 手写批注面板引入相对屏幕百分比坐标记忆机制，彻底解决横竖屏旋转跑位问题；
- **`Commit 81935e3`**: 全面应用专属高保真天琴乐谱应用图标（覆盖 mdpi ~ xxxhdpi 全分辨率）。

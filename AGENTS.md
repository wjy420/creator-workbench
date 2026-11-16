# 项目协作说明

本文件适用于项目根目录及其所有子目录，供在此工作的编码代理使用。

## 沟通与工作方式

- 回复、进度说明和交付说明使用中文；代码标识符沿用现有命名。
- 先阅读相关实现、`README.md` 和测试，再修改。以当前代码和可复现的测试结果判断行为，发现文档与代码不一致时同步修正文档。
- 围绕用户需求做最小必要修改，保留已有未完成工作，不顺带重构或格式化无关文件。
- 完成后简要说明改动、验证结果和未验证项；未执行的检查不能声称通过。

## 项目定位与技术栈

这是面向个人创作者的本地视频处理工作台，支持项目管理、字幕识别与校对、配乐、平台文案、横竖封面、视频合成和项目结果打包。

- 服务端：Node.js 22+，原生 HTTP 服务和 ES Modules，入口为 `server.mjs`。
- 浏览器端：原生 HTML、CSS、JavaScript，无前端构建步骤。部分脚本依赖全局对象及加载顺序，修改前检查 `public/index.html`。
- 媒体处理：本机 FFmpeg / FFprobe，需要 libass 和 libx264。
- 语音识别：项目 `.venv` 中的 Python 与 faster-whisper，由 Node 子进程调用；依赖固定在 `requirements-whisper.txt`。
- AI 文案与图片请求由服务端发送。模型和服务地址来自设置，不应为普通功能修改擅自替换。
- 延续现有轻量实现，新增框架、构建工具或依赖前先评估是否确有必要。

## 文件导航

| 路径 | 职责 |
| --- | --- |
| `server.mjs` | HTTP 路由、持久化、任务管理、模型调用及 FFmpeg 合成流程 |
| `src/config.mjs`、`src/settings.mjs` | 参数校验、旧配置兼容、API 与语音设置合并 |
| `public/render-spec.js` | 前后端共享的默认参数、尺寸计算、字幕规则和任务线路定义 |
| `src/chapters.mjs`、`public/chapters.js` | 章节推断、时间校验及章节编辑与预览 |
| `src/media.mjs`、`src/preview.mjs`、`src/subtitle-background.mjs` | SRT / ASS、字幕透明图层及背景渲染 |
| `src/encoding.mjs` | 视频码率编码参数与实测码率 |
| `src/pipeline.mjs` | 一键处理依赖、并行调度和阶段状态 |
| `src/cover-plan.mjs`、`src/prompt-logs.mjs` | 横竖封面策划、提示词编辑与实际请求日志 |
| `src/library.mjs`、`src/project-settings.mjs` | 预设、音乐、导出记录及项目预设状态 |
| `src/project-bundle.mjs` | 当前项目结果的流式 ZIP64 打包 |
| `public/` | 正式工作台界面、交互和样式 |
| `design-preview/` | 已有视觉方案参考，正式功能应修改 `public/` |
| `scripts/`、根目录 `.cmd` | Windows 启停、本地语音安装及识别脚本 |
| `tests/` | Node 测试及真实 FFmpeg / 模拟模型集成验证 |
| `data/` | 用户项目、明文 API 配置、素材、模型、日志和生成结果 |

## 启动与验证

在项目根目录执行命令。默认访问 `http://127.0.0.1:8769`。

```powershell
npm start
npm test
# 按修改范围执行单个测试，例如：
node --test tests/pipeline.test.mjs
node tests/parallel-pipeline.mjs
```

- Windows 用户入口为 `启动工作台.cmd`、`关闭工作台.cmd` 和 `安装本地语音.cmd`。
- 当前没有单独的 build 或 lint 脚本，不要凭空添加或宣称执行这些检查。
- `npm test` 运行 `tests/*.test.mjs`；部分测试需要 FFmpeg 或 PATH 中的 `python`，也会在专用测试目录写文件。执行前检查相关测试的依赖和副作用。
- 行为修改补充有意义的回归测试，并执行相关测试；纯文档修改无需运行媒体处理。
- UI 修改应在浏览器检查受影响的交互、窄屏布局和错误状态，涉及播放时验证拖动、暂停及刷新后的状态。

按需选择集成验证，不必为无关修改执行全部长耗时测试：

| 修改范围 | 对应命令或测试 |
| --- | --- |
| 字幕样式、预览与导出 | `node tests/visual-render.mjs`，相关 `media`、`subtitle-background` 单元测试 |
| 码率、分辨率 | `node tests/bitrate-export.mjs`、`node tests/resolution-export.mjs` |
| 文案、封面与接口日志 | `node tests/api-integration.mjs`，相关 `cover-plan`、`prompt-logs` 单元测试 |
| 密钥保存 | `node tests/key-persistence.mjs` |
| 预设、音乐、导出记录 | `node tests/library-integration.mjs`，`tests/project-settings.test.mjs` |
| 章节生成、编辑与显示 | `tests/chapters.test.mjs`、`node tests/chapters-integration.mjs` |
| 任务线路、一键处理 | `node tests/concurrent-tasks.mjs`、`node tests/parallel-pipeline.mjs`、`node tests/job-feedback-integration.mjs` |
| 播放器 | `tests/media-playback.test.mjs`、`tests/player.test.mjs` |
| 项目结果打包 | `tests/project-bundle.test.mjs` |

注意：`tests/integration.mjs` 固定访问 8769 端口，会在该服务的数据中创建测试项目，并生成 `data/test-fixtures/test.mp4` 等素材；`tests/api-integration.mjs` 依赖其中的测试视频。需要这类验证时优先使用隔离数据的服务和测试素材，不直接操作用户正在使用的服务。`tests/local-whisper.mjs` 需要本地模型及 `data/test-fixtures/local-speech.wav`，不能假定其他电脑具备。

独立测试服务通过环境变量配置 `PORT` 和 `DATA_DIR`；语音测试可使用 `WHISPER_PYTHON`、`WHISPER_SCRIPT`、`WHISPER_CACHE`。隔离服务启动后仍需确认测试脚本实际访问的端口和文件路径匹配。测试应自行清理所启动的进程，避免占用日常工作台端口。

## 必须保持的行为约定

- **共享参数和旧数据兼容**：默认值与尺寸规则优先维护在 `public/render-spec.js`，校验在 `src/config.mjs`。参数变更同时检查项目保存、预设、前端输入、合成快照及迁移。码率字段使用 `bitrateKbps`；旧 Mbps 字段由现有迁移逻辑处理。
- **字幕一致性**：预览与导出复用相同字幕透明图层和布局规则，不能各自实现一套排版。修改字体、背景、断行或位置时同时验证两端。
- **画幅与码率**：导出保留原比例，预设分辨率按短边缩放，H.264 尺寸取偶数。字号、码率等沿用现有有效性校验，不随意增加人工上限。展示真实探测到的尺寸和码率。
- **任务并行**：字幕、文案、横版封面、竖版封面、合成按线路防重复，不因单路任务禁用整个项目。Whisper 保持串行队列，避免模型进程争用资源。 任务区保留全部运行中任务与最近合成结果；单路完成反馈不得覆盖合成进度或重建无关参数、播放器。
- **章节**：单独识别只更新字幕，章节通过独立按钮生成；一键处理按依赖联动。复用文案模型，按完整带时间戳文稿推断；名称及时间可编辑，不重叠且不超出视频。章节预览和导出共用 ASS 图层；异步生成不能覆盖更新后的文稿或章节。
- **一键处理**：已有文稿直接复用；文稿准备完成后，文案、封面及视频线路并行执行。开启章节且尚无章节时，视频线路先生成章节再合成；已有章节直接复用，章节失败仍继续合成。封面不等待新文案、不使用旧文案作为本次流程的依赖。单路失败保留其余成功结果，视频完成即可下载。
- **合成快照**：合成使用任务启动时的参数、字幕与配乐快照，运行中后续编辑用于下一次任务。异步任务完成不能覆盖用户之后输入的创作方向。
- **横竖封面**：完整生成先策划并校验共同规范及两版提示词，再分别生图；单张重试复用该版方案或当前编辑内容，不额外调用策划模型。防止旧方案覆盖新方案，并保留另一版的成功结果。
- **预设与播放状态**：预设应用整套参数及配乐，实际偏离时标记自定义。同项目刷新、任务完成和参数修改应保留播放器与配乐节点；正常取消播放意图不应弹出 AbortError。
- **结果与历史**：新结果使用独立文件并保留历史记录。项目导出仅打包点击时最新成功结果与已保存字幕、文案、封面，缺失项写入清单，不重新调用模型。

## 数据、密钥与本机运行边界

- `data/workspace.json` 含明文 API Key。不要在排查、终端输出、截图、日志或交付内容中暴露密钥，也不要把它或备份复制到代码目录。
- 检索代码时排除 `data/`、`.venv/`、`.playwright-mcp/`、`node_modules/` 和模型缓存；仅在任务需要时定向检查数据，并先考虑脱敏。
- 不删除、覆盖或重置用户素材、项目、音乐库、模型缓存和导出文件。测试数据使用明确独立目录；递归删除前确认绝对路径位于该测试目录内。
- 密钥仅在服务端保存，前端只接收是否已配置的标记；空白重存应保留已有密钥。提示词日志记录实际请求和已有回复，同时脱敏鉴权信息及已知密钥，不补造历史日志。
- 接口测试默认使用本地模拟服务，不读取真实密钥、不产生付费请求。只有用户明确要求真实调用时才使用相应服务。
- 服务保持仅监听 `127.0.0.1`，保留 Host / Origin 校验、文件路径边界及媒体 Range 支持。
- Windows 子进程沿用 `windowsHide: true`；文件路径使用 `node:path` 和独立参数数组处理，兼容中文及空格。停止服务仅处理本项目已核对的进程，不按进程名批量终止 Node、FFmpeg 或 Python。
- `.gitignore` 已排除运行数据、虚拟环境及常见密钥文件；提交前仍需检查暂存区。Git 推送仅在用户要求的仓库和范围内进行，不强制覆盖远端历史。

## 文档维护

功能入口、使用方法、参数或限制改变时同步更新 `README.md`，优先修正相关旧说明，避免继续堆叠互相冲突的描述。架构、命令或上述行为约定发生实质变化时同步更新本文件。

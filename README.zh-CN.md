<p align="center"><a href="README.md"><strong>English →</strong></a> · <strong>简体中文</strong></p>

![Boplet — Icon Studio](docs/assets/boplet-cover.svg)

<p align="center"><a href="https://boplet.app/">官网</a> · <a href="https://boplet.app/#get-started">开始使用</a> · <a href="https://boplet.app/studio/">进入工作区</a></p>

# 超好用的图标设计工具

Skill 通过 [GitHub Releases](https://github.com/walnut-a/icon-studio/releases) 分发，不使用 npm 发布。官网安装入口指向完整 Release 包及 SHA-256；也可以拉取固定版本源码构建。当前发布仍为开发预览版，原始 `skill/` 目录不能直接安装。

维护者请看[开发、本机测试与发布管线](docs/开发测试与发布.md)：同一验收候选用于本机安装、GitHub 附件和官网，准备产物不自动安装或发布。

把想法告诉你的 AI 助手，在 **Boplet** 查看图标、挑选方案、导出 SVG。

Boplet 将一套图标设计 Skill 和轻量网页工作区结合起来。Skill 引导 AI 助手确认需求、探索方向、绘制几何、检查尺寸；你在工作区查看结果，决定下一步怎么调整。

## 开始使用

| | 在线使用 WebMCP | 本地使用 Skill |
| --- | --- | --- |
| 浏览器和助手支持 | 需要 WebMCP | 不需要 WebMCP |
| 安装 | 无需安装 Skill 到本地 | 安装完整 Skill 包 |
| 项目存储 | 你授权的本地目录 | 你授权的本地目录 |

**在线使用：**打开 [boplet.app](https://boplet.app/#get-started)，复制在线指令发给 AI 助手。它会从官网加载 Skill，取得你的同意后，页面自动进入工作区并引导你授权目录。

**本地使用：**在同一页面复制本地指令。AI 助手下载并校验完整 Skill 包，经你同意后安装，打开包内的本地工作区。宿主需要 Node.js 22.23.1 或更高的 22.x 版本。

已有项目可以直接打开[工作区](https://boplet.app/studio/)查看、导出，无需 Agent 或 WebMCP。浏览器需要支持本地目录访问，重开时可能需要重新授权。

> Boplet 不会把项目文件上传到自己的服务器。AI 助手如何处理数据，取决于其服务商和你的配置。

## 从想法到图标

![Boplet 的三个真实初稿与方案 A 的修改前后对比](docs/assets/boplet-process.svg)

- **探索：**从同一需求出发，对比不同方向。
- **微调：**告诉 AI 助手要调整的几何、神态或小尺寸细节。
- **交付：**确认主方案，检查尺寸与场景，导出 SVG；默认保留备选。

Boplet 自己的图标从一句“有趣一点”开始。我们对比三个初稿，选中 A，把双眼换成偏心镂空，保留歪头和两只小脚。

## 预览状态

官网和可下载的 Skill 目前均为**开发预览版**。在线、本地共用业务核心和数据合同；WebMCP 支持情况取决于浏览器与 Agent，不支持时可走本地路线。

Windows 实机及完整的目录撤权、双端交接矩阵尚未验收。不提供自动更新或旧数据迁移，请备份重要项目。

## 本地开发

使用 Node.js **22.23.1–22.x** 和 npm。浏览器测试需要本机安装 Google Chrome。

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run build:web
npm run test:e2e
```

用本地静态服务器托管 `dist/web`，即可预览官网和 `/studio/`。例如已有 Python 3 时：

```sh
python3 -m http.server 53058 --bind 127.0.0.1 --directory dist/web
```

运行 `npm run pack:skill` 生成完整安装包。不要直接把源码中的 `skill/` 当成完整安装包，它不含必需的已构建运行资产。打包、本地运行与检查说明见[贡献指南](CONTRIBUTING.md)。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `skill/` | 设计方法、Agent 指令与参考资料 |
| `src/web/` | 官网与浏览器运行时 |
| `src/app/` | 共用的项目、图标与检查界面 |
| `src/core/` | 共用业务与几何逻辑 |
| `src/contracts/` | 文档和操作合同 |
| `src/storage/`、`src/runtime/`、`src/transports/` | 本地存储、服务和 WebMCP 适配 |
| `tests/` | 单元、合同、集成与浏览器测试 |

详细[需求](docs/产品图标工坊-项目化架构与双端产品方案.md)与[开发进度](docs/产品图标工坊-开发计划.md)以中文维护。带日期的条目是历史记录，不代表当前安装或部署状态。

## 许可与灵感来源

采用 [MIT 许可证](LICENSE)。第三方依赖保留各自许可证，见[第三方声明](THIRD_PARTY_NOTICES.md)。

灵感来自 Minor Adventures 的 [The Making of Cursor’s Icons](https://www.minoradventures.co/blog/the-making-of-cursors-icons)。Boplet 的实现与品牌图形独立制作；原文章未包含在仓库中，也不受本项目许可证覆盖。

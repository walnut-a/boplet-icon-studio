# 产品图标工坊 · Icon Studio

面向图标系统维护的 Skill 与网页容器，优先通过 WebMCP 操作，数据保存在用户本地，与程序分离。

## 当前状态

开发已开始，当前是 **A0 基础增量**，不是可使用的 Skill 或网站。

- 11 类文档的严格 JSON Schema、统一错误与完成/受理/等待权限回执。
- 22 个能力域、96 个操作的单一目录；其中 18 个基础操作已有核心实现，其余显式标为 `NOT_IMPLEMENTED`，尚无完整输入/输出合同，不注册为可执行工具。
- 已实现项目创建、读取、更新、归档/恢复、草稿读取、零方案列表与本会话导航等核心行为。
- 只有测试用 MemoryStorage。`persisted` 在这些测试中指写入测试适配器完成，不代表真实磁盘持久化；不会将它用作网页保存回退。

尚无本地服务、实际 WebMCP 适配、浏览器文件授权、几何编译器或 UI。当前会话明确返回 `headless` / `uiStatus: unattached`，不能拿核心测试代替两条 Agent 路径或视觉验收。A0 仍在进行中。

## 开发基准

- [已确认需求](docs/产品图标工坊-项目化架构与双端产品方案.md)
- [开发计划与进度](docs/产品图标工坊-开发计划.md)

此处 `docs/` 是后续唯一维护版本。原临时工作区 `outputs/` 中的同名文档保留为本次建仓前的历史快照，不再双向维护。

先完成完整 Skill，再完成网页版；两端共用数据格式、操作合同和几何核心。下一步补齐 A0 剩余操作的严格合同，再推进 A1 共享几何与真实本地存储。

## 开发与验证

当前开发基线是 Node 22.23.1（`engines` 限定 22.x）、npm 10.9.8；本次实际验证环境为 macOS。Windows 和浏览器运行尚未验证，不等于产品放弃跨平台。

```sh
npm ci --ignore-scripts
npm test
npm run build
```

`npm test` 使用 Node 内置测试器，单次运行，无 watch。也可分别运行 `test:unit`、`test:contract`、`test:integration`。构建只验证并生成 `dist/contracts.json`，包含文档 schema 和操作目录；不是可安装或可部署产物。消费端应先注册文档 `$id`，再解析操作 schema 的 `$ref`；`studio-time` 为精确 UTC 毫秒时间格式，校验定义见 `src/contracts/schema.js`。

`test:e2e`、`pack:skill`、`build:web`、`check:package` 已预留命令，但当前会明确失败并报告尚未实现，不输出假成功。它们会在对应工作包逐项替换。

### 代码入口

- `src/contracts/`：文档、操作、统一结果与错误；机器可读 schema 和运行时使用同一份定义。
- `src/core/studio.js`：核心分发入口 `createStudio({ storage, skill }).execute(name, args)`。这是工程内 API，不是已经上线的 HTTP/WebMCP 入口。
- `src/core/projects.js`：已授权存储上的项目基础操作；真实权限必须由未来宿主适配提供，`connect_library` 不赋予磁盘权限。
- `src/storage/`：规范相对路径和测试存储；没有写入锁、版本比较交换或旧格式转换。
- `tests/fixtures/`：合成库、同名项目、多方案及尺寸/样式/轻重变体；不使用用户图标数据。

会话内 requestId 重试复用结果；改变同一 requestId 的参数拒绝执行，过期回执要求先读现状。不同会话可以独立保存相同项目，旧 sourceRevision 不造成冲突拒绝。当前回执仅在运行实例内存中，事件日志、跨重启恢复及真实保存失败验证仍待后续工作包。

### 依赖

运行依赖锁定 Ajv 8.20.0（MIT），用于严格 JSON Schema 校验，不自行实现通用验证器；参考 [Ajv 官方入门文档](https://ajv.js.org/guide/getting-started.html)。传递依赖 fast-deep-equal 3.1.3、json-schema-traverse 1.0.0、require-from-string 2.0.2 为 MIT；fast-uri 3.1.7 为 BSD-3-Clause。版本和完整性记录在 package-lock.json。产品自身分发许可证尚未发布，不因采用这些依赖自动授予产品许可证。

构建和测试只写被忽略的产物目录或测试专属临时目录。此阶段不启动或替换旧预览服务。

## 接续开发

在 Codex 中将 `<USER_HOME>/GitHub/icon-studio` 添加为项目，再从该项目发起后续开发任务。不要继续以原临时工作区为代码修改根目录。

先读取本文件、AGENTS.md 和两份基准文档，再检查 Git 状态。按工作包保留可审查提交和验证证据；提交、安装、替换与部署分别处理。

## 旧版参考

需求文档中的旧版 `outputs/` 与 `work/` 路径均相对于原临时工作区 `<USER_HOME>/Documents/Codex/2026-08-16/https-www-minoradventures-co-blog-the`，不是本仓库或 GitHub 目录：

- `<USER_HOME>/Documents/Codex/2026-08-16/https-www-minoradventures-co-blog-the/outputs/make-product-icons/`：旧候选源码，只读参考。
- `<USER_HOME>/Documents/Codex/2026-08-16/https-www-minoradventures-co-blog-the/work/`：旧测试，按新合同提取有用的回归语义。

这些路径是本机历史参考，不是新版运行依赖，也未打包进本仓库。原有 Skill、HETAO 数据和预览服务保持原样；不迁移旧数据，不将真实项目或日志提交到 Git。

## 分发

本仓库当前仅本地开发，未配置远程仓库、CI 或发布站点。完整 Skill 打包和网站构建尚未实现，不能用当前合同构建产物冒充发行包。

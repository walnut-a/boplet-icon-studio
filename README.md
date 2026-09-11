# 产品图标工坊 · Icon Studio

由 Agent 操作、用户审核的图标系统设计 Skill。WebMCP 优先但不是门槛，项目数据保存在用户本地，与程序分离。

启动前须告知并取得用户对使用本地或在线 HTML 容器的明确同意；拒绝或未回答不启动。HTML 是必需中介，缺少 WebMCP 可以走 HTTP 回退，但不能省略页面。启动器校验同意声明及容器资产，页面未连接时会话返回 html_required 并拒绝项目设计操作。

## 当前状态

已推进到 **A4 Skill 候选验收**。A0–A3 已实现并通过本机对应验证；A4 更新检查、规范、独立打包和 macOS 隔离运行已具备。**Windows 实机未验，尚不能标记阶段一跨平台交付完成；网页 B 阶段未部署。**

- 11 类严格文档 schema、22 个能力域、96 个具名操作，全部有输入/输出合同与处理函数。
- 项目级主方案由用户明确选择，编辑不取消主线，不默认删除备选；“复制给 Agent”生成精确范围的本地读取指令。同一 v3 项目可直接打开：缺少主方案字段按未选择读取，preferredSchemeId 保留但不映射为确认；读取不回写，不迁移图标。未知格式仍拒绝转换，不表示已替换本地安装。
- 项目 → 需求确认 → 方案/规则 → 语义/变体 → 登记任务 → 几何/编译 → 反馈/审核/历史 → 导出/重开。
- Node 授权目录存储、独立配置、回环服务、动态端口和按构建身份复用。单文件完整保存，后成功保存生效，无锁、CAS、旧格式转换或自动合并。
- 黑白灰只读容器：项目库、方案平铺列表、图标详情、图层/节点选区、固定场景和直接下载。沿用 [DESIGN.md](DESIGN.md) 中已确认规范。

本机 Chrome 152.0.7977.77 默认未开放 WebMCP；开启实验 Web 平台能力后，真实 document.modelContext 路径已验证。默认无 WebMCP 的完整本地路径也通过。共享几何已在真实浏览器 Worker 与 Node 验证一致；浏览器目录授权与纯在线执行留在 B 阶段，不能把 Worker 测试当网站交付。

## 唯一开发基准

- [已确认需求](docs/产品图标工坊-项目化架构与双端产品方案.md)
- [开发计划与进度](docs/产品图标工坊-开发计划.md)

docs/ 是后续唯一维护版本；原临时工作区同名文件只作历史快照。先 Skill 后网页，两端共用数据格式、操作合同和几何核心。

## 开发与验证

基线 Node 22.23.1（限定 22.x）、npm 10.9.8。实际环境：macOS / Darwin 25.5.0、Apple M4、Chrome 152.0.7977.77。Windows 命令已提供但未实机验证。

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run test:e2e
npm run pack:skill
npm run check:package
```

所有测试为非 watch；可拆分 test:unit、test:contract、test:integration。build 生成 dist/contracts.json 与 dist/app/。E2E 使用本机 Chrome，分别验证原生 WebMCP、本地回退、Worker 几何及 600 图标页面。生成的 QA、构建、候选包不入 Git。

pack:skill 输出 outputs/icon-studio-next/skill/、ZIP 和 SHA-256。输出目录须为空，不覆盖既有候选；重建前将自己生成的旧候选移入明确 QA 归档目录。check:package 检查白名单、哈希、许可证和敏感/真实数据痕迹。build:web 仍明确报告 B2 未实现。

消费 schema 时先注册文档 $id，再解析 $ref；studio-time 校验见 src/contracts/schema.js。contracts.json 与运行时 get_capabilities 来自同一操作定义，不另造一套工具说明。

## 使用候选 Skill

完整说明见 [skill/SKILL.md](skill/SKILL.md)、[运行规范](skill/references/runtime.md) 和 [两条流程](skill/references/workflows.md)。

包内运行资产已捆绑，无须 npm 安装、Python、CDN 或账号；Node 由宿主提供。先加载 Skill，再确认目录、启动内置服务或复用匹配实例；凭据不进入 URL 或项目数据。已按用户授权在本机 Codex 安装候选并以独立 HETAO Station 新库测试，目前停在需求确认；Codex 宿主 WebMCP 配置超限问题 A4-02 未关闭，当前使用完整 HTTP 回退，详见开发计划 §10.2.5–6。

真实官方更新源尚未配置，检查会报告 unknown，不报告“已是最新版”；合成发布源只验证检查逻辑。不自动安装、热替换或迁移数据。

## 代码入口与状态语义

- src/contracts/：单一文档、操作、结果与错误合同。
- src/core/studio.js：createStudio({storage,skill}).execute(name,args)，统一受理、权限、事件与回执。
- src/core/geometry.js：共享 Paper.js 核心，显式路径、曲线、布尔、组件与仿射变换，不接收原始 SVG。
- src/runtime/：本地服务、启动器；connect_library 不自行授予 OS 权限，数据与只读资料分别授权。
- src/transports/webmcp.js：原生工具注册；缺少原生能力仍可通过相同核心的本地 HTTP 完整使用。
- src/storage/：受控相对路径、磁盘完整写入和测试 MemoryStorage；后者不是网页隐藏保存回退。
- tests/fixtures/：仅合成数据，不使用真实用户图标。

requestId 在会话内复用回执；过期先读现状。不同会话的旧 sourceRevision 不造成冲突拒绝。回执和有界事件是会话级内存，磁盘任务及检查点用于重开；不承诺跨进程恰好一次或全局事件流。确认绑定确切内容，批量结果逐项检查。保存、校验、编译、用户接受和导出不混为一谈。

## 依赖

运行：Ajv 8.20.0、Paper.js 0.12.18、fflate 0.8.3（MIT）。传递依赖 fast-deep-equal、json-schema-traverse、require-from-string 为 MIT，fast-uri 为 BSD-3-Clause。构建 esbuild 0.28.2（MIT），测试 Playwright 1.63.0（Apache-2.0）。精确版本与完整性在 lockfile，包附运行依赖许可证。

Paper 可选 DOM/Canvas 适配不参与生产几何，不要求安装 jsdom/canvas。产品自身分发许可尚未发布，不因采用这些依赖自动授予产品许可证。

## 范围与分发

仓库是 <USER_HOME>/GitHub/icon-studio。旧候选位于 <USER_HOME>/Documents/Codex/2026-08-16/https-www-minoradventures-co-blog-the/outputs/make-product-icons/，仅作为数学和界面语义参考，不是新版运行依赖。

全局 Skill 安装及独立 HETAO Station 新库已获得本次单独授权；旧预览和旧数据保持不变。独立包可构建并隔离运行；完整跨平台交付仍受 Windows 验收门槛约束。未配置远程仓库、CI 或发布站点。全局安装替换、真实更新源、网站部署与公开发布分别处理，不由构建自动执行。

# 贡献指南 / Contributing

感谢你参与 Boplet。面向用户的英文介绍见 [README](README.md)，中文见 [README.zh-CN.md](README.zh-CN.md)。当前详细开发文档以中文维护；欢迎用中文或英文讨论问题。

## 开始开发

- Node.js 22.23.1–22.x、npm；浏览器测试需要本机 Google Chrome。
- `npm ci --ignore-scripts` 安装锁定依赖。
- `npm test` 运行单元、合同、集成测试；部分集成测试也会启动 Chrome。
- `npm run build` 构建共用容器；`npm run build:web` 构建官网与工作区。
- `npm run test:e2e` 顺序执行浏览器回归，不开启 watch。

静态预览可用 `python3 -m http.server 53058 --bind 127.0.0.1 --directory dist/web`。已有服务占用端口时换一个端口，不停止归属不明的服务。生产部署是独立操作，不是构建步骤。

## 本地 Skill 与运行时

完整流程以[开发、测试与发布](docs/开发测试与发布.md)为准。GitHub 分发，不使用 npm publish；npm 仅管理开发依赖。发布前使用同一候选包做隔离安装验收，再将该候选交给 GitHub 和官网，不分别重打包。

`npm run pack:skill` 将源码和构建资产打包到 `outputs/icon-studio-next/`。输出目录必须为空；保留需要的旧包，不盲目覆盖。使用 `npm run check:package` 校验清单、哈希、许可证与白名单。

不要把仓库内未经构建的 `skill/` 直接当安装包。安装到 Agent 前，先完整阅读包中的 `SKILL.md` 和所需引用。安装、目录授权、HTML 使用同意分别处理，不伪造同意证据。

仓库运行入口是 `node scripts/preview.js <明确授权的数据目录>`，需要先构建 `dist/app`。仅在取得真实 HTML 使用同意后设置 `ICON_STUDIO_HTML_CONSENT=granted` 和 `ICON_STUDIO_HTML_CONSENT_REFERENCE`（实际答复引用）。不要使用真实项目做测试；自动化测试使用合成数据及临时目录。

## 修改范围与验证

- 两条入口共用业务核心和合同，不绕过核心直接写项目文件。
- 可自动验证的行为先写失败测试，再实现；视觉变化还要检查桌面和手机真实渲染。
- 不增加旧数据迁移、自动删除备选、项目锁或自动合并。
- 不提交项目数据、密钥、机器路径、日志、缓存或构建产物。
- 只提交相关改动。Commit、Issue、PR 的维护记录使用中文；讨论可双语。
- PR 请写明目的、影响范围、测试结果；界面改动附截图。部署与仓库公开由维护者另行决定。

## 资料入口

- [界面规范](DESIGN.md)
- [产品需求](docs/产品图标工坊-项目化架构与双端产品方案.md)
- [唯一开发进度账本](docs/产品图标工坊-开发计划.md)

上述文档中的带日期记录是历史证据。不要将历史端口、安装路径或阶段计划当成当前配置。

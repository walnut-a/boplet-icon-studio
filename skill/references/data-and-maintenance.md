# 数据与维护合同

`library.json` 识别一个库；`projects/p-…/project.json` 识别项目。项目下 `design-brief.json`、`vocabulary.json`、`schemes/s-…/`，方案下 `scheme.json`、`rules.json`、`matrix/i-….json`、`primitives/`、`usages/`、`builds/`；项目还有 tasks/batches/feedback/reviews/history/deliveries。源数据不进入 Skill 或 HTML 包。

所有身份都来自工具回执：lib-/p-/s-/i-/v-。名称相同不代表同一对象。矩阵存同一图标的独立变体，不在多个方案之间共享可写矩阵。复制后的方案独立存在，由 Agent 检查并保存规则，无需用户二次确认。

严格 JSON schema 拒绝未知字段、重复节点/图层身份、非有限数值、循环组件以及不兼容格式。`contracts.json` 同时包含所有文档 schema 与操作 schema；不要额外创建一套似是而非的 metadata。

需求六项为 `purpose`（设计目的）、`stylePreferences`（风格偏好）、`audience`、`usage`、`scope`、`constraints`。校验与确认使用相同字段；不使用旧 `goals`，不自动映射旧内容。风格偏好不得包含 Agent 未经用户要求预设的具体造型，具体思路留给方案。历史不兼容内容仅封存。

审核绑定内容 hash（几何、规则与组件），修改后旧接受不算当前接受。反馈保留用户原文，不让模型生成自评。历史恢复写新 revision，不回退文件时间，不做多用户合并。undo/redo 也需要明确历史 revision 与用户授权证据，先 list_history/get_revision 再执行，不猜“前一个”属于哪个 Agent。

任务状态 planned/running/paused/waiting_user/blocked/failed/succeeded/cancelled 与真实检查点关联。宿主报告不能直接写成功，成功来自编译。规则生产版本或需求确认版本变化后登记新任务，不复用旧任务授权。规则 status 为 draft/ready/superseded，不含用户 confirmation 字段；prepare_confirmation 仅用于项目需求。暂停、取消只影响明确任务，不停其他项目。

SVG 交付记录包含范围、源 revision、字节和哈希；准备受理不等于文件可下载。源快照包含项目与设计上下文，供查阅和封存，不承诺导入旧版本。项目/方案归档保留文件，不加入永久删除工具。

安全边界是当前会话已授权目录；不提供任意文件系统 API。只读资料目录另授。会话令牌是凭据，不写入业务 metadata。最后成功保存生效，不加入锁、租约、CAS、基础版本门槛或自动合并。

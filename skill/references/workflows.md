# 两条完整流程

下面同一序列用于原生 WebMCP 和本地调用。例子的确认只展示协议；实际必须等真实用户确认，不能复用示例 evidence。

| 阶段 | 操作及回执 |
| --- | --- |
| 启动同意 | 告知 HTML 是必需中介并询问是否允许；真实答复同意后才启动或复用，拒绝/未回答则停止。打开绑定页面，get_workflow 不再为 html_required 后进入设计。 |
| 连接 | 启动器已连接初始会话；新会话 `connect_library {create:false,requestId}`，`get_workflow` |
| 项目 | `list_projects {}`；用户要新项目时 `create_project {name,requestId}`，保存 projectId；`open_project` |
| 需求 | `update_brief {projectId,content,requestId}`，content.fields 六项，每项 `{value,provenance:{kind:'user',reference:null,awaitingConfirmation:false}}`，vocabularyDraft 为数组 |
| 确认 | `validate_brief` → `prepare_confirmation {projectId}` → 聊天展示完整摘要，等待用户 → `confirm_brief {projectId,confirmationId,evidenceReference,requestId}` |
| 方案 | `create_scheme {projectId,name,requestId}` 保存 schemeId；Agent 直接 `set_design_rules {projectId,schemeId,content,requestId}`，content 包含 gridSize/padding/strokeWidth/cornerRadius/lineCap/lineJoin/opticalNotes。规则保存为 ready 后连续登记、绘制和编译，不再次请求用户确认参数，不停在空方案。 |
| 登记 | `register_icons {projectId,icons:[{name,concept,tags,usages}],requestId}`；`register_variants {projectId,schemeId,iconId,variants:[{size:16,style:'outline',weight:'regular'}],requestId}` |
| 计划 | `create_batch {projectId,schemeId,targets:[{iconId,variantId}],requestId}`；`start_batch {projectId,batchId,requestId}`，保存 taskIds |
| 绘制 | `apply_operations {projectId,schemeId,iconId,variantId,taskId,operations:[…],requestId}`；严格按 layers schema，不传 raw SVG |
| 编译 | `validate_icon`，再 `compile_scheme {projectId,schemeId,iconId,variantId,requestId}`；检查每个 items.ok，不只看顶层 ok |
| 查看 | `navigate {view:'structure',projectId,schemeId,iconId,variantId,requestId}`；`get_view_context`/`get_selection`/`get_layer`；没有节点选择返回 null |
| 场景 | `set_usage_bindings {…变体身份,bindings:['toolbar'],requestId}`，`navigate {view:'scenes',projectId,schemeId,iconId,requestId}`，get_context_preview 不传隐藏 variantId |
| 修改 | record_feedback 原文；需要新任务时 create_batch/start_batch，再 apply_operations、validate/compile；pause_task 后可重开用 get_recovery/resume_task 接续 |
| 主线 | 用户明确确认后 set_primary_scheme {projectId,schemeId,evidenceReference,requestId}；取消用 schemeId:null；get_project/open_project/get_view_context 直接附主线信息。倾向或查看不算确认，修改不取消主线，不逐个图标审核 |
| 交接 | get_agent_handoff {projectId,schemeId,scope:'scheme',language:'zh'}；图标加 iconId 和 scope:'icon'，尺寸再加 variantId 和 scope:'variant'。只读生成指令，不包含会话凭据或端口，不改主线 |
| 导出 | prepare_export scope variant/icon/scheme/project，kind svg/source；accepted 则轮询 get_operation；最终 get_export、read_artifact |
| 重开 | 使用相同目录重新启动，connect_library/list_projects/open_project/list_tasks/get_recovery，不重复生成项目 |

## 原生 WebMCP

在已绑定会话的页面上先调用 `icon_studio_v3_get_workflow`。用 `icon_studio_v3_list_operations` 找到业务操作，再用 `icon_studio_v3_get_operation_schema` 读取单项输入合同；只读操作通过 `icon_studio_v3_read`，写操作通过 `icon_studio_v3_write`。五个网关只负责传输，96 个业务操作仍由同一合同和核心执行。浏览器点击仅用于用户查看、选择、下载；页面能显示但网关未注册时不能声称 WebMCP 已连接。

## 不支持 WebMCP

照上述序列逐次 POST `/operation`：`{name:'create_project',input:{name:'…',requestId:'…'}}`。输入输出与 WebMCP 相同。Agent 可以没有浏览器操作能力，但 HTML 不可省略，可请用户打开页面；页面轮询同一会话核心，用户仍能看到数据更新和手动选区，Agent 通过 get_selection 读取。

回执 accepted 使用原 operationId 读取完成，不重新发起；短暂失败检查实际数据再决定。等待用户确认、目录授权和下载选择是正常交互，不伪造 completed。

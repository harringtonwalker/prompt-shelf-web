# Prompt & Skill Shelf

Prompt & Skill Shelf 是一个可直接部署到 GitHub Pages 的提示词与 Skill 私有工作台。

- 在线入口：<https://harringtonwalker.github.io/prompt-shelf-web/>
- 同一个 UI 提供“提示词”和“Skill”两种模式
- 公共仓库只包含网页框架、空白模板和使用说明
- 真实提示词、完整 Skill 与个人元数据保存在用户自己的私有个人工作区
- GitHub Token 与 AI API Key 只保存在当前设备的 IndexedDB

## 公共和私有边界

本仓库可以公开、下载或 Fork，但只包含：

- `index.html`：公开 UI 与 GitHub Contents API 客户端
- `data/prompts.json`：0 条提示词的空白模板
- `templates/private-workspace/data/skills-index.json`：仅供创建私有工作区使用的空白模板
- `templates/private-workspace/data/ai-chats.json`：0 段对话的私有工作区初始化模板
- 公开说明和边界校验脚本

本仓库不得包含真实提示词、完整 Skill、私人工作流、本机绝对路径、Token、API Key 或个人配置。

匿名用户和 Fork 用户默认看到空白工作台，不会继承仓库维护者的任何私人内容或设备连接。

## 私有个人工作区

每位用户可连接一个自己拥有的私有 GitHub 仓库。页面只接受 `Private` 仓库，并在同一个连接中读取：

- `data/prompts.json`
- `data/skills-index.json`
- `data/ai-chats.json`

默认分支和文件路径可以在“同步与备份”中修改。Fine-grained Token 应只授权该私有仓库，并只开放 `Contents: Read and write`。

每台设备只需首次连接一次。连接信息保存在当前设备；页面打开、恢复联网、重新聚焦、定时检查或点击“立即同步”时读取最新数据。提示词新增、编辑、删除和恢复会写入私有工作区；Skill 索引由私有工作区只读提供；AI 导航助手的非空对话会同步到同一工作区。

刷新页面时，缓存会先保持锁定；只有 GitHub 再次确认目标仓库为 Private 且当前 Token 有写权限后，页面才显示私人提示词、Skill 和 AI 配置。断网时会在真实网络请求失败后进入明确标注的“离线缓存只读”状态。

GitHub 无法读取尚未提交和推送的本地 Skill 文件。只有私有工作区中已经更新的索引和源码才能被手机、电脑网页读取。

## Skill 模式

Skill 模式与提示词模式共用当前页面，不维护第二个 HTML。私有索引提供分类、搜索、卡片、详情、使用场景、引用说明、更新时间和状态；完整 Skill 内容按需从同一个私有仓库读取。

公共仓库根目录不保存 `data/skills-index.json`。Skill 索引只存在于私有个人工作区；公共仓库只保留空白初始化模板。Skill 索引生成与源码同步由 Skill 主项目中的唯一有效脚本负责，公共网页仓库不生成或保存私人 Skill。

## AI 导航助手

提示词和 Skill 仪表盘共用同一套供应商、模型和 API Key 配置，不需要重复设置。AI 导航助手会先在浏览器中检索提示词的用途说明、适用场景和紧凑正文摘要，以及 Skill 的用途、使用场景和引用说明，再只把相关候选发送给模型。

- 支持提示词、Skill 或综合检索
- 支持持续多轮对话、新建、重命名和删除
- 对话历史写入私有 `data/ai-chats.json`，手机和电脑可继续
- API Key 仍只保存在当前设备 IndexedDB，不随对话同步
- 聊天输入和模型返回会拦截疑似 API Key 或 GitHub Token，避免进入浏览器缓存或私有对话文件
- 新建或正文发生变化的提示词会用同一套 AI 配置补充“它能做什么”和“适用场景”；没有 API Key 时使用本地摘要并等待用户启用 AI
- 默认不发送全部收藏库、完整 Skill 源码或无关聊天记录

## 多设备和冲突保护

- 提示词写入使用 GitHub 当前文件 SHA，远端变化时重新读取并合并
- 删除、恢复和类目变更保留同步事件，避免旧设备复活已删除内容
- 有未同步本机修改时，不使用公共空白模板覆盖
- Skill 索引按最新 SHA 读取，不从浏览器缓存伪装成已同步
- AI 对话使用独立 SHA；同一对话的并发消息按消息 ID 合并，删除墓碑始终优先，避免另一台设备复活已删除对话
- 私有数据变化不需要重新部署 GitHub Pages

## AI 与凭据安全

- GitHub Token 和 AI API Key 只存当前设备 IndexedDB
- 不进入 HTML、localStorage、Git、JSON、URL、导出文件、日志或错误正文
- 写入前拦截常见 Token 和 API Key 形态
- 连接配置使用独立的私有工作区 v2 存储键，不自动继承旧公开数据分支的 Token 或配置
- 不使用 Supabase、本地服务、Node 代理或启动器

IndexedDB 的安全边界是整个网页来源（origin），不是网址路径。`harringtonwalker.github.io` 下的其他项目页与 Prompt Shelf 属于同一来源，因此不得在这个 GitHub Pages 域名下部署不受信任的第三方页面或脚本。数据库名称中的项目路径只用于避免误用，不构成安全隔离；若未来同域需要托管不受信任页面，应先把 Prompt Shelf 迁到独立域名或独立 GitHub Pages 来源。

## Fork 或下载

Fork 后可以直接部署同一套空白框架。用户如需保存自己的内容，应连接自己的私有仓库和自己的 API Key。任何新增内容只会写入该用户主动连接的私有仓库，不会修改本仓库，也不会看到维护者的私人数据。

需要分享时先在批量管理中主动勾选提示词，再使用“导出公开版”。公开版只包含所选提示词的正文、类目、标签、用途和适用场景，不包含私人备注、版本历史、使用记录、同步信息、Token 或 API Key，也不会改变私有主库。

## 发布前校验

```bash
git fetch --all --tags --prune
node scripts/verify-public-boundary.mjs
git diff --check
```

边界脚本同时检查当前工作树、所有本地/远端 refs 和可达 Git 历史。旧公开数据分支或历史仍含私人内容时必须失败，不能把仅当前目录为空误报为发布安全；浅克隆或未抓取完整远程对象也会拒绝通过。

设备更换私有工作区时，必须先同步当前仓库并执行“断开本设备”，再连接另一仓库，避免把旧仓库缓存写入新仓库。检测到旧版浏览器缓存时，页面只会锁定保留；必须先验证目标为可写私有仓库并由用户明确确认，才会合并恢复。匿名、连接失效或断开状态不会加载私人的 AI 配置与 Key。

还需真实回归：匿名空白状态、私有连接自动恢复、提示词读写冲突、Skill 索引读取、桌面端和移动端无横向溢出。远程推送和 Pages 发布必须单独确认。

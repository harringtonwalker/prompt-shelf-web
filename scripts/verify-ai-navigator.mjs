import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const errors = [];

function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`无法提取 ${start}`);
  return html.slice(from, to);
}

const runtime = new Function('state', 'makeId', `
  ${between('function assertNoSecretLikeData(', 'function githubPayload(')}
  ${between('function normalizeAIChatMessage(', 'function emptyAIChatsPayload(')}
  ${between('function mergeAIChatsPayload(', 'function saveAIChatsLocal(')}
  return { assertNoSecretLikeData, mergeAIChatsPayload };
`);

const state = {
  githubToken: '',
  aiKeys: {},
  aiChats: [{
    id: 'chat-1',
    title: '设备 A',
    createdAt: 100,
    updatedAt: 300,
    scope: 'combined',
    context: null,
    messages: [{ id: 'message-a', role: 'user', content: 'A 设备追加', createdAt: 300 }]
  }],
  aiChatsDeleted: [],
  aiChatsRevision: 0
};
const { assertNoSecretLikeData, mergeAIChatsPayload } = runtime(state, () => 'generated-id');

const promptRuntime = new Function('NOW', 'makeId', 'validUrl', `
  ${between('function normalizeBoolean(', 'function normalizeAIChatMessage(')}
  ${between('function normalizeTombstone(', 'function mergeConcurrentPayload(')}
  return { normalizePrompt, serializePrompt, payloadContentSignature };
`);
const { normalizePrompt, serializePrompt, payloadContentSignature } = promptRuntime(1000, () => 'generated-id', (value) => String(value || ''));
const legacyPrompt = {
  id: 'prompt-legacy',
  title: '兼容性测试',
  category: 'other',
  content: '保持旧版标签页可读写',
  tags: [],
  source: '',
  favorite: false,
  assistant: false,
  usageCount: 0,
  createdAt: 100,
  updatedAt: 100,
  lastUsedAt: 0,
  deletedAt: 0,
  parentPromptId: '',
  sourceType: 'manual',
  aiMetadata: null,
  revisions: []
};
const normalizedLegacy = normalizePrompt(legacyPrompt);
const serializedLegacy = serializePrompt(normalizedLegacy);
if ('aiSummary' in serializedLegacy || 'useCases' in serializedLegacy || 'metadataStatus' in serializedLegacy || 'metadataUpdatedAt' in serializedLegacy) {
  errors.push('AI 能力元数据仍以旧版会丢弃的顶层字段写入');
}
if (serializedLegacy.aiMetadata !== null) errors.push('空白 AI 能力元数据不应制造远端差异');
const defaultMetadataPrompt = { ...legacyPrompt, aiSummary: '', useCases: [], metadataStatus: 'waiting', metadataUpdatedAt: 0 };
if (payloadContentSignature({ prompts: [legacyPrompt] }) !== payloadContentSignature({ prompts: [defaultMetadataPrompt] })) {
  errors.push('旧版缺省字段与新版空白字段仍会触发重复同步');
}
const serializedEnriched = serializePrompt(normalizePrompt({ ...legacyPrompt, aiSummary: '快速说明用途', useCases: ['首次使用'], metadataStatus: 'ready', metadataUpdatedAt: 200 }));
const restoredEnriched = normalizePrompt(serializedEnriched);
if (serializedEnriched.aiMetadata?.capability?.summary !== '快速说明用途' || restoredEnriched.aiSummary !== '快速说明用途') {
  errors.push('AI 能力元数据没有通过旧版可保留的 aiMetadata 兼容层往返');
}

mergeAIChatsPayload({
  version: 1,
  revision: 400,
  conversations: [{
    id: 'chat-1',
    title: '设备 B',
    createdAt: 100,
    updatedAt: 400,
    scope: 'combined',
    context: null,
    messages: [{ id: 'message-b', role: 'assistant', content: 'B 设备追加', createdAt: 400 }]
  }],
  deleted: []
});

const mergedIds = state.aiChats[0]?.messages.map((message) => message.id);
if (JSON.stringify(mergedIds) !== JSON.stringify(['message-a', 'message-b'])) errors.push('同一对话的双设备消息没有按 message ID 合并');
if (state.aiChats[0]?.title !== '设备 B') errors.push('并发合并没有保留较新的对话标题');

state.aiChats = [{
  id: 'chat-2',
  title: '待删除',
  createdAt: 100,
  updatedAt: 600,
  scope: 'combined',
  context: null,
  messages: [{ id: 'message-c', role: 'user', content: '旧设备晚到的修改', createdAt: 600 }]
}];
state.aiChatsDeleted = [];
mergeAIChatsPayload({ version: 1, revision: 500, conversations: [], deleted: [{ id: 'chat-2', deletedAt: 500 }] });
if (state.aiChats.some((chat) => chat.id === 'chat-2')) errors.push('删除墓碑没有阻止旧设备复活对话');

const sampleToken = `github_pat_${'A'.repeat(40)}`;
try {
  assertNoSecretLikeData(sampleToken);
  errors.push('疑似 GitHub Token 没有被凭据检测器阻止');
} catch (error) {
  if (error?.code !== 'KEY_LIKE_DATA') errors.push('凭据检测器返回了错误的错误码');
}

const sendBlock = between('async function sendAINavigatorMessage(', 'async function openAINavigator(');
if (sendBlock.indexOf('assertNoSecretLikeData(question)') < 0 || sendBlock.indexOf('assertNoSecretLikeData(question)') > sendBlock.indexOf('const chat = ensureActiveAIChat()')) {
  errors.push('用户消息没有在写入聊天状态前执行凭据拦截');
}
const saveBlock = between('function saveAIChatsLocal(', 'function normalizeCategory(');
if (saveBlock.indexOf('assertNoSecretLikeData') < 0 || saveBlock.indexOf('assertNoSecretLikeData') > saveBlock.indexOf('localStorage.setItem')) {
  errors.push('AI 对话没有在写入 localStorage 前执行凭据拦截');
}
const publicExportBlock = between('function batchExport(', 'function batchDelete(');
if (!publicExportBlock.includes("type: 'prompt-shelf-public-export'")) errors.push('批量分享没有使用明确的公开版导出格式');
for (const privateField of ['prompt.note', 'prompt.revisions', 'prompt.usageCount', 'aiChats']) {
  if (publicExportBlock.includes(privateField)) errors.push(`公开版导出包含私人字段：${privateField}`);
}

const template = JSON.parse(await readFile(new URL('../templates/private-workspace/data/ai-chats.json', import.meta.url), 'utf8'));
if (!Array.isArray(template.conversations) || template.conversations.length || !Array.isArray(template.deleted) || template.deleted.length) errors.push('公共仓库中的私有 AI 对话初始化模板必须为空');

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('AI Navigator regression OK: credential blocking, concurrent message merge, deletion tombstones, stale-tab metadata compatibility, public export boundary, and blank template.');
}

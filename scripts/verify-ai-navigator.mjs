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
if (!sendBlock.includes('saveAIChatsLocal({ render: false, sync: false })')) {
  errors.push('AI 生成开始前仍会立即触发远端同步，可能替换正在写入的对话对象');
}
if (!sendBlock.includes('const liveChat = findAIChatById(chatId)')) {
  errors.push('AI 回复没有按对话 ID 重新获取当前对象，跨设备同步时可能写入失效引用');
}
if (!sendBlock.includes('以上内容已保存，可以继续追问')) {
  errors.push('流式连接中断时没有保留已经生成的部分回复');
}
const closeModalBlock = between('function closeModal(', 'function closeAllModals(');
const closeAllModalsBlock = between('function closeAllModals(', 'function openDetail(');
if (!closeModalBlock.includes('state.aiNavigatorAbortController.abort()') || closeModalBlock.includes("state.aiNavigatorStreamingText = ''")) {
  errors.push('关闭 AI 导航弹窗时会在中断处理保存部分回复前清空流式缓冲');
}
if (!closeAllModalsBlock.includes('state.aiNavigatorAbortController.abort()') || closeAllModalsBlock.includes("state.aiNavigatorStreamingText = ''")) {
  errors.push('按 Esc 或关闭全部弹窗时会在中断处理保存部分回复前清空流式缓冲');
}
const saveBlock = between('function saveAIChatsLocal(', 'function normalizeCategory(');
if (saveBlock.indexOf('assertNoSecretLikeData') < 0 || saveBlock.indexOf('assertNoSecretLikeData') > saveBlock.indexOf('localStorage.setItem')) {
  errors.push('AI 对话没有在写入 localStorage 前执行凭据拦截');
}
if (!saveBlock.includes('options.sync !== false')) errors.push('AI 对话本地保存无法显式延后 GitHub 同步');
const githubSyncBlock = between('async function syncWithGithub(', 'function scheduleGithubSync(');
if (!githubSyncBlock.includes('if (!state.aiNavigatorBusy) await syncAIChatsWithGithub()')) {
  errors.push('AI 正在生成时 GitHub 同步仍可能合并并替换当前对话');
}
if (!githubSyncBlock.includes('(state.aiChatsDirty && !state.aiNavigatorBusy)')) {
  errors.push('AI 生成期间仍会重复安排对话同步');
}
const aiChatsSyncBlock = between('async function syncAIChatsWithGithub(', 'function githubErrorText(');
if ((aiChatsSyncBlock.match(/state\.aiNavigatorBusy/g) || []).length < 2) {
  errors.push('已发出的 GitHub 请求返回时没有再次确认 AI 是否已经开始生成');
}
if (!aiChatsSyncBlock.includes('state.aiChatsRevision !== synchronizedRevision')) {
  errors.push('GitHub 写入期间产生的新消息仍可能被误标为已同步');
}

function createAIChatsSyncRuntime(syncState, dependencies = {}) {
  const runtime = new Function(
    'state', 'readGithubAIChatsRecord', 'writeGithubAIChatsRecord', 'mergeAIChatsPayload',
    'aiChatsPayload', 'applyAIChatsPayload', 'githubErrorText',
    `${aiChatsSyncBlock}; return syncAIChatsWithGithub;`
  );
  return runtime(
    syncState,
    dependencies.read,
    dependencies.write,
    dependencies.merge || (() => {}),
    dependencies.payload,
    dependencies.apply || (() => {}),
    () => '同步失败'
  );
}

let releaseRemoteRead;
let mergeAfterGenerationStarted = 0;
const inFlightState = { aiNavigatorBusy: false, aiChatsDirty: true, aiChatsRevision: 1, aiChatsSha: '', aiChatsError: '' };
const inFlightSync = createAIChatsSyncRuntime(inFlightState, {
  read: () => new Promise((resolve) => { releaseRemoteRead = resolve; }),
  write: async () => ({ content: { sha: 'new-sha' } }),
  merge: () => { mergeAfterGenerationStarted += 1; },
  payload: () => ({ revision: inFlightState.aiChatsRevision, conversations: [], deleted: [] })
});
const pendingSync = inFlightSync();
inFlightState.aiNavigatorBusy = true;
releaseRemoteRead({ sha: 'remote-sha', payload: { revision: 1, conversations: [], deleted: [] } });
await pendingSync;
if (mergeAfterGenerationStarted !== 0) errors.push('同步请求先发出、AI 后开始生成时，返回结果仍会覆盖当前对话');

const writeRaceState = { aiNavigatorBusy: false, aiChatsDirty: true, aiChatsRevision: 10, aiChatsSha: '', aiChatsError: '', marker: 'before' };
const writeRaceSync = createAIChatsSyncRuntime(writeRaceState, {
  read: async () => ({ sha: 'remote-sha', payload: { revision: 1, conversations: [], deleted: [] } }),
  write: async () => {
    writeRaceState.aiChatsRevision = 11;
    writeRaceState.marker = 'after';
    return { content: { sha: 'new-sha' } };
  },
  payload: () => ({ revision: writeRaceState.aiChatsRevision, marker: writeRaceState.marker, conversations: [], deleted: [] })
});
await writeRaceSync();
if (!writeRaceState.aiChatsDirty) errors.push('GitHub 写入期间追加的新消息被误清为已同步');

async function runSendScenario(callAINavigatorAI) {
  const scenarioState = {
    aiChats: [{
      id: 'chat-live',
      title: '新对话',
      scope: 'combined',
      context: null,
      createdAt: 100,
      updatedAt: 100,
      messages: []
    }],
    activeAIChatId: 'chat-live',
    aiNavigatorScope: 'combined',
    aiNavigatorContext: null,
    aiNavigatorBusy: false,
    aiNavigatorStreamingText: '',
    aiNavigatorAbortController: null
  };
  const input = { value: '请推荐一个组合', style: { height: '40px' } };
  const saveOptions = [];
  let idCounter = 0;
  const findAIChatById = (id) => scenarioState.aiChats.find((chat) => chat.id === id) || null;
  const activeAIChat = () => findAIChatById(scenarioState.activeAIChatId);
  const sendRuntime = new Function(
    'state', '$', 'assertNoSecretLikeData', 'hasCurrentAIKey', 'openAISettings', 'ensureActiveAIChat',
    'normalizeAIChatMessage', 'makeId', 'saveAIChatsLocal', 'retrieveAIAssets', 'renderAINavigator',
    'renderAINavigatorMessages', 'callAINavigatorAI', 'findAIChatById', 'activeAIChat', 'safeAIError', 'toast',
    `${sendBlock}; return sendAINavigatorMessage;`
  );
  const send = sendRuntime(
    scenarioState,
    (id) => id === 'aiNavigatorInput' ? input : null,
    () => {},
    () => true,
    () => {},
    () => scenarioState.aiChats[0],
    (message) => ({ ...message, sources: message.sources || [] }),
    () => `generated-${++idCounter}`,
    (options = {}) => { saveOptions.push(options); return true; },
    () => ({ prompts: [], skills: [] }),
    () => {},
    () => {},
    callAINavigatorAI.bind(null, scenarioState),
    findAIChatById,
    activeAIChat,
    (error) => error?.message || '未知错误',
    () => {}
  );
  await send();
  return { state: scenarioState, saveOptions };
}

const completedScenario = await runSendScenario(async (scenarioState, chat, question, retrieval, onDelta) => {
  scenarioState.aiChats = [structuredClone(scenarioState.aiChats[0])];
  onDelta('完整', '完整回复的一半');
  return '完整回复';
});
if (completedScenario.state.aiChats[0]?.messages.at(-1)?.content !== '完整回复') {
  errors.push('远端同步替换对话对象后，完整 AI 回复仍然会丢失');
}
if (completedScenario.saveOptions[0]?.sync !== false) {
  errors.push('发送用户消息后没有先仅保存本地，仍可能在生成中触发同步竞态');
}

const interruptedScenario = await runSendScenario(async (scenarioState, chat, question, retrieval, onDelta) => {
  scenarioState.aiChats = [structuredClone(scenarioState.aiChats[0])];
  onDelta('半段', '已经生成的半段内容');
  const error = new Error('用户停止');
  error.name = 'AbortError';
  throw error;
});
const interruptedReply = interruptedScenario.state.aiChats[0]?.messages.at(-1);
if (!interruptedReply?.content.includes('已经生成的半段内容') || !interruptedReply?.content.includes('以上内容已保存')) {
  errors.push('用户停止或连接中断后，已经生成的部分回复没有进入聊天记录');
}

if (!html.includes("{ id: 'newest', name: '最近添加'")) errors.push('提示词侧边栏没有“最近添加”入口');
if (!html.includes("state.filter === 'newest'") || !html.includes('RECENTLY_ADDED_LIMIT = 10')) {
  errors.push('“最近添加”没有按创建时间限制为最近 10 条');
}
const recentState = {
  prompts: Array.from({ length: 12 }, (_, index) => ({
    id: `prompt-${index}`,
    title: `提示词 ${index}`,
    content: '',
    note: '',
    aiSummary: '',
    useCases: [],
    tags: [],
    category: 'other',
    assistant: false,
    favorite: false,
    usageCount: 0,
    createdAt: index,
    updatedAt: index,
    lastUsedAt: 0
  })),
  filter: 'newest',
  query: '',
  qualityFilter: '',
  tagFilter: '',
  sort: 'priority-desc'
};
const recentRuntime = new Function('state', 'normalize', 'duplicateIds', 'categoryName', 'RECENTLY_ADDED_LIMIT', `
  ${between('function getVisiblePrompts(', 'function filterTitle(')}
  return getVisiblePrompts;
`);
const recentlyAdded = recentRuntime(recentState, (value) => String(value || '').toLowerCase().trim(), () => new Set(), () => '其他', 10)();
if (recentlyAdded.length !== 10 || recentlyAdded[0]?.id !== 'prompt-11' || recentlyAdded.at(-1)?.id !== 'prompt-2') {
  errors.push('“最近添加”没有稳定返回按创建时间倒序排列的最近 10 条');
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
  console.log('AI Navigator regression OK: streaming survives sync replacement, interrupted output is preserved, GitHub sync is deferred while generating, recent additions are available, credentials are blocked, concurrent messages merge, deletion tombstones hold, public export stays clean, and templates remain blank.');
}

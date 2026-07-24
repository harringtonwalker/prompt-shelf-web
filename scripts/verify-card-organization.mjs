import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const errors = [];

function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`无法提取 ${start}`);
  return html.slice(from, to);
}

function expect(condition, message) {
  if (!condition) errors.push(message);
}

expect(html.includes('const PROMPT_CATEGORY_LONG_PRESS_MS = 600;'), '长按触发时间不是 600ms');
expect(html.includes('data-category-drop='), '一级类目没有成为明确的拖放目标');
expect(html.includes('state.filter !== \'all\''), '拖拽分类没有限制在“全部提示词”视图');
expect(html.includes('event.pointerType !== \'mouse\''), '拖拽分类可能拦截移动端触摸滚动');
expect(html.includes('data-card-pin='), '提示词卡片没有置顶按钮');
expect(html.includes("Object.prototype.hasOwnProperty.call(prompt, 'categoryPinnedAt')"), '置顶状态不能区分“明确取消”和“旧数据缺失”');
expect(html.includes('categoryPinnedAt: Number(categoryPinnedAt || 0)'), '置顶状态没有写入兼容元数据层');
expect(html.includes('revision: Number(organizationRevision)'), '分类和置顶没有独立的多设备版本时钟');
expect(html.includes('const organizationStates = new Map();'), '分类和置顶没有独立于正文进行并发选举');
expect(!between('function recordClock(', 'function payloadContentSignature(').includes('organizationRevision'), '组织版本仍在参与整条正文记录选举');

const promptDataRuntime = new Function('NOW', 'makeId', 'validUrl', `
  ${between('function normalizeBoolean(', 'function normalizeAIChatMessage(')}
  return { normalizePrompt, serializePrompt };
`);
const { normalizePrompt, serializePrompt } = promptDataRuntime(1000, () => 'generated-id', (value) => String(value || ''));
const pinnedRecord = serializePrompt(normalizePrompt({
  id: 'pinned-record',
  title: '兼容置顶',
  category: 'work',
  content: '测试',
  categoryPinnedAt: 900,
  updatedAt: 100
}));
expect(!Object.hasOwn(pinnedRecord, 'categoryPinnedAt'), '置顶状态仍写在旧版会丢弃的顶层字段');
expect(pinnedRecord.aiMetadata?.organization?.categoryPinnedAt === 900, '置顶状态没有进入兼容元数据');
expect(pinnedRecord.aiMetadata?.organization?.revision === 900, '旧置顶状态没有迁移成组织版本时钟');
expect(normalizePrompt(pinnedRecord)?.categoryPinnedAt === 900, '置顶状态不能从兼容元数据恢复');
const unpinnedRecord = normalizePrompt(pinnedRecord);
unpinnedRecord.categoryPinnedAt = 0;
unpinnedRecord.organizationRevision = 1000;
const serializedUnpinnedRecord = serializePrompt(unpinnedRecord);
expect(serializedUnpinnedRecord.aiMetadata?.organization?.categoryPinnedAt === 0, '取消置顶没有留下明确的 0 值墓碑');
expect(serializedUnpinnedRecord.aiMetadata?.organization?.revision === 1000, '取消置顶没有提升组织版本时钟');
expect(normalizePrompt(serializedUnpinnedRecord)?.categoryPinnedAt === 0, '取消置顶在序列化往返后重新复活');
expect(normalizePrompt({ ...unpinnedRecord, aiMetadata: pinnedRecord.aiMetadata })?.categoryPinnedAt === 0, '内存中的旧嵌套置顶覆盖了明确取消状态');

const mergeBlock = between('function recordClock(', 'function applyPayload(');
const mergeState = {
  prompts: [normalizePrompt({
    id: 'merge-prompt', title: '本地正文', category: 'work', content: '本地内容',
    categoryPinnedAt: 0, organizationRevision: 1000, updatedAt: 100
  })],
  trash: [],
  purged: [],
  categoryPurged: [],
  categoryRevived: [],
  categories: [{ id: 'work', name: '工作与效率' }],
  categoryRevision: 0
};
const mergeConcurrentPayload = new Function(
  'state', 'normalizePrompt', 'normalizeTombstone', 'normalizeCategoryRevival', 'normalizeCategory', 'enforceCategoryTombstones',
  `${mergeBlock}; return mergeConcurrentPayload;`
)(
  mergeState,
  normalizePrompt,
  (item) => item?.id ? { id: String(item.id), purgedAt: Number(item.purgedAt || 0) } : null,
  (item) => item?.id ? { id: String(item.id), revivedAt: Number(item.revivedAt || 0) } : null,
  (item) => item?.id ? { ...item } : null,
  () => {}
);
mergeConcurrentPayload({
  prompts: [normalizePrompt({
    id: 'merge-prompt', title: '远端新正文', category: 'work', content: '远端内容',
    categoryPinnedAt: 900, organizationRevision: 900, updatedAt: 2000
  })],
  trash: [],
  purged: [],
  categoryPurged: [],
  categoryRevived: [],
  categories: [{ id: 'work', name: '工作与效率' }],
  categoryRevision: 0
});
expect(mergeState.prompts[0].title === '远端新正文', '并发正文更新没有保留较新的正文');
expect(mergeState.prompts[0].categoryPinnedAt === 0 && mergeState.prompts[0].organizationRevision === 1000, '较新的取消置顶被较新的正文记录重新覆盖');

mergeState.prompts = [normalizePrompt({
  id: 'mirror-merge', title: '本地旧正文', category: 'research', content: '本地旧内容',
  categoryPinnedAt: 3000, organizationRevision: 3000, updatedAt: 100
})];
mergeConcurrentPayload({
  prompts: [normalizePrompt({
    id: 'mirror-merge', title: '远端较新正文', category: 'work', content: '远端较新内容',
    categoryPinnedAt: 1000, organizationRevision: 1000, updatedAt: 2000
  })],
  trash: [],
  purged: [],
  categoryPurged: [],
  categoryRevived: [],
  categories: [{ id: 'work', name: '工作与效率' }, { id: 'research', name: '研究与分析' }],
  categoryRevision: 0
});
expect(mergeState.prompts[0].title === '远端较新正文' && mergeState.prompts[0].content === '远端较新内容', '较大的组织版本错误覆盖了更新时间更晚的正文');
expect(mergeState.prompts[0].category === 'research' && mergeState.prompts[0].categoryPinnedAt === 3000 && mergeState.prompts[0].organizationRevision === 3000, '正文与组织状态没有分别保留各自较新的版本');

const moveBlock = between('function movePromptToCategory(', 'function renderAssistantSpotlight(');
expect(!/splice|state\.prompts\s*=\s*state\.prompts\.filter/.test(moveBlock), '拖拽分类实现可能删除提示词');
expect(moveBlock.includes('prompt.categoryPinnedAt = 0'), '跨类目拖拽没有清除原类目的置顶状态');

const moveState = {
  prompts: [
    { id: 'prompt-a', title: '少打断模式', category: 'research', categoryPinnedAt: 800, organizationRevision: 800, updatedAt: 100 },
    { id: 'prompt-b', title: '保留卡片', category: 'work', categoryPinnedAt: 0, organizationRevision: 0, updatedAt: 200 }
  ],
  categories: [
    { id: 'research', name: '研究与分析' },
    { id: 'work', name: '工作与效率' }
  ]
};
let moveSaved = 0;
let moveRendered = 0;
let moveUndo = null;
const moveRuntime = new Function(
  'state', 'requireEditAccess', 'nextMutationClock', 'promptOrganizationState', 'applyPromptOrganizationState', 'saveState', 'render', 'toast', 'showPromptOrganizationUndo',
  `${moveBlock}; return movePromptToCategory;`
)(
  moveState,
  () => true,
  () => 900,
  (prompt) => ({ category: prompt.category, categoryPinnedAt: prompt.categoryPinnedAt, organizationRevision: prompt.organizationRevision }),
  (prompt, value) => Object.assign(prompt, value),
  () => { moveSaved += 1; return true; },
  () => { moveRendered += 1; },
  () => {},
  (message, prompt, before) => { moveUndo = { message, prompt, before }; }
);
expect(moveRuntime('prompt-a', 'work') === true, '有效拖放没有返回成功');
expect(moveState.prompts.length === 2, '拖放后提示词数量发生变化');
expect(moveState.prompts[0].category === 'work', '拖放后没有修改一级类目');
expect(moveState.prompts[0].categoryPinnedAt === 0, '拖放后仍携带旧类目的置顶状态');
expect(moveState.prompts[0].organizationRevision === 900, '拖放后没有提升组织版本时钟');
expect(moveState.prompts[0].updatedAt === 100, '仅分类操作错误地污染了正文更新时间');
expect(moveSaved === 1 && moveRendered === 1, '拖放后没有走保存和重新渲染链路');
expect(moveUndo?.before?.category === 'research', '拖放撤销没有保存目标卡片的原类目');
expect(!moveUndo?.before?.prompts, '拖放撤销仍保存整库快照');
expect(moveUndo?.message?.includes('工作与效率'), '拖放成功反馈没有说明目标类目');

const pinBlock = between('function toggleCategoryPin(', 'function toggleAssistant(');
const pinState = {
  prompts: [
    { id: 'prompt-a', title: '第五张卡片', category: 'work', categoryPinnedAt: 0, organizationRevision: 0, updatedAt: 100 }
  ],
  categories: [{ id: 'work', name: '工作与效率' }]
};
let pinSaved = 0;
let pinUndo = null;
const pinRuntime = new Function(
  'state', 'requireEditAccess', 'nextMutationClock', 'promptOrganizationState', 'applyPromptOrganizationState', 'saveState', 'render', 'toast', 'showPromptOrganizationUndo', 'categoryName',
  `${pinBlock}; return toggleCategoryPin;`
)(
  pinState,
  () => true,
  () => 900,
  (prompt) => ({ category: prompt.category, categoryPinnedAt: prompt.categoryPinnedAt, organizationRevision: prompt.organizationRevision }),
  (prompt, value) => Object.assign(prompt, value),
  () => { pinSaved += 1; return true; },
  () => {},
  () => {},
  (message, prompt, before) => { pinUndo = { message, prompt, before }; },
  (id) => pinState.categories.find((category) => category.id === id)?.name || '未分类'
);
pinRuntime('prompt-a');
expect(pinState.prompts[0].categoryPinnedAt === 900, '点击置顶没有记录类目置顶时间');
expect(pinState.prompts[0].organizationRevision === 900, '点击置顶没有提升组织版本时钟');
expect(pinState.prompts[0].updatedAt === 100, '置顶错误地污染了正文更新时间');
expect(pinSaved === 1 && pinUndo?.message?.includes('工作与效率'), '置顶没有保存或缺少清晰反馈');
pinRuntime('prompt-a');
expect(pinState.prompts[0].categoryPinnedAt === 0, '再次点击没有取消置顶');

const undoBlock = between('function promptOrganizationState(', 'function openCategoryManager(');
const undoState = {
  prompts: [{ id: 'prompt-a', title: '其他标签页更新后的标题', content: '其他标签页的新正文', category: 'work', categoryPinnedAt: 900, organizationRevision: 900, updatedAt: 2000 }]
};
let undoSaved = 0;
let undoToast = '';
const restorePromptOrganizationChange = new Function(
  'state', 'nextMutationClock', 'saveState', 'render', 'toast', 'showUndo',
  `${undoBlock}; return restorePromptOrganizationChange;`
)(
  undoState,
  () => 1100,
  () => { undoSaved += 1; return true; },
  () => {},
  (message) => { undoToast = message; },
  () => {}
);
const organizationUndo = {
  promptId: 'prompt-a',
  before: { category: 'research', categoryPinnedAt: 0, organizationRevision: 800 },
  after: { category: 'work', categoryPinnedAt: 900, organizationRevision: 900 }
};
expect(restorePromptOrganizationChange(organizationUndo) === true, '单卡片分类撤销没有成功');
expect(undoState.prompts[0].title === '其他标签页更新后的标题' && undoState.prompts[0].content === '其他标签页的新正文', '分类撤销覆盖了其他标签页的正文修改');
expect(undoState.prompts[0].category === 'research' && undoState.prompts[0].categoryPinnedAt === 0, '分类撤销没有只还原目标卡片的组织字段');
expect(undoState.prompts[0].updatedAt === 2000, '分类撤销污染了正文更新时间');
expect(undoState.prompts[0].organizationRevision === 1100 && undoSaved === 1, '分类撤销没有生成新的组织版本并保存');
undoState.prompts[0].organizationRevision = 1200;
expect(restorePromptOrganizationChange(organizationUndo) === false && undoToast.includes('其他设备'), '组织状态已变化时仍盲目覆盖并发修改');

const visibleBlock = between('function getVisiblePrompts(', 'function filterTitle(');
const sortState = {
  prompts: [
    { id: 'normal-new', title: '普通新卡片', category: 'work', categoryPinnedAt: 0, updatedAt: 500, createdAt: 500, usageCount: 0, tags: [], note: '', content: '', aiSummary: '', useCases: [], assistant: false, favorite: false, lastUsedAt: 0 },
    { id: 'pin-old', title: '较早置顶', category: 'work', categoryPinnedAt: 600, updatedAt: 100, createdAt: 100, usageCount: 0, tags: [], note: '', content: '', aiSummary: '', useCases: [], assistant: false, favorite: false, lastUsedAt: 0 },
    { id: 'pin-new', title: '最新置顶', category: 'work', categoryPinnedAt: 900, updatedAt: 50, createdAt: 50, usageCount: 0, tags: [], note: '', content: '', aiSummary: '', useCases: [], assistant: false, favorite: false, lastUsedAt: 0 }
  ],
  categories: [{ id: 'work', name: '工作与效率' }],
  filter: 'work',
  qualityFilter: '',
  tagFilter: '',
  query: '',
  sort: 'updated-desc'
};
const getVisiblePrompts = new Function(
  'state', 'normalize', 'duplicateIds', 'categoryName', 'RECENTLY_ADDED_LIMIT',
  `${visibleBlock}; return getVisiblePrompts;`
)(
  sortState,
  (value = '') => String(value).toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim(),
  () => new Set(),
  (id) => sortState.categories.find((category) => category.id === id)?.name || '未分类',
  10
);
expect(JSON.stringify(getVisiblePrompts().map((prompt) => prompt.id)) === JSON.stringify(['pin-new', 'pin-old', 'normal-new']), '一级类目内没有按最新置顶优先排序');
sortState.filter = 'all';
expect(JSON.stringify(getVisiblePrompts().map((prompt) => prompt.id)) === JSON.stringify(['normal-new', 'pin-old', 'pin-new']), '置顶错误地影响了“全部提示词”的全局排序');

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('Prompt card organization checks passed.');

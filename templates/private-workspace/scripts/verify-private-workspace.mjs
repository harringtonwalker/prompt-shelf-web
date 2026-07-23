import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const root = decodeURIComponent(new URL('../', import.meta.url).pathname);
const errors = [];
const templateMode = process.argv.includes('--template');
const secretPattern = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-(?:ant-|or-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/;
const sensitiveNames = new Set(['cookies','cookies-journal','login data','login data-journal','web data','web data-journal','history','local state','network persistent state']);
const sensitiveDirectories = new Set(['session storage','local storage','indexeddb','user data','browser profile','chrome_data','chrome data','chrome-data','chromium data','firefox profile','edge profile','brave profile']);
const sensitiveSuffixes = /\.(?:sqlite3?|db|pem|p12|pfx|key)$/i;
const browserProfilePathPattern = /(?:^|\/)(?:google(?:\/| )chrome|google chrome|chrome|chromium)\/(?:default|profile \d+|user data)(?:\/|$)|(?:^|\/)firefox\/profiles(?:\/|$)|(?:^|\/)bravesoftware\/brave browser\/(?:default|profile \d+|user data)(?:\/|$)|(?:^|\/)(?:microsoft\/)?edge\/(?:default|profile \d+|user data)(?:\/|$)/;

function browserProfileDirectory(path) {
  const relative = path.slice(root.length).replace(/^\/+/, '').toLowerCase().replace(/[_-]+/g, ' ');
  return browserProfilePathPattern.test(relative);
}

async function json(path, label) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { errors.push(`${label} 缺失或不是有效 JSON`); return {}; }
}

const prompts = await json(join(root, 'data/prompts.json'), 'data/prompts.json');
const skills = await json(join(root, 'data/skills-index.json'), 'data/skills-index.json');
const aiChats = await json(join(root, 'data/ai-chats.json'), 'data/ai-chats.json');
const marker = await json(join(root, 'private-workspace.json'), 'private-workspace.json');
if (marker.private !== true || marker.purpose !== 'prompt-shelf-personal-workspace') errors.push('private-workspace.json 的私有工作区标记无效');
if (!templateMode && !/^[^/\s]+\/[^/\s]+$/.test(String(marker.repository || ''))) errors.push('private-workspace.json 尚未绑定确认过的私有 owner/repository');
if (!Array.isArray(prompts.prompts) || !Array.isArray(prompts.categories)) errors.push('提示词数据结构无效');
if (!Array.isArray(skills.skills) || !Array.isArray(skills.categories)) errors.push('Skill 索引结构无效');
if (!Array.isArray(aiChats.conversations) || !Array.isArray(aiChats.deleted)) errors.push('AI 对话数据结构无效');
if (templateMode && ((prompts.prompts || []).length || (prompts.trash || []).length || (skills.skills || []).length || (aiChats.conversations || []).length)) errors.push('初始化模板必须保持空白');
for (const skill of skills.skills || []) {
  const sourcePath = String(skill.sourcePath || '');
  if (sourcePath && (!sourcePath.startsWith('skills/') || sourcePath.includes('..') || sourcePath.includes('\\'))) errors.push(`Skill sourcePath 非法：${skill.id || 'unknown'}`);
}

async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (sensitiveDirectories.has(entry.name.toLowerCase()) || browserProfileDirectory(path)) { errors.push(`禁止提交浏览器资料目录：${path.slice(root.length)}`); continue; }
      await scan(path); continue;
    }
    const relative = path.slice(root.length);
    const lowerName = entry.name.toLowerCase();
    if (entry.name.startsWith('.env') || /(?:api[_-]?keys?|tokens?|credentials?)\.json$/i.test(entry.name) || sensitiveNames.has(lowerName) || sensitiveSuffixes.test(entry.name)) errors.push(`禁止提交敏感文件：${relative}`);
    const head = await readFile(path).then((value)=>value.subarray(0,4096)).catch(()=>Buffer.alloc(0));
    if (head.subarray(0,16).toString('binary') === 'SQLite format 3\u0000' || /BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY/.test(head.toString('utf8'))) errors.push(`检测到敏感数据库或私钥：${relative}`);
    if (entry.name.match(/\.(?:md|txt|json|js|mjs|py|toml|ya?ml|csv|html|css)$/i)) {
      const text = await readFile(path, 'utf8').catch(() => '');
      if (secretPattern.test(text)) errors.push(`检测到疑似凭据：${relative}`);
    }
  }
}

await scan(root);
if (errors.length) { console.error(errors.map((item)=>`- ${item}`).join('\n')); process.exitCode=1; }
else console.log(`${templateMode ? 'Private workspace template' : 'Private workspace'} OK: ${prompts.prompts.length} prompts, ${skills.skills.length} skills, ${aiChats.conversations.length} AI chats, no detected credential files.`);

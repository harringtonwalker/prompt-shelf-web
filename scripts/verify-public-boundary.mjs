import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = new URL('../', import.meta.url);
const rootPath = decodeURIComponent(root.pathname);
const errors = [];

const prompts = JSON.parse(await readFile(new URL('../data/prompts.json', import.meta.url), 'utf8'));
const templatePrompts = JSON.parse(await readFile(new URL('../templates/private-workspace/data/prompts.json', import.meta.url), 'utf8'));
const templateSkills = JSON.parse(await readFile(new URL('../templates/private-workspace/data/skills-index.json', import.meta.url), 'utf8'));
if (!Array.isArray(prompts.prompts) || prompts.prompts.length) errors.push('data/prompts.json 必须保持 0 条提示词');
if (!Array.isArray(prompts.trash) || prompts.trash.length) errors.push('data/prompts.json 回收站必须为空');
if (!Array.isArray(templatePrompts.prompts) || templatePrompts.prompts.length) errors.push('私有工作区提示词模板必须保持空白');
if (!Array.isArray(templateSkills.skills) || templateSkills.skills.length) errors.push('私有工作区 Skill 模板必须保持空白');

const textExtensions = new Set(['.html', '.md', '.json', '.mjs', '.js', '.css', '.txt', '.yml', '.yaml']);
const secretPattern = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-(?:ant-|or-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/;
const privatePathPattern = new RegExp('/' + 'Users/[^/\\s]+/');
const privatePathGitPattern = '/' + 'Users/[^/[:space:]]+/';

function git(args, options = {}) {
  return spawnSync('git', ['-C', rootPath, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
}

async function scanPublishCandidates() {
  const result = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (result.status !== 0) { errors.push('无法列出待发布文件'); return; }
  const paths = result.stdout.split('\u0000').filter(Boolean);
  for (const label of paths) {
    const extension = label.includes('.') ? label.slice(label.lastIndexOf('.')) : '';
    if (!textExtensions.has(extension)) continue;
    const text = await readFile(join(rootPath, label), 'utf8');
    if (secretPattern.test(text)) errors.push(`${label} 含疑似 Token 或 API Key`);
    if (privatePathPattern.test(text)) errors.push(`${label} 含本机绝对路径`);
  }
}

function jsonRecordCountAt(ref, path, label) {
  const result = git(['show', `${ref}:${path}`]);
  if (result.status !== 0) return null;
  try {
    const payload = JSON.parse(result.stdout);
    const records = label === '提示词' ? [...(payload.prompts || []), ...(payload.trash || [])] : (payload.skills || []);
    return records.length;
  } catch {
    return Number.NaN;
  }
}

function inspectJsonAtRef(ref, path, label) {
  const count = jsonRecordCountAt(ref, path, label);
  if (Number.isNaN(count)) errors.push(`${ref} 的 ${path} 不是有效 JSON`);
  else if (count) errors.push(`${ref} 的 ${path} 含 ${count} 条真实${label}`);
}

function inspectGitHistory() {
  const shallowResult = git(['rev-parse', '--is-shallow-repository']);
  if (shallowResult.status !== 0 || shallowResult.stdout.trim() === 'true') {
    errors.push('当前仓库是浅克隆或无法确认完整历史；请先抓取全部分支和标签再执行公共边界校验');
    return;
  }
  const refsResult = git(['for-each-ref', '--format=%(refname)']);
  if (refsResult.status !== 0) { errors.push('无法检查全部 Git refs'); return; }
  const refs = [...new Set(refsResult.stdout.split('\n').map((item)=>item.trim()).filter((item)=>item && !item.endsWith('/HEAD')))];
  for (const ref of refs) {
    inspectJsonAtRef(ref, 'data/prompts.json', '提示词');
    inspectJsonAtRef(ref, 'data/skills-index.json', 'Skill');
  }
  const remoteResult = git(['ls-remote', '--heads', '--tags', 'origin'], { timeout: 15000 });
  if (remoteResult.status !== 0) {
    errors.push('无法读取 origin 的远程分支和标签；为避免漏检，公共边界校验已停止');
    return;
  }
  const remoteEntries = remoteResult.stdout.split('\n').map((line)=>line.trim().split(/\s+/)).filter((item)=>item.length === 2 && !item[1].endsWith('^{}'));
  const remoteShas = [...new Set(remoteEntries.map(([sha])=>sha))];
  const missingRemoteRefs = remoteEntries.filter(([sha])=>git(['cat-file', '-e', `${sha}^{commit}`]).status !== 0).map(([,ref])=>ref);
  if (missingRemoteRefs.length) {
    errors.push(`本地缺少 ${missingRemoteRefs.length} 个远程分支或标签对象；请先执行 git fetch --all --tags --prune，示例：${missingRemoteRefs.slice(0,5).join(', ')}`);
    return;
  }
  for (const [sha, ref] of remoteEntries) {
    inspectJsonAtRef(sha, 'data/prompts.json', `提示词（${ref}）`);
    inspectJsonAtRef(sha, 'data/skills-index.json', `Skill（${ref}）`);
  }
  const commitsResult = git(['rev-list', '--all', ...remoteShas]);
  if (commitsResult.status !== 0) { errors.push('无法检查完整 Git 历史'); return; }
  const commits = commitsResult.stdout.split('\n').map((item)=>item.trim()).filter(Boolean);
  const pathCommits = [];
  const secretCommits = [];
  const sensitiveFileCommits = [];
  const promptDataCommits = [];
  const skillDataCommits = [];
  const skillSourceCommits = [];
  for (const commit of commits) {
    if (pathCommits.length < 5 && git(['grep', '-I', '-q', '-E', privatePathGitPattern, commit, '--', '.']).status === 0) pathCommits.push(commit.slice(0,12));
    if (secretCommits.length < 5 && git(['grep', '-I', '-q', '-E', '(github_pat_|gh[pousr]_|sk-(ant-|or-)?|AIza)[A-Za-z0-9_-]{16,}', commit, '--', '.']).status === 0) secretCommits.push(commit.slice(0,12));
    const tree = git(['ls-tree', '-r', '--name-only', commit]);
    if (tree.status === 0) {
      const paths = tree.stdout.split('\n').filter(Boolean);
      if (sensitiveFileCommits.length < 5 && paths.some((path)=>/(^|\/)(\.env(?:\.|$)|cookies(?:-journal)?$|login data(?:-journal)?$|.*\.(?:sqlite3?|db|pem|p12|pfx|key)$)/i.test(path))) sensitiveFileCommits.push(commit.slice(0,12));
      if (skillSourceCommits.length < 5 && paths.some((path)=>/(^|\/)SKILL\.md$/i.test(path))) skillSourceCommits.push(commit.slice(0,12));
      if (promptDataCommits.length < 5) {
        const promptPaths = paths.filter((path)=>/(^|\/)(?:prompts(?:-data)?|提示词[^/]*)\.json$/i.test(path));
        if (promptPaths.some((path)=>Number(jsonRecordCountAt(commit, path, '提示词')) > 0)) promptDataCommits.push(commit.slice(0,12));
      }
      if (skillDataCommits.length < 5) {
        const skillPaths = paths.filter((path)=>/(^|\/)skills-index\.json$/i.test(path));
        if (skillPaths.some((path)=>Number(jsonRecordCountAt(commit, path, 'Skill')) > 0)) skillDataCommits.push(commit.slice(0,12));
      }
    }
  }
  if (pathCommits.length) errors.push(`Git 历史含本机绝对路径，示例提交：${pathCommits.join(', ')}`);
  if (secretCommits.length) errors.push(`Git 历史含疑似 Token 或 API Key，示例提交：${secretCommits.join(', ')}`);
  if (sensitiveFileCommits.length) errors.push(`Git 历史含敏感文件名或数据库，示例提交：${sensitiveFileCommits.join(', ')}`);
  if (promptDataCommits.length) errors.push(`Git 历史含真实提示词 JSON，示例提交：${promptDataCommits.join(', ')}`);
  if (skillDataCommits.length) errors.push(`Git 历史含真实 Skill 索引，示例提交：${skillDataCommits.join(', ')}`);
  if (skillSourceCommits.length) errors.push(`Git 历史含完整 Skill 源码路径，示例提交：${skillSourceCommits.join(', ')}`);
}

await scanPublishCandidates();
inspectGitHistory();
if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Public boundary OK: blank public data, no public Skill index, and no detected private data or credentials in reachable Git history.');
}

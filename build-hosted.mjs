import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const src = (path) => new URL(path, import.meta.url);
const read = (path) => readFile(src(path), 'utf8');
const contentTypes = {
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'app.mjs': 'text/javascript; charset=utf-8',
  'analysis.mjs': 'text/javascript; charset=utf-8',
};
const [sourceCode, workerCode, initial, ...pages] = await Promise.all([
  read('sources.mjs'), read('worker.mjs'), read('data/initial.json'),
  ...Object.keys(contentTypes).map((file) => read(`public/${file}`)),
]);
const browserAssets = Object.fromEntries(Object.entries(contentTypes).map(([file, mime], index) =>
  [file === 'index.html' ? '/' : `/${file}`, [pages[index], mime]]));
const assetModule = `const browserAssets = ${JSON.stringify(browserAssets)};\nconst seed = ${JSON.stringify(JSON.parse(initial))};`;
const worker = workerCode.replace(/^import .+;\n/gm, '');
const extra = await Promise.all(['public/analysis.mjs','coach.mjs'].map(read));
const logic = extra.join('\n').replace(/^import .+;\n/gm,'').replace(/^export /gm,'');
const sources = sourceCode.replace(/^export (?=(?:async )?function )/gm, '');
await mkdir(src('dist/server'), { recursive: true });
await writeFile(src('dist/server/index.js'), [assetModule, sources, logic, worker].join('\n\n'));
try {
  await mkdir(src('dist/.openai'), { recursive: true });
  await copyFile(src('.openai/hosting.json'), src('dist/.openai/hosting.json'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

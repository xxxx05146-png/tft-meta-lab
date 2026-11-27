import { evaluate } from './public/analysis.mjs';

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const zeroItems = Array(8).fill(0);

export function study(snapshot, args) {
  const ds = snapshot.datasets.find(d => d.id === (args.dataset || 'metatft-pbe'));
  if (!ds) throw Error('Nguồn đã chọn chưa có dữ liệu.');
  const units = [...new Map(ds.comps.flatMap(c => c.units).map(u => [u.id, u])).values()];
  const names = args.units ?? [];
  if (!Array.isArray(names) || names.length > 12 || names.some(s => typeof s !== 'string' || s.length > 100)) throw Error('Chọn tối đa 12 tướng.');
  const lookup = (query) => units.find(u => normalize(u.id) === normalize(query)) || units.find(u => normalize(u.name) === normalize(query));
  const unknown = names.filter(n => !lookup(n));
  const ids = new Set(names.map(n => lookup(n)?.id).filter(Boolean));
  const augment = String(args.augment ?? '').trim().slice(0,120);
  const target = Object.entries(ds.heroAugments ?? {}).find(([id, key]) => {
    const keyName = units.find(u => u.id === id)?.name;
    return [key, keyName && 'Lõi '+keyName, keyName && 'Lõi anh hùng '+keyName].filter(Boolean).some(s => normalize(s) === normalize(augment));
  });
  if (!ids.size && !target) throw Error('Chọn ít nhất một tướng có trong nguồn hoặc một lõi anh hùng đã xác minh.');
  const ranked = ds.comps.filter(c => c.count >= 200).map(c => {
    const matches = c.units.filter(u => ids.has(u.id));
    const hasAugment = Boolean(target && c.units.some(u => u.id === target[0]));
    const rating = evaluate(c, ds.baseline ?? 4.5, zeroItems);
    const fit = (matches.length + Number(hasAugment)) / (ids.size + Number(Boolean(target)));
    return { id:c.id, name:c.name, matches:matches.map(u => u.name), hasAugment, missing:c.units.filter(u => !ids.has(u.id)).map(u => u.name),
      carries:c.carries.map(u => u.name), style:c.style, top4:c.top4, place:c.place, playRate:c.playRate, count:c.count,
      score:Math.round(60*fit + 0.4*rating.score), builds:c.builds.slice(0,2).map(b => ({holder:c.units.find(u=>u.id===b.holder)?.name,items:b.items.map(i=>i.name),count:b.count})) };
  }).filter(c => c.matches.length || c.hasAugment).sort((a,b) => b.score-a.score || b.count-a.count).slice(0,3);
  return {dataset:ds.id, source:ds.source, sourceUrl:ds.sourceUrl, set:ds.set, channel:ds.channel, asOf:ds.asOf, patch:ds.patch, unknown,
    augmentNote:!augment ? '' : target ? 'Lõi anh hùng được đối chiếu theo tướng sở hữu. Số liệu dưới đây tính cho toàn đội hình.' : 'Nguồn chưa xác minh tương tác của lõi này. Kết quả chỉ tính theo tướng.',
    recommendations:ranked};
}

export function packBoard(positioning, members) {
  const options = Object.fromEntries(members.map(u => {
    const cells = (positioning?.units?.[u.id]?.positions ?? []).flatMap(p => {
      const cell = Number(/^cell_(\d+)$/.exec(p.cell)?.[1]);
      if (!Number.isInteger(cell) || cell < 1 || cell > 28 || !(p.count > 0)) return [];
      return [{row:4-Math.floor((cell-1)/7), col:(cell-1)%7+1, count:p.count}];
    }).sort((a,b)=>b.count-a.count);
    const total = cells.reduce((sum,p)=>sum+p.count,0);
    return [u.id,cells.map(p=>({...p,share:p.count/total}))];
  }));
  const taken = new Set(), placed = new Set(), board = [];
  const candidates = Object.entries(options).flatMap(([id, cells])=>cells.map(p=>({...p,id}))).sort((a,b)=>b.share-a.share);
  for (const p of candidates) {
    const key = p.row*10+p.col;
    if (placed.has(p.id) || taken.has(key)) continue;
    board.push(p); placed.add(p.id); taken.add(key);
  }
  return {board, options:Object.fromEntries(Object.entries(options).map(([id,cells])=>[id,cells.slice(0,3)]))};
}

export async function boardFor(snapshot, args) {
  const ds = snapshot.datasets.find(d=>d.id===args.dataset);
  const comp = ds?.comps.find(c=>c.id===args.comp);
  if (!comp) throw Error('Bài không có trong nguồn đã chọn.');
  if (!ds.clusterVersion || ds.source!=='MetaTFT') return {board:[],options:{},note:'Nguồn của bài này chưa cung cấp vị trí từng ô.'};
  const query = new URLSearchParams({comp:comp.id, cluster_id:ds.clusterVersion, queue:ds.channel==='pbe'?'PBE':'1100'});
  const res = await fetch('https://api-hc.metatft.com/tft-comps-api/comp_details?'+query,{signal:AbortSignal.timeout(15000)});
  if (!res.ok) throw Error('MetaTFT tạm thời chưa trả dữ liệu vị trí.');
  const raw = await res.json();
  if (String(raw.cluster_id)!==ds.clusterVersion || raw.tft_set!=='TFTSet'+ds.set || String(raw.results?.cluster)!==comp.id) throw Error('Nguồn đã đổi cụm đội hình. Hãy cập nhật dữ liệu.');
  return {...packBoard(raw.results.positioning,comp.units),source:'MetaTFT', updated:raw.updated};
}

const coachTools = [
  {name:'study_comps', description:'Compare up to three statistically supported TFT comps for a pre-game hypothetical or postgame review. Include sample size, set, source, and date. No live coaching. Unknown augments have no effect on score.',
    inputSchema:{type:'object',properties:{dataset:{type:'string',enum:['metatft-pbe','metatft-live','tactics-live']},units:{type:'array',items:{type:'string'},maxItems:12},augment:{type:'string',description:'Optional hero augment ID or Lõi + champion name'}}}},
  {name:'study_positioning',description:'Study a reference formation for a comp returned by study_comps. Rows 1 to 4 run from front to back. Cells represent individual position frequencies, not a jointly observed best board.',
    inputSchema:{type:'object',properties:{dataset:{type:'string'},comp:{type:'string'}},required:['dataset','comp']}}
];

export async function coachRequest(path, method, input, getSnapshot) {
  if (path === '/mcp') {
    const base = {jsonrpc:'2.0',id:input.id ?? null};
    if (input.method === 'server/discover') return {...base,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}};
    if (input.method === 'initialize') return {...base,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'tft-meta-lab',version:'1.0'}}};
    if (input.method === 'tools/list') return {...base,result:{tools:coachTools}};
    if (input.method !== 'tools/call') return {...base,error:{code:-32601,message:'Method not found'}};
    try {
      const tool = input.params?.name;
      if (!coachTools.some(t=>t.name===tool)) throw Error('Công cụ không tồn tại.');
      const snapshot = await getSnapshot();
      const args = input.params.arguments ?? {};
      const result = tool === 'study_comps' ? study(snapshot,args) : await boardFor(snapshot,args);
      return {...base,result:{content:[{type:'text',text:JSON.stringify(result)}]}};
    } catch(error) { return {...base,result:{isError:true,content:[{type:'text',text:error.message}]}}; }
  }
  const snapshot = await getSnapshot();
  return path === '/api/study' ? study(snapshot,input) : boardFor(snapshot,input);
}

import { components, itemRecipe, rank, summarizeTrials } from './analysis.mjs';

const $ = (id) => document.getElementById(id);
const formatDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const whole = new Intl.NumberFormat('vi-VN');
const decimals = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const value = (num) => Number.isFinite(num) ? decimals.format(num) : '—';
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 });
const percentage = (ratio) => Number.isFinite(ratio) ? percent.format(ratio) : '—';
const timestamp = (date) => !date ? 'chưa có' : /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? date.split('-').reverse().join('/') : formatDate.format(new Date(date));
const channelLabel = (channel) => channel === 'pbe' ? 'PBE' : 'Live';
const difficultyName = (difficulty) => difficulty == null ? 'Chưa chấm độ khó' : ['Dễ', 'Vừa', 'Khó'][difficulty - 1];

const storageKey = 'tft-meta-lab-trials-v1';
function readTrials() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(data) ? data.filter((trial) => trial && Number.isInteger(trial.place)) : [];
  } catch {
    return [];
  }
}

let snapshot = { datasets: [], status: {} };
let trials = readTrials();
let view = 'browse';
let message = '';
const inventory = components.map(() => 0);
const selected = () => snapshot.datasets.find(({ id }) => id === $('dataset').value);

function formatSource(dataset) {
  return `${dataset.source} · Set ${dataset.set} ${channelLabel(dataset.channel)}${dataset.patch ? ` · ${dataset.patch}` : ''}`;
}

function metrics(rows) {
  return `<dl class="metrics">${rows.map(([label, display]) => `<div><dt>${escape(label)}</dt><dd>${escape(display)}</dd></div>`).join('')}</dl>`;
}

function portrait(unit) {
  const fallback = 'https://cdn.metatft.com/file/metatft/champions/'+encodeURIComponent(unit.id.toLowerCase())+'.png';
  return `<img loading="lazy" src="${escape(unit.icon || fallback)}" data-fallback="${escape(fallback)}" alt="">`;
}
document.addEventListener('error', e => {
  const image = e.target;
  if (image.tagName !== 'IMG' || !image.dataset.fallback) return;
  if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
  else image.hidden = true;
}, true);

function lineup(comp) {
  const carryIds = new Set(comp.carries.map(({ id }) => id));
  return `<div class="lineup" aria-label="Đội hình">${comp.units.map((unit) =>
    `<div class="unit${carryIds.has(unit.id) ? ' carry' : ''}" title="${escape(unit.name)}${unit.cost ? ` · ${unit.cost} vàng` : ''}">
      ${portrait(unit)}<span>${escape(unit.name)}</span>
      </div>`).join('')}</div>`;
}

function card(comp) {
  return `<article class="card">
    <header><div><h3>${escape(comp.name)}</h3><div class="chips"><span class="chip">${escape(comp.style)}</span>
      <span class="chip${comp.difficulty === 1 ? ' good' : ''}">${difficultyName(comp.difficulty)}</span></div></div>
      <span class="score" title="Điểm tổng hợp trên 100">${Math.round(comp.score)}</span></header>
    ${metrics([['Hạng TB', value(comp.place)], ['Top 4', percentage(comp.top4)], ['Top 1', percentage(comp.win)], ['Bài/lobby', value(comp.playRate)]])}
    ${lineup(comp)}
    ${comp.matchingItems.length ? `<p class="caption">Ghép được ${escape([...new Set(comp.matchingItems.map(({ name }) => name))].slice(0, 3).join(', '))}</p>` : ''}
    <div class="card-bottom"><p class="caption">${whole.format(comp.count)} lượt khớp mẫu đội hình</p>
    <button type="button" data-comp="${escape(comp.id)}" class="action">Xem bài</button></div></article>`;
}

function showInventory() {
  $('components').innerHTML = components.map((name, index) =>
    `<button type="button" class="component" aria-pressed="${inventory[index] > 0}" data-index="${index}" aria-label="${escape(name)}, ${inventory[index]} mảnh. Bấm để đổi số lượng.">${escape(name)} ×${inventory[index]}</button>`).join('');
  const count = inventory.reduce((sum, number) => sum + number, 0);
  $('inventory-count').textContent = count ? `${count} mảnh` : '';
}

function showStatus() {
  const labels = { riot: 'Data Dragon', 'metatft-pbe': 'MetaTFT PBE', 'metatft-live': 'MetaTFT Live', 'tactics-live': 'tactics.tools' };
  const issues = Object.entries(snapshot.status).filter(([, entry]) => entry.state !== 'ok')
    .map(([id, entry]) => `${labels[id]} ${entry.state === 'cached' ? 'đang dùng bản lưu' : 'chưa có dữ liệu'} (${entry.reason})`);
  $('status').textContent = [message, ...issues].filter(Boolean).join(' · ');
  $('sync-info').textContent = snapshot.attemptedAt ? `Kiểm tra lúc ${timestamp(snapshot.attemptedAt)}` : '';
  $('dragon-status').textContent = snapshot.catalog
    ? `Data Dragon ${snapshot.catalog.version} · ${snapshot.catalog.locale}. Nếu tướng chưa có trong danh mục chính thức, thẻ dùng tên từ nguồn thống kê.`
    : 'Chưa có danh mục Riot Data Dragon.';
}

function showBrowse() {
  const dataset = selected();
  const pbe = dataset?.channel === 'pbe';
  $('set-label').textContent = dataset ? `Set ${dataset.set} · ${channelLabel(dataset.channel)}${dataset.patch ? ` · ${dataset.patch}` : ''}` : 'Teamfight Tactics';
  $('rate-control').hidden = !$('rare').checked;
  if (!dataset) {
    $('cohort').textContent = '';
    $('result-count').textContent = '';
    $('dataset-time').textContent = '';
    $('featured').hidden = true;
    $('cards').innerHTML = '<div class="empty">Chưa có bảng đội hình. Bấm Cập nhật dữ liệu để tải từ các nguồn.</div>';
    return;
  }
  const filters = {
    minCount: Math.max(1, Number($('min').value) || 1),
    rare: $('rare').checked, maxRate: Number($('max-rate').value) || 0.2, easy: $('easy').checked,
    sort: $('sort').value, search: $('search').value.trim().toLowerCase(),
  };
  const rows = rank(dataset, filters, inventory);
  $('result-count').textContent = `${rows.length}/${dataset.comps.length}`;
  $('cohort').textContent = `${dataset.cohort} · ${whole.format(dataset.total)} lượt người chơi trong mẫu`;
  $('dataset-time').textContent = `Nguồn ghi nhận ${timestamp(dataset.asOf)}`;
  $('cards').innerHTML = rows.length ? rows.map(card).join('') : '<div class="empty">Không có bài khớp bộ lọc hiện tại.</div>';
  $('featured').hidden = !rows.length;
  if (rows.length) {
    const [first] = rows;
    $('featured').innerHTML = `<p class="eyebrow">Ưu tiên theo bộ lọc</p><h3>${escape(first.name)}</h3><p>
       Top 4 ${percentage(first.top4)} · ${value(first.playRate)} bài/lobby · ${whole.format(first.count)} mẫu${pbe ? ' PBE' : ''}</p>`;
  }
}

function applySnapshot(data) {
  const previous = $('dataset').value;
  snapshot = data;
  $('dataset').replaceChildren(...snapshot.datasets.map((entry) => new Option(formatSource(entry), entry.id)));
  if (snapshot.datasets.some(({ id }) => id === previous)) $('dataset').value = previous;
  $('find-dataset').replaceChildren(...snapshot.datasets.map(d=>new Option(formatSource(d), d.id)));
  $('find-dataset').value = $('dataset').value;
  resetFinder();
  boardCache.clear();
  showStatus();
  showBrowse();
  route();
}

function strategy(comp) {
  const primary = comp.carries[0]?.name ?? 'chủ lực';
  const firstItem = comp.matchingItems.find(({ holder }) => holder === comp.carries[0]?.id);
  const effects = [];
  if (comp.style.startsWith('Reroll')) {
    effects.push(`Giữ kinh tế và ưu tiên shop cấp ${comp.level} để tìm bản sao ${primary}. Khi tập bài, ghi lại lần bạn lên được 3 sao và lần phải bỏ giữa chừng.`);
  } else if (comp.style.startsWith('Fast')) {
    effects.push(`Dùng bàn cờ mạnh và tướng cầm đồ hộ để giữ máu, sau đó dành vàng cho mốc cấp ${comp.level}. Thử đo số trận đủ máu và vàng để hoàn thành bài.`);
  } else {
    effects.push('Dùng bàn mạnh đầu trận. Khi tập bài, ghi lại cấp bạn bắt đầu ổn định bàn cờ rồi đối chiếu sau vài trận.');
  }
  if (comp.emblem) effects.push(`Bài có dấu hiệu phụ thuộc ${comp.emblem}. Chuẩn bị phương án bỏ bài nếu thiếu điều kiện.`);
  if (firstItem) effects.push(`Với mảnh đã chọn, có thể ghép ${firstItem.name} cho ${primary} hoặc dùng trên tướng cầm đồ hộ khi tập bài.`);
  else effects.push('Ưu tiên xác định tướng cầm đồ hộ và ít nhất một bộ đồ thay thế trước khi vào trận.');
  if (comp.playRate < 0.2) effects.push('Play rate trong mẫu thấp. Khi thử, theo dõi riêng số trận tranh chủ lực vì các bài khác vẫn có thể dùng cùng tướng.');
  return effects;
}

function findComparison(dataset, comp) {
  const baseUnits = new Set(comp.units.map(({ id }) => id));
  const carryIds = new Set(comp.carries.map(({ id }) => id));
  const views = snapshot.datasets.filter((other) => other.source !== dataset.source
    && other.channel === dataset.channel && other.set === dataset.set && dataset.patch && other.patch === dataset.patch);
  let best = null;
  for (const other of views) {
    for (const contender of other.comps) {
      if (!contender.carries.some(({ id }) => carryIds.has(id))) continue;
      const count = new Set(contender.units.map(({ id }) => id).filter((id) => baseUnits.has(id))).size;
      const overlap = count / (baseUnits.size + contender.units.length - count);
      if (overlap >= 0.55 && (!best || overlap > best.overlap)) best = { other, contender, overlap };
    }
  }
  return best;
}

function buildMarkup(comp) {
  if (!comp.items.length) return '<p class="caption">Nguồn chưa đủ mẫu để gợi ý đồ cho bài này.</p>';
  const showItem = (entry) => {
    const recipe = itemRecipe(entry.id);
    const tip = recipe?.map((index) => components[index]).join(' + ');
    return `<span class="chip" title="${escape(tip || 'Xem công thức trong game')}">${entry.icon ? `<img src="${escape(entry.icon)}" alt="">` : ''}${escape(entry.name)}</span>`;
  };
  const builds = comp.builds.length ? comp.builds : comp.carries.map((carry) => ({
    holder: carry.id, items: comp.items.filter(({ holder }) => holder === carry.id),
  })).filter((build) => build.items.length);
  return `<div class="builds">${builds.map((build) => `<div class="build">
    <div class="item-holder">${escape(comp.units.find(({ id }) => id === build.holder)?.name ?? build.holder)}
    ${build.count ? ` · ${whole.format(build.count)} lượt · hạng TB ${value(build.place)}` : ''}</div>
    <div class="item-list">${build.items.map(showItem).join('')}</div></div>`).join('')}</div>`;
}

function comparisonMarkup(dataset, comp) {
  const match = findComparison(dataset, comp);
  if (!match) return '';
  return `<section class="detail-section"><h3>Đối chiếu đội hình tương tự</h3>
    <p>${escape(match.other.source)} · ${escape(match.contender.name)} · hạng TB ${value(match.contender.place)}
    · top 4 ${percentage(match.contender.top4)} · ${whole.format(match.contender.count)} mẫu.</p>
    <p class="caption">${escape(match.other.cohort)}. Hai nguồn dùng nhóm mẫu riêng.</p></section>`;
}

function showDetail(id, dataset = selected()) {
  const comp = rank(dataset, { minCount: 1, sort: 'score' }, inventory).find((entry) => entry.id === id);
  if (!comp) return;
  const detail = $('detail-content');
  detail.innerHTML = `<p class="eyebrow">${escape(formatSource(dataset))}</p><h2 id="detail-title">${escape(comp.name)}</h2>
    <p class="caption">${escape(comp.style)} · ${difficultyName(comp.difficulty)} · ${whole.format(comp.count)} mẫu</p>
    <section class="detail-section"><h3>Bàn cờ mục tiêu</h3>${lineup(comp)}<div id="board-pane" aria-live="polite">Đang tải vị trí từng ô…</div></section>
    <section class="detail-section"><h3>Chỉ số sau hiệu chỉnh cỡ mẫu</h3>
      ${metrics([['Hạng TB', value(comp.placeAdjusted)], ['Top 4', percentage(comp.top4Adjusted)], ['Top 1', percentage(comp.winAdjusted)], ['Bài/lobby', value(comp.playRate)]])}</section>
    <section class="detail-section"><h3>Cách triển khai và kiểm chứng</h3><ul>${strategy(comp).map((line) => `<li>${escape(line)}</li>`).join('')}</ul></section>
    <section class="detail-section"><h3>Đồ đã xuất hiện trong mẫu</h3>
      ${buildMarkup(comp)}
      ${comp.matchingItems.length ? `<p class="caption">Các lựa chọn ghép riêng lẻ gồm ${escape([...new Set(comp.matchingItems.map(({ name }) => name))].join(', '))}. Một mảnh có thể xuất hiện trong nhiều lựa chọn.</p>` : ''}
      <p class="caption">${escape(dataset.note)}</p></section>
    ${comparisonMarkup(dataset, comp)}
    <section class="detail-section"><h3>Ghi kết quả trận thử</h3>
      <form class="trial-form">
        <label>Thứ hạng<select name="place">${Array.from({length: 8}, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
        <label><input type="checkbox" name="completed"> Hoàn thành bài</label>
        <label class="memo">Ghi chú<input name="note" maxlength="240" placeholder="Ví dụ thiếu Ấn hoặc đủ đồ nhưng tranh tướng"></label>
        <button type="submit" class="action">Lưu kết quả</button>
      </form>
      <p class="caption" id="trial-message" role="status"></p>
    </section>
    <a href="${escape(dataset.sourceUrl)}">Xem tại ${escape(dataset.source)}</a>`;
  detail.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = new FormData(event.target);
    const entry = {
      key: [dataset.id, dataset.set, dataset.patch || dataset.channel, comp.id].join('|'),
      comp: comp.name, sample: formatSource(dataset), place: Number(fields.get('place')),
      completed: fields.has('completed'), note: String(fields.get('note')).trim(), date: new Date().toISOString(),
    };
    try {
      const next = [entry, ...trials];
      localStorage.setItem(storageKey, JSON.stringify(next));
      trials = next;
      event.target.reset();
      $('trial-message').textContent = 'Đã lưu kết quả.';
      showTrials();
    } catch {
      $('trial-message').textContent = 'Trình duyệt không lưu được kết quả.';
    }
  });
  $('detail').showModal();
  drawBoard(dataset, comp, $('board-pane'));
}

function showTrials() {
  $('trial-count').textContent = trials.length || '';
  const groups = Map.groupBy(trials, ({ key }) => key);
  $('trial-groups').innerHTML = groups.size ? [...groups.values()].map((entries) => {
    const summary = summarizeTrials(entries);
    return `<article class="card"><header><div><h3>${escape(entries[0].comp)}</h3><p class="caption">${escape(entries[0].sample)}</p></div></header>
      ${metrics([['Trận', whole.format(summary.count)], ['Hạng TB', value(summary.place)], ['Top 4', percentage(summary.top4)], ['Dựng bài', percentage(summary.completion)]])}
      ${entries.map((entry) => `<p class="trial-entry">${escape(timestamp(entry.date))} · Hạng ${entry.place}
        · ${entry.completed ? 'Hoàn thành' : 'Dở bài'}${entry.note ? ` · ${escape(entry.note)}` : ''}</p>`).join('')}</article>`;
  }).join('') : '<div class="empty">Mở một đội hình để ghi trận thử đầu tiên.</div>';
}

for (const element of ['dataset', 'search', 'sort', 'min', 'rare', 'max-rate', 'easy']) {
  $(element).addEventListener('input', showBrowse);
}
$('components').addEventListener('click', ({ target }) => {
  const button = target.closest('[data-index]');
  if (!button) return;
  const index = Number(button.dataset.index);
  inventory[index] = (inventory[index] + 1) % 4;
  showInventory();
  $('components').querySelector(`[data-index="${index}"]`).focus();
  showBrowse();
});
$('clear-inventory').addEventListener('click', () => {
  inventory.fill(0);
  showInventory();
  showBrowse();
});
$('cards').addEventListener('click', ({ target }) => {
  const button = target.closest('[data-comp]');
  if (button) showDetail(button.dataset.comp);
});
document.querySelector('.toolbar').addEventListener('click', ({ target }) => {
  const button = target.closest('[data-view]');
  if (!button) return;
  view = button.dataset.view;
  for (const control of document.querySelectorAll('[data-view]')) {
    control.setAttribute('aria-pressed', String(control.dataset.view === view));
  }
  $('browse').hidden = view !== 'browse';
  $('trials').hidden = view !== 'trials';
});

async function load(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  message = '';
  applySnapshot(data);
}

$('sync').addEventListener('click', async () => {
  const button = $('sync');
  button.disabled = true;
  button.textContent = 'Đang cập nhật…';
  try {
    await load('./api/sync', { method: 'POST' });
  } catch (error) {
    message = error.message;
    showStatus();
  } finally {
    button.disabled = false;
    button.textContent = '↻ Cập nhật dữ liệu';
  }
});

const picks = new Set();
let queryGeneration = 0;
let chatBrief = '';
function unitLabel(u) {
  if (u.id === 'DA_AkaliKDA19') return 'Akali (K/DA)';
  if (u.id === 'DA_Akali_TrueDamage19') return 'Akali (True Damage)';
  return u.name;
}
const boardCache = new Map();
const finderSource = () => snapshot.datasets.find(d=>d.id === $('find-dataset').value);
const pool = () => [...new Map((finderSource()?.comps || []).flatMap(c=>c.units).map(u=>[u.id,u])).values()].sort((a,b)=>a.name.localeCompare(b.name));
function route() {
  const mode = location.hash.slice(1);
  const home = !['find','learn'].includes(mode);
  document.body.classList.toggle('at-home',home);
  $('home').hidden = !home;
  $('studio').hidden = home;
  $('finder').hidden = mode !== 'find';
  document.querySelector('.toolbar').hidden = mode !== 'learn';
  $('browse').hidden = mode !== 'learn' || view !== 'browse';
  $('trials').hidden = mode !== 'learn' || view !== 'trials';
  $('featured').hidden = mode !== 'learn' || !$('featured').textContent;
  $('mode-title').textContent = mode === 'find' ? 'Tìm bài phù hợp' : 'Học xếp cờ';
  $('mode-copy').textContent = mode === 'find' ? 'Dựng tình huống trước trận hoặc xem lại ván đã chơi. Chọn tướng để so độ khớp và hiệu quả của từng bài.' : 'Chọn một bài để xem bàn cờ mẫu và tìm hiểu vị trí từng tướng.';
  $('set-label').textContent = (mode === 'find' ? finderSource() : selected()) ? formatSource(mode === 'find' ? finderSource() : selected()) : 'TFT Meta Lab';
}
document.querySelector('.tickets').addEventListener('click',e=>{
  const btn=e.target.closest('[data-route]');
  if (btn) location.hash=btn.dataset.route;
});
window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0);});
function invalidateMatches() {
  queryGeneration++;
  chatBrief = '';
  $('chat-note').textContent='';
  $('manual-brief').hidden=true;
  $('chat-tools').hidden = true;
  $('matches').replaceChildren();
  $('find-status').textContent='';
}
function showPicks() {
  $('picked').innerHTML = pool().filter(u=>picks.has(u.id)).map(u=>`<button type="button" class="component" data-remove="${escape(u.id)}" aria-label="Bỏ ${escape(u.name)}">${escape(unitLabel(u))} ×</button>`).join('');
}
function resetFinder() {
  picks.clear();
  $('find-unit').value = $('augment').value = '';
  invalidateMatches();
  const units=pool();
  $('unit-list').replaceChildren(...units.map(u=>new Option(unitLabel(u),unitLabel(u))));
  $('augment-list').replaceChildren(...units.filter(u=>finderSource()?.heroAugments?.[u.id]).map(u=>new Option('Lõi '+u.name)));
  showPicks();
}
$('find-dataset').addEventListener('change',()=>{resetFinder();route();});
function addPick() {
  const val = $('find-unit').value.trim().toLocaleLowerCase();
  const unit = pool().find(u=>unitLabel(u).toLocaleLowerCase()===val || u.id.toLowerCase()===val);
  if (!unit || (picks.size>=12 && !picks.has(unit.id))) {
    $('find-status').textContent='Chọn tên từ danh sách, tối đa 12 tướng.';
    return false;
  }
  picks.add(unit.id); $('find-unit').value=''; invalidateMatches(); showPicks();
  return true;
}
$('add-unit').addEventListener('click',addPick);
$('find-unit').addEventListener('input',invalidateMatches);
$('augment').addEventListener('input',invalidateMatches);
$('picked').addEventListener('click',e=>{
  const button=e.target.closest('[data-remove]');
  if (button) {picks.delete(button.dataset.remove);invalidateMatches();showPicks();}
});
async function post(path, data) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if (!response.ok) throw Error(result.error || 'Không đọc được phản hồi.');
  return result;
}
$('find-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if ($('find-unit').value.trim() && !addPick()) return;
  invalidateMatches();
  const generation=queryGeneration;
  const ds=finderSource();
  if (!ds) { $('find-status').textContent='Chưa tải xong bộ dữ liệu.'; return; }
  $('find-status').textContent='Đang so khớp đội hình…';
  try {
    const result=await post('/api/study',{dataset:ds.id,units:[...picks],augment:$('augment').value});
    if (queryGeneration!==generation) return;
    $('find-status').textContent=[result.augmentNote,result.recommendations.length ? formatSource(ds)+' · '+timestamp(ds.asOf) : 'Chưa có bài khớp trong các đội hình đủ 200 mẫu.'].filter(Boolean).join(' ');
    chatBrief = ['Tôi đang tập bài trước trận. Hãy so sánh các hướng này theo độ khớp, hạng TB, top 4 và cỡ mẫu. Giải thích cách xếp chủ lực và tuyến trước. Dùng công cụ TFT Meta Lab nếu có để lấy sơ đồ. Ghi rõ phần nào là suy luận.',
      'Tướng: '+[...picks].map(id=>unitLabel(pool().find(u=>u.id===id))).join(', '), 'Lõi giả định: '+($('augment').value||'chưa chọn'),JSON.stringify(result)].join('\n');
    $('chat-tools').hidden = !result.recommendations.length;
    $('matches').innerHTML=result.recommendations.map(r=>{
      const c=ds.comps.find(c=>c.id===r.id);
      return `<article class="card"><h3>${escape(c.name)}</h3><p>${r.matches.length ? 'Khớp '+escape(r.matches.join(', '))+'. ' : ''}${r.hasAugment?'Có tướng sở hữu lõi. ':''}${escape(r.style)}.</p>
        ${metrics([['Top 4',percentage(r.top4)],['Hạng TB',value(r.place)],['Bài/lobby',value(r.playRate)],['Cỡ mẫu',whole.format(r.count)]])}
        ${lineup(c)}<p class="caption">Cần bổ sung · ${escape(r.missing.join(', ') || 'Đã đủ tướng')}</p>
        <button type="button" class="action" data-study="${escape(c.id)}">Xem cách xếp cờ</button></article>`;
    }).join('');
  } catch(error) {if (generation===queryGeneration) $('find-status').textContent=error.message;}
});
$('copy-chat').addEventListener('click',async ()=>{
  try {await navigator.clipboard.writeText(chatBrief);$('chat-note').textContent='Đã chép câu hỏi và số liệu. Mở ChatGPT rồi dán để phân tích.';}
  catch {const box=$('manual-brief');box.value=chatBrief;box.hidden=false;box.select();}
});
$('matches').addEventListener('click',e=>{
  const button=e.target.closest('[data-study]');
  if (button) showDetail(button.dataset.study,finderSource());
});
async function drawBoard(ds,comp,pane) {
  const key=[ds.id,ds.asOf,comp.id].join('/');
  try {
    if (!boardCache.has(key)) boardCache.set(key,post('/api/board',{dataset:ds.id,comp:comp.id}));
    const result=await boardCache.get(key);
    if (!pane.isConnected) return;
    if (!result.board.length) {pane.textContent=result.note || 'Chưa có mẫu vị trí từng ô cho bài này.';return;}
    const members=new Map(comp.units.map(u=>[u.id,u]));
    const positions=new Map(result.board.map(p=>[p.row*10+p.col,p.id]));
    const rows=Array.from({length:4},(_,r)=>`<div class="board-row">${Array.from({length:7},(_,c)=>{
      const u=members.get(positions.get((r+1)*10+c+1));
      return u ? `<button class="hex" data-member="${escape(u.id)}" type="button" aria-label="${escape(u.name)}, hàng ${r+1}, cột ${c+1}">${portrait(u)}<span>${escape(u.name)}</span></button>` : '<div class="hex"></div>';
    }).join('')}</div>`).join('');
    pane.innerHTML=`<p class="board-axis">Phía đối thủ · hàng 1</p><div class="board-rows">${rows}</div><p class="board-axis">Phía bạn · hàng 4</p>
    <p class="board-info" role="status">Bấm vào tướng để xem ba ô thường đứng nhất.</p>
    <p class="caption">Sơ đồ tổng hợp từ tần suất từng tướng ở MetaTFT. Khi hai tướng trùng ô, ưu tiên tướng có tỷ lệ đứng ô đó cao hơn.</p>`;
    pane.addEventListener('click',e=>{
      const id=e.target.closest('[data-member]')?.dataset.member;
      if (!id) return;
      const front=result.options[id][0].row<=2;
      const role=front?'Trong mẫu, tướng này thường đứng ở hai hàng trước, nơi giao tranh bắt đầu.':'Trong mẫu, tướng này thường đứng ở hai hàng sau, có khoảng cách với tuyến đầu đối phương.';
      pane.querySelector('.board-info').textContent=role+' '+members.get(id).name+' · '+result.options[id].map(p=>'Hàng '+p.row+', cột '+p.col+' ('+percentage(p.share)+')').join(' · ');
    });
  } catch(error) {boardCache.delete(key);pane.textContent='Chưa tải được bàn cờ. '+error.message;}
}


route();
showInventory();
showTrials();
showBrowse();
load('./api/snapshot').catch(() => {
  message = 'Không đọc được dữ liệu của máy chủ.';
  showStatus();
});

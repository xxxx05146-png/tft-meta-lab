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

function lineup(comp) {
  const carryIds = new Set(comp.carries.map(({ id }) => id));
  return `<div class="lineup" aria-label="Đội hình">${comp.units.map((unit) =>
    `<div class="unit${carryIds.has(unit.id) ? ' carry' : ''}" title="${escape(unit.name)}${unit.cost ? ` · ${unit.cost} vàng` : ''}">
      ${unit.icon ? `<img src="${escape(unit.icon)}" alt="" loading="lazy">` : ''}<span>${escape(unit.name)}</span>
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
  showStatus();
  showBrowse();
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

function showDetail(id) {
  const dataset = selected();
  const comp = rank(dataset, { minCount: 1, sort: 'score' }, inventory).find((entry) => entry.id === id);
  if (!comp) return;
  const detail = $('detail-content');
  detail.innerHTML = `<p class="eyebrow">${escape(formatSource(dataset))}</p><h2 id="detail-title">${escape(comp.name)}</h2>
    <p class="caption">${escape(comp.style)} · ${difficultyName(comp.difficulty)} · ${whole.format(comp.count)} mẫu</p>
    <section class="detail-section"><h3>Bàn cờ mục tiêu</h3>${lineup(comp)}</section>
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

showInventory();
showTrials();
showBrowse();
load('./api/snapshot').catch(() => {
  message = 'Không đọc được dữ liệu của máy chủ.';
  showStatus();
});

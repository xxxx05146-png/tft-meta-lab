const META = 'https://api-hc.metatft.com/tft-comps-api';
const TACTICS = 'https://tactics.tools/team-compositions/latest';
const DRAGON = 'https://ddragon.leagueoflegends.com';
const assets = ['tft-champion', 'tft-item', 'tft-trait'];
const numberOfSet = (value) => Number(String(value).match(/TFTSet(\d+)$/i)?.[1]);
const asDate = (value) => Number.isFinite(value) ? new Date(value).toISOString() : null;

async function request(url, format = 'json') {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'TFT-Meta-Lab/0.1 (personal TFT statistics dashboard)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} · ${new URL(url).hostname}`);
  return format === 'text' ? response.text() : response.json();
}

const readable = (id) => id?.replace(/^(DA_|TFT\d*_Item_|TFT\d*_)/, '')
  .replace(/\d+/g, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

function titleText(source) {
  return source.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&#(?:x27|39);|&apos;/gi, "'").replace(/&quot;/g, '"').trim();
}

export function parseCatalog(documents, version, locale) {
  const lang = locale === 'vi_VN' ? 'vi' : 'en';
  const asMap = (document) => Object.fromEntries(Object.entries(document.data ?? {})
    .filter(([, value]) => value && typeof value.name === 'string')
    .map(([key, value]) => {
      const id = value.id || key;
      const image = value.image?.icon || value.image?.full;
      const group = value.image?.group;
      const icon = image && group && /^[\w.-]+$/.test(image) && /^[\w-]+$/.test(group)
        ? `${DRAGON}/cdn/${version}/img/${group}/${image}` : null;
      return [id, {
        name: value.name, icon, cost: Number(value.cost ?? value.tier) || null, lang,
      }];
    }));
  const [units, items, traits] = documents.map(asMap);
  if (!Object.keys(units).length || !Object.keys(items).length) {
    throw new Error('Data Dragon trả về danh mục trống.');
  }
  return { version, locale, units, items, traits };
}

async function fetchCatalog() {
  const version = process.env.TFT_DDRAGON_VERSION || (await request(`${DRAGON}/api/versions.json`))[0];
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Phiên bản Data Dragon không hợp lệ.');
  for (const locale of ['vi_VN', 'en_US']) {
    try {
      const docs = await Promise.all(assets.map((asset) => request(`${DRAGON}/cdn/${version}/data/${locale}/${asset}.json`)));
      return parseCatalog(docs, version, locale);
    } catch (error) {
      if (locale === 'en_US') throw error;
    }
  }
}

function unit(id, lookups, catalog) {
  const official = catalog?.units[id];
  const reference = lookups.unit_lookup?.[id];
  return {
    id, name: official?.name || reference?.name || readable(id), icon: official?.icon || null,
    cost: official?.cost ?? (Number(reference?.unit_cost) || null),
  };
}

function item(id, holder, catalog, count = null, place = null) {
  return { id, holder, name: catalog?.items[id]?.name || readable(id), icon: catalog?.items[id]?.icon ?? null, count, place };
}

function approach(text, carries, emblem) {
  const reroll = /lvl ([5-7])|level ([5-7]) reroll/i.exec(text);
  const level = Number(reroll?.[1] || reroll?.[2]);
  const fast9 = /fast(?: level)? 9/i.test(text);
  const fast8 = /fast(?: level)? 8/i.test(text);
  if (!level && !fast9 && !fast8) {
    return { style: 'Lên cấp linh hoạt', difficulty: emblem ? 3 : null, level: null, emblem };
  }
  const heavy = carries.filter(({ cost }) => cost >= 4).length > 1;
  const difficulty = fast9 || emblem ? 3 : (level === 7 || heavy ? 2 : 1);
  const style = level ? `Reroll cấp ${level}` : `Fast ${fast9 ? 9 : 8}`;
  return { style, difficulty, level: level || (fast9 ? 9 : 8), emblem };
}

export function parseMeta(stats, board, lookup, channel, catalog, livePatch) {
  if (String(stats.cluster_id) !== String(board.cluster_id) || stats.tft_set !== board.tft_set) {
    throw new Error('MetaTFT đang đổi nhóm đội hình. Thử lại ở lần cập nhật sau.');
  }
  const set = numberOfSet(stats.tft_set);
  const boardData = board.results?.data?.cluster_details;
  const details = lookup?.cluster_info?.cluster_details ?? {};
  const total = stats.results?.find(({ cluster }) => cluster === '')?.places[0];
  if (!set || !boardData || !total) throw new Error('Cấu trúc thống kê MetaTFT đã thay đổi.');
  const comps = stats.results.flatMap(({ cluster, places }) => {
    const row = boardData[cluster];
    if (!row || !Array.isArray(places) || places.length < 8 || !places.slice(0, 8).every((n) => Number.isInteger(n) && n >= 0)) return [];
    const distribution = places.slice(0, 8);
    const count = distribution.reduce((sum, n) => sum + n, 0);
    if (!count || count > total) return [];
    const units = [...new Set(row.units_string?.split(',').map((id) => id.trim()).filter(Boolean) || [])]
      .map((id) => unit(id, details, catalog));
    if (!units.length) return [];
    const namedCarries = row.name?.filter((part) => part.type === 'unit').map((part) => part.name) || [];
    const buildHolders = (row.builds ?? []).map((build) => build.unit);
    const carries = [...new Set([...namedCarries, ...buildHolders])].filter((id) => units.some((member) => member.id === id))
      .slice(0, 2).map((id) => unit(id, details, catalog));
    const name = (row.name ?? []).map(({ name: id }) =>
      catalog?.traits[id]?.name || details.trait_lookup?.[id]?.name || unit(id, details, catalog).name).filter(Boolean).join(' · ')
      || carries.map(({ name: label }) => label).join(' & ') || `Bài ${cluster}`;
    const builds = carries.flatMap(({ id }) => (row.builds ?? []).filter((build) =>
      build.unit === id && Array.isArray(build.buildName) && build.buildName.length > 0 && build.count >= 30,
    ).sort((a, b) => b.count - a.count).slice(0, 2).map((build) => ({
      holder: id, count: build.count, place: build.avg, items: build.buildName.map((key) => item(key, id, catalog)),
    })));
    const items = [...new Map(builds.flatMap((build) => build.items).map((entry) => [`${entry.holder}:${entry.id}`, entry])).values()];
    const emblem = row.top_itemNames?.find(({ itemNames, pcnt }) =>
      /emblem/i.test(itemNames) && pcnt >= 0.8)?.itemNames ?? null;
    return [{
      id: String(cluster), name, units, carries, items, builds, count,
      place: distribution.reduce((sum, n, index) => sum + (index + 1) * n, 0) / count,
      top4: distribution.slice(0, 4).reduce((sum, n) => sum + n, 0) / count,
      win: distribution[0] / count, playRate: 8 * count / total, distribution,
      ...approach(row.levelling || '', carries, emblem && item(emblem, null, catalog).name),
    }];
  });
  if (!comps.length) throw new Error('MetaTFT không trả về đội hình có số liệu hợp lệ.');
  return {
    id: `metatft-${channel}`, source: 'MetaTFT', channel, set,
    patch: channel === 'live' && livePatch?.startsWith(`${set}.`) ? livePatch : null,
    cohort: channel === 'pbe' ? 'Máy chủ thử nghiệm · cửa sổ của MetaTFT' : 'Ranked · bộ lọc mặc định của MetaTFT',
    asOf: asDate(stats.updated), fetchedAt: new Date().toISOString(), baseline: 4.5, total, comps,
    sourceUrl: channel === 'pbe' ? 'https://www.metatft.com/pbe-comps' : 'https://www.metatft.com/comps',
    note: 'Chỉ số đội hình và bộ đồ có thể dùng hai cửa sổ mẫu khác nhau. Cỡ mẫu bộ đồ được hiển thị riêng.',
  };
}

async function fetchMeta(channel, catalogPromise, livePatchPromise) {
  const queue = channel === 'pbe' ? 'PBE' : '1100';
  const results = await Promise.all([
    request(`${META}/comps_stats?queue=${queue}`),
    request(`${META}/comps_data?queue=${queue}`),
    request(`${META}/latest_cluster_info?queue=${queue}`).catch(() => null),
    catalogPromise, livePatchPromise,
  ]);
  const [stats, board, lookup, catalog, patch] = results;
  return parseMeta(stats, board, lookup, channel, catalog, patch);
}

export function parseTactics(html, catalog) {
  const payload = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const page = payload && JSON.parse(payload)?.props?.pageProps;
  const data = page?.initialData;
  const titlePattern = /class="text-lg pl-1 font-montserrat font-semibold">([^<]+)<\/div>/g;
  const headings = [...html.matchAll(titlePattern)];
  const patch = html.match(/\/info\/patch-notes\/(\d+\.\d+[a-z]?)/i)?.[1] ?? null;
  const set = numberOfSet(data?.groups?.[0]?.full?.code?.match(/TFTSet\d+$/i)?.[0]);
  if (!set || !data?.count || !headings.length || data.groups.length !== headings.length) {
    throw new Error('Bảng đội hình tactics.tools đã đổi cấu trúc.');
  }
  const filters = [...html.matchAll(/aria-haspopup="listbox"[^>]*>([^<]+)<\/div>/g)].map((match) => titleText(match[1]));
  const cohort = filters.filter((label) => /Ranked|Days|\+$/.test(label)).slice(0, 3).join(' · ')
    || 'Bộ lọc trang công khai';
  const comps = data.groups.flatMap(({ full }, index) => {
    if (full.count <= 0 || !full.comps?.[0]?.units?.length) return [];
    const units = [...new Set(full.comps[0].units)].map((id) => unit(id, {}, catalog));
    const carries = (full.carryUnits ?? []).filter(([id]) => units.some((member) => member.id === id))
      .slice(0, 2).map(([id]) => unit(id, {}, catalog));
    const items = carries.flatMap(({ id }) => (full.unitItems ?? []).filter((entry) => entry.unitId === id && entry.count >= 30)
      .sort((a, b) => b.count - a.count).slice(0, 4)
      .map((entry) => item(entry.itemId, id, catalog, entry.count, entry.place)));
    const end = headings[index + 1]?.index ?? html.indexOf('__NEXT_DATA__');
    const headingBlock = html.slice(headings[index].index, end);
    const style = headingBlock.match(/Level [5-7] Reroll|Fast Level [89]/i)?.[0] || '';
    const emblem = full.countNoSpat === 0 ? 'Kiểm tra biến thể có Ấn ở nguồn' : null;
    return [{
      id: full.code, name: titleText(headings[index][1]), units, carries, items, builds: [],
      count: full.count, place: full.place, top4: full.top4 / full.count, win: full.win / full.count,
      playRate: 8 * full.count / data.count, distribution: full.placementDistribution,
      ...approach(style, carries, emblem),
    }];
  });
  if (!comps.length) throw new Error('tactics.tools không có đội hình hợp lệ.');
  const days = data.groups.flatMap(({ full }) => (full.dateStats ?? []).map(([date]) => date)).sort();
  return {
    id: 'tactics-live', source: 'tactics.tools', channel: 'live', set,
    patch: patch?.startsWith(`${set}.`) ? patch : null, cohort,
    asOf: days.at(-1) ?? null, fetchedAt: new Date().toISOString(), baseline: data.place,
    total: data.count, comps, sourceUrl: TACTICS,
    note: 'Ảnh chụp phần bảng công khai máy chủ trả về. Khoảng thời gian gần đây có thể đi qua một hotfix.',
  };
}

async function fetchLivePatch() {
  const html = await request('https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/', 'text');
  return html.match(/\/news\/game-updates\/teamfight-tactics-patch-(\d+)-(\d+)([a-z]?)(?=[/"\\])/i)?.slice(1).map((part, i) => i === 1 ? `.${part}` : part).join('') ?? null;
}

export async function collect(previous = {}) {
  const status = {};
  const catalogPromise = fetchCatalog().then((catalog) => {
    status.riot = { state: 'ok' };
    return catalog;
  }).catch((error) => {
    const catalog = previous.catalog ?? null;
    status.riot = { state: catalog ? 'cached' : 'unavailable', reason: error.message };
    return catalog;
  });
  const patchPromise = fetchLivePatch().catch(() => null);
  const jobs = {
    'metatft-pbe': fetchMeta('pbe', catalogPromise, Promise.resolve(null)),
    'metatft-live': fetchMeta('live', catalogPromise, patchPromise),
    'tactics-live': Promise.all([request(TACTICS, 'text'), catalogPromise]).then(([html, catalog]) => parseTactics(html, catalog)),
  };
  const datasets = [];
  await Promise.all(Object.entries(jobs).map(async ([key, job]) => {
    try {
      datasets.push(await job);
      status[key] = { state: 'ok' };
    } catch (error) {
      const last = previous.datasets?.find(({ id }) => id === key);
      if (last) datasets.push(last);
      status[key] = { state: last ? 'cached' : 'unavailable', reason: error.message };
    }
  }));
  datasets.sort((a, b) => Object.keys(jobs).indexOf(a.id) - Object.keys(jobs).indexOf(b.id));
  return { version: 1, attemptedAt: new Date().toISOString(), catalog: await catalogPromise, datasets, status };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { craftableItems, rank, summarizeTrials } from '../public/analysis.mjs';
import { parseCatalog, parseMeta, parseTactics } from '../sources.mjs';

test('giảm tác động của mẫu nhỏ và lọc theo sức mạnh, độ hiếm, cỡ mẫu', () => {
  const comp = { units: [], items: [], difficulty: 1, count: 200, place: 4.1, top4: 0.55, win: 0.12, playRate: 0.1 };
  const comps = [
    { ...comp, name: 'Mẫu chắc' },
    { ...comp, name: 'Mẫu nhỏ', count: 2, place: 1, top4: 1 },
    { ...comp, name: 'Bài phổ biến', playRate: 0.8, place: 4.2 },
    { ...comp, name: 'Hiếm nhưng yếu', place: 4.8 },
  ];
  const dataset = { baseline: 4.5, comps };
  const filters = { minCount: 1, sort: 'place' };
  assert.equal(rank(dataset, filters, [])[0].name, 'Mẫu chắc');
  assert.deepEqual(rank(dataset, { ...filters, minCount: 100, rare: true, maxRate: 0.2 }, []).map(({ name }) => name), ['Mẫu chắc']);
});

test('ghép đúng số mảnh và giữ cả trận bỏ bài khi tính nhật ký', () => {
  const items = [{ id: 'DA_BlueBuff' }, { id: 'DA_VoidStaff' }];
  assert.deepEqual(craftableItems(items, [0, 1, 0, 1]), [items[1]]);
  assert.deepEqual(craftableItems(items, [0, 0, 0, 2]), [items[0]]);
  assert.deepEqual(summarizeTrials([{ place: 2, completed: true }, { place: 8, completed: false }]), {
    count: 2, place: 5, top4: 0.5, completion: 0.5,
  });
});

test('Data Dragon ưu tiên icon vuông và bỏ qua đường dẫn rỗng', () => {
  const docs = [{ data: { Ahri: { id: 'DA_19_Ahri', name: 'Ahri', tier: 4, image: {
    full: 'AhriSplash.png', icon: 'Ahri.png', group: 'tft-champion',
  } } } }, { data: { item: { name: 'Đồ', image: { full: '', group: 'tft-item' } } } }, { data: {} }];
  const result = parseCatalog(docs, '19.1.0', 'vi_VN');
  assert.equal(result.units.DA_19_Ahri.cost, 4);
  assert.match(result.units.DA_19_Ahri.icon, /19\.1\.0\/img\/tft-champion\/Ahri.png$/);
  assert.equal(result.items.item.icon, null);
});

test('phân phối MetaTFT loại bỏ ô tổng và tách PBE khỏi live', () => {
  const stats = { cluster_id: 10, tft_set: 'TFTSet19', results: [
    { cluster: '', places: [800] },
    { cluster: '1000', places: [6, 3, 2, 3, 1, 2, 2, 1, 20] },
  ] };
  const board = { cluster_id: 10, tft_set: 'TFTSet19', results: { data: { cluster_details: {
    1000: { units_string: 'DA_19_Ahri', name: [{ name: 'DA_19_Ahri', type: 'unit' }], levelling: 'Fast 8' },
  } } } };
  const pbe = parseMeta(stats, board, null, 'pbe', null, '19.1');
  assert.equal(pbe.patch, null);
  assert.equal(pbe.comps[0].count, 20);
  assert.equal(pbe.comps[0].top4, 0.7);
  assert.equal(pbe.comps[0].playRate, 0.2);
  assert.throws(() => parseMeta(stats, { ...board, cluster_id: 11 }, null, 'pbe', null, '19.1'));
});

test('tactics.tools chỉ nhận hàng và tên từ cùng bảng công khai', () => {
  const data = {
    props: { pageProps: { initialData: { count: 800, place: 4.5, groups: [{ full: {
      code: 'boardTFTSet19', comps: [{ units: ['DA_19_Ahri'] }], count: 20, place: 4.1,
      top4: 12, win: 4, carryUnits: [['DA_19_Ahri', 3]], dateStats: [['2026-11-27']],
    } }] } } },
  };
  const html = '<a href="/info/patch-notes/19.1">Patch</a><div aria-haspopup="listbox">Diamond+</div>'
    + '<div class="text-lg pl-1 font-montserrat font-semibold">K/DA &amp; Ahri</div><div>Fast Level 8</div>'
    + '<script id="__NEXT_DATA__">' + JSON.stringify(data) + '</script>';
  const result = parseTactics(html, null);
  assert.equal(result.cohort, 'Diamond+');
  assert.equal(result.comps[0].name, 'K/DA & Ahri');
  assert.equal(result.comps[0].style, 'Fast 8');
  assert.equal(result.comps[0].playRate, 0.2);
  assert.throws(() => parseTactics(html.replace('font-semibold', 'changed'), null));
});

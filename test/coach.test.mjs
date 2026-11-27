import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { study, packBoard, coachRequest } from '../coach.mjs';

const snapshot = JSON.parse(await readFile(new URL('../data/initial.json',import.meta.url)));
test('nguồn PBE, lõi được xác minh, tên lạ và giới hạn cỡ mẫu',()=>{
  const base={units:['Renekton','SaiTên'],dataset:'metatft-pbe'};
  const result=study(snapshot,{...base,augment:'Lõi Renekton'});
  assert.equal(result.recommendations.length,3);
  assert(result.recommendations.every(c=>c.count>=200 && c.matches.includes('Renekton') && c.hasAugment));
  assert.deepEqual(result.unknown,['SaiTên']);
  assert.match(study(snapshot,{...base,augment:'Chưa xác minh'}).augmentNote,/chỉ tính theo tướng/);
});
test('ô 1 nằm hàng sau, hai tướng có vị trí riêng',()=>{
  const raw={units:{a:{positions:[{cell:'cell_1',count:90},{cell:'cell_2',count:10}]},
    b:{positions:[{cell:'cell_1',count:51},{cell:'cell_28',count:49}]}}};
  const {board,options}=packBoard(raw,[{id:'a'},{id:'b'}]);
  assert.deepEqual(board.map(x=>[x.id,x.row,x.col]),[['a',4,1],['b',1,7]]);
  assert.equal(options.b[0].share,0.51);
});
test('ChatGPT và web dùng chung bộ xếp hạng',async()=>{
  const args={dataset:'metatft-pbe',units:['Sett']};
  const mcp=await coachRequest('/mcp','POST',{method:'tools/call',params:{name:'study_comps',arguments:args}},async()=>snapshot);
  assert.deepEqual(JSON.parse(mcp.result.content[0].text),study(snapshot,args));
});

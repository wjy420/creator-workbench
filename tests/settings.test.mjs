import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeSettings} from '../src/settings.mjs';
test('空白密钥不覆盖已保存的值，其他设置可正常更新',()=>{
 const old={deepseekKey:'test-a',imageKey:'test-b',whisperModel:'small'};
 const next=mergeSettings(old,{deepseekKey:'',imageKey:'   ',whisperModel:'base'});
 assert.equal(next.deepseekKey,'test-a');assert.equal(next.imageKey,'test-b');assert.equal(next.whisperModel,'base');assert.equal(old.whisperModel,'small');
});
test('新密钥明确替换，拒绝非法模型参数',()=>{
 assert.equal(mergeSettings({deepseekKey:'a'},{deepseekKey:' b '}).deepseekKey,'b');
 assert.throws(()=>mergeSettings({}, {whisperModel:'../../bad'}));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,validateConfig} from '../src/config.mjs';
import {measuredRates,videoRateArgs} from '../src/encoding.mjs';
test('旧项目和预设从 Mbps 一次性转换为 kbps，不重复扩大',()=>{
 const old=normalizeConfig({bitrate:12.5});assert.equal(old.bitrateKbps,12500);assert.equal(old.bitrate,undefined);
 assert.equal(normalizeConfig(old).bitrateKbps,12500);
 assert.equal(normalizeConfig({bitrate:12,bitrateKbps:8000}).bitrateKbps,8000);
 assert.equal(validateConfig({bitrateKbps:12345}).bitrateKbps,12345);
 assert.equal(videoRateArgs(12345)[1],'12345000');
});
test('实测视频码率与总码率独立，缺失视频码率不得拿总码率替代',()=>{
 assert.deepEqual(measuredRates({streams:[{codec_type:'audio',bit_rate:'192000'},{codec_type:'video',bit_rate:'8000000'}],format:{bit_rate:'8200000'}}),{videoBitrateBps:8000000,totalBitrateBps:8200000});
 assert.deepEqual(measuredRates({streams:[{codec_type:'video'}],format:{bit_rate:'8200000'}}),{videoBitrateBps:null,totalBitrateBps:8200000});
});

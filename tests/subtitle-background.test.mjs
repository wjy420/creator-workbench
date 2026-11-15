import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../src/config.mjs';
import {defaults} from '../public/render-spec.js';
import {addSubtitleBackground} from '../src/subtitle-background.mjs';
test('参数不再有人工大小上限，仍拒绝无效数字和不合理透明度',()=>{
 const values={fontSize:240,barHeight:180,barMargin:1200,subtitleMargin:1600,maxChars:120,subtitleOutlineWidth:30,subtitleBackgroundPadding:150,subtitleBackgroundRadius:200,musicVolume:200,fadeIn:90,fadeOut:90,bitrateKbps:200000};
 const c=validateConfig(values);for(const key of Object.keys(values))assert.equal(c[key],values[key]);
 assert.equal(validateConfig({fontSize:1,maxChars:1,barMargin:-10}).fontSize,1);
 for(const input of [{fontSize:NaN},{maxChars:0},{maxChars:1.5},{subtitleBackgroundOpacity:101},{subtitleBackgroundRadius:-1}])assert.throws(()=>validateConfig(input));
});
test('圆角底板有透明角、实色中心，且不覆盖文字或空白时段',()=>{
 const w=80,h=60,data=Buffer.alloc(w*h*4);const pixel=(x,y)=>data.subarray((y*w+x)*4,(y*w+x)*4+4);
 for(let y=20;y<40;y++)for(let x=20;x<60;x++)pixel(x,y).set([101,239,179,255]);
 addSubtitleBackground(data,w,h,{...defaults,subtitleBackgroundPadding:10,subtitleBackgroundRadius:10});
 assert.deepEqual([...pixel(10,10)],[0,0,0,0]);
 assert.deepEqual([...pixel(40,10)],[0,0,0,255]);
 assert.deepEqual([...pixel(20,20)],[101,239,179,255]);
 const empty=Buffer.alloc(w*h*4);assert.ok(addSubtitleBackground(empty,w,h,defaults).equals(Buffer.alloc(empty.length)));
});

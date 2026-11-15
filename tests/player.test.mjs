import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('运行时播放器 ID 不得与静态 SVG 图标 ID 冲突',async()=>{
 const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const script=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const staticIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 const videoId=script.match(/<video id="([^"]+)"/)[1];
 assert.ok(!staticIds.includes(videoId),`播放器 ID ${videoId} 已被图标占用`);
 assert.equal(new Set(staticIds).size,staticIds.length,'页面存在重复 ID');
});

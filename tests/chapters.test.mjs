import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chapterRequest,parseChapters,validateChapters,generateChapters} from '../src/chapters.mjs';
import {defaults,chapterLayout,taskLanes} from '../public/render-spec.js';
import {validateConfig,normalizeConfig} from '../src/config.mjs';
import {makeAss} from '../src/media.mjs';
const project=()=>({width:640,height:360,duration:12,subtitles:[{start:1,end:3,text:'开场介绍'},{start:4,end:6,text:'如何使用'},{start:8,end:11,text:'注意事项'}]});
const response=chapters=>({choices:[{message:{content:JSON.stringify({chapters})}}]});

test('模型按文稿索引划分，时间完整覆盖片头、停顿及片尾',()=>{
 const p=project(),body=chapterRequest(p,'configured-model');assert.equal(body.model,'configured-model');assert.deepEqual(JSON.parse(body.messages[1].content).transcript.map(s=>s.start),[1,4,8]);
 assert.deepEqual(parseChapters(response([{startIndex:0,title:'介绍'},{startIndex:1,title:'操作'},{startIndex:2,title:'提醒'}]),p),[{start:0,end:4,title:'介绍'},{start:4,end:8,title:'操作'},{start:8,end:12,title:'提醒'}]);
 for(const chapters of [[],[{startIndex:1,title:'遗漏开场'}],[{startIndex:0,title:'开场'},{startIndex:8,title:'越界'}],[{startIndex:0,title:'开场'},{startIndex:0,title:'重复'}],[{startIndex:0,title:''}]])assert.throws(()=>parseChapters(response(chapters),p));
 assert.throws(()=>parseChapters({choices:[{message:{content:'无效 JSON'}}]},p),/格式/);
});
test('编辑章节允许空列表和空白时段，拒绝重叠、非法名称及越界时间',()=>{
 assert.deepEqual(validateChapters([],12),[]);assert.deepEqual(validateChapters([{start:5,end:8,title:' 后半段 '},{start:0,end:3,title:'开场'}],12),[{start:0,end:3,title:'开场'},{start:5,end:8,title:'后半段'}]);
 for(const chapters of [[{start:0,end:13,title:'越界'}],[{start:1,end:1,title:'零长'}],[{start:-1,end:2,title:'负数'}],[{start:0,end:4,title:'第一章'},{start:3,end:7,title:'第二章'}],[{start:0,end:3,title:'换\n行'}],[null]])assert.throws(()=>validateChapters(chapters,12));
 assert.throws(()=>validateConfig({...defaults,chapterFontSize:0}));assert.throws(()=>validateConfig({...defaults,chapterColor:'red'}));
});
test('异步章节不能覆盖生成期间保存的章节或文稿',async()=>{
 for(const edit of [p=>{p.chapters=[{start:0,end:12,title:'手动章节'}];p.chapterRevision=1},p=>{p.subtitles[0].text='新的文稿'}]){
  const p=project();let release;const gate=new Promise(r=>release=r),pending=generateChapters(p,{model:'test',request:()=>gate});edit(p);release(response([{startIndex:0,title:'旧结果'}]));await assert.rejects(pending,/已保留当前编辑/);assert.notEqual(p.chapters?.[0]?.title,'旧结果');
 }
 const p=project();assert.deepEqual(await generateChapters(p,{model:'test',request:async()=>response([{startIndex:0,title:'内容介绍'}])}),{count:1});assert.equal(p.chapters[0].end,12);assert.equal(p.chapterRevision,1);
});
test('章节按时段宽度排列，缩放长名称，导出只写名称并过滤 ASS 注入',()=>{
 const p={...project(),chapters:[{start:0,end:3,title:'开始'},{start:3,end:12,title:'详细说明'}]},c={...defaults,chapterFontSize:24};
 const layout=chapterLayout(p,c);assert.equal(layout[0].right-layout[0].left,(640-96)/4);assert.equal(layout[1].x,388);assert.equal(layout[0].y,288);
 const ass=makeAss(p,c);assert.ok(ass.includes('\\an5\\pos(116,288)\\fs24'));assert.ok(ass.includes('\\1c&Hffffff&'));assert.ok(ass.includes('开始'));assert.deepEqual(ass.split('\n').filter(line=>line.startsWith('Dialogue: 2,')).map(line=>line.slice(line.lastIndexOf('}')+1)),['开始','详细说明']);assert.ok(ass.includes('m 183.25 276 l 184.75 276'));
 assert.ok(!makeAss(p,{...c,chapterEnabled:false}).includes('详细说明'));p.chapters[0].title='{\\pos(0,0)}恶意\\N换行';assert.ok(!makeAss(p,c).includes('{\\pos(0,0)}恶意'));
 assert.deepEqual(taskLanes({type:'chapters',status:'running'}),['chapters']);
});

test('文字和分割线共用垂直中心，线长、粗细和整体偏移可分别调整',()=>{
 const p={...project(),chapters:[{start:0,end:3,title:'开始'},{start:3,end:12,title:'说明'}]},c={...defaults,chapterLineLength:40,chapterLineWidth:4,chapterOffset:32};
 const [first]=chapterLayout(p,c);assert.equal(first.y,276);assert.equal(first.lineTop,256);assert.equal(first.lineBottom,296);assert.equal(first.lineWidth,4);assert.equal((first.lineTop+first.lineBottom)/2,first.y);
 const [largerText]=chapterLayout(p,{...c,chapterFontSize:60});assert.equal(largerText.y,first.y);assert.equal(largerText.lineTop,first.lineTop);
 const [moved]=chapterLayout(p,{...c,chapterOffset:-10});assert.equal(moved.y,318);assert.equal(moved.lineBottom-moved.lineTop,40);
 const ass=makeAss(p,c);assert.ok(ass.includes('m 182 256 l 186 256 186 296 182 296'));
 for(const key of ['chapterLineLength','chapterLineWidth']){assert.throws(()=>validateConfig({...c,[key]:-1}));assert.ok(!makeAss(p,{...c,[key]:0}).includes('Dialogue: 4,'))}
 for(const value of ['',null,true,'abc',Infinity])assert.throws(()=>validateConfig({...c,chapterOffset:value}));
 assert.equal(validateConfig({...c,chapterLineLength:'40.5',chapterLineWidth:'2.5',chapterOffset:'-12.5'}).chapterOffset,-12.5);
 const legacy=normalizeConfig({chapterFontSize:35});assert.equal(legacy.chapterFontSize,35);assert.equal(legacy.chapterLineLength,24);assert.equal(legacy.chapterLineWidth,1.5);assert.equal(legacy.chapterOffset,20);
});

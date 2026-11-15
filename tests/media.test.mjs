import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSrt,toSrt,makeAss,defaults} from '../src/media.mjs';
import {barLayout,subtitleLines} from '../public/render-spec.js';
test('字幕样式参数与方形进度条前景、背景都进入导出定义',()=>{
 const ass=makeAss({width:640,height:360,duration:5,subtitles:[{start:0,end:4,text:'第一行\n第二行'}]},{...defaults,subtitleColor:'#ff0000',subtitleOutlineColor:'#00ff00',subtitleOutlineWidth:4,subtitleBackgroundEnabled:true,subtitleBackgroundColor:'#0000ff',subtitleBackgroundOpacity:50,barBackgroundColor:'#ff0000',barBackgroundOpacity:75});
 assert.ok(ass.includes('&H000000ff'));assert.ok(ass.includes('&H0000ff00'));assert.ok(!ass.includes(',Background,,'));assert.ok(ass.includes('第一行\\N第二行'));assert.ok(ass.includes('\\1a&H40&'));assert.deepEqual(barLayout({width:640,height:360},{barMargin:120,barHeight:8}),{x:120,y:232,width:400,height:8});assert.equal(subtitleLines('中文换行测试',3),'中文换\\N行测试');
});
test('SRT 支持 BOM、CRLF、跨行文字和毫秒往返',()=>{const src='\uFEFF1\r\n00:00:01,234 --> 00:00:03,567\r\n你好\r\n第二行\r\n';const rows=parseSrt(src);assert.deepEqual(rows,[{start:1.234,end:3.567,text:'你好\n第二行'}]);assert.deepEqual(parseSrt(toSrt(rows)),rows)});
test('忽略逆序时间，阻止字幕注入 ASS 标签',()=>{assert.equal(parseSrt('1\n00:00:03,000 --> 00:00:02,000\n无效').length,0);const ass=makeAss({width:1920,height:1080,duration:5,subtitles:[{start:0,end:2,text:'{\\pos(0,0)}你好'}]},defaults);assert.ok(!ass.includes('{\\pos(0,0)}你好'));assert.ok(ass.includes('\\t(0,5000,\\clip('));});

import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {makeAss,defaults} from '../src/media.mjs';
import {subtitlePreview,subtitleTimeline,filterPath} from '../src/preview.mjs';
const folder=path.resolve('data/visual-render-test');await fs.mkdir(folder,{recursive:true});
function run(exe,args){return new Promise((resolve,reject)=>{const proc=spawn(exe,args,{windowsHide:true});const chunks=[];let err='';proc.stdout.on('data',x=>chunks.push(x));proc.stderr.on('data',x=>err+=x);proc.on('error',reject);proc.on('exit',code=>code?reject(new Error(err)):resolve(Buffer.concat(chunks)))})}
for(const background of [false,true]){
 const config={...defaults,barEnabled:false,fontSize:36,maxChars:10,subtitleMargin:90,subtitleColor:'#f0c979',subtitleOutlineColor:'#ef6b73',subtitleOutlineWidth:3,subtitleBackgroundEnabled:background,subtitleBackgroundColor:'#648bff',subtitleBackgroundOpacity:65,subtitleBackgroundPadding:10};
 const p={width:640,height:360,duration:4,config,subtitles:[{start:0,end:4,text:'颜色描边背景测试换行也要一致'}]};
 const png=await subtitlePreview(p,[0],folder,run);const ass=path.join(folder,'test.ass');await fs.writeFile(ass,makeAss(p,config));
 const direct=await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x242424:s=640x360:r=1,format=rgba','-vf',`subtitles=filename='${filterPath(ass)}'`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
 const composed=await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x242424:s=640x360:r=1,format=rgba','-i',png,'-filter_complex','[0:v][1:v]overlay=format=rgb:alpha=straight','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
 assert.equal(direct.length,composed.length);let diff=0,active=0;for(let i=0;i<direct.length;i++){diff+=Math.abs(direct[i]-composed[i]);if(direct[i]!==36)active++}assert.ok(active>500,'字幕未渲染');if(!background)assert.ok(diff/direct.length<0.03,`像素平均差异 ${diff/direct.length}`);else assert.ok(diff>10000,'圆角底板未显示');
 await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=0x242424:s=640x360:r=1,format=rgba','-i',png,'-filter_complex','[0:v][1:v]overlay=format=rgb:alpha=straight','-frames:v','1',path.join(folder,`preview-${background}.png`)]);
 console.log(JSON.stringify({background,meanPixelDifference:diff/direct.length,subtitlePreview:png}));
}
// Check filled and unfilled rectangular bars at a known time, including alpha.
const c={...defaults,subtitleEnabled:false,barHeight:12,barMargin:24,barOpacity:50,barBackgroundColor:'#ffffff',barBackgroundOpacity:35};
const p={width:640,height:360,duration:4,subtitles:[]};const barAss=path.join(folder,'bar.ass');await fs.writeFile(barAss,makeAss(p,c));
const pixels=await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x242424:s=640x360:r=1,format=rgba','-vf',`setpts=PTS+1/TB,subtitles=filename='${filterPath(barAss)}'`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
const sample=(x,y)=>[...pixels.subarray((y*640+x)*3,(y*640+x)*3+3)];
const background=[113,113,113],fill=[106,126,184];
for(const [actual,expected] of [[sample(300,330),background],[sample(50,330),fill]])for(let i=0;i<3;i++)assert.ok(Math.abs(actual[i]-expected[i])<=3,`进度条颜色不一致 ${actual} / ${expected}`);
assert.deepEqual(sample(23,330),[36,36,36]);assert.deepEqual(sample(50,323),[36,36,36]);
console.log('PASS: 方条位置、前景/底轨透明度与预览计算一致。');
// Verify concat timing through real FFmpeg decoding, including empty gaps.
const timed={width:640,height:360,duration:4,config:{...defaults,fontSize:32,subtitleMargin:55,subtitleBackgroundEnabled:true},subtitles:[{start:.3,end:1.2,text:'第一句字幕'},{start:1.8,end:3.5,text:'第二句字幕'}]};
const timeline=await subtitleTimeline(timed,folder,run);
const frames=await run('ffmpeg',['-v','error','-f','concat','-safe','0','-i',timeline,'-vf','fps=10','-t','4','-f','rawvideo','-pix_fmt','rgba','pipe:1']);
const frameBytes=640*360*4;
for(const [frame,indices] of [[0,[]],[5,[0]],[14,[]],[23,[1]],[37,[]]]){
 const png=await subtitlePreview(timed,indices,folder,run);
 const expected=await run('ffmpeg',['-v','error','-i',png,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']);
 assert.ok(frames.subarray(frame*frameBytes,(frame+1)*frameBytes).equals(expected),`字幕切换或空白间隔不正确：${frame/10}秒`);
}
console.log('PASS: 字幕时间轴在首句、次句和空白间隔均与预览一致。');

// A reference-style still for visual review: one rounded plate around the text.
const reference={width:1280,height:720,duration:2,config:{...defaults,fontSize:70,subtitleMargin:110,maxChars:30,subtitleBackgroundPadding:28,subtitleBackgroundRadius:26},subtitles:[{start:0,end:2,text:'包括文案还有一个声音'}]};
const referencePng=await subtitlePreview(reference,[0],folder,run);
await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=0x161618:s=1280x720:r=1,format=rgba','-i',referencePng,'-filter_complex','[0:v][1:v]overlay=format=rgb:alpha=straight','-frames:v','1',path.join(folder,'reference-rounded.png')]);
console.log('PASS: 参考图圆角黑底、薄荷绿文字已生成。');

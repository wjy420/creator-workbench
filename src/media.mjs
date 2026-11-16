import {defaults,barLayout,chapterLayout,assColor,subtitleLines} from '../public/render-spec.js';
export {defaults};
const stamp=(n,sep=',')=>{const ms=Math.round(n*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${sep}${String(ms%1000).padStart(3,'0')}`};
export function toSrt(segments){return segments.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join('\n')}
export function parseSrt(s){const result=[];const blocks=s.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);const time=t=>{const a=t.replace(',','.').split(':').map(Number);return a[0]*3600+a[1]*60+a[2]};for(const b of blocks){const lines=b.split('\n'),idx=lines.findIndex(x=>x.includes('-->'));if(idx<0)continue;const m=lines[idx].match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/);if(!m)continue;const start=time(m[1]),end=time(m[2]),text=lines.slice(idx+1).join('\n').replace(/<[^>]*>/g,'').trim();if(end>start&&text)result.push({start,end,text})}return result}
const assTime=n=>{const cs=Math.round(n*100);return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`};
export function makeAss(p,config){
const c={...defaults,...config},w=p.width,h=p.height;
const paint=(color,opacity)=>{const a=assColor(color,opacity);return `\\1c&H${a.slice(4)}&\\1a&H${a.slice(2,4)}&`};
const style=(name,primary,outline,border,width)=>`Style: ${name},Microsoft YaHei,${c.fontSize},${primary},&H00FFFFFF,${outline},&HFF000000,0,0,0,0,100,100,0,0,${border},${width},0,2,30,30,${c.subtitleMargin},1`;
let out=`[Script Info]\nScriptType: v4.00+\nYCbCr Matrix: None\nPlayResX: ${w}\nPlayResY: ${h}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${style('Default',assColor(c.subtitleColor),assColor(c.subtitleOutlineColor),1,c.subtitleOutlineWidth)}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const event=(layer,start,end,text,style='Default')=>{out+=`Dialogue: ${layer},${assTime(start)},${assTime(end)},${style},,0,0,0,,${text}\n`};
if(c.barEnabled){const {x,y,width,height}=barLayout(p,c),right=x+width;const shape=`m ${x} ${y} l ${right} ${y} ${right} ${y+height} ${x} ${y+height}`;
event(0,0,p.duration,`{\\an7\\pos(0,0)\\bord0\\shad0${paint(c.barBackgroundColor,c.barBackgroundOpacity)}\\p1}${shape}`);
event(1,0,p.duration,`{\\an7\\pos(0,0)\\bord0\\shad0${paint(c.barColor,c.barOpacity)}\\clip(${x},${y},${x},${y+height})\\t(0,${Math.round(p.duration*1000)},\\clip(${x},${y},${right},${y+height}))\\p1}${shape}`);
}
if(c.chapterEnabled){const boundaries=new Set();for(const chapter of chapterLayout(p,c)){
 const {left,right,x,y,fontSize,scaleX,lineTop,lineBottom,lineWidth,text}=chapter;
 event(2,0,p.duration,`{\\an5\\pos(${x},${y})\\fs${fontSize}\\fscx${scaleX}\\bord1.2\\shad0\\1c&H${assColor(c.chapterColor).slice(4)}&\\1a&H00&\\3c&H000000&\\clip(${Math.round(left)},0,${Math.round(right)},${h})\\q2}${text}`);
 for(const [time,edge] of [[chapter.start,left],[chapter.end,right]])if(lineWidth>0&&lineBottom>lineTop&&time>0&&time<p.duration&&!boundaries.has(time)){boundaries.add(time);event(4,0,p.duration,`{\\an7\\pos(0,0)\\bord0\\shad0${paint(c.chapterColor,100)}\\p1}m ${edge-lineWidth/2} ${lineTop} l ${edge+lineWidth/2} ${lineTop} ${edge+lineWidth/2} ${lineBottom} ${edge-lineWidth/2} ${lineBottom}`);}
}}
if(c.subtitleEnabled){for(const s of p.subtitles||[]){const text='{\\q2}'+subtitleLines(s.text,c.maxChars);event(3,s.start,s.end,text)}}
return out;
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildProjectBundle} from '../src/project-bundle.mjs';
test('项目包只包含最后结果，ZIP 中文文件名和 CRC 可被标准解压器读取',async()=>{
 const folder=path.resolve('data/bundle-tests',crypto.randomUUID());await fs.mkdir(folder,{recursive:true});const video=crypto.randomBytes(3*1024*1024);await fs.writeFile(path.join(folder,'latest.mp4'),video);await fs.writeFile(path.join(folder,'old.mp4'),'旧视频不应导出');await fs.writeFile(path.join(folder,'horizontal.png'),'横版最新');await fs.writeFile(path.join(folder,'vertical.png'),'竖版最新');
 const p={id:'project',name:'中文项目',output:{file:'latest.mp4'},subtitles:[{start:0,end:1,text:'最终校对字幕'}],copy:{platforms:[{platform:'抖音',title:'最终标题',description:'一句话简介',tags:['测试']}],coverPrompt:'不应泄露进文案文件'},cover:{horizontal:{url:'/media/project/horizontal.png'},vertical:{url:'/media/project/vertical.png'}}};const zip=path.join(folder,'result.zip'),result=await buildProjectBundle(p,folder,zip);assert.equal(result.missing.length,0);
 const check=spawnSync('python',['-c',`import sys,zipfile,json,hashlib\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert len(z.namelist())==7\n assert hashlib.sha256(z.read('最终视频.mp4')).hexdigest()==sys.argv[2]\n assert '最终校对字幕' in z.read('最终字幕.srt').decode('utf-8-sig')\n assert '一句话简介' in z.read('平台标题和简介.txt').decode('utf-8-sig')\n assert json.loads(z.read('平台文案.json'))['platforms'][0]['title']=='最终标题'\n assert 'coverPrompt' not in z.read('平台文案.json').decode()\n assert z.read('横版封面.png').decode()=='横版最新'\n assert not any('old' in n or 'source' in n for n in z.namelist())`,zip,crypto.createHash('sha256').update(video).digest('hex')],{windowsHide:true,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
});
test('缺少结果时列入清单，没有任何结果则拒绝，禁止跨项目文件路径',async()=>{const folder=path.resolve('data/bundle-tests',crypto.randomUUID());await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'partial.zip');const result=await buildProjectBundle({id:'p',name:'部分结果',subtitles:[{start:0,end:1,text:'文稿'}],output:{file:'missing.mp4'}},folder,file);assert.ok(result.missing.includes('最终视频.mp4（文件已删除）'));assert.ok(result.files.includes('最终字幕.srt'));await assert.rejects(buildProjectBundle({id:'p'},folder,path.join(folder,'empty.zip')),/还没有/);await assert.rejects(buildProjectBundle({id:'p',output:{file:'../workspace.json'}},folder,path.join(folder,'unsafe.zip')),/无效文件名/)});

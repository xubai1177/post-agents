const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { join } = require('node:path')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const windows=[]
  try {
    for(let n=0;n<2;n++){
      const win=new BrowserWindow({show:false,width:1920,height:1080,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}); windows.push(win)
      await win.loadFile(join(process.cwd(),'scripts/whiteboard-svg-render.html'))
      const result=await win.webContents.executeJavaScript(`(()=>{const base={id:'a',type:'rectangle',x:120,y:240,width:1200,height:90,strokeColor:'#1971c2',backgroundColor:'#a5d8ff',fillStyle:'hachure',strokeWidth:3,strokeStyle:'solid',roughness:1,opacity:100,seed:123,roundness:null};const txt={...base,id:'b',type:'text',x:150,y:400,width:600,height:70,text:'顺序一致',fontSize:48,lineHeight:1.25,textAlign:'left'};window.loadScene([base,txt],[0,0],[[0,10]],{},10,[[0,4,8]]);window.setCaptions([{start:0,end:10,text:'字幕'}],{fontSize:40,baselineY:1022});return {count:items.length,starts:items.map(i=>i.start),ends:items.map(i=>i.end)}})()`)
      assert.equal(result.count,2);assert.ok(result.starts[1]>=4);assert.ok(result.ends[1]<10)
      const anchored=await win.webContents.executeJavaScript(`(()=>{const b={type:'text',x:150,y:400,width:600,height:70,text:'同步',fontSize:48,lineHeight:1.25,textAlign:'left',strokeColor:'#222',backgroundColor:'transparent',strokeWidth:3,strokeStyle:'solid',roughness:0,opacity:100,seed:1,roundness:null};window.loadScene([{...b,id:'a'},{...b,id:'b'}],[0,0],[[0,10]],{},10,[[0,4,8]],[0,2]);return items.map(i=>({start:i.start,end:i.end}))})()`)
      assert.ok(anchored[0].end <= 4);assert.ok(anchored[1].start >= 8);assert.ok(anchored[1].end <= 10)
    }
    const capture=async(win,t)=>{await win.webContents.executeJavaScript(`(async()=>{window.seek(${t});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);return (await win.webContents.capturePage()).toPNG()}
    const first=await capture(windows[0],5.5);await capture(windows[0],9);await capture(windows[0],1);const again=await capture(windows[0],5.5),other=await capture(windows[1],5.5)
    assert.ok(again.equals(first), '同一时间的画面不应受出帧顺序影响')
    assert.ok(other.equals(first), '不同窗口应输出相同画面')
    const size=(await windows[0].webContents.capturePage()).getSize();assert.equal(size.width/size.height,1920/1080)
    console.log('skill SVG 渲染、句级锚点、跨窗口和乱序出帧通过。')
    for(const win of windows)win.destroy();app.exit(0)
  }catch(error){console.error(error);for(const win of windows)win.destroy();app.exit(1)}
})

import { solveLayout, type LayoutItem, type LayoutBox } from './layout-solver'
import type { StoryboardElement, StoryboardRelation, SceneLayout, StickerPosition } from '../../../shared/whiteboard'

interface Box { x: number; y: number; w: number; h: number }
interface ImageData { dataURL: string; width: number; height: number }
export interface CompileBeat { elements: StoryboardElement[]; image?: ImageData; start: number; duration: number; cues?: number[]; stickerCue?: number; stickerPosition?: StickerPosition }
export interface CompileScene { focus: string; layout: SceneLayout; beats: CompileBeat[]; relations?: StoryboardRelation[] }
type ShapeType = 'rectangle' | 'ellipse' | 'text' | 'image' | 'line' | 'arrow'
interface RenderElement { id: string; type: ShapeType; x: number; y: number; width: number; height: number; strokeColor: string; backgroundColor: string; fillStyle: string; strokeWidth: number; strokeStyle: string; roughness: number; opacity: number; seed: number; roundness: { type: number } | null; text?: string; fontSize?: number; lineHeight?: number; textAlign?: string; fileId?: string; points?: number[][]; endArrowhead?: string | null; startArrowhead?: string | null }
const ink: Record<string, string> = { ink: '#1e1e1e', green: '#2f9e44', blue: '#1971c2', red: '#e03131', orange: '#f08c00' }
const fill: Record<string, string> = { ink: '#e9ecef', green: '#b2f2bb', blue: '#a5d8ff', red: '#ffc9c9', orange: '#ffec99' }

/** Compile only trusted, validated storyboard data into the skill's rendering primitives. */
export function compileScene(scene: CompileScene) {
  const elements: RenderElement[] = [], beatOf: number[] = [], cueOf: (number | null)[] = [], files: Record<string, { dataURL: string }> = {}
  let activeCue: number | null = null
  const add = (beat: number, type: ShapeType, box: Box, options: Partial<RenderElement> = {}) => {
    const id = `e${elements.length}`, color = options.strokeColor ?? ink.ink
    elements.push({ id, type, x: box.x, y: box.y, width: box.w, height: box.h, strokeColor: color, backgroundColor: 'transparent', fillStyle: 'hachure', strokeWidth: 3, strokeStyle: 'solid', roughness: 1, opacity: 100, seed: elements.length * 9173 + 27, roundness: null, ...options }); beatOf.push(beat); cueOf.push(activeCue)
  }
  const text = (beat: number, value: string, box: Box, color: string, size = 44, align: 'left' | 'center' = 'left') => {
    const length = Math.max(1, [...value].length), fontSize = Math.max(10, Math.min(size, box.h / 1.3, box.w / length * 1.05))
    add(beat, 'text', box, { text: value, strokeColor: color, fontSize, lineHeight: 1.25, textAlign: align, roughness: 0 })
  }
  const geometry = (bi: number, ei: number): { item: Box; image: Box } => {
    const n = scene.beats.length, count = scene.beats[bi].elements.length
    if (scene.layout === 'spotlight') {
      const top=n===1?260:n===2?215:200, spacing=n===3?140:170, itemHeight=n===3?60:78, itemGap=n===3?64:82
      const gap=60,w=Math.min(440,(1440-gap*(n-1))/n),start=960-(n*w+(n-1)*gap)/2
      return { item:{x:200,y:top+bi*spacing+ei*itemGap,w:1520,h:itemHeight},image:{x:start+bi*(w+gap),y:n===3?650:570,w,h:n===3?240:310} }
    }
    if (scene.layout === 'concentric') {
      const radii = n === 2 ? [160, 305] : [115, 210, 305], r = radii[bi]
      return { item: ei === 0 ? { x: 530, y: bi === 0 ? 510 : 550-r+30, w: 240, h: 60 } : { x: 1050, y: 235+bi*220+(ei-1)*58, w: 490, h: 52 }, image: { x: 1570, y: 220+bi*220, w: 225, h: 200 } }
    }
    if (scene.layout === 'diagram') {
      const total = scene.beats.reduce((a,b) => a+b.elements.length,0), index = scene.beats.slice(0,bi).reduce((a,b) => a+b.elements.length,0)+ei
      const cols = total<=3?total:total<=9?3:4, rows=Math.ceil(total/cols), cellW=(1240-100*(cols-1))/cols, cellH=(660-55*(rows-1))/rows
      const row=Math.floor(index/cols), col=index%cols, inRow=Math.min(cols,total-row*cols), offset=(cols-inRow)*(cellW+100)/2, h=Math.min(110,cellH)
      return { item: { x:105+offset+col*(cellW+100), y:210+row*(cellH+55)+(cellH-h)/2, w:cellW, h }, image:{x:1430+(bi%2)*175,y:230+Math.floor(bi/2)*300,w:165,h:250} }
    }
    if (scene.layout === 'columns' || scene.layout === 'steps') {
      const steps=scene.layout==='steps', gap=steps?40:30, w=(1720-gap*(n-1))/n, left=100+bi*(w+gap), h=Math.min(steps?84:92,(steps?300:390)/Math.max(count,1))
      return { item:{x:left+22,y:570+ei*h,w:w-44,h:h-10}, image:{x:left+35,y:225,w:w-70,h:300} }
    }
    const row=700/n,h=Math.min(82,(row-20)/Math.max(count,1)),top=205+bi*row,contentHeight=count*h
    return { item:{x:210,y:top+(row-contentHeight)/2+ei*h,w:780,h:h-8},image:{x:1060,y:top+10,w:540,h:row-20} }
  }
  const layoutItems: LayoutItem[] = []
  const protectedAreas = scene.layout === 'concentric' ? [{ id:'region', box:{ x:345,y:245,w:610,h:610 } }] : []
  scene.beats.forEach((beat,bi) => {
    if (beat.image) {
      const area=beat.stickerPosition?{x:100+beat.stickerPosition.x*17.2,y:190+beat.stickerPosition.y*7.15,w:beat.stickerPosition.width*17.2,h:beat.stickerPosition.height*7.15}:geometry(bi,0).image
      const scale=Math.min(area.w/beat.image.width,area.h/beat.image.height),w=beat.image.width*scale,h=beat.image.height*scale
      layoutItems.push({id:`image:${bi}`,box:{x:area.x+(area.w-w)/2,y:area.y+(area.h-h)/2,w,h},fixed:!!beat.stickerPosition,kind:'image',group:`beat:${bi}`})
    }
    beat.elements.forEach((el,ei) => {
      const explicit=el.x!==undefined && el.y!==undefined && el.width!==undefined && el.height!==undefined
      let box: LayoutBox = explicit ? {x:100+el.x!*17.2,y:190+el.y!*7.15,w:el.width!*17.2,h:el.height!*7.15}:geometry(bi,ei).item
      const regionLabel=scene.layout==='concentric' && ei===0
      if (!explicit && el.type==='text' && !regionLabel) {
        const centered=scene.layout==='spotlight'||scene.layout==='columns'||scene.layout==='steps'
        const targetSize=scene.layout==='spotlight'?(bi===0&&ei===0?76:56):centered?48:50
        const size=Math.max(10,Math.min(targetSize,box.h/1.3,box.w/Math.max(1,[...el.text].length)*1.05))
        const width=Math.min(box.w,Math.max(size,[...el.text].reduce((sum,ch)=>sum+(/[\u2e80-\u9fff]/.test(ch)?size:size*.6),0))+24)
        box={...box,x:centered?box.x+(box.w-width)/2:box.x,w:width}
      }
      layoutItems.push({id:`element:${bi}:${ei}`,box,fixed:explicit||regionLabel,kind:el.type==='text'?'text':'shape',protectedRegion:regionLabel?'region':undefined,group:`beat:${bi}`})
    })
  })
  // Treat each list beat as a visual group and share column axes across beats.
  // Custom coordinates remain authoritative; the solver handles any remaining collisions.
  if (scene.layout === 'list' && layoutItems.every(item => !item.fixed)) {
    const labels=layoutItems.filter(item => item.id.startsWith('element:')), pictures=layoutItems.filter(item => item.kind==='image')
    const labelWidth=Math.max(0,...labels.map(item=>item.box.w)), imageWidth=Math.max(0,...pictures.map(item=>item.box.w)), gap=pictures.length ? 110 : 0
    const left=960-(labelWidth+gap+imageWidth)/2
    for (const item of labels) item.box.x=left
    for (const item of pictures) item.box.x=left+labelWidth+gap+(imageWidth-item.box.w)/2
  }
  const layout = solveLayout(layoutItems, protectedAreas)
  const boxFor = (bi: number, ei: number): Box => layout.boxes[`element:${bi}:${ei}`]
  // Back-to-front drawing order preserves inner rings while beatOf keeps their animation time.
  if (scene.layout === 'concentric') for (let bi=scene.beats.length-1;bi>=0;bi--) {
    activeCue = scene.beats[bi].elements[0].cue ?? null
    const r=(scene.beats.length===2?[160,305]:[115,210,305])[bi], key=scene.beats[bi].elements[0].color ?? (bi===0?'blue':'green')
    add(bi,'ellipse',{x:650-r,y:550-r,w:r*2,h:r*2},{strokeColor:ink[key],backgroundColor:fill[key],fillStyle:bi===0?'solid':'hachure',strokeWidth:4})
  }
  activeCue = 0
  text(0,scene.focus,{x:105,y:60,w:1450,h:100},ink.green,76)
  scene.beats.forEach((beat,bi) => {
    activeCue = 0
    if (bi > 0 && scene.layout === 'columns') {
      const gap=30, width=(1720-gap*(scene.beats.length-1))/scene.beats.length, x=100+bi*(width+gap)-gap/2
      add(bi,'line',{x,y:210,w:0,h:690},{strokeColor:'#868e96',strokeStyle:'dashed',strokeWidth:2,points:[[0,0],[0,690]]})
    }
    if (bi > 0 && scene.layout === 'steps') {
      const gap=40,width=(1720-gap*(scene.beats.length-1))/scene.beats.length,x=100+bi*(width+gap)-gap+4
      add(bi,'arrow',{x,y:500,w:gap-8,h:0},{strokeColor:ink.green,points:[[0,0],[gap-8,0]],endArrowhead:'arrow'})
    }
    const fileId=`image${bi}`
    activeCue = beat.stickerCue ?? null
    if (beat.image) { files[fileId]={dataURL:beat.image.dataURL};add(bi,'image',layout.boxes[`image:${bi}`],{fileId,roughness:0}) }
    beat.elements.forEach((el,ei) => {
      activeCue = el.cue ?? null
      const box=boxFor(bi,ei),color=ink[el.color??'ink'], bg=fill[el.color??'blue']
      if(el.type==='text' || (scene.layout==='concentric' && ei===0)) {
        const centered=(scene.layout==='concentric' && ei===0) || scene.layout==='spotlight' || ((scene.layout==='columns' || scene.layout==='steps') && el.x===undefined)
        const targetSize=scene.layout==='spotlight'?(bi===0&&ei===0?76:56):centered?48:50
        const fontSize=Math.max(10,Math.min(targetSize,box.h/1.3,box.w/Math.max(1,[...el.text].length)*1.05))
        const measured=Math.min(box.w,Math.max(fontSize,[...el.text].reduce((sum,ch)=>sum+(/[\u2e80-\u9fff]/.test(ch)?fontSize:fontSize*.6),0)))
        const markWidth=Math.min(box.w,measured+16),markHeight=Math.min(box.h,fontSize*1.2),markX=centered?box.x+(box.w-markWidth)/2:box.x
        if(el.emphasis==='highlight') add(bi,'rectangle',{x:markX,y:box.y+markHeight*.47,w:markWidth,h:Math.max(8,markHeight*.4)},{strokeColor:'#ffec99',backgroundColor:'#ffec99',fillStyle:'solid',roughness:1.2,opacity:80,strokeWidth:2})
        text(bi,el.text,box,color,targetSize,centered?'center':'left')
        if(el.emphasis==='circle') add(bi,'ellipse',{x:markX,y:box.y,w:markWidth,h:markHeight},{strokeColor:color,strokeWidth:3})
        if(el.emphasis==='underline') {const length=markWidth,count=Math.max(2,Math.ceil(length/16)+1),points=Array.from({length:count},(_,n)=>{const x=n*length/(count-1);return [x,4+Math.sin(x/12)*4]});add(bi,'line',{x:markX,y:box.y+Math.max(0,markHeight-8),w:length,h:8},{strokeColor:color,strokeWidth:3,points,roundness:{type:2}})}
      }
      else if(el.type==='box'||el.type==='circle') {
        add(bi,el.type==='box'?'rectangle':'ellipse',box,{strokeColor:color,backgroundColor:bg,roundness:el.type==='box'?{type:3}:null})
        text(bi,el.text,{x:box.x+12,y:box.y+box.h*.23,w:Math.max(1,box.w-24),h:box.h*.55},color,48,'center')
      } else {
        const w=Math.min(105,box.w*.22),y=box.y+box.h/2
        add(bi,'arrow',{x:box.x,y,w,h:0},{strokeColor:color,points:[[0,0],[w,0]],endArrowhead:'arrow'})
        text(bi,el.text,{x:box.x+w+15,y:box.y,w:Math.max(1,box.w-w-15),h:box.h},color)
      }
    })
  })
  for (const rel of scene.relations ?? []) {
    activeCue = rel.from.beat === rel.to.beat ? Math.max(scene.beats[rel.from.beat].elements[rel.from.element].cue ?? 0, scene.beats[rel.to.beat].elements[rel.to.element].cue ?? 0) : scene.beats[Math.max(rel.from.beat, rel.to.beat)].elements[rel.from.beat > rel.to.beat ? rel.from.element : rel.to.element].cue ?? null
    const a=boxFor(rel.from.beat,rel.from.element), b=boxFor(rel.to.beat,rel.to.element), ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2}, dx=bc.x-ac.x,dy=bc.y-ac.y
    const bound=(box:Box)=>Math.min(Math.abs(dx)<.001?Infinity:box.w/2/Math.abs(dx),Math.abs(dy)<.001?Infinity:box.h/2/Math.abs(dy))
    const first=bound(a),last=1-bound(b);if(!Number.isFinite(first)||first>=last)continue
    const x1=ac.x+dx*first,y1=ac.y+dy*first,x2=ac.x+dx*last,y2=ac.y+dy*last,bi=Math.max(rel.from.beat,rel.to.beat), color=ink[rel.color??'green']
    const others=scene.beats.flatMap((beat,i)=>beat.elements.map((_,j)=>({beat:i,element:j}))).filter(ref=>!(ref.beat===rel.from.beat&&ref.element===rel.from.element)&&!(ref.beat===rel.to.beat&&ref.element===rel.to.element)).map(ref=>boxFor(ref.beat,ref.element))
    const obstructed=others.some(box=>Array.from({length:79},(_,i)=>(i+1)/80).some(f=>{const x=x1+(x2-x1)*f,y=y1+(y2-y1)*f;return x>box.x-8&&x<box.x+box.w+8&&y>box.y-8&&y<box.y+box.h+8}))
    const reverse=(scene.relations??[]).some(other=>other!==rel&&other.from.beat===rel.to.beat&&other.from.element===rel.to.element&&other.to.beat===rel.from.beat&&other.to.element===rel.from.element)
    const fromOrder=rel.from.beat*8+rel.from.element,toOrder=rel.to.beat*8+rel.to.element
    let route=[[x1,y1],[x2,y2]]
    if(obstructed||(reverse&&fromOrder>toOrder)){
      const boxes=[a,b,...others], top=Math.min(...boxes.map(box=>box.y)),bottom=Math.max(...boxes.map(box=>box.y+box.h))
      if(top>=250){const y=top-45;route=[[ac.x,a.y],[ac.x,y],[bc.x,y],[bc.x,b.y]]}
      else if(bottom<=865){const y=bottom+45;route=[[ac.x,a.y+a.h],[ac.x,y],[bc.x,y],[bc.x,b.y+b.h]]}
    }
    const x=Math.min(...route.map(p=>p[0])),y=Math.min(...route.map(p=>p[1])),w=Math.max(...route.map(p=>p[0]))-x,h=Math.max(...route.map(p=>p[1]))-y
    add(bi,'arrow',{x,y,w,h},{strokeColor:color,strokeStyle:rel.style??'solid',points:route.map(p=>[p[0]-x,p[1]-y]),endArrowhead:'arrow'})
    if(rel.label){const middle=Math.floor((route.length-1)/2),p=route[middle],q=route[middle+1];text(bi,rel.label,{x:(p[0]+q[0])/2-100,y:(p[1]+q[1])/2-35,w:200,h:32},color,26,'center')}
  }
  const anchored = scene.beats.some(beat => beat.stickerCue !== undefined || beat.elements.some(element => element.cue !== undefined))
  return { elements, beatOf, cueOf: anchored ? cueOf : undefined, files, layoutIssues: layout.issues, beats: scene.beats.map(b => [b.start,b.start+b.duration] as [number,number]), cues: scene.beats.map(b => b.cues ?? []) }
}

export function describeLayoutIssues(issues: { first: string; second: string }[]): string[] {
  const label = (id: string): string => {
    const p=id.split(':')
    if (p[0]==='image') return `节拍 ${Number(p[1])+1} 的贴纸`
    if (p[0]==='element') return `节拍 ${Number(p[1])+1} 的元素 ${Number(p[2])+1}`
    return id==='region'?'同心区域':id
  }
  return issues.map(issue=>`${label(issue.first)}与${label(issue.second)}重叠或超出可用空间，请调整自定义位置或减少内容。`)
}

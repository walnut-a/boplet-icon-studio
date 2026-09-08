import {setup,call} from './workflow.js';
export async function createScaleFixture(storage){
  const context=await setup(storage);const {studio,p,s,i}=context;
  const project=(await call(studio,'get_project',p)).project,scheme=(await call(studio,'get_scheme',s)).scheme,matrix=(await call(studio,'get_icon',i)).matrix;
  for(let n=0;n<20;n++){const projectId=n===0?p.projectId:`p-scale-${n}`;await storage.writeJson(`projects/${projectId}/project.json`,{...project,projectId});for(let j=0;j<5;j++){const schemeId=n===0&&j===0?s.schemeId:`s-scale-${j}`;await storage.writeJson(`projects/${projectId}/schemes/${schemeId}/scheme.json`,{...scheme,projectId,schemeId});}}
  const vocabulary=await storage.readJson(`projects/${p.projectId}/vocabulary.json`),base=vocabulary.icons[0];vocabulary.icons=[];
  for(let n=0;n<600;n++){const iconId=n===0?i.iconId:`i-scale-${n}`;vocabulary.icons.push({...base,iconId,name:`合成图标 ${n}`,concept:`合成动作 ${n}`,tags:[n%2?'odd':'even']});await storage.writeJson(`projects/${p.projectId}/schemes/${s.schemeId}/matrix/${iconId}.json`,{...matrix,iconId,variants:[16,24,32,64].map((size,j)=>({...matrix.variants[0],variantId:`v-size-${j}`,size,productionStatus:'draft',layers:[{layerId:'l-shape',name:'图形',type:'rect',visible:true,drawing:'fill',strokeWidth:0,x:size*.2,y:size*.2,width:size*.6,height:size*.6,radius:1}]}))});}
  await storage.writeJson(`projects/${p.projectId}/vocabulary.json`,vocabulary);
  return context;
}

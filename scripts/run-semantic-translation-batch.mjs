import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, openSync, closeSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTranslationArtifacts, createTranslationPlan, readBuiltRecords, validateDraftRecords } from "./classical-translation-pipeline.mjs";
import { readRepairCheckpoint } from "./repair-classical-alignment.mjs";
import { createSemanticPlan, repairSemanticTranslation, SEMANTIC_PROMPT_VERSION, sourceIntegrityIssue } from "./semantic-classical-translations.mjs";
import { loadGeneratorConfig, loadClassicalGlossary } from "./generate-classical-translation-drafts.mjs";
import { validateClassicalAlignment } from "../src/classical-alignment.js";
import { CLOUD_MODEL, CloudAssistStopped, CodexSemanticProvider, cloudGenerationParameters, repairWithCloudFallback } from "./codex-semantic-provider.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const execute=promisify(execFile),sleep=(ms)=>new Promise(done=>setTimeout(done,ms));
const args=process.argv.slice(2),options={publish:false,batchSize:10};
for(let i=0;i<args.length;i++){
  if(args[i]==="--publish")options.publish=true;
  else if(["--state-dir","--progress-html","--model-file","--server-binary","--model-sha256","--ids","--branch","--site","--repository"].includes(args[i])){
    const key=args[i].slice(2),value=args[++i];if(!value||value.startsWith("--"))throw new Error(`Missing ${key}`);options[key]=value;
  }else throw new Error(`Unknown option ${args[i]}`);
}
for(const key of ["state-dir","progress-html","model-file","server-binary","model-sha256"])if(!options[key])throw new Error(`Missing --${key}`);
const stateDir=resolve(options["state-dir"]),page=resolve(options["progress-html"]);
const statePath=resolve(stateDir,"progress.json"),journalPath=resolve(stateDir,"journal.jsonl"),checkpoint=resolve(stateDir,"accepted.jsonl"),stopPath=resolve(stateDir,"STOP");
const publicStatusPath=resolve(root,"data/classical-translations/semantic-status.json");
const cloudOptionsPath=resolve(stateDir,"cloud-assist.json"),cloudFinishedPath=resolve(stateDir,"cloud-assist-finished.json");
const repository=options.repository||"yutok0423gh/Leafbound",site=options.site||"https://yutok0423gh.github.io/Leafbound/";
const expectedBranch=options.branch||"codex/semantic-alignment-all";
const state={schemaVersion:1,pid:process.pid,status:"starting",startedAt:new Date().toISOString(),updatedAt:null,
  promptVersion:SEMANTIC_PROMPT_VERSION,total:0,processed:0,accepted:0,published:0,held:0,sourceHolds:0,
  current:null,error:null,site,checkpoint,stopPath,publications:[],activeModel:"Qwen3.5-9B-Alignment",cloudAccepted:0,cloudAssist:null};
let server=null,heartbeat=null,saveQueue=Promise.resolve(),cloud=null,cloudConfig=null;
const html=(value)=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

function save(){
  state.updatedAt=new Date().toISOString();const snapshot=structuredClone(state);
  saveQueue=saveQueue.then(async()=>{
    await writeFile(statePath+".next",JSON.stringify(snapshot,null,2)+"\n");await rename(statePath+".next",statePath);
    const labels={starting:"正在准备",running:"全库语义核对中",validating:"正在检查本批结果",publishing:"正在发布",deploying:"网站部署中",
      complete:"全库检查完成",needs_review:"全库检查结束，仍有待核实内容",stopped:"已停止",failed:"已中断，等待恢复"};
    await writeFile(page,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15"><title>Leafbound 全库核对进度</title>
<style>body{max-width:950px;margin:45px auto;padding:0 22px;background:#f8f5ee;color:#283f33;font:17px/1.75 system-ui}h1{font-family:serif;font-weight:500}.cards{display:flex;flex-wrap:wrap;gap:14px}.card{background:white;border:1px solid #dddfd2;border-radius:10px;padding:16px 20px}.card b{display:block;font-size:30px}a{color:#306e54}small{color:#69746b}progress{width:100%;height:15px}.warning{color:#934235}</style>
<small>LEAFBOUND · 全部 17,373 篇</small><h1 id="status">${html(labels[snapshot.status]||snapshot.status)}</h1>
<p><a href="${html(site)}" target="_blank">打开正式网站</a> · ${snapshot.activeModel===CLOUD_MODEL?`GPT-5.6 Luna · ${snapshot.cloudAssist?.serviceTier==="priority"?"Fast":"标准速度"}`:"本机 Qwen3.5-9B"} · 按意思分组，允许多句合译</p>
<div class="cards"><div class="card"><b>${snapshot.processed} / ${snapshot.total}</b>已处理</div><div class="card"><b>${snapshot.accepted}</b>通过语义检查</div><div class="card"><b>${snapshot.published}</b>已上线分组</div><div class="card"><b>${snapshot.held}</b>仍待核实</div></div>
<p><progress max="${Math.max(snapshot.total,1)}" value="${snapshot.processed}"></progress></p>
<p>${snapshot.current?`当前：${html(snapshot.current.title)} · ${html(snapshot.current.poet)}`:"已有人工译文保留原字句；疑似错配的机器稿重新翻译并复核。"}</p>
<p>${snapshot.sourceHolds} 篇存在来源疑点；不把缺字或混进标题的正文交给模型猜补。通过模型核对仍需人工校订。</p>
${snapshot.cloudAssist?`<p>GPT-5.6 Luna 累计已完成 ${snapshot.cloudAccepted} 篇。${snapshot.cloudAssist.quota?`周剩余额度最近读数：${snapshot.cloudAssist.quota.remainingPercent}%。`:""}保留 10% 周额度，另留 2% 缓冲，约剩 12% 时结束本轮云端协助并继续本地处理。${snapshot.cloudAssist.mode==="local"?`<br>已切回本地：${html(snapshot.cloudAssist.stopLabel||"本轮云端协助已结束")}。`:""}</p>`:""}
${snapshot.error?`<p class="warning">${html(snapshot.error)}</p>`:""}
<p id="heartbeat"><small>最后更新：${html(new Date(snapshot.updatedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}))}。页面每 15 秒刷新。</small></p>
<p>任务由本机计划任务续跑，电脑关机时不会处理；下次登录后从检查点继续。请保持电脑接通电源。<br>停止入口：在任务目录创建 STOP 文件；再次启动前需移走这个文件。</p>
<details><summary>最近部署</summary><ul>${snapshot.publications.slice(-5).reverse().map(p=>`<li><a href="${html(p.url)}">${html(p.completedAt)}</a> · ${p.count} 篇</li>`).join("")}</ul></details>
<script>if(!${JSON.stringify(["complete","needs_review","stopped","failed"].includes(snapshot.status))}&&Date.now()-${Date.parse(snapshot.updatedAt)}>180000){document.getElementById('status').textContent='任务心跳已停止，等待恢复';document.getElementById('heartbeat').className='warning'}</script></html>`);
  });return saveQueue;
}
async function command(program,arguments_,timeout=120000){
  const result=await execute(program,arguments_,{cwd:root,windowsHide:true,timeout,maxBuffer:16*1024*1024,
    env:{...process.env,GIT_TERMINAL_PROMPT:"0",GH_PROMPT_DISABLED:"1"}});return result.stdout.trim();
}
const git=(...values)=>command("git",["-c","core.safecrlf=false",...values]);
const github=(...values)=>command("C:/Program Files/GitHub CLI/gh.exe",values);
const allowedPath=(path)=>/^data\/classical-translations\/(?:manifest\.json|semantic-status\.json|shards\/[a-f0-9]{2}\.json)$/.test(path);
async function assertClean(){if(await git("diff","--name-only")||await git("diff","--cached","--name-only"))throw new Error("独立工作目录有未完成的更改，检查点已保留，请先核查后续跑。");}
async function syncPublishedBranch(){
  if(await git("branch","--show-current")!==expectedBranch)throw new Error("Unexpected worker branch.");
  if(await git("remote","get-url","origin")!==`https://github.com/${repository}.git`)throw new Error("Unexpected publishing destination.");
  await assertClean();await git("fetch","origin","main");
  const [ahead,behind]=(await git("rev-list","--left-right","--count","HEAD...origin/main")).split(/\s+/).map(Number);
  if(ahead&&behind)throw new Error("网站和后台分支同时有新提交，已停止自动发布以保留双方更改。");
  if(ahead){
    const paths=(await git("diff","--name-only","origin/main...HEAD")).split(/\r?\n/).filter(Boolean);
    if(paths.some(path=>!allowedPath(path)))throw new Error("Unpublished commit contains non-translation changes.");
    await git("push","origin","HEAD:main");
  }
  if(behind){await git("merge","--ff-only","origin/main");throw new Error("已同步网站新版本；下次续跑将载入最新原文与译文。");}
}
async function startModel(){
  const hash=createHash("sha256");for await(const chunk of createReadStream(options["model-file"]))hash.update(chunk);
  const sha=hash.digest("hex");if(sha!==options["model-sha256"].toLowerCase())throw new Error("Local model checksum changed; refusing an unverified model.");
  const apiKey=randomUUID();
  const out=openSync(resolve(stateDir,"model.stdout.log"),"a"),err=openSync(resolve(stateDir,"model.stderr.log"),"a");
  server=spawn(options["server-binary"],["-m",options["model-file"],"--host","127.0.0.1","--port","8080","--alias","Qwen3.5-9B-Alignment",
    "-c","16384","-ngl","99","-np","1","--jinja","--no-webui","--reasoning-budget","1536","--reasoning-format","deepseek","--api-key",apiKey],{windowsHide:true,stdio:["ignore",out,err]});
  closeSync(out);closeSync(err);state.modelPid=server.pid;let launchError=null;server.on("error",error=>{launchError=error;});
  for(let attempt=0;attempt<90;attempt++){
    if(launchError)throw launchError;
    if(server.exitCode!==null)throw new Error("本机模型未能启动，请检查模型日志或 8080 端口是否占用。");
    try{const response=await fetch("http://127.0.0.1:8080/health",{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(2000)});
      if(response.ok&&(await response.json()).status==="ok")return loadGeneratorConfig({...process.env,
        LEAFBOUND_OPENAI_BASE_URL:"http://127.0.0.1:8080/v1",LEAFBOUND_OPENAI_API_KEY:apiKey,LEAFBOUND_OPENAI_MODEL:"Qwen3.5-9B-Alignment",
        LEAFBOUND_OPENAI_MODEL_REVISION:`sha256:${sha}`,LEAFBOUND_PROMPT_VERSION:SEMANTIC_PROMPT_VERSION,
        LEAFBOUND_OPENAI_TIMEOUT:"240000",LEAFBOUND_OPENAI_MAX_TOKENS:"6144",LEAFBOUND_OPENAI_RETRY:"1",LEAFBOUND_OPENAI_TEMPERATURE:"0.1"});
    }catch{}await sleep(1000);
  }throw new Error("本机模型加载超时。");
}

async function stopCloud(error){
  const reason=error.reason||"cloud-unavailable";
  const labels={"weekly-reserve-reached":"已到额度保留线","weekly-window-changed":"额度窗口读数发生变化，已保护性转回本地",
    "quota-unavailable":"暂时无法确认额度","quota-invalid-or-expired":"额度读数已失效",
    "cloud-request-too-large":"长篇继续由本地模型处理"};
  cloud?.close();cloud=null;state.activeModel="Qwen3.5-9B-Alignment";
  state.cloudAssist={...state.cloudAssist,mode:"local",stopReason:reason,stopDetails:error.details,stopLabel:labels[reason]||"云端调用暂不可用",stoppedAt:new Date().toISOString()};
  await writeFile(cloudFinishedPath+".next",JSON.stringify(state.cloudAssist,null,2)+"\n");
  await rename(cloudFinishedPath+".next",cloudFinishedPath);await save();
}

async function startCloud(){
  if(!existsSync(cloudOptionsPath))return;
  const settings=JSON.parse(await readFile(cloudOptionsPath,"utf8"));if(!settings.enabled)return;
  state.cloudAssist={requestId:settings.requestId,mode:"starting",model:CLOUD_MODEL,serviceTier:settings.serviceTier||"default",quota:null};
  if(existsSync(cloudFinishedPath)){
    const finished=JSON.parse(await readFile(cloudFinishedPath,"utf8"));
    if(finished.requestId===settings.requestId){state.cloudAssist=finished;return;}
  }
  try{
    if(settings.model!==CLOUD_MODEL||!settings.requestId||!settings.codexBinary
      ||settings.reservePercent!==10||settings.safetyMarginPercent!==2)throw new CloudAssistStopped("invalid-cloud-settings");
    cloudConfig={model:CLOUD_MODEL,modelRevision:"codex:gpt-5.6-luna:unversioned-alias",promptVersion:SEMANTIC_PROMPT_VERSION,
      temperature:0,maxTokens:6144,generationParameters:cloudGenerationParameters(settings.serviceTier)};
    cloud=new CodexSemanticProvider({binary:settings.codexBinary,cwd:root,policy:settings,
      onQuota:async quota=>{state.cloudAssist.quota=quota;await save();}});
    await cloud.start();state.activeModel=CLOUD_MODEL;state.cloudAssist.mode="cloud";await save();
  }catch(error){await stopCloud(error);}
}
async function publish(results,publicStatus){
  if(!options.publish)return;
  const previousStatus=JSON.parse(await readFile(publicStatusPath,"utf8"));
  if(!results.length&&JSON.stringify(previousStatus.holds)===JSON.stringify(publicStatus.holds)
    &&JSON.stringify(previousStatus.editorial)===JSON.stringify(publicStatus.editorial))return;
  await syncPublishedBranch();state.status="validating";await save();
  const current=createSemanticPlan(await readBuiltRecords()),byId=new Map(current.map(entry=>[entry.job.id,entry]));
  for(const result of results){
    const entry=byId.get(result.id);
    if(!entry||entry.inputHash!==result.inputHash)throw new Error(`原稿已有变化，保留新稿供核查：${result.id}`);
    if(entry.preserveText&&result.record&&JSON.stringify(entry.paragraphs)!==JSON.stringify(result.record.paragraphs))throw new Error("Protected translation changed.");
    if(result.editorial)publicStatus.editorial[result.id]={sourceHash:result.sourceHash,alignment:result.alignment};
    delete publicStatus.holds[result.id];
  }
  const records=results.filter(result=>!result.editorial).map(result=>result.record);
  if(records.length){const built=await buildTranslationArtifacts({draftRecords:records});if(!built.ok)throw new Error(`全库验证未通过：${JSON.stringify(built.validation?.errors)}`);}
  publicStatus.updatedAt=new Date().toISOString();
  await writeFile(publicStatusPath,JSON.stringify(publicStatus)+"\n");
  const tests=await command(process.execPath,["--test","--test-isolation=none","tests/*.test.mjs"],180000);
  await writeFile(resolve(stateDir,"last-tests.log"),tests+"\n");
  const changed=(await git("diff","--name-only")).split(/\r?\n/).filter(Boolean);
  if(changed.some(path=>!allowedPath(path))||await git("diff","--cached","--name-only"))throw new Error("Unexpected files in publication.");
  if(!changed.length)return;
  state.status="publishing";await save();await git("add","--",...changed);await git("diff","--cached","--check");
  await git("commit","-m",`Verify semantic translation groups for ${results.length} classical works`);
  const sha=await git("rev-parse","HEAD");await git("push","origin","HEAD:main");state.lastPushedCommit=sha;state.status="deploying";await save();
  let deployed=null;
  for(let attempt=0;attempt<60;attempt++){
    const runs=JSON.parse(await github("run","list","--repo",repository,"--workflow","deploy-pages.yml","--commit",sha,"--limit","1","--json","status,conclusion,url"));
    if(runs[0]?.status==="completed"){if(runs[0].conclusion!=="success")throw new Error(`网站部署失败：${runs[0].url}`);deployed=runs[0];break;}
    await sleep(15000);
  }
  if(!deployed)throw new Error("网站部署未在等待时间内完成。");
  const localManifest=JSON.parse(await readFile(resolve(root,"data/classical-translations/manifest.json"),"utf8"));
  const expected=Number(localManifest.coverage.semanticAlignedGeneratedCount||0);
  let visible=false;
  for(let attempt=0;attempt<12;attempt++){
    const [response,statusResponse]=await Promise.all([
      fetch(`${site}data/classical-translations/manifest.json?semantic=${sha}-${attempt}`,{signal:AbortSignal.timeout(30000)}),
      fetch(`${site}data/classical-translations/semantic-status.json?semantic=${sha}-${attempt}`,{signal:AbortSignal.timeout(30000)})
    ]);
    if(response.ok&&statusResponse.ok&&Number((await response.json()).coverage.semanticAlignedGeneratedCount||0)>=expected
      &&(await statusResponse.json()).updatedAt===publicStatus.updatedAt){visible=true;break;}await sleep(10000);
  }
  if(!visible)throw new Error("公开网站尚未返回新一批结果，检查点已保留。");
  state.published=expected+Object.keys(publicStatus.editorial).length;
  state.publications.push({sha,count:results.length,url:deployed.url,completedAt:new Date().toISOString()});
  state.status="running";await save();
}

async function run(){
  await mkdir(stateDir,{recursive:true});await mkdir(dirname(page),{recursive:true});
  if(existsSync(stopPath)){state.status="stopped";await save();return;}
  if(existsSync(statePath)){
    const previous=JSON.parse(await readFile(statePath,"utf8"));
    if(previous.pid!==process.pid){try{process.kill(previous.pid,0);if(Date.now()-Date.parse(previous.updatedAt)<180000)return;}catch(error){if(error.code!=="ESRCH")throw error;}}
    state.startedAt=previous.startedAt;state.publications=previous.publications||[];
  }
  if(options.publish)await syncPublishedBranch();
  let publicStatus=existsSync(publicStatusPath)?JSON.parse(await readFile(publicStatusPath,"utf8")):{schemaVersion:1,holds:{},editorial:{}};
  const plan=createSemanticPlan(await readBuiltRecords());state.total=plan.length;
  state.cloudAccepted=plan.filter(entry=>entry.record?.model===CLOUD_MODEL&&entry.record?.alignment?.verification?.verdict==="pass").length
    +Object.values(publicStatus.editorial).filter(value=>value.alignment?.verification?.model===CLOUD_MODEL).length;
  const accepted=await readRepairCheckpoint(checkpoint),events=await readRepairCheckpoint(journalPath);
  const latest=new Map(accepted.filter(result=>result.editorial
    ? result.alignment?.verification?.promptVersion===SEMANTIC_PROMPT_VERSION
    : result.record?.promptVersion===SEMANTIC_PROMPT_VERSION).map(result=>[result.id,result]));
  const held=new Map(events.filter(event=>event.status==="held"&&event.promptVersion===SEMANTIC_PROMPT_VERSION).map(event=>[event.id,event]));
  const queue=[],pending=[];
  for(const entry of plan){
    const id=entry.job.id,alignment=entry.editorial?publicStatus.editorial[id]?.alignment:entry.record?.alignment;
    if(validateClassicalAlignment(entry.job.lines,entry.paragraphs,alignment,{requireSemantic:true}).valid){state.processed++;state.accepted++;continue;}
    const result=latest.get(id);
    if(result?.inputHash===entry.inputHash){pending.push(result);state.processed++;state.accepted++;if(result.record?.model===CLOUD_MODEL||result.alignment?.verification?.model===CLOUD_MODEL)state.cloudAccepted++;continue;}
    const sourceIssue=sourceIntegrityIssue(entry.job),prior=held.get(id);
    if(sourceIssue||(prior&&prior.inputHash===entry.inputHash)){
      publicStatus.holds[id]=sourceIssue||prior.code;state.processed++;state.held++;if(sourceIssue)state.sourceHolds++;continue;
    }
    queue.push(entry);
  }
  const requested=options.ids?.split(",");
  const priority=new Set(["open-song-ci-6c21623b391cd27c807b","open-shijing-7cf1017a93707344f308","open-tang-12fdaad8-b197-4526-b56d-c7c713267248","open-song-ci-54ac1bc59a84faaee750"]);
  queue.sort((a,b)=>Number(priority.has(b.job.id))-Number(priority.has(a.job.id))
    ||Number(b.editorial)-Number(a.editorial)||a.job.sourceCharacterCount-b.job.sourceCharacterCount||a.job.id.localeCompare(b.job.id));
  if(options.publish){
    const [manifestResponse,statusResponse]=await Promise.all([
      fetch(`${site}data/classical-translations/manifest.json?resume=${Date.now()}`,{signal:AbortSignal.timeout(30000)}),
      fetch(`${site}data/classical-translations/semantic-status.json?resume=${Date.now()}`,{signal:AbortSignal.timeout(30000)})
    ]);
    if(!manifestResponse.ok||!statusResponse.ok)throw new Error("无法确认公开网站的当前核对进度。");
    const live=await manifestResponse.json(),liveStatus=await statusResponse.json();
    state.published=Number(live.coverage.semanticAlignedGeneratedCount||0)+Object.keys(liveStatus.editorial||{}).length;
  }
  await save();heartbeat=setInterval(()=>save().catch(error=>console.error(error.message)),15000);
  if(pending.length){await publish(pending,publicStatus);pending.length=0;}
  const selected=requested?queue.filter(entry=>requested.includes(entry.job.id)):queue;
  let config=null,catalog=null;
  const getLocalConfig=async()=>{state.activeModel="Qwen3.5-9B-Alignment";await save();if(!config)config=await startModel();return config;};
  if(selected.length){await startCloud();if(!cloud)await getLocalConfig();catalog=await loadClassicalGlossary();}
  state.status="running";await save();
  for(const entry of selected){
    if(existsSync(stopPath))break;
    state.current={id:entry.job.id,title:entry.job.title,poet:entry.job.poet,startedAt:new Date().toISOString()};await save();
    try{
      const result=await repairWithCloudFallback(entry,{cloud,cloudConfig,getLocalConfig,catalog,repair:repairSemanticTranslation,onCloudStop:stopCloud});
      await appendFile(checkpoint,JSON.stringify(result)+"\n");pending.push(result);state.accepted++;
      if(result.record?.model===CLOUD_MODEL||result.alignment?.verification?.model===CLOUD_MODEL)state.cloudAccepted++;
      await appendFile(journalPath,JSON.stringify({id:result.id,inputHash:entry.inputHash,status:"accepted",promptVersion:SEMANTIC_PROMPT_VERSION,at:new Date().toISOString()})+"\n");
      if(cloud?.stopAfterResult)await stopCloud(cloud.stopAfterResult);
    }catch(error){
      // Connectivity and runtime failures must retry after restart; never mark
      // thousands of unprocessed works as semantic failures after the GPU dies.
      if(/Local model|request failed|timed out/.test(error.message)||(server&&server.exitCode!==null))throw error;
      if(error.candidate)await appendFile(resolve(stateDir,"rejected.jsonl"),JSON.stringify(error.candidate)+"\n");
      const code=error.message.split(":")[0];publicStatus.holds[entry.job.id]=code;state.held++;
      await appendFile(journalPath,JSON.stringify({id:entry.job.id,inputHash:entry.inputHash,status:"held",code,message:error.message,promptVersion:SEMANTIC_PROMPT_VERSION,at:new Date().toISOString()})+"\n");
    }
    state.processed++;await save();
    const batchSize=state.publications.length ? options.batchSize : 2;
    if(pending.length>=batchSize&&!existsSync(stopPath)){await publish(pending,publicStatus);pending.length=0;}
  }
  if(!existsSync(stopPath))await publish(pending,publicStatus);
  state.current=null;state.status=existsSync(stopPath)?"stopped":state.held?"needs_review":"complete";await save();
}
try{await run();}
catch(error){state.status="failed";state.error=error.message;await save();console.error(error.message);process.exitCode=1;}
finally{if(heartbeat)clearInterval(heartbeat);cloud?.close();if(server&&server.exitCode===null)server.kill();await saveQueue;}

import test from "node:test";
import assert from "node:assert/strict";
import { parseSemanticResponse, parseContentReview, reconcileSemanticGroups, repairSemanticTranslation, createSemanticPlan, sourceIntegrityIssue, semanticRegressionIssues } from "../scripts/semantic-classical-translations.mjs";
import { sourceHashFor, validateDraftRecords, readBuiltRecords } from "../scripts/classical-translation-pipeline.mjs";
import { alignClassicalReadingUnits } from "../src/classical-reading.js";

const job = { id:"semantic-fixture",kind:"詩",title:"試詩",poet:"作者",dynasty:"唐",lines:["故人具雞黍","邀我至田家","把酒話桑麻"],sourceCharacterCount:15 };
job.sourceHash=sourceHashFor(job);
const fragments=job.lines.map((text,lineIndex)=>({id:`s0000${lineIndex+1}p1`,text,lineIndex}));
const paragraphs=["我們端着酒杯談論農事。","老朋友準備了雞肉和黃米飯，邀請我到他鄉下的家做客。"];
const groups=[{sourceIds:fragments.slice(0,2).map(f=>f.id),sourceQuotes:job.lines.slice(0,2),translationIds:["t00002"],meaning:"朋友準備飯菜邀我做客",uncertain:false},
  {sourceIds:[fragments[2].id],sourceQuotes:[job.lines[2]],translationIds:["t00001"],meaning:"舉杯談農事",uncertain:false}];
const response=(value)=>({choices:[{finish_reason:"stop",message:{content:JSON.stringify(value)}}]});
const config={baseUrl:"http://127.0.0.1:8080/v1",model:"test",modelRevision:"sha-fixture",temperature:0.1,maxTokens:4096};
const catalog={source:"Test dictionary",version:"1",sourceSha256:"a".repeat(64),upstreamSourceSha256:"",entriesByFirstCharacter:new Map()};

test("semantic groups recover reordered, many-to-one translations without rewriting protected text",async()=>{
  const review={reviewer:"Owner",reviewedAt:"2026-10-01T00:00:00Z",note:"Keep these words"};
  const entry={job,paragraphs,preserveText:true,editorial:false,inputHash:"fixture",record:{status:"pending-review",review,editorialTriage:"initially-usable"}};
  const requests=[];
  const result=await repairSemanticTranslation(entry,config,catalog,{requestImpl:async(request)=>{
    const input=JSON.parse(request.messages[1].content); requests.push(input);
    if(input.groups)return response({checks:Object.fromEntries(input.groups.map(group=>[group.id,{
      sourceMeaning:"朋友招待做客或談論農事",translationMeaning:"朋友招待做客或談論農事",
      accurate:true,complete:true,noAddedMeaning:true,uncertain:false,issues:[]
    }]))});
    return response({verdict:"pass",issues:[],groups});
  }});
  assert.equal(requests.length,2);
  assert.ok(requests[0].translations && requests[1].groups);
  assert.deepEqual(requests[1].groups[0].source,job.lines.slice(0,2));
  assert.deepEqual(requests[1].groups[0].translation,[paragraphs[1]]);
  assert.ok(requests.every((request)=>!JSON.stringify(request).includes('朋友準備飯菜邀我做客')),"the independent reviewer must not see the first pass's interpretation");
  assert.deepEqual(result.record.paragraphs,paragraphs);
  assert.deepEqual(result.record.review,review);
  assert.equal(validateDraftRecords([result.record],{jobs:[job]}).valid,true);
  const units=alignClassicalReadingUnits(job.lines.map(text=>({text})),result.record);
  assert.equal(units.length,2);
  assert.equal(units[0].sourceLines.length,2);
  assert.deepEqual(units.map(unit=>unit.translations[0]),[paragraphs[1],paragraphs[0]]);
});

test("content review rejects omitted or invented meaning despite a structurally complete mapping",()=>{
  const check={sourceMeaning:"朋友邀請做客",translationMeaning:"我邀朋友做客",accurate:false,complete:true,noAddedMeaning:true,uncertain:false,issues:["主客顛倒"]};
  assert.throws(()=>parseContentReview(response({checks:{g1:check}}),[{}]),/content-rejected/);
  assert.throws(()=>parseContentReview(response({checks:{}}),[{}]),/coverage/);
});

test("machine drafts are regenerated without exposing the old mistaken translation",async()=>{
  const inputs=[];
  const result=await repairSemanticTranslation({job,paragraphs:["錯誤舊譯：我邀朋友到我家"],preserveText:false,editorial:false,inputHash:"fixture"},config,catalog,{
    requestImpl:async(request)=>{
      const input=JSON.parse(request.messages[1].content);inputs.push(input);
      if(input.groups)return response({checks:Object.fromEntries(input.groups.map(group=>[group.id,{
        sourceMeaning:"朋友邀我做客，舉杯談農事",translationMeaning:"朋友邀我做客，舉杯談農事",accurate:true,complete:true,noAddedMeaning:true,uncertain:false,issues:[]
      }]))});
      return response({verdict:"pass",issues:[],groups:groups.map(group=>({sourceIds:group.sourceIds,sourceQuotes:group.sourceQuotes,
        paragraphs:group.translationIds.map(id=>paragraphs[Number(id.slice(1))-1]),meaning:group.meaning,uncertain:false}))});
    }
  });
  assert.equal(inputs[0].translations,undefined);
  assert.ok(inputs.every(input=>!JSON.stringify(input).includes("錯誤舊譯")));
  assert.equal(result.rewritten,true);
  assert.deepEqual(result.record.paragraphs,[paragraphs[1],paragraphs[0]]);
});

test("observed semantic mistakes cannot be approved again by the same model",()=>{
  const xin={kind:"詞",lines:["英雄無覓","風流總被","金戈鐵馬","元嘉草草","封狼居胥"]};
  assert.equal(semanticRegressionIssues(xin,["風流韻事，騎著鐵馬，學劉裕在狼居胥山封禪，向北追趕敗敵。"]).length,4);
  assert.deepEqual(semanticRegressionIssues(xin,["英雄的功業已成往事；雄壯的軍隊氣吞萬里。草率出兵，最後卻敗退北望。"]),[]);
  const du={kind:"詩",lines:["陰陽割昏曉","盪胷生曾雲"]};
  assert.equal(semanticRegressionIssues(du,["陰陽兩界，雲氣從胸中升起。"]).length,2);
  assert.deepEqual(semanticRegressionIssues(du,["山的南北明暗分明；層雲湧起，使人胸懷激蕩。"]),[]);
});

test("an independent audit cannot bless crossed meanings by merging the whole poem",()=>{
  const f=fragments.slice(0,2);
  const a=[{sourceIds:[f[0].id],translationIndexes:[0]},{sourceIds:[f[1].id],translationIndexes:[1]}];
  const reversed=[{sourceIds:[f[0].id],translationIndexes:[1]},{sourceIds:[f[1].id],translationIndexes:[0]}];
  assert.throws(()=>reconcileSemanticGroups(a,reversed,f),/disagreement/);
  const combined=[{sourceIds:f.map(x=>x.id),translationIndexes:[0,1]}];
  assert.deepEqual(reconcileSemanticGroups(a,combined,f),combined);
});

test("semantic evidence rejects changed quotes, missing passages and duplicate candidate IDs",()=>{
  const good={verdict:"pass",issues:[],groups};
  assert.equal(parseSemanticResponse(response(good),fragments,paragraphs).groups.length,2);
  const wrongQuote=structuredClone(good);wrongQuote.groups[0].sourceQuotes[0]="朋友沒有準備飯菜";
  const duplicate=structuredClone(good);duplicate.groups[1].translationIds=["t00002"];
  const missing=structuredClone(good);missing.groups.pop();
  const uncertain=structuredClone(good);uncertain.groups[0].uncertain=true;
  for(const item of [wrongQuote,duplicate,missing,uncertain])assert.throws(()=>parseSemanticResponse(response(item),fragments,paragraphs));
});

test("the full semantic plan includes equal-count and editorial works and detects malformed source titles",async()=>{
  const plan=createSemanticPlan(await readBuiltRecords());
  assert.equal(plan.length,17373);
  assert.equal(plan.filter(entry=>entry.editorial).length,184);
  assert.ok(plan.some(entry=>entry.paragraphs.length===entry.job.lines.length && !entry.editorial));
  assert.equal(sourceIntegrityIssue({kind:"曲",title:"小梁州・虛敞似瑤台十二層，滿目空清。金精光射玉壺冰，轩窗靜，何用",lines:["九枝燈"]}),"source-verse-in-title");
  assert.equal(sourceIntegrityIssue({kind:"曲",title:"詐妮子調風月・混江龍",lines:["正文"]}),null);
});

import {describe,it,expect,afterEach} from "vitest";
import {startTrial,allTrials,updateTrial} from "@/lib/team-trials";
const id=crypto.randomUUID();
const plan={id,tool:"Radar",goal:"Trial",owner:"Team",date:"2027-04-20",criterion:"Review",reason:"Test"};
const key="ea-team-trial:v1:"+id;
afterEach(()=>localStorage.removeItem(key));
describe("stored trial integrity",()=>{
 it("preserves completed attempts and defaults a missing feedback list",()=>{
   startTrial(plan);
   const record=JSON.parse(localStorage.getItem(key)!);delete record.feedback;
   record.attempts=[{id:crypto.randomUUID(),task:"Review",result:"Done",link:"file:///sample"}];
   localStorage.setItem(key,JSON.stringify(record));
   expect(allTrials()[0]).toMatchObject({id,feedback:[],attempts:[{result:"Done",link:""}]});
 });
 it("skips malformed records without deleting the original",()=>{
   const raw=JSON.stringify({...plan,attempts:[null],reviews:[]});
   localStorage.setItem(key,raw);
   expect(allTrials()).toHaveLength(0);
   expect(()=>updateTrial(id,t=>t)).toThrow();
   expect(localStorage.getItem(key)).toBe(raw);
 });
});

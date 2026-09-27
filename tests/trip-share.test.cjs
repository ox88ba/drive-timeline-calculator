const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('share code lifecycle, validation and expiry',async()=>{
 const {tripShare}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../worker/trip-share.js'))).toString('base64'));
 const store=new Map(); let conflicts=0, inserts=0;
 const env={AI_RATE_LIMITER:{limit:async()=>({success:true})},TRIP_SHARES:{prepare(sql){return {bind(...args){return {
  first:async()=>store.get(args[0]),
  run:async()=>{if(sql.startsWith('DELETE'))return {meta:{changes:0}};inserts++;if(conflicts>0){conflicts--;return {meta:{changes:0}};}if(store.has(args[0]))return {meta:{changes:0}};store.set(args[0],{trip:args[1],expires_at:args[2]});return {meta:{changes:1}};}
 };}};}}};
 const request=(method,body,code='')=>new Request('https://road-api.ox88.work/api/trip-share'+(code?'?code='+code:''),{method,headers:{origin:'https://road.ox88.work'},...(body?{body:JSON.stringify(body)}:{})});
 const trip={v:1,dep:'2030-09-30T10:00:00Z',d:[{n:'测试',la:30,lo:110}]};
 conflicts=1;
 const created=await tripShare(request('POST',trip),env);assert.equal(created.status,201);const {code,expiresAt}=await created.json();assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(inserts,2);assert.ok(Math.abs(expiresAt-Date.now()-7*86400000)<1000);
 assert.deepEqual((await (await tripShare(request('GET',null,code),env)).json()).trip,trip);
 assert.equal((await tripShare(request('POST',{v:0}),env)).status,400);
 assert.equal((await tripShare(request('GET',null,'bad'),env)).status,400);
 assert.equal((await tripShare(request('GET',null,'O0I1AB'),env)).status,400);
 assert.equal((await tripShare(request('GET',null,'222222'),env)).status,404);
 conflicts=8;assert.equal((await tripShare(request('POST',trip),env)).status,503);assert.equal(store.size,1);
 store.get(code).expires_at=0;assert.equal((await tripShare(request('GET',null,code),env)).status,404);
 assert.equal((await tripShare(request('POST',trip),{})).status,503);
 env.AI_RATE_LIMITER.limit=async()=>({success:false});assert.equal((await tripShare(request('POST',trip),env)).status,429);
});

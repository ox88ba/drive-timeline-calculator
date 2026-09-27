export async function tripShare(request, env) {
  try { return await handleTripShare(request, env); }
  catch { return Response.json({message:'分享码服务暂不可用，请使用完整行程链接。'},{status:503,headers:{'cache-control':'no-store'}}); }
}

async function handleTripShare(request, env) {
  const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
  if (!env.TRIP_SHARES || !env.AI_RATE_LIMITER) return reply({message:'分享码服务尚未配置，请使用完整行程链接。'},503);
  if (!['https://road.ox88.work','https://ox88ba.github.io'].includes(request.headers.get('origin'))) return reply({message:'请求来源无效'},403);
  const allowed=await env.AI_RATE_LIMITER.limit({key:'share:'+ (request.headers.get('CF-Connecting-IP')||'unknown')});
  if(!allowed.success)return reply({message:'操作频繁，请稍后再试。'},429);
  const url=new URL(request.url);
  if(request.method==='GET') {
    const code=(url.searchParams.get('code')||'').replace(/[-\s]/g,'').toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return reply({message:'分享码格式不正确。'},400);
    const data=await env.TRIP_SHARES.prepare('SELECT trip, expires_at FROM trip_shares WHERE code = ?').bind(code).first();
    if(!data || data.expires_at<=Date.now())return reply({message:'分享码不存在或已过期，请索取新的分享码。'},404);
    return reply({trip:JSON.parse(data.trip),expiresAt:data.expires_at});
  }
  if(request.method!=='POST')return reply({message:'请求方法不受支持。'},405);
  const reader=request.body?.getReader(); if(!reader)return reply({message:'内容为空'},400);
  let size=0; const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return reply({message:'行程过大，请使用完整链接。'},413);}chunks.push(value);}
  let trip;try{trip=JSON.parse(await new Blob(chunks).text());}catch{return reply({message:'行程格式错误'},400);}
  if(trip?.v!==1 || !Number.isFinite(Date.parse(trip.dep)) || !Array.isArray(trip.d) || !trip.d.length || trip.d.length>200 || trip.d.some(d=>!d || typeof d!=='object'))return reply({message:'行程格式错误'},400);
  const expiresAt=Date.now()+7*86400000;
  await env.TRIP_SHARES.prepare('DELETE FROM trip_shares WHERE code IN (SELECT code FROM trip_shares WHERE expires_at <= ? LIMIT 100)').bind(Date.now()).run();
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols; no 0/O/1/I.
  for(let attempt=0;attempt<8;attempt++) {
    const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>alphabet[b & 31]).join('');
    // Atomic uniqueness: concurrent requests cannot overwrite an existing trip.
    const result=await env.TRIP_SHARES.prepare('INSERT INTO trip_shares (code, trip, expires_at) VALUES (?, ?, ?) ON CONFLICT(code) DO NOTHING').bind(code,JSON.stringify(trip),expiresAt).run();
    if(result.meta.changes===1)return reply({code,expiresAt},201);
  }
  return reply({message:'分享码生成繁忙，请重试或使用完整链接。'},503);
}

const TOKEN="EAARjhXZAl5RIBRaIkVTZCWL3m6BZAEzZBFrUqBwF2vh0ZC4P6PcHASSKC5alYe8xVU6n9JQHEWrem1n3ZAvPVRUPJv99RszRRZCS0h6vZAO9ZBAUarep94dHPZAOAX98BChxtaNLUmQDNZCfWAiRZCPN1WzSAOoFTCzxGWRyMceBvvJH7MPBE1HQdmNwZCysTNOfqYBXcUwZDZD";
const V="v21.0";
const r=await fetch(`https://graph.facebook.com/${V}/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`);
const j=await r.json();
const gs=j?.data?.granular_scopes||[];
let wabas=[];
for(const g of gs){ if(/whatsapp/i.test(g.scope) && g.target_ids){ wabas.push(...g.target_ids); } }
wabas=[...new Set(wabas)];
console.log("WABA ids:", wabas.join(", ")||"(ninguno)");
for(const waba of wabas){
  const r2=await fetch(`https://graph.facebook.com/${V}/${waba}/message_templates?fields=name,language,status,category&limit=100&access_token=${TOKEN}`);
  const j2=await r2.json();
  console.log(`\n== WABA ${waba} ==`);
  for(const t of (j2.data||[])) console.log(`  ${String(t.name).padEnd(28)} lang=${String(t.language).padEnd(7)} ${t.status} ${t.category}`);
  if((j2.data||[]).length===0) console.log("  (sin plantillas o error)", JSON.stringify(j2).slice(0,200));
}
process.exit(0);

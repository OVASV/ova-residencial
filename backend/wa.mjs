const TOKEN="EAARjhXZAl5RIBRaIkVTZCWL3m6BZAEzZBFrUqBwF2vh0ZC4P6PcHASSKC5alYe8xVU6n9JQHEWrem1n3ZAvPVRUPJv99RszRRZCS0h6vZAO9ZBAUarep94dHPZAOAX98BChxtaNLUmQDNZCfWAiRZCPN1WzSAOoFTCzxGWRyMceBvvJH7MPBE1HQdmNwZCysTNOfqYBXcUwZDZD";
const PHONE="1157810380739496";
const V="v21.0";
// 1) info del número + WABA padre
const r1=await fetch(`https://graph.facebook.com/${V}/${PHONE}?fields=display_phone_number,verified_name,whatsapp_business_account{id,name}&access_token=${TOKEN}`);
const j1=await r1.json();
console.log("Número:", JSON.stringify(j1));
const waba=j1?.whatsapp_business_account?.id;
if(!waba){ console.log("No pude obtener WABA id"); process.exit(0); }
// 2) listar plantillas
const r2=await fetch(`https://graph.facebook.com/${V}/${waba}/message_templates?fields=name,language,status,category&limit=100&access_token=${TOKEN}`);
const j2=await r2.json();
console.log("\nPlantillas en la cuenta:");
for(const t of (j2.data||[])) console.log(`  ${String(t.name).padEnd(30)} lang=${String(t.language).padEnd(7)} status=${t.status} cat=${t.category}`);
if((j2.data||[]).length===0) console.log("  (ninguna)", JSON.stringify(j2).slice(0,300));

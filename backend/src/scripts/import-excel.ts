import XLSX from "xlsx";

const BASE = "http://localhost:3010/api/v1";
const EXCEL = "C:/OVA_DTE/Base completa pagos.xlsx";

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  // Login
  const { token } = await api("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "superadmin@lospinos.gt", password: "admin123" }),
  });

  const complejos = await api("/complejos", { headers: { Authorization: `Bearer ${token}` } });
  const complejoId = complejos[0].id;
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Complejo-ID": complejoId };

  // Load catalogs
  const bloques = await api("/config/bloques", { headers: h });
  const calles = await api("/config/calles", { headers: h });
  const pisos = await api("/config/pisos", { headers: h });
  const estados = await api("/config/estados", { headers: h });
  const existingUnidades = await api("/unidades", { headers: h });

  const bloqueA = bloques.find((b: any) => b.nombre === "A");
  const piso1 = pisos.find((p: any) => p.nombre === "1");

  // Map Excel calle names to catalog IDs
  const calleMap: Record<string, string> = {
    PALMERAS: calles.find((c: any) => c.nombre.includes("Palmeras"))?.id,
    "LOS COCOS": calles.find((c: any) => c.nombre.includes("Cocos"))?.id,
    ALMENDROS: calles.find((c: any) => c.nombre.includes("Almendros"))?.id,
    "AV EL MIRADOR": calles.find((c: any) => c.nombre.includes("Mirador"))?.id,
    LIMONES: calles.find((c: any) => c.nombre.includes("Limones"))?.id,
    HIGUEROS: calles.find((c: any) => c.nombre.includes("Higueros"))?.id,
  };

  // Map estatus to estado IDs
  const estadoMap: Record<string, string> = {
    CASA: estados.find((e: any) => e.nombre === "Construida")?.id,
    TERRENO: estados.find((e: any) => e.nombre === "Sin construcción")?.id,
    AIRBNB: estados.find((e: any) => e.nombre === "Airbnb")?.id,
    CONSTRUCCION: estados.find((e: any) => e.nombre === "En construcción")?.id,
  };

  console.log("Bloque A:", bloqueA?.id);
  console.log("Piso 1:", piso1?.id);
  console.log("Calle map:", calleMap);
  console.log("Estado map:", estadoMap);

  // Read Excel
  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets["Sheet1"];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  const existingIds = new Set(existingUnidades.map((u: any) => u.id));
  let created = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (!lote) { skipped++; continue; }

    const calleExcel = row.CALLE?.trim();
    const idCalle = calleMap[calleExcel];
    const estatus = row.ESTATUS?.trim();
    const idEstado = estadoMap[estatus];
    const nombre = row.NOMBRE?.trim() ?? "";
    const telefono = row.TELEFONO != null ? String(row.TELEFONO).trim() : null;
    const email = row.EMAIL != null ? String(row.EMAIL).trim() : null;

    if (!idCalle) {
      console.log(`SKIP ${lote}: calle "${calleExcel}" no mapeada`);
      skipped++;
      continue;
    }

    // Check if already exists
    if (existingIds.has(lote)) {
      console.log(`SKIP ${lote}: ya existe`);
      skipped++;
      continue;
    }

    try {
      // Create unidad
      const unidad = await api("/unidades", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          id_bloque: bloqueA.id,
          id_calle: idCalle,
          id_piso: piso1?.id ?? null,
          numero_propiedad: lote,
          area_m2: null,
        }),
      });
      console.log(`✓ Unidad ${unidad.id} (${lote})`);

      // Assign estado/categoría
      if (idEstado) {
        await api(`/unidades/${encodeURIComponent(unidad.id)}/estado`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ id_estado: idEstado, fecha_inicio: "2022-12-01" }),
        });
      }

      // Create propietario and assign
      if (nombre) {
        const parts = nombre.split(/[/]/)[0].trim().split(/\s+/);
        const apellido = parts.length > 1 ? parts.slice(-2).join(" ") : parts[0];
        const nombreP = parts.length > 2 ? parts.slice(0, -2).join(" ") : parts[0];

        const prop = await api("/propietarios", {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            nombre: nombreP,
            apellido: parts.length > 1 ? apellido : "",
            telefono,
            email,
            asignacion: { id_unidad: unidad.id, fecha_inicio: "2022-12-01" },
          }),
        });
        console.log(`  → Propietario: ${prop.nombre} ${prop.apellido}`);
      }

      created++;
    } catch (err: any) {
      console.error(`ERROR ${lote}:`, err.message);
      errors++;
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${errors} errors`);
}

main().catch(console.error);

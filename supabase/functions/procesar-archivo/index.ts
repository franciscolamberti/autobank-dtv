const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': '*'
};

function obtenerTelefonoPrincipal(row: any): string | null {
  const candidatos = [row[40], row[41], row[38], row[39]];
  for (const tel of candidatos) {
    if (tel && String(tel).trim()) return String(tel).trim();
  }
  return null;
}

function normalizarTelefonoE164(telefono: string | null): string | null {
  if (!telefono) return null;
  let limpio = telefono.trim().replace(/[^\d+]/g, '');
  if (!limpio) return null;

  if (limpio.startsWith('+54')) {
    return limpio.length >= 12 && limpio.length <= 13 ? limpio : null;
  }
  if (limpio.startsWith('54')) {
    const sin = limpio.slice(2);
    return sin.length >= 10 ? `+54${sin}` : null;
  }
  if (limpio.startsWith('011')) {
    const rest = limpio.slice(3);
    return rest.length >= 8 ? `+54911${rest}` : null;
  }
  if (limpio.startsWith('11')) {
    const rest = limpio.slice(2);
    return rest.length >= 8 ? `+54911${rest}` : null;
  }
  if (limpio.startsWith('0') && limpio.length >= 8) {
    const area = limpio.slice(1, 4);
    const numero = limpio.slice(4);
    return numero.length >= 6 ? `+54${area}${numero}` : null;
  }
  if (/^\d{10}$/.test(limpio)) {
    return `+54911${limpio}`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { bucket, path } = await req.json();
    if (!bucket || !path) {
      return new Response(
        JSON.stringify({ error: 'faltan parámetros: bucket, path' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(path);

    if (downloadError) {
      return new Response(
        JSON.stringify({ error: `error descargando archivo: ${downloadError.message}` }),
        { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();

    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const ref = sheet['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);

    const rows: any[] = [];
    for (let R = 0; R <= range.e.r; R++) {
      const row: any[] = [];
      for (let C = 0; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = (sheet as any)[addr];
        row.push(cell ? cell.v : null);
      }
      rows.push(row);
    }

    // Construir personas y deduplicar
    const personas: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const lonRaw = row[32];
      const latRaw = row[33];
      if (latRaw == null || lonRaw == null) continue;
      let lat = parseFloat(latRaw);
      let lon = parseFloat(lonRaw);
      if (isNaN(lat) || isNaN(lon)) continue;
      if (Math.abs(lat) > 180) lat = lat / 1000000;
      if (Math.abs(lon) > 180) lon = lon / 1000000;

      const tel = obtenerTelefonoPrincipal(row);
      if (!tel) continue;
      const normalizado = normalizarTelefonoE164(tel) || tel;

      personas.push({
        fila: i + 1,
        nroCliente: String(row[0] || '').trim(),
        nroWO: String(row[1] || '').trim(),
        telefonoPrincipal: tel,
        telefonoNormalizado: normalizado,
        apellidoNombre: String(row[28] || '').trim(),
        dni: String(row[29] || '').trim(),
        direccionCompleta: `${String(row[30] || '').trim()} ${String(row[31] || '').trim()}`.trim(),
        cp: String(row[35] || '').trim(),
        localidad: String(row[36] || '').trim(),
        provincia: String(row[37] || '').trim(),
        lat,
        lon
      });
    }

    const byCliente = new Map<string, any>();
    const byTelefono = new Map<string, any>();

    for (const p of personas) {
      const keyCliente = p.nroCliente && p.nroCliente.trim();
      if (keyCliente) {
        if (!byCliente.has(keyCliente)) {
          byCliente.set(keyCliente, { ...p, nrosCliente: [p.nroCliente], nrosWO: [p.nroWO], cantidadDecos: 1 });
        } else {
          const ex = byCliente.get(keyCliente);
          ex.nrosCliente.push(p.nroCliente);
          ex.nrosWO.push(p.nroWO);
          ex.cantidadDecos++;
        }
      } else {
        const keyTel = p.telefonoNormalizado || p.telefonoPrincipal;
        if (!byTelefono.has(keyTel)) {
          byTelefono.set(keyTel, { ...p, nrosCliente: p.nroCliente ? [p.nroCliente] : [], nrosWO: [p.nroWO], cantidadDecos: 1 });
        } else {
          const ex = byTelefono.get(keyTel);
          if (p.nroCliente) ex.nrosCliente.push(p.nroCliente);
          ex.nrosWO.push(p.nroWO);
          ex.cantidadDecos++;
        }
      }
    }

    const deduplicadas: any[] = [];
    for (const v of byCliente.values()) deduplicadas.push(v);
    for (const v of byTelefono.values()) {
      const exists = deduplicadas.some((d) => d.telefonoNormalizado === v.telefonoNormalizado);
      if (!exists) deduplicadas.push(v);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stage: 'normalize-dedupe',
        totalRows: rows.length,
        personasRaw: personas.length,
        personasDeduplicadas: deduplicadas.length
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json', ...corsHeaders }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        stage: 'normalize-dedupe',
        error: error instanceof Error ? error.message : 'unknown error'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json', ...corsHeaders }
      }
    );
  }
});

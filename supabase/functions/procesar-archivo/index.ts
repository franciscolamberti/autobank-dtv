// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

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

function normalizarTelefonoE164(original: string | null): string | null {
  if (!original) return null;
  let s = String(original).trim();
  // Keep '+' for final build only
  s = s.replace(/[^\d+]/g, '');
  // Remove leading '+' and '00'
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  // Strip country code if present
  if (s.startsWith('54')) s = s.slice(2);
  // Remove trunk '0'
  if (s.startsWith('0')) s = s.slice(1);

  // Handle Buenos Aires (11)
  if (s.startsWith('11')) {
    let local = s.slice(2);
    if (local.startsWith('15')) local = local.slice(2);
    // Use 8 digits for BA local
    local = local.replace(/\D/g, '').slice(0, 8);
    if (local.length < 6) return null;
    return `+54911${local}`;
  }

  // Generic area codes (2-4 digits). Approximate by taking first 3 or 4 if length allows.
  // Prefer 3-digit area code if number seems to include mobile '15'
  let area = '';
  let local = '';
  // Try 4-digit area first (common), else 3, else 2
  for (const len of [4, 3, 2]) {
    if (s.length >= len + 6) { // ensure reasonable local length remains
      area = s.slice(0, len);
      local = s.slice(len);
      break;
    }
  }
  if (!area) {
    // Fallback: if total 10 digits, assume BA without explicit 11 (rare)
    if (/^\d{10}$/.test(s)) {
      let loc = s;
      if (loc.startsWith('15')) loc = loc.slice(2);
      loc = loc.slice(0, 8);
      return `+54911${loc}`;
    }
    return null;
  }
  if (local.startsWith('15')) local = local.slice(2);
  local = local.replace(/\D/g, '').slice(0, 8);
  if (local.length < 6) return null;
  return `+549${area}${local}`;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { bucket, path, campana_id } = await req.json();
    if (typeof bucket !== 'string' || typeof path !== 'string' || bucket.trim() === '' || path.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'parámetros inválidos: bucket y path (string no vacío)' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    // @ts-ignore - remote import in Deno runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(path);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: `error descargando archivo: ${downloadError?.message || 'blob vacío'}` }),
        { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();

    // @ts-ignore - remote import in Deno runtime
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Excel inválido: sin hojas' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return new Response(
        JSON.stringify({ error: 'Excel inválido: hoja 0 inexistente' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    const ref = sheet['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    if (range.e.r < 0 || range.e.c < 0) {
      return new Response(
        JSON.stringify({ error: 'Excel vacío (sin rango válido)' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    const MAX_EXCEL_ROWS = parseInt(Deno.env.get('MAX_EXCEL_ROWS') || '20000');
    const totalRowsExpected = range.e.r + 1;
    if (totalRowsExpected > MAX_EXCEL_ROWS) {
      return new Response(
        JSON.stringify({ error: `Excel demasiado grande: ${totalRowsExpected} filas (máximo ${MAX_EXCEL_ROWS})` }),
        { status: 413, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

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

    if (rows.length <= 1) {
      return new Response(
        JSON.stringify({ error: 'Excel sin datos (solo encabezado o vacío)' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    const personas: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const lonRaw = row[32];
      const latRaw = row[33];

      let lat: number | null = null;
      let lon: number | null = null;
      if (latRaw != null && lonRaw != null) {
        const latNum = parseFloat(latRaw);
        const lonNum = parseFloat(lonRaw);
        if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
          lat = Math.abs(latNum) > 180 ? latNum / 1000000 : latNum;
          lon = Math.abs(lonNum) > 180 ? lonNum / 1000000 : lonNum;
        }
      }

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

    if (!campana_id) {
      return new Response(
        JSON.stringify({
          ok: true,
          stage: 'db-insert-skip',
          reason: 'campana_id requerido para insertar en DB',
          totalRowsExcel: rows.length,
          personasRaw: personas.length,
          personasDeduplicadas: deduplicadas.length
        }),
        { status: 200, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    let distanciaMax = 2000;
    let kapsoPhoneNumberId: string | null = null;
    {
      const { data: campana } = await supabase
        .from('campanas')
        .select('distancia_max, kapso_phone_number_id')
        .eq('id', campana_id)
        .single();
      if (campana && typeof campana.distancia_max === 'number') distanciaMax = campana.distancia_max;
      if (campana && typeof campana.kapso_phone_number_id === 'string') kapsoPhoneNumberId = campana.kapso_phone_number_id;
    }

    const { data: puntosPickit } = await supabase
      .from('puntos_pickit')
      .select('id, nombre, direccion, lat, lon');

    const personasParaInsertar: any[] = [];
    let dentro = 0;
    let fuera = 0;
    const fueraRangoListado: any[] = [];

    const validarWa = (Deno.env.get('VALIDAR_WA') || 'false').toLowerCase() === 'true';
    const kapsoApiKey = Deno.env.get('KAPSO_API_KEY') || null;

    async function validarWhatsappKapso(telefonoNormalizado: string): Promise<boolean | null> {
      if (!kapsoPhoneNumberId || !kapsoApiKey || !telefonoNormalizado.startsWith('+54')) return null;
      const waId = telefonoNormalizado.replace(/^\+/, '');
      const url = `https://api.kapso.ai/meta/whatsapp/v23.0/${kapsoPhoneNumberId}/contacts/${waId}`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { headers: { 'X-API-Key': kapsoApiKey }, signal: controller.signal });
        clearTimeout(t);
        if (res.status === 200) return true;
        if (res.status === 404) return null;
        return null;
      } catch (_) {
        clearTimeout(t);
        return null;
      }
    }

    if (Array.isArray(puntosPickit) && puntosPickit.length > 0) {
      for (const p of deduplicadas) {
        let min: number | null = null;
        let nearest: any = null;
        if (typeof p.lat === 'number' && typeof p.lon === 'number') {
          for (const pt of puntosPickit) {
            const d = haversine(p.lat, p.lon, pt.lat, pt.lon);
            if (min === null || d < min) {
              min = d;
              nearest = pt;
            }
          }
        }
        const esDentro = min !== null && min <= distanciaMax;
        if (esDentro) dentro++; else fuera++;

        let tieneWhatsapp: boolean | null = null;
        if (validarWa) {
          const telNorm = p.telefonoNormalizado || p.telefonoPrincipal;
          if (telNorm && typeof telNorm === 'string') {
            tieneWhatsapp = await validarWhatsappKapso(telNorm);
          }
        }

        const registro = {
          campana_id,
          fila_archivo: p.fila,
          nro_cliente: p.nroCliente || null,
          nro_wo: p.nroWO || null,
          nros_cliente: p.nrosCliente || [],
          nros_wo: p.nrosWO || [],
          cantidad_decos: p.cantidadDecos || 1,
          apellido_nombre: p.apellidoNombre || null,
          dni: p.dni || null,
          telefono_principal: p.telefonoNormalizado || p.telefonoPrincipal,
          direccion_completa: p.direccionCompleta || null,
          cp: p.cp || null,
          localidad: p.localidad || null,
          provincia: p.provincia || null,
          lat: p.lat,
          lon: p.lon,
          punto_pickit_id: nearest ? nearest.id : null,
          distancia_metros: min,
          dentro_rango: !!esDentro,
          fuera_de_rango: !esDentro,
          tiene_whatsapp: tieneWhatsapp,
          estado_contacto: 'pendiente',
          razon_creacion: null,
          estado_cliente_original: null
        };

        personasParaInsertar.push(registro);

        if (!esDentro) {
          fueraRangoListado.push({
            'Nro Cliente': registro.nro_cliente || '',
            'Nro WO': registro.nro_wo || '',
            'Nros Cliente': (registro.nros_cliente || []).join(', '),
            'Nros WO': (registro.nros_wo || []).join(', '),
            'Cantidad Decos': registro.cantidad_decos || 1,
            'Apellido y Nombre': p.apellidoNombre || '',
            'DNI': p.dni || '',
            'Teléfono Principal': registro.telefono_principal || '',
            'Dirección Completa': registro.direccion_completa || '',
            'CP': registro.cp || '',
            'Localidad': registro.localidad || '',
            'Provincia': registro.provincia || '',
            'Latitud': registro.lat ?? '',
            'Longitud': registro.lon ?? '',
            'Distancia (metros)': min != null ? Math.round(min) : '',
            'Punto Pickit': nearest?.nombre || '',
            'Dirección Punto Pickit': nearest?.direccion || ''
          });
        }
      }
    }

    // Insertar en lotes
    const chunkSize = 500;
    for (let i = 0; i < personasParaInsertar.length; i += chunkSize) {
      const slice = personasParaInsertar.slice(i, i + chunkSize);
      const { error: insertError } = await supabase
        .from('personas_contactar')
        .insert(slice);
      if (insertError) {
        return new Response(
          JSON.stringify({ error: `error insertando personas: ${insertError.message}` }),
          { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // Generar export fuera de rango
    let exportFileName: string | null = null;
    const MAX_EXPORT_ROWS = parseInt(Deno.env.get('MAX_EXPORT_ROWS') || '15000');
    if (fueraRangoListado.length > 0 && fueraRangoListado.length <= MAX_EXPORT_ROWS) {
      const ws = XLSX.utils.json_to_sheet(fueraRangoListado);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fuera de Rango');
      const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const excelUint8 = new Uint8Array(excelBuffer);
      const name = `export-fuera-rango-${campana_id}-${Date.now()}.xlsx`;
      const { error: uploadError } = await supabase
        .storage
        .from('archivos-dtv')
        .upload(`${campana_id}/${name}`, excelUint8, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      if (!uploadError) exportFileName = name;
    }

    // Actualizar campaña
    {
      const { error: updateError } = await supabase
        .from('campanas')
        .update({ total_personas: deduplicadas.length, personas_dentro_rango: dentro })
        .eq('id', campana_id);
      if (updateError) {
        return new Response(
          JSON.stringify({ error: `error actualizando campaña: ${updateError.message}` }),
          { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stage: 'db-insert',
        totalRowsExcel: rows.length,
        personasRaw: personas.length,
        personasDeduplicadas: deduplicadas.length,
        personasDentroRango: dentro,
        personasFueraRango: fuera,
        export_fuera_rango: exportFileName
      }),
      { status: 200, headers: { 'content-type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        stage: 'db-insert',
        error: error instanceof Error ? error.message : 'unknown error'
      }),
      { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders } }
    );
  }
});

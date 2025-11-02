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

    if (!campana_id) {
      return new Response(
        JSON.stringify({
          ok: true,
          stage: 'db-insert-skip',
          reason: 'campana_id requerido para insertar en DB',
          personasRaw: personas.length,
          personasDeduplicadas: deduplicadas.length
        }),
        { status: 200, headers: { 'content-type': 'application/json', ...corsHeaders } }
      );
    }

    let distanciaMax = 2000;
    {
      const { data: campana } = await supabase
        .from('campanas')
        .select('distancia_max')
        .eq('id', campana_id)
        .single();
      if (campana && typeof campana.distancia_max === 'number') distanciaMax = campana.distancia_max;
    }

    const { data: puntosPickit } = await supabase
      .from('puntos_pickit')
      .select('id, nombre, direccion, lat, lon');

    const personasParaInsertar: any[] = [];
    let dentro = 0;
    let fuera = 0;
    const fueraRangoListado: any[] = [];

    if (Array.isArray(puntosPickit) && puntosPickit.length > 0) {
      for (const p of deduplicadas) {
        let min = Infinity;
        let nearest: any = null;
        for (const pt of puntosPickit) {
          const d = haversine(p.lat, p.lon, pt.lat, pt.lon);
          if (d < min) {
            min = d;
            nearest = pt;
          }
        }
        const esDentro = min <= distanciaMax;
        if (esDentro) dentro++; else fuera++;

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
          dentro_rango: esDentro,
          fuera_de_rango: !esDentro,
          tiene_whatsapp: null,
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
            'Latitud': registro.lat || '',
            'Longitud': registro.lon || '',
            'Distancia (metros)': Math.round(min || 0),
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
    if (fueraRangoListado.length > 0) {
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
        totalRows: rows.length,
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizarTelefonoE164(telefono: string): {
  normalizado: string | null;
  invalido: boolean;
} {
  if (!telefono) {
    return { normalizado: null, invalido: true };
  }

  let limpio = telefono.trim().replace(/[^\d+]/g, "");

  if (!limpio || limpio.length < 8) {
    return { normalizado: null, invalido: true };
  }

  if (limpio.startsWith("+54")) {
    if (limpio.length === 13) {
      return { normalizado: limpio, invalido: false };
    }
    return { normalizado: null, invalido: true };
  }

  if (limpio.startsWith("54")) {
    const sinPrefijo = limpio.substring(2);
    if (sinPrefijo.length === 10) {
      return { normalizado: `+54${sinPrefijo}`, invalido: false };
    }
    return { normalizado: null, invalido: true };
  }

  if (limpio.startsWith("011")) {
    const sin011 = limpio.substring(3);
    if (sin011.length === 8) {
      return { normalizado: `+54911${sin011}`, invalido: false };
    }
    if (sin011.length === 10) {
      return { normalizado: `+54911${sin011}`, invalido: false };
    }
    return { normalizado: null, invalido: true };
  }

  if (limpio.startsWith("11") && limpio.length >= 10) {
    const sin11 = limpio.substring(2);
    if (sin11.length === 8 || sin11.length === 10) {
      return { normalizado: `+54911${sin11}`, invalido: false };
    }
    return { normalizado: null, invalido: true };
  }

  if (limpio.startsWith("0") && limpio.length >= 8) {
    const codigoArea = limpio.substring(0, 4);
    const numero = limpio.substring(4);

    if (codigoArea.length === 4 && numero.length >= 6) {
      const codigoSinCero = codigoArea.substring(1);
      return { normalizado: `+54${codigoSinCero}${numero}`, invalido: false };
    }
    return { normalizado: null, invalido: true };
  }

  if (limpio.length === 10 && !limpio.startsWith("0")) {
    return { normalizado: `+54911${limpio}`, invalido: false };
  }

  return { normalizado: null, invalido: true };
}

function calcularDistanciaHaversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { campana_id, bucket, path } = await req.json();

    if (!campana_id || !bucket || !path) {
      return new Response(JSON.stringify({ error: "faltan parámetros" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Descargar archivo
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(path);

    if (downloadError) {
      throw new Error(`Error descargando: ${downloadError.message}`);
    }

    // Leer Excel
    const arrayBuffer = await fileData.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Obtener puntos Pickit
    const { data: puntosPickit, error: puntosError } = await supabase
      .from("puntos_pickit")
      .select("id, nombre, direccion, lat, lon");

    if (puntosError) {
      throw new Error(`Error puntos: ${puntosError.message}`);
    }

    // Obtener campaña
    const { data: campana, error: campanaError } = await supabase
      .from("campanas")
      .select("distancia_max")
      .eq("id", campana_id)
      .single();

    if (campanaError) {
      throw new Error(`Error campaña: ${campanaError.message}`);
    }

    const distanciaMax = campana.distancia_max || 2000;
    const personasParaInsertar: any[] = [];
    const dedupeMap = new Map();

    // Procesar filas (saltar header)
    for (let i = 1; i < data.length; i++) {
      const row: any = data[i];

      const nroCliente = String(row[0] || "").trim();
      const latRaw = row[33];
      const lonRaw = row[32];

      if (!nroCliente || latRaw == null || lonRaw == null) continue;

      let lat = parseFloat(latRaw);
      let lon = parseFloat(lonRaw);

      if (isNaN(lat) || isNaN(lon)) continue;

      if (Math.abs(lat) > 180) lat = lat / 1000000;
      if (Math.abs(lon) > 180) lon = lon / 1000000;

      const telefonos = [row[40], row[41], row[38], row[39]].filter(
        (t) => t && String(t).trim()
      );
      if (telefonos.length === 0) continue;

      const telefonoRaw = String(telefonos[0]).trim();
      const { normalizado } = normalizarTelefonoE164(telefonoRaw);

      // Deduplicar por nro_cliente
      if (dedupeMap.has(nroCliente)) {
        const existente = dedupeMap.get(nroCliente);
        existente.nros_cliente.push(nroCliente);
        existente.nros_wo.push(String(row[1] || "").trim());
        existente.cantidad_decos++;
        continue;
      }

      // Calcular distancia
      let distanciaMinima = Infinity;
      let puntoMasCercano = null;

      for (const punto of puntosPickit) {
        const distancia = calcularDistanciaHaversine(
          lat,
          lon,
          punto.lat,
          punto.lon
        );
        if (distancia < distanciaMinima) {
          distanciaMinima = distancia;
          puntoMasCercano = punto;
        }
      }

      const dentroRango = distanciaMinima <= distanciaMax;

      const persona = {
        campana_id,
        fila_archivo: i + 1,
        nro_cliente: nroCliente,
        nro_wo: String(row[1] || "").trim(),
        nros_cliente: [nroCliente],
        nros_wo: [String(row[1] || "").trim()],
        cantidad_decos: 1,
        apellido_nombre: String(row[28] || "").trim(),
        dni: String(row[29] || "").trim(),
        telefono_principal: normalizado || telefonoRaw,
        direccion_completa: `${String(row[30] || "").trim()} ${String(
          row[31] || ""
        ).trim()}`.trim(),
        cp: String(row[35] || "").trim(),
        localidad: String(row[36] || "").trim(),
        provincia: String(row[37] || "").trim(),
        lat,
        lon,
        punto_pickit_id: puntoMasCercano?.id || null,
        distancia_metros: distanciaMinima,
        dentro_rango: dentroRango,
        fuera_de_rango: !dentroRango,
        tiene_whatsapp: null,
        estado_contacto: "pendiente",
        razon_creacion: String(row[3] || "").trim(),
        estado_cliente_original: String(row[26] || "").trim(),
        email: String(row[42] || "").trim(),
      };

      dedupeMap.set(nroCliente, persona);
      personasParaInsertar.push(persona);
    }

    // Insertar personas
    if (personasParaInsertar.length > 0) {
      const { error: insertError } = await supabase
        .from("personas_contactar")
        .insert(personasParaInsertar);

      if (insertError) {
        throw new Error(`Error insertando: ${insertError.message}`);
      }
    }

    // Actualizar contadores
    const dentroRango = personasParaInsertar.filter(
      (p) => p.dentro_rango
    ).length;
    await supabase
      .from("campanas")
      .update({
        total_personas: personasParaInsertar.length,
        personas_dentro_rango: dentroRango,
      })
      .eq("id", campana_id);

    return new Response(
      JSON.stringify({
        success: true,
        campana_id,
        total_personas: personasParaInsertar.length,
        total_filas_excel: data.length - 1,
        personas_dentro_rango: dentroRango,
        personas_fuera_rango: personasParaInsertar.length - dentroRango,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error desconocido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

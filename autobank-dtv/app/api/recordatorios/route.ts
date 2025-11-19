import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase, Tables } from "@/lib/supabase";

function getArgTwoDaysAgoHourWindow() {
  const tz = "America/Argentina/Buenos_Aires";
  const now = new Date();
  const argNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const hour = argNow.getHours();
  argNow.setDate(argNow.getDate() - 2);

  const yyyy = argNow.getFullYear();
  const mm = String(argNow.getMonth() + 1).padStart(2, "0");
  const dd = String(argNow.getDate()).padStart(2, "0");
  const HH = String(hour).padStart(2, "0");

  const start = new Date(`${yyyy}-${mm}-${dd}T${HH}:00:00-03:00`);
  const end = new Date(`${yyyy}-${mm}-${dd}T${HH}:59:59-03:00`);

  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    date: `${yyyy}-${mm}-${dd}`,
    hour,
  };
}

async function enviarKapsoWorkflow(
  persona: Tables<"personas_contactar"> & {
    punto_pickit: Tables<"puntos_pickit"> | null;
  },
  apiKey: string,
  phoneNumberId: string
) {
  const workflowId = "3af75433-75f6-4a07-9ebc-90d161d29d32";
  const cantidadDecos = persona.cantidad_decos ?? 1;
  const nrosWO = persona.nros_wo?.length
    ? persona.nros_wo
    : persona.nro_wo
    ? [persona.nro_wo]
    : [];

  const textoDeco =
    cantidadDecos === 1 ? "el decodificador" : "los decodificadores";
  const nrowsWOStr = nrosWO.join(", ");

  const body = {
    workflow_execution: {
      phone_number: persona.telefono_principal,
      phone_number_id: phoneNumberId,
      variables: {
        nombre_cliente: persona.apellido_nombre,
        nro_cliente: persona.nro_cliente || "",
        nros_cliente: nrowsWOStr,
        cantidad_decos: cantidadDecos,
        texto_deco: textoDeco,
        punto_pickit: persona.punto_pickit?.nombre || "N/A",
        direccion_punto: persona.punto_pickit?.direccion || "N/A",
        distancia:
          persona.distancia_metros != null
            ? `${Math.round(persona.distancia_metros)} metros`
            : "",
        persona_id: persona.id,
        horarios_punto: persona.punto_pickit?.horario || "N/A",
      },
      context: {
        source: "sistema_pickit",
        campana_id: persona.campana_id,
        persona_id: persona.id,
      },
    },
  };

  const url = `https://api.kapso.ai/platform/v1/workflows/${workflowId}/executions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`kapso ${res.status}: ${text || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

export async function POST() {
  try {
    const { startISO, endISO, date, hour } = getArgTwoDaysAgoHourWindow();
    const hourLabel = String(hour).padStart(2, "0");
    console.log(
      `[api/enviar-recordatorios] Ventana AR=${date} ${hourLabel}:00–${hourLabel}:59 (${startISO}..${endISO})`
    );

    const { data: campanas, error: campErr } = await supabase
      .from("campanas")
      .select("id, nombre")
      .eq("estado", "activa");
    if (campErr) throw campErr;
    if (!campanas?.length) {
      return NextResponse.json(
        { success: true, total_personas: 0 },
        { status: 200 }
      );
    }

    const campanaById = new Map(campanas.map((c) => [c.id, c]));
    const campanaIds = campanas.map((c) => c.id);

    const { data: personas, error: perErr } = await supabase
      .from("personas_contactar")
      .select(
        `
        id, campana_id, apellido_nombre, telefono_principal, nro_cliente, nro_wo, nros_wo, cantidad_decos, distancia_metros,
        punto_pickit:puntos_pickit(id, nombre, direccion, horario)
      `
      )
      .in("campana_id", campanaIds)
      .eq("estado_contacto", "enviado_whatsapp")
      .eq("intentos_envio", 1)
      .gte("fecha_envio_whatsapp", startISO)
      .lte("fecha_envio_whatsapp", endISO);

    if (perErr) throw perErr;

    if (!personas?.length) {
      return NextResponse.json(
        { success: true, total_personas: 0 },
        { status: 200 }
      );
    }

    const successIds: string[] = [];
    const errorIds: string[] = [];

    for (const persona of personas) {
      const campana = campanaById.get(persona.campana_id);
      if (!campana) continue;
      try {
        await enviarKapsoWorkflow(
          persona as any,
          process.env.KAPSO_API_KEY || "",
          process.env.KAPSO_PHONE_NUMBER_ID || ""
        );
        successIds.push(persona.id);
      } catch (e) {
        console.error(
          `Error envio persona=${persona.id} campana=${persona.campana_id}:`,
          e instanceof Error ? e.message : String(e)
        );
        errorIds.push(persona.id);
      }
    }

    if (successIds.length) {
      const chunkSize = 1000;
      for (let i = 0; i < successIds.length; i += chunkSize) {
        const chunk = successIds.slice(i, i + chunkSize);
        await supabase
          .from("personas_contactar")
          .update({ intentos_envio: 2 })
          .in("id", chunk);
      }
    }
    if (errorIds.length) {
      const chunkSize = 1000;
      for (let i = 0; i < errorIds.length; i += chunkSize) {
        const chunk = errorIds.slice(i, i + chunkSize);
        await supabase
          .from("personas_contactar")
          .update({ estado_contacto: "error_envio", intentos_envio: 2 })
          .in("id", chunk);
      }
    }

    return NextResponse.json(
      {
        success: true,
        total_personas: personas.length,
        ok: successIds.length,
        fail: errorIds.length,
      },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[api/enviar-recordatorios] FATAL:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

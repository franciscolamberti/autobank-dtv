// Cloudflare Worker: enviar-campana
// Según PRD: maneja envío manual, cron contacto inicial, cron recordatorios, generación archivo diario pickit

const DRY_RUN = false; // cambiar a false para envíos reales
const BATCH_SIZE = 10; // mensajes por batch
const DELAY_BETWEEN_BATCHES = 1000; // ms entre batches

/**
 * Convierte hora UTC a timezone especificada
 */
function getHoraEnTimezone(timezone) {
  const now = new Date();
  const localTime = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );
  return {
    hora: localTime.getHours(),
    minuto: localTime.getMinutes(),
    diaSemana: localTime.getDay(), // 0 = domingo, 1 = lunes, ..., 6 = sábado
    fecha: localTime.toISOString().split("T")[0], // YYYY-MM-DD
    fechaLegible: localTime.toLocaleString("es-AR", { timeZone: timezone }),
  };
}

/**
 * Valida si está dentro de las ventanas horarias configuradas según PRD
 * - Lunes a Viernes: 2 ventanas (ventana_1 y ventana_2)
 * - Sábado: 1 ventana
 * - Domingo: nunca (a menos que contactar_domingo = true)
 */
function estaDentroDeHorario(campana, timeInfo) {
  const { hora, minuto, diaSemana } = timeInfo;

  // Domingo: nunca contactar a menos que contactar_domingo = true
  if (diaSemana === 0 && !campana.contactar_domingo) {
    return false;
  }

  // Sábado: una ventana
  if (diaSemana === 6) {
    const inicio = parseTime(campana.horario_sabado_inicio || "10:00:00");
    const fin = parseTime(campana.horario_sabado_fin || "13:00:00");
    return estaEntreHoras(
      hora,
      minuto,
      inicio.hora,
      inicio.minuto,
      fin.hora,
      fin.minuto
    );
  }

  // Lunes a Viernes: dos ventanas
  if (diaSemana >= 1 && diaSemana <= 5) {
    // Ventana 1
    const v1Inicio = parseTime(campana.horario_ventana_1_inicio || "12:00:00");
    const v1Fin = parseTime(campana.horario_ventana_1_fin || "15:00:00");
    if (
      estaEntreHoras(
        hora,
        minuto,
        v1Inicio.hora,
        v1Inicio.minuto,
        v1Fin.hora,
        v1Fin.minuto
      )
    ) {
      return true;
    }

    // Ventana 2
    const v2Inicio = parseTime(campana.horario_ventana_2_inicio || "18:00:00");
    const v2Fin = parseTime(campana.horario_ventana_2_fin || "20:30:00");
    if (
      estaEntreHoras(
        hora,
        minuto,
        v2Inicio.hora,
        v2Inicio.minuto,
        v2Fin.hora,
        v2Fin.minuto
      )
    ) {
      return true;
    }
  }

  return false;
}

function parseTime(timeStr) {
  const [hora, minuto] = timeStr.split(":").map(Number);
  return { hora: hora || 0, minuto: minuto || 0 };
}

function estaEntreHoras(
  hora,
  minuto,
  inicioHora,
  inicioMinuto,
  finHora,
  finMinuto
) {
  const actualMinutos = hora * 60 + minuto;
  const inicioMinutos = inicioHora * 60 + inicioMinuto;
  const finMinutos = finHora * 60 + finMinuto;
  return actualMinutos >= inicioMinutos && actualMinutos < finMinutos;
}

/**
 * Valida que no sea el mismo día de creación de campaña
 * Según PRD: primer contacto siempre día hábil siguiente
 */
function esMismoDiaCreacion(campanaCreatedAt, timeInfo) {
  const fechaCreacion = new Date(campanaCreatedAt).toISOString().split("T")[0];
  return fechaCreacion === timeInfo.fecha;
}

async function consultarSupabase(env, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${query.table}`;
  const params = new URLSearchParams(query.params || {});

  if (query.select) {
    params.set("select", query.select);
  }

  const response = await fetch(`${url}?${params}`, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `error consultando supabase: ${response.status} - ${errorText}`
    );
  }

  return await response.json();
}

async function actualizarSupabase(env, table, data, filter) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const params = new URLSearchParams(filter);

  const response = await fetch(`${url}?${params}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `error actualizando supabase: ${response.status} - ${errorText}`
    );
  }

  return response.ok;
}

/**
 * Envía workflow a Kapso según PRD
 * Endpoint: POST https://api.kapso.ai/platform/v1/workflows/{workflow_id}/executions
 */
async function enviarKapsoWorkflow(
  persona,
  campana,
  env,
  esRecordatorio = false
) {
  if (DRY_RUN) {
    console.log("[DRY_RUN] Simulando envío a Kapso:", {
      persona_id: persona.id,
      telefono: persona.telefono_principal,
      workflow: esRecordatorio
        ? campana.kapso_workflow_id_recordatorio
        : campana.kapso_workflow_id,
    });
    return { success: true, simulated: true };
  }

  const workflowId = esRecordatorio
    ? campana.kapso_workflow_id_recordatorio
    : campana.kapso_workflow_id;

  if (!workflowId) {
    throw new Error(
      `Workflow ID no configurado para ${
        esRecordatorio ? "recordatorio" : "contacto principal"
      }`
    );
  }

  const url = `https://app.kapso.ai/api/v1/flows/${workflowId}/executions`;

  // Construir variables según PRD
  const cantidadDecos = persona.cantidad_decos || 1;
  const nrosCliente =
    persona.nros_cliente || (persona.nro_cliente ? [persona.nro_cliente] : []);
  const nrosWO = persona.nros_wo || (persona.nro_wo ? [persona.nro_wo] : []);
  const textoDeco =
    cantidadDecos === 1 ? "el decodificador" : "los decodificadores";
  const nrosClienteStr = nrosCliente.join(", ");
  const nrosWOStr = nrosWO.join(", ");

  // Payload según PRD
  const body = {
    workflow_execution: {
      phone_number: persona.telefono_principal,
      phone_number_id:
        campana.kapso_phone_number_id || env.KAPSO_PHONE_NUMBER_ID,
      whatsapp_config_id: env.KAPSO_WHATSAPP_CONFIG_ID,
      variables: esRecordatorio
        ? {
            nombre_cliente: persona.apellido_nombre,
            punto_pickit: persona.puntos_pickit?.nombre || "N/A",
            direccion_punto: persona.puntos_pickit?.direccion || "N/A",
            nros_wo: nrosWOStr,
            persona_id: persona.id,
          }
        : {
            nombre_cliente: persona.apellido_nombre,
            nro_cliente: persona.nro_cliente || "",
            nros_cliente: nrosClienteStr,
            cantidad_decos: cantidadDecos,
            texto_deco: textoDeco,
            punto_pickit: persona.puntos_pickit?.nombre || "N/A",
            direccion_punto: persona.puntos_pickit?.direccion || "N/A",
            distancia: `${Math.round(persona.distancia_metros)} metros`,
            persona_id: persona.id,
          },
      context: {
        source: esRecordatorio
          ? "sistema_pickit_recordatorio"
          : "sistema_pickit",
        campana_id: persona.campana_id,
        persona_id: persona.id,
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.KAPSO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: { message: response.statusText } }));
    const errorMessage = errorData?.error || response.statusText || null;

    // Capturar errores Meta según PRD
    // code 1357045: recipient not found
    // code 131026: invalid phone number
    // code 131047: re-engagement message
    // Marcar tiene_whatsapp = false
    await actualizarSupabase(
      env,
      "personas_contactar",
      {
        tiene_whatsapp: false,
        error_envio_kapso: errorMessage,
      },
      new URLSearchParams({ id: `eq.${persona.id}` })
    );

    throw new Error(
      `error kapso: ${response.status} - ${JSON.stringify(errorData)}`
    );
  }

  const result = await response.json();
  const trackingId = result.data?.tracking_id;

  if (trackingId && !DRY_RUN) {
    await actualizarSupabase(
      env,
      "personas_contactar",
      { kapso_tracking_id: trackingId },
      new URLSearchParams({ id: `eq.${persona.id}` })
    );
  }

  return result;
}

/**
 * Procesa campaña para envío de mensajes
 */
async function procesarCampana(env, campanaId, esManual = true) {
  const log = {
    timestamp: new Date().toISOString(),
    campana_id: campanaId,
    modo: DRY_RUN ? "DRY_RUN" : "PRODUCCION",
    tipo_ejecucion: esManual ? "manual" : "cron",
    pasos: [],
  };

  try {
    // Obtener campaña con configuración completa
    const campanas = await consultarSupabase(env, {
      table: "campanas",
      select: "*",
      params: new URLSearchParams({ id: `eq.${campanaId}` }),
    });

    if (!campanas || campanas.length === 0) {
      throw new Error("Campaña no encontrada");
    }

    const campana = campanas[0];
    const timezone = campana.timezone || "America/Argentina/Buenos_Aires";
    const timeInfo = getHoraEnTimezone(timezone);

    log.pasos.push({
      paso: 1,
      accion: "campaña obtenida",
      nombre: campana.nombre,
    });

    // Validar fecha_fin_contactacion según PRD
    if (campana.fecha_fin_contactacion) {
      const fechaFin = new Date(campana.fecha_fin_contactacion);
      const hoy = new Date(timeInfo.fecha);
      if (hoy > fechaFin) {
        log.pasos.push({
          paso: 2,
          resultado: "fecha_fin_contactacion ya pasó, no se contactará",
        });
        log.resultado = "fecha_fin_contactacion_pasada";
        return log;
      }
    }

    // Validar que no sea mismo día de creación (solo para envío manual)
    if (esManual && esMismoDiaCreacion(campana.created_at, timeInfo)) {
      log.pasos.push({
        paso: 2,
        resultado: "mismo día de creación, no se contacta",
      });
      log.resultado = "mismo_dia_creacion";
      return log;
    }

    // Validar horario (solo para envío manual)
    let dentroHorario = estaDentroDeHorario(campana, timeInfo);
    if (esManual && !dentroHorario) {
      log.pasos.push({ paso: 2, resultado: "fuera de horario, encolando" });

      // Consultar personas pendientes
      const personas = await consultarSupabase(env, {
        table: "personas_contactar",
        select: "id",
        params: new URLSearchParams({
          campana_id: `eq.${campanaId}`,
          dentro_rango: "eq.true",
          tiene_whatsapp: "neq.false",
          estado_contacto: "eq.pendiente",
        }),
      });

      // Encolar todas
      for (const persona of personas) {
        await actualizarSupabase(
          env,
          "personas_contactar",
          { estado_contacto: "encolado" },
          new URLSearchParams({ id: `eq.${persona.id}` })
        );
      }

      log.resultado = "encolado";
      log.mensaje = `${personas.length} personas encoladas`;
      return log;
    }

    // Consultar personas a contactar
    log.pasos.push({ paso: 3, accion: "consultando personas" });

    const queryParams = new URLSearchParams({
      campana_id: `eq.${campanaId}`,
      dentro_rango: "eq.true",
      tiene_whatsapp: "neq.false",
    });

    if (esManual) {
      queryParams.append("estado_contacto", "in.(pendiente,encolado)");
    } else {
      queryParams.append("estado_contacto", "eq.encolado");
      // Solo si fecha_fin_contactacion no pasó
      if (campana.fecha_fin_contactacion) {
        queryParams.append("fecha_fin_contactacion", `gte.${timeInfo.fecha}`);
      }
    }

    const personas = await consultarSupabase(env, {
      table: "personas_contactar",
      select: "*,puntos_pickit(*)",
      params: queryParams,
    });

    log.pasos.push({
      paso: 3,
      resultado: "ok",
      personas_encontradas: personas.length,
    });

    if (personas.length === 0) {
      log.pasos.push({ paso: 4, resultado: "no hay personas para procesar" });
      return log;
    }

    // Procesar en batches
    log.pasos.push({ paso: 4, accion: "iniciando envío de mensajes" });
    const resultados = [];
    const errores = [];

    for (let i = 0; i < personas.length; i += BATCH_SIZE) {
      const batch = personas.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(personas.length / BATCH_SIZE);

      log.pasos.push({
        paso: `4.${batchNum}`,
        accion: `procesando batch ${batchNum}/${totalBatches}`,
        personas_en_batch: batch.length,
      });

      // Procesar batch en paralelo
      const promesas = batch.map(async (persona) => {
        try {
          await enviarKapsoWorkflow(persona, campana, env, false);

          await actualizarSupabase(
            env,
            "personas_contactar",
            {
              estado_contacto: "enviado_whatsapp",
              fecha_envio_whatsapp: new Date().toISOString(),
              intentos_envio: (persona.intentos_envio || 0) + 1,
            },
            new URLSearchParams({ id: `eq.${persona.id}` })
          );

          return { success: true, persona_id: persona.id };
        } catch (error) {
          await actualizarSupabase(
            env,
            "personas_contactar",
            {
              estado_contacto: "error_envio",
              intentos_envio: (persona.intentos_envio || 0) + 1,
            },
            new URLSearchParams({ id: `eq.${persona.id}` })
          );

          return {
            success: false,
            persona_id: persona.id,
            error: error.message,
          };
        }
      });

      const resultadosBatch = await Promise.all(promesas);

      resultadosBatch.forEach((r) => {
        if (r.success) {
          resultados.push(r);
        } else {
          errores.push(r);
        }
      });

      // Delay entre batches
      if (i + BATCH_SIZE < personas.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_BATCHES)
        );
      }
    }

    // Resumen final
    log.resultado = "completado";
    log.resumen = {
      total_procesadas: personas.length,
      exitosas: resultados.length,
      con_error: errores.length,
      tasa_exito:
        personas.length > 0
          ? `${Math.round((resultados.length / personas.length) * 100)}%`
          : "0%",
    };

    if (errores.length > 0) {
      log.errores = errores.slice(0, 10); // Primeros 10 errores
    }

    return log;
  } catch (error) {
    log.resultado = "error";
    log.error = error.message;
    log.stack = error.stack;
    return log;
  }
}

/**
 * Genera archivo diario Pickit según PRD
 * Ejecuta a horario_corte_diario (default 20:00 AR = 23:00 UTC)
 * Llama a Edge Function generar-corte-diario
 */
async function generarCorteDiario(env, campanaId) {
  const log = {
    timestamp: new Date().toISOString(),
    tipo: "corte-diario",
    campana_id: campanaId,
    pasos: [],
  };

  try {
    log.pasos.push({
      paso: 1,
      accion: "llamando edge function generar-corte-diario",
    });

    // Llamar a Supabase Edge Function
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/generar-corte-diario`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campana_id: campanaId }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Error generando corte diario: ${response.status} - ${errorText}`
      );
    }

    const resultado = await response.json();
    log.pasos.push({ paso: 1, resultado: "ok", ...resultado });
    log.resultado = "completado";

    return log;
  } catch (error) {
    log.resultado = "error";
    log.error = error.message;
    return log;
  }
}

/**
 * Procesa recordatorios según PRD
 * Ejecuta diariamente a las 09:00 argentina (12:00 UTC)
 */
async function procesarRecordatorios(env) {
  const log = {
    timestamp: new Date().toISOString(),
    tipo: "recordatorios",
    pasos: [],
  };

  try {
    // Obtener fecha de hoy en timezone Argentina
    const timeInfo = getHoraEnTimezone("America/Argentina/Buenos_Aires");
    const fechaHoy = timeInfo.fecha;

    log.pasos.push({
      paso: 1,
      accion: "buscando confirmados con fecha_compromiso = hoy",
    });

    // Consultar todas las campañas activas
    const campanasActivas = await consultarSupabase(env, {
      table: "campanas",
      select:
        "id, nombre, kapso_workflow_id_recordatorio, kapso_phone_number_id",
      params: new URLSearchParams({ estado: "eq.activa" }),
    });

    const resultados = [];
    const errores = [];

    // Procesar cada campaña
    for (const campana of campanasActivas) {
      // Consultar personas confirmadas con fecha_compromiso = hoy y recordatorio_enviado = false
      const personas = await consultarSupabase(env, {
        table: "personas_contactar",
        select:
          "id, campana_id, apellido_nombre, telefono_principal, nro_cliente, nro_wo, nros_wo, cantidad_decos, fecha_compromiso, punto_pickit_id",
        params: new URLSearchParams({
          campana_id: `eq.${campana.id}`,
          estado_contacto: "eq.confirmado",
          fecha_compromiso: `eq.${fechaHoy}`,
          recordatorio_enviado: "eq.false",
        }),
      });

      if (personas.length === 0) continue;

      // Obtener puntos pickit para estas personas
      const puntoIds = [
        ...new Set(personas.map((p) => p.punto_pickit_id).filter(Boolean)),
      ];
      let puntosPickit = {};
      if (puntoIds.length > 0) {
        const puntos = await consultarSupabase(env, {
          table: "puntos_pickit",
          select: "id, nombre, direccion",
          params: new URLSearchParams({ id: `in.(${puntoIds.join(",")})` }),
        });
        puntosPickit = puntos.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }

      // Agregar punto_pickit a cada persona
      const personasConPunto = personas.map((p) => ({
        ...p,
        campanas: campana,
        puntos_pickit: puntosPickit[p.punto_pickit_id] || null,
      }));

      log.pasos.push({
        paso: 2,
        accion: `procesando campaña ${campana.nombre}`,
        personas: personasConPunto.length,
      });

      for (const persona of personasConPunto) {
        try {
          await enviarKapsoWorkflow(persona, campana, env, true);

          await actualizarSupabase(
            env,
            "personas_contactar",
            {
              recordatorio_enviado: true,
              fecha_envio_recordatorio: new Date().toISOString(),
            },
            new URLSearchParams({ id: `eq.${persona.id}` })
          );

          resultados.push({
            success: true,
            persona_id: persona.id,
            campana_id: campana.id,
          });
        } catch (error) {
          errores.push({
            success: false,
            persona_id: persona.id,
            campana_id: campana.id,
            error: error.message,
          });
        }
      }
    }

    const totalPersonas = resultados.length + errores.length;

    log.resultado = totalPersonas > 0 ? "completado" : "no_hay_recordatorios";
    log.resumen = {
      total_procesadas: totalPersonas,
      exitosas: resultados.length,
      con_error: errores.length,
      campanas_procesadas: campanasActivas.length,
    };

    if (errores.length > 0) {
      log.errores = errores.slice(0, 10); // Primeros 10 errores
    }

    return log;
  } catch (error) {
    log.resultado = "error";
    log.error = error.message;
    return log;
  }
}

export default {
  // Handler para requests HTTP (manual)
  async fetch(request, env, ctx) {
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "método no permitido" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const body = await request.json();
      const { campana_id, tipo } = body;

      if (!campana_id && tipo !== "recordatorios") {
        return new Response(JSON.stringify({ error: "falta campana_id" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      let resultado;
      if (tipo === "recordatorios") {
        resultado = await procesarRecordatorios(env);
      } else if (tipo === "corte-diario") {
        resultado = await generarCorteDiario(env, campana_id);
      } else {
        resultado = await procesarCampana(env, campana_id, true);
      }

      return new Response(JSON.stringify(resultado, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
          stack: error.stack,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },

  // Handler para cron trigger
  // Según PRD: ejecuta diariamente a las 12:00 UTC (09:00 AR para recordatorios, inicio ventana 1 para contacto)
  async scheduled(event, env, ctx) {
    const timezone = "America/Argentina/Buenos_Aires";
    const horaArgentina = parseInt(
      new Date().toLocaleString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }),
      10
    );

    console.log(
      "cron trigger ejecutado:",
      new Date().toISOString(),
      "AR hour:",
      horaArgentina
    );

    // Corte diario a las 20:00 AR (o forzado en dev con FORCE_CORTE_DIARIO)
    if (horaArgentina === 20 || env.FORCE_CORTE_DIARIO === "true") {
      console.log("Procesando corte diario (20:00 AR)...");

      const campanas = await consultarSupabase(env, {
        table: "campanas",
        select: "id",
        params: new URLSearchParams({ estado: "eq.activa" }),
      });

      await Promise.all(campanas.map((c) => generarCorteDiario(env, c.id)));

      console.log(`Corte diario completado para ${campanas.length} campañas`);
      return;
    }

    // Recordatorios + contacto inicial a las 09:00 AR
    if (horaArgentina === 9) {
      try {
        // 1. Procesar recordatorios (09:00 AR = 12:00 UTC)
        console.log("Procesando recordarios");
        const recordatoriosLog = await procesarRecordatorios(env);
        console.log("Recordatorios:", recordatoriosLog.resultado);

        // 2. Procesar contacto inicial (inicio ventana 1 AR)
        console.log("Procesando contacto inicial...");
        const campanas = await consultarSupabase(env, {
          table: "campanas",
          select: "id",
          params: new URLSearchParams({ estado: "eq.activa" }),
        });

        console.log(`Encontradas ${campanas.length} campañas activas`);

        const resultados = [];
        for (const campana of campanas) {
          const resultado = await procesarCampana(env, campana.id, false);
          resultados.push(resultado);
          console.log(`Campaña ${campana.id} procesada:`, resultado.resultado);
        }

        console.log("Cron completado:", {
          total_campanas: campanas.length,
          resultados: resultados.map((r) => ({ resultado: r.resultado })),
        });
      } catch (err) {
        console.error("error en cron:", error);
      }
    } else {
      console.log("Fuera de ventanas programadas; no hay tareas.");
    }
  },
};

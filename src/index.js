// configuración
const DRY_RUN = true // cambiar a false para envíos reales
const HORARIO_INICIO = 12 // 12:00
const HORARIO_FIN = 15 // 15:00
const TIMEZONE = 'America/Argentina/Buenos_Aires'

function leerPuntosPickit(workbook, hoja = 'Red Total') {
  const sheet = workbook.Sheets[hoja];
  if (!sheet) {
    throw new Error(`hoja "${hoja}" no encontrada`);
  }
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const puntos = [];
  
  // empezar desde fila 1 (índice 1) para saltar encabezados
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lat = row[7]; // columna h (índice 7)
    const lon = row[8]; // columna i (índice 8)
    
    if (lat != null && lon != null) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        puntos.push({
          lat: latNum,
          lon: lonNum,
          fila: i + 1,
          nombre: row[1] || '',
          direccion: row[2] || ''
        });
      }
    }
  }
  
  return puntos;
}

function leerPersonasDtv(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const personas = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lon = row[32]; // columna ag (índice 32) = x
    const lat = row[33]; // columna ah (índice 33) = y
    
    if (lat != null && lon != null) {
      let latNum = parseFloat(lat);
      let lonNum = parseFloat(lon);
      
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        // si los valores son muy grandes, dividir por 1000000
        if (Math.abs(latNum) > 180) latNum = latNum / 1000000;
        if (Math.abs(lonNum) > 180) lonNum = lonNum / 1000000;
        
        personas.push({
          lat: latNum,
          lon: lonNum,
          fila: i + 1,
          datos: row
        });
      }
    }
  }
  
  return personas;
}

function encontrarPersonasCercanas(personas, puntosPicikt, distanciaMax = 2000) {
  const resultados = [];
  
  for (const persona of personas) {
    let distanciaMinima = Infinity;
    let puntoMasCercano = null;
    
    for (const punto of puntosPicikt) {
      const distancia = calcularDistanciaHaversine(
        persona.lat,
        persona.lon,
        punto.lat,
        punto.lon
      );
      
      if (distancia < distanciaMinima) {
        distanciaMinima = distancia;
        puntoMasCercano = punto;
      }
    }
    
    resultados.push({
      fila: persona.fila,
      distancia: Math.round(distanciaMinima * 100) / 100,
      cerca: distanciaMinima < distanciaMax,
      puntoPickit: puntoMasCercano ? {
        nombre: puntoMasCercano.nombre,
        direccion: puntoMasCercano.direccion,
        lat: puntoMasCercano.lat,
        lon: puntoMasCercano.lon
      } : null,
      persona: {
        lat: persona.lat,
        lon: persona.lon,
        datos: persona.datos
      }
    });
  }
  
  return resultados;
}

export default {
  async fetch(request, env, ctx) {
    // manejar preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }
    
    // solo aceptar POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        error: 'método no permitido. usa POST' 
      }), {
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    try {
      const formData = await request.formData();
      const archivoPickit = formData.get('archivo_pickit');
      const archivoDtv = formData.get('archivo_dtv');
      const distanciaMax = parseInt(formData.get('distancia_max') || '2000');
      const solosCercanos = formData.get('solos_cercanos') === 'true';
      
      if (!archivoPickit || !archivoDtv) {
        return new Response(JSON.stringify({ 
          error: 'faltan archivos. debes enviar archivo_pickit y archivo_dtv' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // leer archivos excel
      const bufferPickit = await archivoPickit.arrayBuffer();
      const bufferDtv = await archivoDtv.arrayBuffer();
      
      const wbPickit = XLSX.read(bufferPickit, { type: 'array' });
      const wbDtv = XLSX.read(bufferDtv, { type: 'array' });
      
      // procesar datos
      const puntosPicikt = leerPuntosPickit(wbPickit);
      const personas = leerPersonasDtv(wbDtv);
      const resultados = encontrarPersonasCercanas(personas, puntosPicikt, distanciaMax);
      
      // filtrar si se pidió solo cercanos
      const resultadosFiltrados = solosCercanos 
        ? resultados.filter(r => r.cerca)
        : resultados;
      
      const personasCercanas = resultados.filter(r => r.cerca).length;
      
      return new Response(JSON.stringify({
        success: true,
        resumen: {
          total_personas: personas.length,
          total_puntos_pickit: puntosPicikt.length,
          personas_cercanas: personasCercanas,
          porcentaje: personas.length > 0 
            ? Math.round(personasCercanas / personas.length * 1000) / 10 
            : 0,
          distancia_max_metros: distanciaMax
        },
        resultados: resultadosFiltrados
      }, null, 2), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

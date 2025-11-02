const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': '*'
};

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

    return new Response(
      JSON.stringify({
        ok: true,
        stage: 'excel-parse',
        totalRows: rows.length,
        totalCols: range.e.c + 1
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
        stage: 'excel-parse',
        error: error instanceof Error ? error.message : 'unknown error'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json', ...corsHeaders }
      }
    );
  }
});

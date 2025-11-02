# latest changes — avances autobank <> sidetool (reunión 31 oct)

resumen de cambios y tareas a implementar a partir del transcript. idioma y nombres en minúsculas.

## decisiones confirmadas
- deduplicación por número de cliente (columna 0) como llave principal; agrupar múltiples work orders (wo) por cliente. fallback: teléfono si llegara a faltar el número de cliente.
- ofrecer un único punto pickit: siempre el más cercano dentro del radio configurado.
- contacto por whatsapp dentro de ventanas horarias; evitar domingo; la entrega siempre “a partir del día hábil siguiente”.
- el bot debe presentarse explícitamente como “asistente virtual”.
- sin integración con pickit en v1: se generan archivos de salida (diario y final).
- si no hay whatsapp (o es línea fija), derivar a gestión manual desde la plataforma.

## requerimientos nuevos/priorizados
- dos franjas horarias por día (ej. 12:00–15:00 y 18:00–20:30) y configuración diferenciada para sábado; domingo deshabilitado por defecto.
- fecha de inicio y fecha fin de contactación por campaña (corte operativo de envíos, la conversación puede seguir).
- validación estricta del excel: bloquear creación de campaña si faltan columnas clave; mostrar alerta guiada.
- exportaciones:
  - diario pickit: sólo confirmados con fecha de compromiso (formato pickit provisto por el cliente).
  - fuera de rango (sin punto pickit cercano) para devolver a directv.
  - solicita retiro a domicilio (listado separado).
  - sin whatsapp / contacto manual.
  - reporte final de campaña para directv (por wo: contactado, no respondió, confirmado, rechazó + motivo, retiro a domicilio, sin punto pickit, en proceso, etc.).
- dashboard:
  - pestaña “alertas” global y por campaña (“gestiones con resolución requerida”).
  - buckets: “urgentes”, “sin whatsapp”, “sin punto pickit”, “solicita retiro”.
  - acceso a “resumen de chat” por persona (no necesariamente el log completo de whatsapp business, pero sí un resumen útil).
- taxonomía de motivos negativos (clasificación):
  - sin punto pickit
  - no responde
  - solicita retiro a domicilio
  - datos de contacto incorrectos
  - ya lo entregó
  - no lo va a entregar
  - robado/perdido/roto
  - no acepta validación de datos
  - servicio activo
  - desconoce el servicio
  - domicilio no corresponde
  - otros (con observación)
- recontactación: marcar “entregado” manual; flag automático “vencida_sin_entrega” cuando pasen >7 días desde la fecha de compromiso sin marcar entrega; listar en “recontacto pendiente”.
- múltiples decos por cliente: el mensaje indica “tenés x equipos” y lista de wos; el archivo a pickit debe generar una fila por cada wo.

## cambios de base de datos (migraciones)
- tabla campañas:
  - hora_ventana_1_inicio time tz, hora_ventana_1_fin time tz
  - hora_ventana_2_inicio time tz, hora_ventana_2_fin time tz (opcionales)
  - habilitar_sabado boolean (default true), habilitar_domingo boolean (default false)
  - fecha_inicio_contactacion timestamptz, fecha_fin_contactacion timestamptz
  - hora_corte_diario_pickit time (default ‘20:00’)
- tabla personas_contactar:
  - nro_cliente text (index)
  - work_orders text[] (lista de wos por cliente)
  - cantidad_decos integer
  - tiene_whatsapp boolean (nullable; setear false si falla envío por no whatsapp)
  - motivo_negativo text (o enum externo) + observaciones text
  - fecha_compromiso date
  - entregado boolean default false
  - vencida_sin_entrega boolean default false (también puede calcularse en consulta)
  - fuera_de_rango boolean, solicita_retiro_domicilio boolean
- tabla (o campo) de conversación:
  - resumen_conversacion jsonb (últimos mensajes, intención, motivo clasificado)
- índices sugeridos:
  - idx_personas_nro_cliente, idx_personas_telefono, idx_personas_fecha_compromiso, idx_personas_motivo_negativo, idx_personas_campana_estado

## backend
- edge function procesar-archivo:
  - parsear excel; columnas mínimas: telefono, nombre, lat, lon, nro_cliente (col 0), work_order (col 1/wo). si faltan, abortar con alerta y no crear campaña.
  - normalizar lat/lon (microgrados), calcular punto pickit más cercano, flag fuera_de_rango si excede distancia máxima.
  - deduplicar por nro_cliente; agrupar wos y setear cantidad_decos.
  - crear personas_contactar con flags iniciales (fuera_de_rango, solicita_retiro_domicilio=false, tiene_whatsapp=null).
  - generar listas derivadas: fuera_de_rango y sin whatsapp (esta última se completa luego por worker).
- worker enviar-campana.js:
  - soportar múltiples ventanas/días (lv + sábado); domingo off por defecto.
  - no contactar el mismo día de carga; primera comunicación a partir del siguiente día hábil.
  - detección de no-whatsapp/linea fija: marcar tiene_whatsapp=false y mover a bucket “manual”.
  - generar archivo diario pickit a la hora_corte_diario_pickit con confirmados + fecha_compromiso (formato cliente), una fila por wo.
  - export “sin punto pickit”, “solicita retiro domicilio”, “sin whatsapp”.
  - setear vencida_sin_entrega=true cuando fecha_compromiso + 7 días y entregado=false.
  - idempotencia por wo (no duplicar envíos ni exportes).
- webhook-kapso:
  - persistir última interacción; extraer y clasificar motivo_negativo; guardar observaciones; actualizar resumen_conversacion.

## frontend (next.js)
- wizard nueva campaña:
  - paso 1: configuración (ventanas horarias, sábado/domingo, fecha inicio/fin, radio de distancia).
  - paso 2: subir excel + validación estricta de columnas (mostrar nombres faltantes).
  - paso 3: confirmación (conteos: total, dentro de rango, fuera de rango, con teléfono, etc.).
- detalle campaña:
  - tabs: listado | alertas | exportaciones | métricas.
  - filtros por estado (pendiente, encolado, contactado, confirmados, respondido negativo, entregado, sin whatsapp, fuera de rango, solicita retiro).
  - acciones: “marcar entregado”, “finalizar campaña” (genera reporte final), botones de descarga por cada export.
  - acceso al resumen de chat de cada persona.
- vista global:
  - “alertas” cross-campaña con filtros (urgentes, recontacto pendiente, sin whatsapp, nuevos motivos no mapeados).
- métricas:
  - gráfico de torta de motivos negativos y barras de estados por campaña.

## flujo conversacional (whatsapp)
- primer mensaje: “soy un asistente virtual” (explicitar bot) y setear expectativas de tono corto y al pie.
- confirmación positiva:
  - pluralización por cantidad_decos y listado de wos.
  - “entrega a partir de mañana” con ajuste si mañana es domingo → “a partir del lunes”.
  - recordatorio de requisitos (bolsa sellada por equipo, control remoto y cables si los tiene, informar número de orden al llegar).
- casos negativos:
  - preguntar breve motivo y clasificar según taxonomía; si “otros”, solicitar una línea de detalle.
  - ofrecer reagendar contacto (guardar preferencia) o derivar a humano (crear alerta en dashboard).

## validación de excel y plantilla
- v1: validación por nombre exacto de columnas requeridas; si faltan, bloquear creación y mostrar alerta con lista faltante.
- v2 (optativa): “subir template” y mapeo de columnas via ui; persistir plantilla por cliente.

## recontactación
- v1: manual. listar “recontacto pendiente” (confirmados con fecha_compromiso vencida y no entregados) y permitir exportar o recontactar manualmente.
- v2 (posterior): flujo automático específico de recordatorio, condicionado y con plantillas nuevas.

## aceptación (criterios mínimos)
- se puede crear una campaña con dos franjas horarias y fechas inicio/fin.
- al subir excel con columnas válidas, se valida y se deduplica por nro_cliente agrupando wos.
- se generan personas_contactar con cantidad_decos y punto pickit más cercano; fuera de rango marcados.
- el worker respeta ventanas y no envía en domingo ni el mismo día de carga.
- ante falla por no whatsapp, la persona aparece en bucket “sin whatsapp”.
- confirmados con fecha_compromiso aparecen en el export diario pickit (una fila por wo) a la hora de corte.
- existe pestaña “alertas” global y por campaña; se ven motivos negativos y “recontacto pendiente”.
- se puede marcar “entregado” manualmente y se actualiza el estado.
- botón “finalizar campaña” genera reporte final por wo con estados y motivos.

## hitos y plan
- p0 (antes del 10/11):
  - deduplicación por nro_cliente, ventanas horarias lv + sábado, domingo off, validación excel v1, export diario pickit, export fuera de rango, export solicita retiro, buckets “sin whatsapp” y “alertas”, marcar entregado, reporte final de campaña.
- p1 (posterior):
  - vista de resumen de chat, taxonomía completa con métricas, plantilla de excel configurable, recontactación automática, mejoras de idempotencia e integraciones.

## riesgos y supuestos
- el formato diario pickit debe confirmarse (versión final del cliente); cambios de formato implican ajuste rápido.
- el excel de entrada puede variar; mientras mantenga nombres de columnas clave, no afecta v1.
- sin integración pickit en v1; toda la ingestión es por archivos.
- la detección de “no whatsapp” depende de errores de envío/rechazos de la api y validaciones básicas de números.

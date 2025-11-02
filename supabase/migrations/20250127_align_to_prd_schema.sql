-- Migration: Align schema to PRD requirements
-- This migration ensures all tables match the PRD specification exactly

-- ============================================
-- 1. Update estado_contacto enum if needed
-- ============================================
DO $$ 
BEGIN
    -- Create enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_contacto_enum') THEN
        CREATE TYPE estado_contacto_enum AS ENUM (
            'pendiente',
            'encolado',
            'enviado_whatsapp',
            'respondio',
            'confirmado',
            'rechazado',
            'no_responde',
            'error_envio'
        );
    END IF;
END $$;

-- ============================================
-- 2. Update CAMPANAS table with PRD fields
-- ============================================

-- Add kapso_workflow_id if not exists (rename from kapso_flow_id if needed)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS kapso_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS kapso_workflow_id_recordatorio TEXT,
ADD COLUMN IF NOT EXISTS kapso_phone_number_id TEXT;

-- Rename kapso_flow_id to kapso_workflow_id if it exists and new column is null
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campanas' AND column_name = 'kapso_flow_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campanas' AND column_name = 'kapso_workflow_id'
    ) THEN
        ALTER TABLE campanas RENAME COLUMN kapso_flow_id TO kapso_workflow_id;
    END IF;
END $$;

-- Add fecha_fin_contactacion (required)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS fecha_fin_contactacion DATE;

-- Add horario_corte_diario (default 20:00)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS horario_corte_diario TIME DEFAULT '20:00:00';

-- Add time windows for weekdays (ventana 1)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS horario_ventana_1_inicio TIME DEFAULT '12:00:00',
ADD COLUMN IF NOT EXISTS horario_ventana_1_fin TIME DEFAULT '15:00:00';

-- Add time windows for weekdays (ventana 2)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS horario_ventana_2_inicio TIME DEFAULT '18:00:00',
ADD COLUMN IF NOT EXISTS horario_ventana_2_fin TIME DEFAULT '20:30:00';

-- Add time window for Saturday
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS horario_sabado_inicio TIME DEFAULT '10:00:00',
ADD COLUMN IF NOT EXISTS horario_sabado_fin TIME DEFAULT '13:00:00';

-- Add contactar_domingo flag (default false)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS contactar_domingo BOOLEAN DEFAULT FALSE;

-- Add timezone (default America/Argentina/Buenos_Aires)
ALTER TABLE campanas 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires';

-- Rename horario_envio_inicio/fin if they exist and new columns are null
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campanas' AND column_name = 'horario_envio_inicio'
    ) THEN
        UPDATE campanas 
        SET horario_ventana_1_inicio = horario_envio_inicio 
        WHERE horario_ventana_1_inicio IS NULL;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campanas' AND column_name = 'horario_envio_fin'
    ) THEN
        UPDATE campanas 
        SET horario_ventana_1_fin = horario_envio_fin 
        WHERE horario_ventana_1_fin IS NULL;
    END IF;
END $$;

-- Rename kapso_whatsapp_config_id to kapso_phone_number_id if needed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campanas' AND column_name = 'kapso_whatsapp_config_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campanas' AND column_name = 'kapso_phone_number_id'
    ) THEN
        ALTER TABLE campanas RENAME COLUMN kapso_whatsapp_config_id TO kapso_phone_number_id;
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN campanas.kapso_workflow_id IS 'Workflow principal de contacto (UUID)';
COMMENT ON COLUMN campanas.kapso_workflow_id_recordatorio IS 'Workflow separado para recordatorio (UUID)';
COMMENT ON COLUMN campanas.kapso_phone_number_id IS 'WhatsApp Business Phone Number ID';
COMMENT ON COLUMN campanas.fecha_fin_contactacion IS 'Plazo máximo para contactar personas';
COMMENT ON COLUMN campanas.horario_corte_diario IS 'Hora de generación del archivo diario Pickit (default 20:00)';
COMMENT ON COLUMN campanas.timezone IS 'Timezone para cálculos de horarios (default America/Argentina/Buenos_Aires)';

-- ============================================
-- 3. Update PERSONAS_CONTACTAR table with PRD fields
-- ============================================

-- Add array columns for multiple decodificadores
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS nros_cliente TEXT[],
ADD COLUMN IF NOT EXISTS nros_wo TEXT[],
ADD COLUMN IF NOT EXISTS cantidad_decos INTEGER DEFAULT 1;

-- Add WhatsApp and range flags
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS tiene_whatsapp BOOLEAN, -- null initially
ADD COLUMN IF NOT EXISTS fuera_de_rango BOOLEAN DEFAULT FALSE;

-- Update estado_contacto to use enum (if column exists as text, migrate it)
DO $$
BEGIN
    -- Check if estado_contacto exists and is not the enum type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'personas_contactar' 
        AND column_name = 'estado_contacto'
        AND data_type != 'USER-DEFINED'
    ) THEN
        -- Migrate text to enum values
        ALTER TABLE personas_contactar 
        ALTER COLUMN estado_contacto TYPE estado_contacto_enum 
        USING estado_contacto::estado_contacto_enum;
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'personas_contactar' 
        AND column_name = 'estado_contacto'
    ) THEN
        -- Create column with enum type
        ALTER TABLE personas_contactar 
        ADD COLUMN estado_contacto estado_contacto_enum DEFAULT 'pendiente';
    END IF;
END $$;

-- Add date fields for commitments and reminders
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS fecha_compromiso DATE,
ADD COLUMN IF NOT EXISTS recordatorio_enviado BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fecha_envio_recordatorio TIMESTAMPTZ;

-- Add text fields for responses
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS motivo_negativo TEXT;

-- Add flag for special handling
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS solicita_retiro_domicilio BOOLEAN DEFAULT FALSE;

-- Ensure intentos_envio exists and has default
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS intentos_envio INTEGER DEFAULT 0;

-- Ensure respuesta_texto exists (may already exist)
ALTER TABLE personas_contactar 
ADD COLUMN IF NOT EXISTS respuesta_texto TEXT;

-- Update fuera_de_rango based on dentro_rango if fuera_de_rango is null
UPDATE personas_contactar 
SET fuera_de_rango = NOT dentro_rango 
WHERE fuera_de_rango IS NULL;

-- Initialize nros_cliente and nros_wo arrays from single values if arrays are null
UPDATE personas_contactar 
SET nros_cliente = ARRAY[nro_cliente]::TEXT[]
WHERE nros_cliente IS NULL AND nro_cliente IS NOT NULL;

UPDATE personas_contactar 
SET nros_wo = ARRAY[nro_wo]::TEXT[]
WHERE nros_wo IS NULL AND nro_wo IS NOT NULL;

-- Set cantidad_decos to 1 if null
UPDATE personas_contactar 
SET cantidad_decos = 1 
WHERE cantidad_decos IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN personas_contactar.nros_cliente IS 'Array para múltiples números de cliente';
COMMENT ON COLUMN personas_contactar.nros_wo IS 'Array para múltiples work orders';
COMMENT ON COLUMN personas_contactar.cantidad_decos IS 'Cantidad de decodificadores';
COMMENT ON COLUMN personas_contactar.tiene_whatsapp IS 'null inicial, false si validación kapso falla';
COMMENT ON COLUMN personas_contactar.fuera_de_rango IS 'true si distancia > distancia_max';
COMMENT ON COLUMN personas_contactar.fecha_compromiso IS 'Día que el cliente se comprometió a entregar';
COMMENT ON COLUMN personas_contactar.motivo_negativo IS 'Generado por agente kapso en caso de rechazo';
COMMENT ON COLUMN personas_contactar.solicita_retiro_domicilio IS 'Flag para casos que requieren atención especial';

-- ============================================
-- 4. Create indexes for performance
-- ============================================

-- Index on campana_id (likely already exists)
CREATE INDEX IF NOT EXISTS idx_personas_contactar_campana_id 
ON personas_contactar(campana_id);

-- Index for filtering by dentro_rango
CREATE INDEX IF NOT EXISTS idx_personas_contactar_campana_dentro_rango 
ON personas_contactar(campana_id, dentro_rango);

-- Index for filtering by estado_contacto
CREATE INDEX IF NOT EXISTS idx_personas_contactar_campana_estado 
ON personas_contactar(campana_id, estado_contacto);

-- Index for fecha_compromiso (for reminders and daily exports)
CREATE INDEX IF NOT EXISTS idx_personas_contactar_fecha_compromiso 
ON personas_contactar(campana_id, fecha_compromiso);

-- Index for tiene_whatsapp filtering
CREATE INDEX IF NOT EXISTS idx_personas_contactar_tiene_whatsapp 
ON personas_contactar(campana_id, tiene_whatsapp) 
WHERE tiene_whatsapp = false;

-- ============================================
-- 5. Set defaults on existing records
-- ============================================

-- Update existing campanas with default timezone if null
UPDATE campanas 
SET timezone = 'America/Argentina/Buenos_Aires' 
WHERE timezone IS NULL;

-- Update existing campanas with default horario_corte_diario if null
UPDATE campanas 
SET horario_corte_diario = '20:00:00' 
WHERE horario_corte_diario IS NULL;

-- Set default windows if null
UPDATE campanas 
SET horario_ventana_1_inicio = '12:00:00',
    horario_ventana_1_fin = '15:00:00',
    horario_ventana_2_inicio = '18:00:00',
    horario_ventana_2_fin = '20:30:00',
    horario_sabado_inicio = '10:00:00',
    horario_sabado_fin = '13:00:00',
    contactar_domingo = FALSE
WHERE horario_ventana_1_inicio IS NULL;


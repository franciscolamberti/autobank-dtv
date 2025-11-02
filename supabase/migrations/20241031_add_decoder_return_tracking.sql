-- Add decoder return tracking columns to personas_contactar table
ALTER TABLE personas_contactar
ADD COLUMN IF NOT EXISTS decodificador_devuelto BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS fecha_devolucion TIMESTAMPTZ;

-- Add comment to columns for documentation
COMMENT ON COLUMN personas_contactar.decodificador_devuelto IS 'Indica si el usuario devolvió el decodificador';
COMMENT ON COLUMN personas_contactar.fecha_devolucion IS 'Fecha en que se marcó como devuelto el decodificador';


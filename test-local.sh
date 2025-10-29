#!/bin/bash

# script para probar el worker localmente

echo "probando worker con archivos locales..."

curl -X POST http://localhost:8787 \
  -F "archivo_pickit=@/Users/franciscolamberti/Downloads/PUNTOS PICKIT - AR - Red Dev_DO mktplc DTV.v2.xlsx" \
  -F "archivo_dtv=@/Users/franciscolamberti/Downloads/Formato ejemplo de info DTV.xlsx" \
  -F "distancia_max=2000" \
  -F "solos_cercanos=false" | jq '.'

echo ""
echo "prueba completada"

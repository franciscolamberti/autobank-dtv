#!/usr/bin/env python3
"""
genera un archivo excel de prueba pequeño (10-15 filas)
con 2-3 personas que tienen telefono duplicado
"""

import random
import math
from openpyxl import Workbook

# coordenadas de algunos puntos pickit
PUNTOS_PICKIT = [
    {"nombre": "meraki - yaguareté", "lat": -34.58147, "lon": -58.379221},
    {"nombre": "maxikiosco calipso", "lat": -34.606872, "lon": -58.430521},
    {"nombre": "mensajería buenos aires", "lat": -34.616085, "lon": -58.447403},
]

NOMBRES = [
    "juan pérez", "maría garcía", "carlos lópez", "ana martínez", "pedro rodríguez",
    "laura fernández", "diego gonzález", "carolina sánchez", "martín romero", "valeria torres",
]

LOCALIDADES = ["caba", "vicente lópez", "san isidro", "la matanza", "lomas de zamora"]
PROVINCIAS = ["buenos aires", "caba"]
RAZONES = ["deuda vencida", "falta de pago", "gestión de cobro"]
ESTADOS = ["moroso", "suspendido", "activo con deuda"]


def generar_coordenadas_cercanas(punto_base, max_distancia_metros):
    """genera coordenadas aleatorias dentro de un radio"""
    delta_grados = max_distancia_metros / 111000
    lat = punto_base["lat"] + random.uniform(-delta_grados, delta_grados)
    lon = punto_base["lon"] + random.uniform(-delta_grados, delta_grados)
    return lat, lon


def generar_persona(idx, telefono_override=None):
    """genera datos de una persona"""
    punto = random.choice(PUNTOS_PICKIT)
    lat, lon = generar_coordenadas_cercanas(punto, 1800)
    
    # convertir lat/lon a formato microgrados
    lat_micro = int(lat * 1000000)
    lon_micro = int(lon * 1000000)
    
    telefono = telefono_override if telefono_override else f"11{random.randint(20000000, 69999999)}"
    
    return {
        "nro_cliente": f"cli{10000 + idx}",
        "nro_wo": f"wo{20000 + idx}",
        "razon_creacion": random.choice(RAZONES),
        "estado_cliente": random.choice(ESTADOS),
        "apellido_nombre": random.choice(NOMBRES),
        "dni": f"{random.randint(20000000, 45000000)}",
        "direccion_calle": f"av. ejemplo {random.randint(100, 9999)}",
        "direccion_numero": "",
        "lat_micro": lat_micro,
        "lon_micro": lon_micro,
        "cp": f"{1000 + random.randint(0, 999)}",
        "localidad": random.choice(LOCALIDADES),
        "provincia": random.choice(PROVINCIAS),
        "telefono": telefono,
    }


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "dtv data"
    
    # headers
    headers = [""] * 41
    headers[0] = "nro_cliente"
    headers[1] = "nro_wo"
    headers[3] = "razon_creacion"
    headers[26] = "estado_cliente"
    headers[28] = "apellido_nombre"
    headers[29] = "dni"
    headers[30] = "direccion_calle"
    headers[31] = "direccion_numero"
    headers[32] = "lon"
    headers[33] = "lat"
    headers[35] = "cp"
    headers[36] = "localidad"
    headers[37] = "telefono_1"
    headers[38] = "telefono_2"
    headers[39] = "telefono_3"
    headers[40] = "telefono_4"
    
    ws.append(headers)
    
    # definir telefonos duplicados
    telefono_duplicado_1 = "1156571617"  # juan pérez tendrá 3 decoders
    telefono_duplicado_2 = "1145678901"  # maría garcía tendrá 2 decoders
    
    personas = []
    
    # generar 12 personas: 5 duplicadas + 7 únicas
    # juan pérez con 3 decoders (indices 0, 3, 7)
    personas.append(generar_persona(0, telefono_duplicado_1))
    personas.append(generar_persona(1))
    personas.append(generar_persona(2))
    personas.append(generar_persona(3, telefono_duplicado_1))  # duplicado
    personas.append(generar_persona(4))
    
    # maría garcía con 2 decoders (indices 5, 9)
    personas.append(generar_persona(5, telefono_duplicado_2))
    personas.append(generar_persona(6))
    personas.append(generar_persona(7, telefono_duplicado_1))  # duplicado
    personas.append(generar_persona(8))
    personas.append(generar_persona(9, telefono_duplicado_2))  # duplicado
    
    # agregar 2 más únicas
    personas.append(generar_persona(10))
    personas.append(generar_persona(11))
    
    # escribir todas las filas
    for persona in personas:
        row = [""] * 41
        row[0] = persona["nro_cliente"]
        row[1] = persona["nro_wo"]
        row[3] = persona["razon_creacion"]
        row[26] = persona["estado_cliente"]
        row[28] = persona["apellido_nombre"]
        row[29] = persona["dni"]
        row[30] = persona["direccion_calle"]
        row[31] = persona["direccion_numero"]
        row[32] = persona["lon_micro"]
        row[33] = persona["lat_micro"]
        row[35] = persona["cp"]
        row[36] = persona["localidad"]
        row[37] = persona["telefono"]
        ws.append(row)
    
    filename = "archivo_prueba_duplicados.xlsx"
    wb.save(filename)
    print(f"archivo generado: {filename}")
    print(f"total filas: {len(personas)} (sin contar header)")
    print(f"personas únicas (deduplicated): 9")
    print(f"  - telefono {telefono_duplicado_1}: 3 decoders")
    print(f"  - telefono {telefono_duplicado_2}: 2 decoders")
    print(f"  - 7 personas con 1 decoder cada una")


if __name__ == "__main__":
    main()

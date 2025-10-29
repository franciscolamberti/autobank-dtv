#!/usr/bin/env python3
"""
genera un archivo excel de prueba con 100 personas
76 dentro de 2000m de puntos pickit
24 fuera del rango
"""

import random
import math
from openpyxl import Workbook

# coordenadas de algunos puntos pickit
PUNTOS_PICKIT = [
    {"nombre": "Meraki - Yaguareté", "lat": -34.58147, "lon": -58.379221},
    {"nombre": "Maxikiosco Calipso", "lat": -34.606872, "lon": -58.430521},
    {"nombre": "Mensajería Buenos Aires", "lat": -34.616085, "lon": -58.447403},
    {"nombre": "Patricia Maria Mateo", "lat": -34.6232104, "lon": -58.4589195},
    {"nombre": "Kiosco Maltagliati", "lat": -34.61972, "lon": -58.468384},
]

NOMBRES = [
    "Juan Pérez", "María García", "Carlos López", "Ana Martínez", "Pedro Rodríguez",
    "Laura Fernández", "Diego González", "Carolina Sánchez", "Martín Romero", "Valeria Torres",
    "Federico Díaz", "Gabriela Ruiz", "Sebastián Castro", "Natalia Moreno", "Maximiliano Ortiz",
    "Andrea Silva", "Pablo Herrera", "Luciana Medina", "Nicolás Vargas", "Florencia Rojas",
    "Matías Pereyra", "Camila Molina", "Facundo Vega", "Victoria Blanco", "Agustín Giménez"
]

LOCALIDADES = [
    "CABA", "Vicente López", "San Isidro", "La Matanza", "Lomas de Zamora",
    "Quilmes", "Avellaneda", "Lanús", "San Martín", "Tres de Febrero"
]

PROVINCIAS = ["Buenos Aires", "CABA"]

RAZONES = [
    "Deuda vencida", "Falta de pago", "Gestión de cobro", "Recupero activo",
    "Morosidad", "Atraso en pagos", "Cuenta morosa"
]

ESTADOS = ["MOROSO", "SUSPENDIDO", "ACTIVO CON DEUDA", "INACTIVO"]


def calcular_distancia(lat1, lon1, lat2, lon2):
    """calcula distancia haversine en metros"""
    R = 6371000
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


def generar_coordenadas_cercanas(punto_base, max_distancia_metros):
    """genera coordenadas aleatorias dentro de un radio"""
    # convertir metros a grados (aproximado)
    delta_grados = max_distancia_metros / 111000  # 1 grado ≈ 111km
    
    lat = punto_base["lat"] + random.uniform(-delta_grados, delta_grados)
    lon = punto_base["lon"] + random.uniform(-delta_grados, delta_grados)
    
    return lat, lon


def generar_coordenadas_lejanas(punto_base):
    """genera coordenadas fuera del rango de 2000m"""
    # entre 3000m y 10000m
    distancia = random.uniform(3000, 10000)
    delta_grados = distancia / 111000
    
    lat = punto_base["lat"] + random.uniform(-delta_grados, delta_grados)
    lon = punto_base["lon"] + random.uniform(-delta_grados, delta_grados)
    
    return lat, lon


def generar_persona(idx, dentro_rango):
    """genera datos de una persona"""
    punto = random.choice(PUNTOS_PICKIT)
    
    if dentro_rango:
        # generar dentro de 2000m
        lat, lon = generar_coordenadas_cercanas(punto, 1800)  # 1800m para estar seguro
    else:
        # generar lejos
        lat, lon = generar_coordenadas_lejanas(punto)
    
    nombre = random.choice(NOMBRES)
    apellido = nombre.split()[0]  # simular apellido
    
    # convertir lat/lon a formato microgrados (multiplicar por 1000000)
    lat_micro = int(lat * 1000000)
    lon_micro = int(lon * 1000000)
    
    return {
        "nro_cliente": f"CLI{10000 + idx}",
        "nro_wo": f"WO{20000 + idx}",
        "razon_creacion": random.choice(RAZONES),
        "estado_cliente": random.choice(ESTADOS),
        "apellido_nombre": nombre,
        "dni": f"{random.randint(20000000, 45000000)}",
        "direccion_calle": f"Av. Ejemplo {random.randint(100, 9999)}",
        "direccion_numero": "",
        "lat_micro": lat_micro,
        "lon_micro": lon_micro,
        "cp": f"{1000 + random.randint(0, 999)}",
        "localidad": random.choice(LOCALIDADES),
        "provincia": random.choice(PROVINCIAS),
        "telefono": f"11{random.randint(20000000, 69999999)}",
    }


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "DTV Data"
    
    # headers (basados en el código de la edge function)
    # row[0] = nro_cliente, row[1] = nro_wo, row[3] = razon_creacion, row[26] = estado_cliente
    # row[28] = apellido_nombre, row[29] = dni
    # row[30] = direccion parte 1, row[31] = direccion parte 2
    # row[32] = lon, row[33] = lat
    # row[35] = cp, row[36] = localidad, row[37] = provincia (y también teléfono!)
    # row[37], row[38], row[39], row[40] = teléfonos
    
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
    
    # generar 76 personas dentro del rango
    for i in range(76):
        persona = generar_persona(i, True)
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
    
    # generar 24 personas fuera del rango
    for i in range(76, 100):
        persona = generar_persona(i, False)
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
    
    filename = "archivo_prueba_dtv_100_personas.xlsx"
    wb.save(filename)
    print(f"archivo generado: {filename}")
    print("100 personas totales")
    print("76 dentro de 2000m de puntos pickit")
    print("24 fuera del rango")


if __name__ == "__main__":
    main()

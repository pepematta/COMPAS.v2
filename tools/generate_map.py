#!/usr/bin/env python3
"""
generate_map.py - Generador de mapa vectorial para COMPAS (Barduino + OLED SH1107)

Descarga calles desde OpenStreetMap (Overpass API) para un área definida
por latitud, longitud y radio, y genera un archivo de cabecera C++ 'map_data.h'
optimizado para compilarse en la memoria Flash (PROGMEM) del ESP32-S3.
"""

import sys
import os
import math
import json
import urllib.request
import urllib.parse
import argparse

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
]

METERS_PER_DEGREE_LAT = 111132.954

def lat_lon_to_meters(lat, lon, origin_lat, origin_lon):
    """
    Convierte lat/lon a coordenadas cartesianas (x, y) en metros
    relativas al origen local usando proyección equirrectangular.
    x: Este (metros)
    y: Norte (metros)
    """
    d_lat = lat - origin_lat
    d_lon = lon - origin_lon
    
    rad_lat = math.radians(origin_lat)
    meters_per_degree_lon = METERS_PER_DEGREE_LAT * math.cos(rad_lat)
    
    x = d_lon * meters_per_degree_lon
    y = d_lat * METERS_PER_DEGREE_LAT
    return round(x), round(y)

def fetch_osm_ways(lat, lon, radius_meters):
    """
    Consulta Overpass API para obtener vías transitables (highways)
    dentro del radio especificado.
    """
    query = f"""
    [out:json][timeout:30];
    (
      way["highway"]
         ["highway"!~"footway|cycleway|path|pedestrian|steps|service|construction"]
         (around:{radius_meters},{lat},{lon});
    );
    out geom;
    """
    
    encoded_data = urllib.parse.urlencode({'data': query}).encode('utf-8')
    headers = {
        'User-Agent': 'COMPASNavigationSystem/1.0 (Barduino Embedded Project)'
    }
    
    last_err = None
    for url in OVERPASS_URLS:
        try:
            print(f"[*] Consultando Overpass API ({url})...")
            req = urllib.request.Request(url, data=encoded_data, headers=headers)
            with urllib.request.urlopen(req, timeout=35) as response:
                result = json.loads(response.read().decode('utf-8'))
                return result.get('elements', [])
        except Exception as e:
            print(f"[!] Error conectando a {url}: {e}")
            last_err = e
            continue
            
    raise RuntimeError(f"No se pudo consultar ningún servidor de Overpass: {last_err}")

def generate_demo_grid(radius_meters):
    """
    Genera una cuadrícula sintética de calles (para pruebas offline sin conexión a internet).
    """
    segments = []
    step = 80 # Calle cada 80 metros
    r = radius_meters
    
    # Calles horizontales (Este-Oeste)
    for y in range(-r, r + 1, step):
        segments.append((-r, y, r, y))
        
    # Calles verticales (Norte-Sur)
    for x in range(-r, r + 1, step):
        segments.append((x, -r, x, r))
        
    # Añadir algunas diagonales o avenidas principales
    segments.append((-r, -r, r, r))
    segments.append((-r, r // 2, r // 2, -r))
    return segments

def simplify_segments(elements, origin_lat, origin_lon):
    """
    Convierte los elementos de OSM en una lista de segmentos (x1, y1, x2, y2)
    en metros respecto al origen.
    """
    segments = []
    
    for elem in elements:
        if elem.get('type') != 'way':
            continue
        geom = elem.get('geometry', [])
        if len(geom) < 2:
            continue
            
        pts = [lat_lon_to_meters(node['lat'], node['lon'], origin_lat, origin_lon) for node in geom]
        
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            
            # Evitar segmentos de longitud 0
            if x1 == x2 and y1 == y2:
                continue
                
            # Limitar a rango int16_t (-32768 a 32767 metros)
            if all(-32000 <= val <= 32000 for val in (x1, y1, x2, y2)):
                segments.append((x1, y1, x2, y2))
                
    return segments

def generate_header(segments, origin_lat, origin_lon, radius_meters, output_path):
    """
    Genera el archivo map_data.h con la estructura optimizada para Arduino y PROGMEM.
    """
    header_content = f"""// Auto-generado por tools/generate_map.py
// Origen: Lat={origin_lat:.6f}, Lon={origin_lon:.6f}, Radio={radius_meters}m
// Segmentos totales: {len(segments)}

#ifndef MAP_DATA_H
#define MAP_DATA_H

#include <Arduino.h>

// Coordenadas de referencia del origen del mapa
#define MAP_ORIGIN_LAT {origin_lat:.7f}
#define MAP_ORIGIN_LON {origin_lon:.7f}
#define MAP_RADIUS_METERS {radius_meters}
#define TOTAL_MAP_SEGMENTS {len(segments)}

// Factor de conversión local (metros por grado)
#define METERS_PER_DEG_LAT {METERS_PER_DEGREE_LAT:.3f}f
#define METERS_PER_DEG_LON {METERS_PER_DEGREE_LAT * math.cos(math.radians(origin_lat)):.3f}f

// Segmento de calle en metros relativos al origen (Norte = +Y, Este = +X)
struct MapSegment {{
    int16_t x1;
    int16_t y1;
    int16_t x2;
    int16_t y2;
}};

// Datos almacenados en memoria Flash (PROGMEM)
const MapSegment MAP_SEGMENTS[TOTAL_MAP_SEGMENTS] PROGMEM = {{
"""

    lines = []
    for s in segments:
        lines.append(f"    {{{s[0]}, {s[1]}, {s[2]}, {s[3]}}},")
    
    header_content += "\n".join(lines)
    header_content += "\n};\n\n#endif // MAP_DATA_H\n"
    
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header_content)
        
    print(f"[✓] Archivo '{output_path}' generado con éxito ({len(segments)} segmentos de calles).")

def main():
    parser = argparse.ArgumentParser(description="Generador de datos de mapa para COMPAS")
    parser.add_argument("--lat", type=float, default=41.3965, help="Latitud central (def: 41.3965 - Barcelona Poblenou / Fab Lab)")
    parser.add_argument("--lon", type=float, default=2.1943, help="Longitud central (def: 2.1943 - Barcelona Poblenou / Fab Lab)")
    parser.add_argument("--radius", type=int, default=600, help="Radio en metros alrededor del punto (def: 600m)")
    parser.add_argument("--output", type=str, default="COMPAS_Firmware/map_data.h", help="Ruta del archivo de salida map_data.h")
    parser.add_argument("--demo", action="store_true", help="Generar un mapa sintético de prueba offline sin consultar internet")
    
    args = parser.parse_args()
    
    print(f"=== COMPAS Map Generator ===")
    print(f"Centro: Lat={args.lat}, Lon={args.lon}")
    print(f"Radio: {args.radius} metros")
    
    if args.demo:
        print("[*] Generando mapa sintético de demostración (cuadrícula)...")
        segments = generate_demo_grid(args.radius)
    else:
        try:
            elements = fetch_osm_ways(args.lat, args.lon, args.radius)
            print(f"[*] Vías descargadas desde OSM: {len(elements)}")
            segments = simplify_segments(elements, args.lat, args.lon)
        except Exception as e:
            print(f"[!] No se pudo descargar desde OSM ({e}). Generando mapa de demostración como alternativa...")
            segments = generate_demo_grid(args.radius)
            
    print(f"[*] Segmentos de línea generados: {len(segments)}")
    generate_header(segments, args.lat, args.lon, args.radius, args.output)

if __name__ == "__main__":
    main()

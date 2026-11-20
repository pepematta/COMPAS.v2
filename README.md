# COMPAS - Sistema de Navegación Intermedio (Iteración 2)

Sistema de navegación embebido que sitúa al usuario en un mapa vectorial local dinámico y le orienta hacia un destino mediante un indicador tipo brújula sin imponer una ruta cerrada (el punto intermedio entre una brújula y un GPS convencional).

---

## 1. Novedades de la Iteración 2

- **Fijación de Destino Táctil**: Mapa interactivo Leaflet en [`web_companion/index.html`](file:///Users/josematta/Downloads/COMPAS/web_companion/index.html) para tocar cualquier punto y establecer la meta.
- **Indicador Perimetral en Pantalla**: Si el objetivo está fuera de la pantalla, una flecha triangular en el borde apunta directamente hacia él.
- **Marcador en Mapa**: Si el objetivo entra en el campo de visión del OLED, se dibuja como una diana/cruz concéntrica sobre las calles reales.
- **Distancia en Línea Recta**: Muestra los metros o kilómetros restantes junto a un icono de bandera (ej. `⚑ 320m`).
- **Aviso de Llegada**: Muestra `"LLEGASTE!"` al estar a menos de 15 metros del objetivo.

---

## 1. Componentes de Hardware

| Componente | Conexión / Función | Notas |
| :--- | :--- | :--- |
| **Barduino 4.0.2 (ESP32-S3)** | Microcontrolador principal | BLE 5.0, Flash integrada y aceleración vectorial |
| **OLED Display 1.12" v2.0** | Controlador **SH1107** (128x128 píxeles) | Bus I2C (dirección 0x3C) |
| **Smartphone** | Proveedor de ubicación GPS vía BLE | Aplicación Web ligera (Web Bluetooth) |

### Cableado I2C:
| OLED 1.12" Pin | Barduino 4.0.2 Pin |
| :--- | :--- |
| **GND** | `GND` |
| **VCC** | `3V3` o `5V` |
| **SDA** | `SDA` (Configurable en código, por defecto `GPIO 8`) |
| **SCL** | `SCL` (Configurable en código, por defecto `GPIO 9`) |

---

## 2. Estructura del Repositorio

- [`COMPAS_Firmware/COMPAS_Firmware.ino`](file:///Users/josematta/Downloads/COMPAS/COMPAS_Firmware/COMPAS_Firmware.ino): Sketch principal de Arduino IDE.
- [`COMPAS_Firmware/map_data.h`](file:///Users/josematta/Downloads/COMPAS/COMPAS_Firmware/map_data.h): Estructura C++ optimizada en `PROGMEM` con los segmentos vectoriales de las calles.
- [`tools/generate_map.py`](file:///Users/josematta/Downloads/COMPAS/tools/generate_map.py): Script de Python para descargar y exportar cualquier área de OpenStreetMap a `map_data.h`.
- [`web_companion/index.html`](file:///Users/josematta/Downloads/COMPAS/web_companion/index.html): Web App (Web Bluetooth + GPS) para enlazar el móvil al Barduino sin instalar nada.

---

## 3. Preparación en Arduino IDE (2.x)

1. **Instalar soporte para ESP32**:
   - En *Preferencias*, añade el gestor de tarjetas:
     `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   - En *Gestor de Placas*, busca e instala **esp32** de Espressif Systems.
   - Selecciona tu placa: **ESP32S3 Dev Module** (o la definición de Barduino si la tienes instalada).
2. **Instalar librería gráfica**:
   - En *Gestor de Librerías*, busca e instala: **U8g2** (por *oliver*).
3. **Compilar y Flashear**:
   - Abre [`COMPAS_Firmware/COMPAS_Firmware.ino`](file:///Users/josematta/Downloads/COMPAS/COMPAS_Firmware/COMPAS_Firmware.ino).
   - Verifica los pines `SDA_PIN` y `SCL_PIN` según la serigrafía de tu Barduino 4.0.2.
   - Sube el sketch al dispositivo.

---

## 4. Generar el Mapa de tu Ciudad / Barrio

Puedes generar los datos vectoriales para cualquier ubicación del mundo usando OpenStreetMap:

```bash
# Ejemplo: Para tu barrio con un radio de 800 metros
python3 tools/generate_map.py --lat 41.3965 --lon 2.1943 --radius 800 --output COMPAS_Firmware/map_data.h

# O si estás sin conexión a internet y quieres una cuadrícula de prueba:
python3 tools/generate_map.py --demo --radius 600 --output COMPAS_Firmware/map_data.h
```

Una vez ejecutado, vuelve a subir el sketch en Arduino IDE para que el nuevo mapa quede grabado en la memoria Flash.

---

## 5. Conexión desde el Smartphone

1. Enciende el Barduino; en la pantalla aparecerá el mapa inicial y el estado `"NO BLE"`.
2. Abre [`web_companion/index.html`](file:///Users/josematta/Downloads/COMPAS/web_companion/index.html) en el navegador del teléfono (Google Chrome en Android, o navegadores compatibles con Web Bluetooth como Bluefy/WebBLE en iOS).
3. Pulsa **Conectar vía Bluetooth** y selecciona **COMPAS-NAV**.
4. ¡Listo! Al moverte por la calle:
   - El smartphone transmitirá tu latitud y longitud.
   - El Barduino proyectará las coordenadas y trasladará el mapa en la pantalla en tiempo real, manteniéndote siempre en el centro (`North-Up`).
   - También incluye un **Simulador de Escritorio** con botones táctiles para desplazarte virtualmente desde la mesa de trabajo.

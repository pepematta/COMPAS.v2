/**
 * COMPAS_Firmware.ino
 * 
 * Proyecto: Sistema de Navegación Intermedio (COMPAS)
 * Dispositivos:
 *  - Microcontrolador: Barduino 4.0.2 (ESP32-S3)
 *  - Pantalla: Seeed Grove OLED Display 1.12" v2.0 (SH1107 128x128 I2C)
 * 
 * Funcionalidad:
 *  - Recibe coordenadas GPS (latitud, longitud) desde el smartphone vía BLE (Nordic UART Service).
 *  - Renderiza el mapa vectorial local de calles almacenado en Flash (map_data.h).
 *  - Orientación "North-Up" con la posición del usuario fija en el centro de la pantalla (64, 64).
 *  - Indicador de estado de conexión BLE y escala gráfica.
 */

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#if __has_include("map_data.h")
  #include "map_data.h"
#else
  // ==========================================================================
  // DATOS DE MAPA POR DEFECTO (Fallback si map_data.h no está en las pestañas)
  // ==========================================================================
  #define MAP_ORIGIN_LAT 41.3965000
  #define MAP_ORIGIN_LON 2.1943000
  #define MAP_RADIUS_METERS 600
  #define METERS_PER_DEG_LAT 111132.954f
  #define METERS_PER_DEG_LON 83362.467f
  #define TOTAL_MAP_SEGMENTS 34

  struct MapSegment {
      int16_t x1;
      int16_t y1;
      int16_t x2;
      int16_t y2;
  };

  const MapSegment MAP_SEGMENTS[TOTAL_MAP_SEGMENTS] PROGMEM = {
      {-600, -600, 600, -600}, {-600, -520, 600, -520}, {-600, -440, 600, -440},
      {-600, -360, 600, -360}, {-600, -280, 600, -280}, {-600, -200, 600, -200},
      {-600, -120, 600, -120}, {-600, -40, 600, -40},   {-600, 40, 600, 40},
      {-600, 120, 600, 120},   {-600, 200, 600, 200},   {-600, 280, 600, 280},
      {-600, 360, 600, 360},   {-600, 440, 600, 440},   {-600, 520, 600, 520},
      {-600, 600, 600, 600},   {-600, -600, -600, 600}, {-520, -600, -520, 600},
      {-440, -600, -440, 600}, {-360, -600, -360, 600}, {-280, -600, -280, 600},
      {-200, -600, -200, 600}, {-120, -600, -120, 600}, {-40, -600, -40, 600},
      {40, -600, 40, 600},     {120, -600, 120, 600},   {200, -600, 200, 600},
      {280, -600, 280, 600},   {360, -600, 360, 600},   {440, -600, 440, 600},
      {520, -600, 520, 600},   {600, -600, 600, 600},   {-600, -600, 600, 600},
      {-600, 300, 300, -600}
  };
#endif

// ==========================================
// CONFIGURACIÓN DE PINES I2C (Barduino 4.0.2)
// ==========================================
// Modifica estos pines si tu placa tiene serigrafiados pines I2C específicos.
// En muchas placas ESP32-S3 los pines estándar I2C son GPIO 8 (SDA) y GPIO 9 (SCL).
#ifndef SDA_PIN
#define SDA_PIN 8
#endif

#ifndef SCL_PIN
#define SCL_PIN 9
#endif

// ==========================================
// CONFIGURACIÓN DE PANTALLA OLED SH1107
// ==========================================
// Constructor U8g2 para Grove OLED 1.12" v2.0 (SH1107 128x128 I2C)
U8G2_SH1107_SEEED_128X128_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE);

#define SCREEN_W 128
#define SCREEN_H 128
#define CENTER_X (SCREEN_W / 2)
#define CENTER_Y (SCREEN_H / 2)

// Escala del mapa: metros visibles en el ancho de la pantalla (128 px)
// 200 metros en 128 px => ~0.64 píxeles por metro (vista detallada de manzanas)
#define VIEW_METERS_WIDTH 220.0f
const float PIXELS_PER_METER = (float)SCREEN_W / VIEW_METERS_WIDTH;

// ==========================================
// CONFIGURACIÓN BLE (Nordic UART Service - NUS)
// ==========================================
#define DEVICE_NAME         "COMPAS-NAV"
#define SERVICE_UUID        "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_RX   "6E400002-B5A3-F393-E0A9-E50E24DCCA9E" // Write
#define CHARACTERISTIC_TX   "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // Notify

BLEServer *pServer = nullptr;
BLECharacteristic *pTxCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Estado de ubicación del usuario
volatile bool newGpsDataReceived = false;
double currentLat = MAP_ORIGIN_LAT;
double currentLon = MAP_ORIGIN_LON;
float userX = 0.0f; // Metros Este respecto a origen
float userY = 0.0f; // Metros Norte respecto a origen

// Estado del Destino / Objetivo (Modo Brújula Intermedio)
bool hasTarget = false;
double targetLat = 0.0;
double targetLon = 0.0;
float targetX = 0.0f; // Metros Este respecto a origen
float targetY = 0.0f; // Metros Norte respecto a origen
float targetDistanceMeters = 0.0f;

// ==========================================
// CALLBACKS DE SERVIDOR BLE
// ==========================================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) override {
        deviceConnected = true;
    }

    void onDisconnect(BLEServer* pServer) override {
        deviceConnected = false;
    }
};

// ==========================================
// CALLBACK DE RECEPCIÓN BLE (GPS + Destino Parser)
// ==========================================
// Formatos soportados:
// 1. "lat,lon" (actualización de posición)
// 2. "lat,lon,targetLat,targetLon" (posición + destino simultáneo)
// 3. "TARGET:CLEAR" (desactivar destino)
// 4. "TARGET:lat,lon" (fijar destino)
class MyRxCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) override {
        String rxValue = pCharacteristic->getValue().c_str();

        if (rxValue.length() > 0) {
            rxValue.trim();

            if (rxValue.startsWith("TARGET:CLEAR")) {
                hasTarget = false;
                newGpsDataReceived = true;
                return;
            }

            if (rxValue.startsWith("TARGET:")) {
                String coordStr = rxValue.substring(7);
                int commaIdx = coordStr.indexOf(',');
                if (commaIdx > 0) {
                    double tLat = coordStr.substring(0, commaIdx).toDouble();
                    double tLon = coordStr.substring(commaIdx + 1).toDouble();
                    if (tLat >= -90.0 && tLat <= 90.0 && tLon >= -180.0 && tLon <= 180.0) {
                        targetLat = tLat;
                        targetLon = tLon;
                        hasTarget = true;
                        newGpsDataReceived = true;
                    }
                }
                return;
            }

            int commaCount = 0;
            for (unsigned int i = 0; i < rxValue.length(); i++) {
                if (rxValue.charAt(i) == ',') commaCount++;
            }

            if (commaCount == 1) {
                // Formato: "lat,lon"
                int c1 = rxValue.indexOf(',');
                double lat = rxValue.substring(0, c1).toDouble();
                double lon = rxValue.substring(c1 + 1).toDouble();
                if (lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0) {
                    currentLat = lat;
                    currentLon = lon;
                    newGpsDataReceived = true;
                }
            } else if (commaCount == 3) {
                // Formato: "lat,lon,targetLat,targetLon"
                int c1 = rxValue.indexOf(',');
                int c2 = rxValue.indexOf(',', c1 + 1);
                int c3 = rxValue.indexOf(',', c2 + 1);

                double lat = rxValue.substring(0, c1).toDouble();
                double lon = rxValue.substring(c1 + 1, c2).toDouble();
                double tLat = rxValue.substring(c2 + 1, c3).toDouble();
                double tLon = rxValue.substring(c3 + 1).toDouble();

                if (lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0) {
                    currentLat = lat;
                    currentLon = lon;
                    if (abs(tLat) < 0.00001 && abs(tLon) < 0.00001) {
                        hasTarget = false;
                    } else if (tLat >= -90.0 && tLat <= 90.0 && tLon >= -180.0 && tLon <= 180.0) {
                        targetLat = tLat;
                        targetLon = tLon;
                        hasTarget = true;
                    }
                    newGpsDataReceived = true;
                }
            }
        }
    }
};

// ==========================================
// FUNCIONES DE RENDERIZADO Y PROYECCIÓN
// ==========================================

// ==========================================
// FUNCIONES DE RECORTE Y RENDERIZADO
// ==========================================

// Algoritmo Cohen-Sutherland para recorte exacto a los límites de la pantalla [0, 127]x[0, 127]
// U8g2 utiliza enteros sin signo (u8g2_uint_t); pasar coordenadas negativas produce desbordamiento.
const int CS_INSIDE = 0; // 0000
const int CS_LEFT   = 1; // 0001
const int CS_RIGHT  = 2; // 0010
const int CS_BOTTOM = 4; // 0100
const int CS_TOP    = 8; // 1000

int computeOutCode(int x, int y) {
    int code = CS_INSIDE;
    if (x < 0)               code |= CS_LEFT;
    else if (x >= SCREEN_W)  code |= CS_RIGHT;
    if (y < 0)               code |= CS_TOP;
    else if (y >= SCREEN_H)  code |= CS_BOTTOM;
    return code;
}

bool clipLineToScreen(int &x0, int &y0, int &x1, int &y1) {
    int code0 = computeOutCode(x0, y0);
    int code1 = computeOutCode(x1, y1);
    bool accept = false;

    while (true) {
        if ((code0 | code1) == 0) {
            // Ambos puntos dentro de la pantalla
            accept = true;
            break;
        } else if (code0 & code1) {
            // Ambos puntos comparten una zona exterior (trivialmente fuera)
            break;
        } else {
            // Al menos un punto fuera, calcular intersección con el borde
            int codeOut = code0 ? code0 : code1;
            int x = 0, y = 0;

            if (codeOut & CS_TOP) {
                x = x0 + (int)((long)(x1 - x0) * (0 - y0) / (y1 - y0));
                y = 0;
            } else if (codeOut & CS_BOTTOM) {
                x = x0 + (int)((long)(x1 - x0) * ((SCREEN_H - 1) - y0) / (y1 - y0));
                y = SCREEN_H - 1;
            } else if (codeOut & CS_RIGHT) {
                y = y0 + (int)((long)(y1 - y0) * ((SCREEN_W - 1) - x0) / (x1 - x0));
                x = SCREEN_W - 1;
            } else if (codeOut & CS_LEFT) {
                y = y0 + (int)((long)(y1 - y0) * (0 - x0) / (x1 - x0));
                x = 0;
            }

            if (codeOut == code0) {
                x0 = x;
                y0 = y;
                code0 = computeOutCode(x0, y0);
            } else {
                x1 = x;
                y1 = y;
                code1 = computeOutCode(x1, y1);
            }
        }
    }
    return accept;
}

void drawPerimeterArrow(int bx, int by, float dirX, float dirY) {
    // Punta de la flecha en (bx, by) en el perímetro de la pantalla
    // Base a 7 px hacia atrás a lo largo del vector opuesto
    int baseX = bx - (int)(dirX * 7.5f);
    int baseY = by - (int)(dirY * 7.5f);
    // Alas perpendiculares (ancho 4.5 px a cada lado)
    int w1x = baseX + (int)(-dirY * 4.5f);
    int w1y = baseY + (int)(dirX * 4.5f);
    int w2x = baseX - (int)(-dirY * 4.5f);
    int w2y = baseY - (int)(dirX * 4.5f);

    u8g2.drawTriangle(bx, by, w1x, w1y, w2x, w2y);
}

void updateCoordinates() {
    // Proyección equirrectangular a metros respecto al origen
    double dLat = currentLat - MAP_ORIGIN_LAT;
    double dLon = currentLon - MAP_ORIGIN_LON;

    userX = (float)(dLon * METERS_PER_DEG_LON);
    userY = (float)(dLat * METERS_PER_DEG_LAT);

    // Calcular coordenadas y distancia del objetivo si está activo
    if (hasTarget) {
        double dTargetLat = targetLat - MAP_ORIGIN_LAT;
        double dTargetLon = targetLon - MAP_ORIGIN_LON;
        targetX = (float)(dTargetLon * METERS_PER_DEG_LON);
        targetY = (float)(dTargetLat * METERS_PER_DEG_LAT);

        float dx = targetX - userX;
        float dy = targetY - userY;
        targetDistanceMeters = sqrt(dx * dx + dy * dy);
    }
}

void drawMap() {
    // Dibujar los segmentos de calles leídos desde PROGMEM
    // Radio de descarte rápido en metros alrededor del usuario
    float cullingRadiusMeters = (VIEW_METERS_WIDTH / 2.0f) * 1.5f;
    int visibleSegmentsCount = 0;

    for (int i = 0; i < TOTAL_MAP_SEGMENTS; i++) {
        MapSegment seg;
        // Leer estructura desde memoria Flash (PROGMEM)
        memcpy_P(&seg, &MAP_SEGMENTS[i], sizeof(MapSegment));

        // Trasladar respecto a la posición actual del usuario
        float dx1 = seg.x1 - userX;
        float dy1 = seg.y1 - userY;
        float dx2 = seg.x2 - userX;
        float dy2 = seg.y2 - userY;

        // Descarte rápido (Bounding Box Culling) si el segmento está totalmente fuera de vista
        if ((dx1 < -cullingRadiusMeters && dx2 < -cullingRadiusMeters) ||
            (dx1 >  cullingRadiusMeters && dx2 >  cullingRadiusMeters) ||
            (dy1 < -cullingRadiusMeters && dy2 < -cullingRadiusMeters) ||
            (dy1 >  cullingRadiusMeters && dy2 >  cullingRadiusMeters)) {
            continue;
        }

        // Convertir a coordenadas de pantalla (North-Up: Norte = -Y en pantalla)
        int sx1 = CENTER_X + (int)(dx1 * PIXELS_PER_METER);
        int sy1 = CENTER_Y - (int)(dy1 * PIXELS_PER_METER);
        int sx2 = CENTER_X + (int)(dx2 * PIXELS_PER_METER);
        int sy2 = CENTER_Y - (int)(dy2 * PIXELS_PER_METER);

        // Recorte exacto a [0, 127] para evitar valores negativos en U8g2
        if (clipLineToScreen(sx1, sy1, sx2, sy2)) {
            u8g2.drawLine(sx1, sy1, sx2, sy2);
            visibleSegmentsCount++;
        }
    }

    // Si el usuario está lejos del área del mapa cargado, avisar en pantalla
    if (visibleSegmentsCount == 0 && (abs(userX) > MAP_RADIUS_METERS || abs(userY) > MAP_RADIUS_METERS)) {
        u8g2.setFont(u8g2_font_4x6_tf);
        u8g2.drawStr(16, 60, "FUERA DEL MAPA");
        char distStr[24];
        float distKm = sqrt(userX * userX + userY * userY) / 1000.0f;
        snprintf(distStr, sizeof(distStr), "a %.1f km del origen", distKm);
        u8g2.drawStr(12, 70, distStr);
    }

    // ==========================================
    // DIBUJAR DESTINO / OBJETIVO (Modo Brújula)
    // ==========================================
    if (hasTarget) {
        float dx = targetX - userX;
        float dy = targetY - userY;
        int targetSx = CENTER_X + (int)(dx * PIXELS_PER_METER);
        int targetSy = CENTER_Y - (int)(dy * PIXELS_PER_METER);

        // ¿Está el destino dentro de la pantalla visible?
        bool onScreen = (targetSx >= 8 && targetSx <= SCREEN_W - 9 &&
                         targetSy >= 8 && targetSy <= SCREEN_H - 9);

        if (onScreen) {
            // Icono de destino: Diana / Cruz concéntrica
            u8g2.drawCircle(targetSx, targetSy, 4, U8G2_DRAW_ALL);
            u8g2.drawDisc(targetSx, targetSy, 2, U8G2_DRAW_ALL);
            u8g2.drawLine(targetSx - 6, targetSy, targetSx + 6, targetSy);
            u8g2.drawLine(targetSx, targetSy - 6, targetSx, targetSy + 6);
        } else {
            // Destino fuera de pantalla: Flecha perimetral en el borde
            float vx = dx;
            float vy = -dy; // En pantalla +Y va hacia abajo
            float len = sqrt(vx * vx + vy * vy);
            if (len > 0.001f) {
                float dirX = vx / len;
                float dirY = vy / len;

                // Margen del borde (54 px desde el centro 64 -> bordes a 10 px)
                float scaleX = (dirX > 0.0001f) ? (54.0f / dirX) : ((dirX < -0.0001f) ? (-54.0f / dirX) : 1e9f);
                float scaleY = (dirY > 0.0001f) ? (54.0f / dirY) : ((dirY < -0.0001f) ? (-54.0f / dirY) : 1e9f);
                float scale = min(scaleX, scaleY);

                int bx = CENTER_X + (int)(dirX * scale);
                int by = CENTER_Y + (int)(dirY * scale);

                drawPerimeterArrow(bx, by, dirX, dirY);
            }
        }

        // Mostrar distancia y estado en la parte inferior
        if (targetDistanceMeters < 15.0f) {
            u8g2.setFont(u8g2_font_6x12_tf);
            u8g2.drawStr(CENTER_X - 26, CENTER_Y - 10, "LLEGASTE!");
        } else {
            char distBuf[16];
            if (targetDistanceMeters < 1000.0f) {
                snprintf(distBuf, sizeof(distBuf), "%dm", (int)targetDistanceMeters);
            } else {
                snprintf(distBuf, sizeof(distBuf), "%.1fkm", targetDistanceMeters / 1000.0f);
            }
            u8g2.setFont(u8g2_font_5x7_tf);
            int strW = u8g2.getStrWidth(distBuf);
            int textX = SCREEN_W - strW - 4;
            int textY = SCREEN_H - 4;
            u8g2.drawStr(textX, textY, distBuf);
            // Pequeño icono de bandera al lado de la distancia
            u8g2.drawTriangle(textX - 8, textY - 6, textX - 4, textY - 4, textX - 8, textY - 2);
            u8g2.drawLine(textX - 8, textY - 6, textX - 8, textY);
        }
    }

    // Dibujar la ubicación actual del usuario en el centro (64, 64)
    // Círculo concéntrico con punto central (estilo brújula/radar)
    u8g2.drawCircle(CENTER_X, CENTER_Y, 4, U8G2_DRAW_ALL);
    u8g2.drawDisc(CENTER_X, CENTER_Y, 2, U8G2_DRAW_ALL);

    // Indicador de Norte en la esquina superior izquierda
    u8g2.setFont(u8g2_font_5x7_tf);
    u8g2.drawStr(4, 9, "N");
    u8g2.drawTriangle(6, 12, 4, 16, 8, 16);

    // Barra de escala gráfica en la esquina inferior izquierda (50 metros)
    int scaleBarPx = (int)(50.0f * PIXELS_PER_METER);
    int scaleY = SCREEN_H - 4;
    u8g2.drawLine(4, scaleY, 4 + scaleBarPx, scaleY);
    u8g2.drawLine(4, scaleY - 2, 4, scaleY + 2);
    u8g2.drawLine(4 + scaleBarPx, scaleY - 2, 4 + scaleBarPx, scaleY + 2);
    u8g2.drawStr(4 + scaleBarPx + 3, scaleY + 2, "50m");

    // Indicador de estado BLE en la esquina superior derecha
    if (deviceConnected) {
        u8g2.drawDisc(SCREEN_W - 6, 6, 2, U8G2_DRAW_ALL);
        u8g2.drawStr(SCREEN_W - 24, 8, "BLE");
    } else {
        // Círculo parpadeante cuando espera conexión
        if ((millis() / 500) % 2 == 0) {
            u8g2.drawCircle(SCREEN_W - 6, 6, 2, U8G2_DRAW_ALL);
        }
        u8g2.drawStr(SCREEN_W - 36, 8, "NO BLE");
    }
}

// ==========================================
// SETUP & INICIALIZACIÓN
// ==========================================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[COMPAS] Iniciando Sistema de Navegacion...");

    // Inicializar bus I2C con pines específicos para Barduino 4.0.2
    Wire.begin(SDA_PIN, SCL_PIN);
    Wire.setClock(400000); // 400kHz Fast I2C

    // Inicializar pantalla OLED SH1107
    u8g2.begin();
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_7x14_tf);
    u8g2.drawStr(10, 50, "COMPAS NAV");
    u8g2.setFont(u8g2_font_5x7_tf);
    u8g2.drawStr(10, 70, "Iniciando BLE...");
    u8g2.sendBuffer();

    // Inicializar BLE
    BLEDevice::init(DEVICE_NAME);
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    // Crear servicio Nordic UART
    BLEService *pService = pServer->createService(SERVICE_UUID);

    // Característica TX (Notificaciones al móvil si se requieren)
    pTxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_TX,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pTxCharacteristic->addDescriptor(new BLE2902());

    // Característica RX (Recepción de coordenadas desde el móvil)
    BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_RX,
        BLECharacteristic::PROPERTY_WRITE
    );
    pRxCharacteristic->setCallbacks(new MyRxCallbacks());

    // Iniciar servicio y publicidad
    pService->start();
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06); // Funciones de compatibilidad con iOS
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("[COMPAS] BLE listo. Anunciando como 'COMPAS-NAV'");

    // Actualizar coordenadas iniciales del origen
    updateCoordinates();
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================
void loop() {
    // Si se desconectó el dispositivo móvil, reiniciar publicidad BLE
    if (!deviceConnected && oldDeviceConnected) {
        delay(200);
        pServer->startAdvertising();
        Serial.println("[COMPAS] Cliente desconectado. Reanudando publicidad BLE...");
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
        Serial.println("[COMPAS] Cliente conectado con exito.");
    }

    // Actualizar cálculos de metros si se recibieron nuevas coordenadas
    if (newGpsDataReceived) {
        newGpsDataReceived = false;
        updateCoordinates();
        if (hasTarget) {
            Serial.printf("[GPS] User: (%.6f, %.6f) | Dest: (%.6f, %.6f) | Dist: %.0fm\n", 
                          currentLat, currentLon, targetLat, targetLon, targetDistanceMeters);
        } else {
            Serial.printf("[GPS] Lat: %.6f, Lon: %.6f | X: %.1fm, Y: %.1fm\n", 
                          currentLat, currentLon, userX, userY);
        }
    }

    // Renderizar cuadro del mapa
    u8g2.clearBuffer();
    drawMap();
    u8g2.sendBuffer();

    // Pequeño descanso para tasa de refresco estable (~20-30 FPS)
    delay(40);
}

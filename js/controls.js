// =============================================================================
// COMPAS - CONTROLADORES DE ENTRADA, SENSORES Y CICLO DE VIDA
// =============================================================================

// ==========================================
// 1. CAPTURA DE SENSORES (GPS + GIROSCOPIO)
// ==========================================

/**
 * Solicita permisos de giroscopio/orientación en iOS Safari o navegadores modernos
 */
async function requestOrientationPermission() {
  const btnGyro = document.getElementById('btnGyro');
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if (btnGyro) btnGyro.textContent = "solicitando...";
      const response = await DeviceOrientationEvent.requestPermission();
      if (response === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation, true);
        window.compasState.gyroActive = true;
        if (btnGyro) {
          btnGyro.textContent = "activo";
          btnGyro.style.textDecoration = "none";
          btnGyro.onclick = null;
        }
      } else {
        if (btnGyro) {
          btnGyro.textContent = "denegado";
          btnGyro.style.textDecoration = "none";
        }
      }
    } catch (err) {
      console.warn("Error al solicitar orientación:", err);
      if (btnGyro) btnGyro.textContent = "error";
    }
  } else if ('ondeviceorientation' in window) {
    window.addEventListener('deviceorientation', handleOrientation, true);
    window.compasState.gyroActive = true;
    if (btnGyro) {
      btnGyro.textContent = "activo";
      btnGyro.style.textDecoration = "none";
      btnGyro.onclick = null;
    }
  } else {
    if (btnGyro) {
      btnGyro.textContent = "no soportado";
      btnGyro.style.textDecoration = "none";
    }
  }
}

/**
 * Procesa lecturas del sensor de orientación (rumbo e inclinación)
 */
function handleOrientation(event) {
  let heading = null;

  if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    heading = (360 - event.alpha) % 360;
  }

  if (heading !== null) {
    window.compasState.heading = heading;
    const card = getCardinal(heading);
    const vHeading = document.getElementById('vHeading');
    if (vHeading) vHeading.textContent = `${Math.round(heading)}° ${card}`;
  }

  if (event.beta !== null && event.gamma !== null) {
    window.compasState.tiltBeta = event.beta;
    window.compasState.tiltGamma = event.gamma;
    const signB = event.beta >= 0 ? "+" : "";
    const signG = event.gamma >= 0 ? "+" : "";
    const vTilt = document.getElementById('vTilt');
    if (vTilt) vTilt.textContent = `${signB}${Math.round(event.beta)}° / ${signG}${Math.round(event.gamma)}°`;
  }
}

/**
 * Inicializa el tracking GPS en tiempo real
 */
function initGeolocation() {
  const vLat = document.getElementById('vLat');
  const vLon = document.getElementById('vLon');
  const vAcc = document.getElementById('vAcc');
  const vZone = document.getElementById('vZone');
  const vMapStatus = document.getElementById('vMapStatus');

  if (!("geolocation" in navigator)) {
    if (vLat) vLat.textContent = "no disponible";
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      window.compasState.userLat = lat;
      window.compasState.userLon = lon;
      window.compasState.accuracy = acc;
      window.compasState.gpsActive = true;

      if (!originInitialized) {
        MAP_ORIGIN_LAT = lat;
        MAP_ORIGIN_LON = lon;
        METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos(MAP_ORIGIN_LAT * Math.PI / 180);
        originInitialized = true;

        const isBcn = isInsideBarcelonaArea(lat, lon);
        if (isBcn) {
          loadBarcelonaMasterIfAvailable(lat, lon);
        } else {
          const cachedSegs = loadMapCache(lat, lon);
          if (cachedSegs && cachedSegs.length >= 500) {
            mapSegments = cachedSegs;
            if (vMapStatus) vMapStatus.textContent = `${mapSegments.length} calles (en caché)`;
          } else {
            fetchRealStreetsForLocation(lat, lon);
          }
        }

        const bcn = getBarcelonaDistrictAndBarri(lat, lon);
        if (bcn) {
          const zoneText = `${bcn.dist.toUpperCase()} | ${formatBarriName(bcn.barri)}`;
          window.compasState.districtNeighborhood = zoneText;
          window.compasState.currentDistrict = bcn.dist.toUpperCase();
          window.compasState.currentDistrictKey = normalizeDistrictName(bcn.dist);
          if (vZone) vZone.textContent = zoneText;
        }

        reverseGeocodeRealLocation(lat, lon);
      }

      const coordsInMeters = latLonToMeters(lat, lon);
      window.compasState.userX = coordsInMeters.x;
      window.compasState.userY = coordsInMeters.y;

      if (bcnMasterData && lastSlicedLat !== null) {
        const moveDist = Math.hypot((lat - lastSlicedLat) * 111132, (lon - lastSlicedLon) * 83362);
        if (moveDist > 150) {
          const bcn = getBarcelonaDistrictAndBarri(lat, lon);
          if (bcn) {
            const zoneText = `${bcn.dist.toUpperCase()} | ${formatBarriName(bcn.barri)}`;
            window.compasState.districtNeighborhood = zoneText;
            window.compasState.currentDistrict = bcn.dist.toUpperCase();
            window.compasState.currentDistrictKey = normalizeDistrictName(bcn.dist);
            if (vZone) vZone.textContent = zoneText;
          }
          sliceLocalSegmentsFromMaster(lat, lon);
          if (bcnTopographyData) {
            sliceTopographyFromMaster(lat, lon);
          }
          if (bcnWaterData) {
            sliceWaterFromMaster(lat, lon);
          }
        }
      }

      if (vLat) vLat.textContent = lat.toFixed(6);
      if (vLon) vLon.textContent = lon.toFixed(6);
      if (vAcc) vAcc.textContent = `±${Math.round(acc)} m`;
    },
    (err) => {
      console.warn("Error GPS:", err);
      if (vLat) vLat.textContent = "sin señal gps";
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

// ==========================================
// 2. INTERACCIÓN TÁCTIL Y RATÓN (ZOOM + TEMA)
// ==========================================

function startZoom(e) {
  const btnGyro = document.getElementById('btnGyro');
  const canvas = document.getElementById('oledCanvas');
  if (e && btnGyro && e.target === btnGyro) return;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scale = SCREEN_W / rect.width;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const x = (cx - rect.left) * scale;
  const y = (cy - rect.top) * scale;

  // Botón superior izquierdo: alternancia de tema claro/oscuro (zona 0-32px X, 0-24px Y)
  if (x >= 0 && x <= 32 && y >= 0 && y <= 24) {
    toggleTheme();
    return;
  }

  isPressing = true;
  touchStartY = cy;
  currentDragY = 0;
}

function moveZoom(e) {
  if (!isPressing) return;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const dy = cy - touchStartY;
  currentDragY = Math.max(0, dy);
}

function endZoom() {
  isPressing = false;
  currentDragY = 0;
}

/**
 * Registra todos los event listeners de interacción en el canvas y la ventana
 */
function initControls() {
  const canvas = document.getElementById('oledCanvas');
  if (!canvas) return;

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startZoom(e);
  }, { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (isPressing) {
      moveZoom(e);
    }
  }, { passive: true });

  window.addEventListener("touchend", endZoom);
  window.addEventListener("touchcancel", endZoom);

  canvas.addEventListener("mousedown", (e) => {
    startZoom(e);
  });

  window.addEventListener("mousemove", (e) => {
    if (isPressing) {
      moveZoom(e);
    } else {
      const rect = canvas.getBoundingClientRect();
      const scale = SCREEN_W / rect.width;
      const x = (e.clientX - rect.left) * scale;
      const y = (e.clientY - rect.top) * scale;
      if (x <= 32 && y <= 24) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "default";
      }
    }
  });

  window.addEventListener("mouseup", endZoom);
}

// ==========================================
// 3. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================

window.addEventListener("DOMContentLoaded", () => {
  initControls();
  initGeolocation();
  requestAnimationFrame(renderOLED);
});

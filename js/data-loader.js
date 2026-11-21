// =============================================================================
// COMPAS - CARGA VECTORIAL Y CORTE ESPACIAL (OFFLINE RESILIENTE + OVERPASS)
// =============================================================================

let bcnMasterData = null;
let bcnTopographyData = null;
let bcnWaterData = null;
let activeTopographyLines = [];
let activeWaterLines = [];
let mapSegments = [];
let isFetchingStreets = false;

let lastSlicedLat = null;
let lastSlicedLon = null;
let lastTopoSlicedLat = null;
let lastTopoSlicedLon = null;

// 1. GESTIÓN DE CACHÉ LOCAL
try {
  localStorage.removeItem('compas_cached_map');
  localStorage.removeItem('compas_map_cached_v1');
  localStorage.removeItem('compas_map_v4_wide');
} catch(e) {}

function saveMapCache(lat, lon, segments) {
  try {
    const data = { lat, lon, segments, ts: Date.now() };
    localStorage.setItem('compas_map_v6_districts', JSON.stringify(data));
  } catch(e) {}
}

function loadMapCache(lat, lon) {
  try {
    const raw = localStorage.getItem('compas_map_v6_districts');
    if (!raw) return null;
    const data = JSON.parse(raw);
    const dLat = (data.lat - lat) * 111132;
    const dLon = (data.lon - lon) * 83362;
    if (Math.hypot(dLat, dLon) < 600 && data.segments && data.segments.length >= 700) {
      return data.segments;
    }
  } catch(e) {}
  return null;
}

// 2. CORTE ESPACIAL VECTORIAL: TOPOGRAFÍA
function sliceTopographyFromMaster(lat, lon) {
  if (!bcnTopographyData || !originInitialized) return;

  const lines = bcnTopographyData;
  const processed = [];
  const mPerDegLat = METERS_PER_DEG_LAT;
  const mPerDegLon = METERS_PER_DEG_LON;

  for (let i = 0; i < lines.length; i++) {
    const poly = lines[i];
    if (!poly || poly.length < 2) continue;

    const count = poly.length;
    const pts = new Int32Array(count * 2);
    let minX = 999999, maxX = -999999, minY = 999999, maxY = -999999;

    for (let j = 0; j < count; j++) {
      const pt = poly[j];
      const x = Math.round((pt[1] - MAP_ORIGIN_LON) * mPerDegLon);
      const y = Math.round((pt[0] - MAP_ORIGIN_LAT) * mPerDegLat);
      pts[j * 2] = x;
      pts[j * 2 + 1] = y;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    processed.push({
      pts,
      count,
      minX, maxX, minY, maxY,
      isMajor: isMajorContourLine(i),
      id: i
    });
  }

  activeTopographyLines = processed;
  lastTopoSlicedLat = lat;
  lastTopoSlicedLon = lon;
}

// 3. CORTE ESPACIAL VECTORIAL: RÍOS (Besòs y Llobregat)
function sliceWaterFromMaster(lat, lon) {
  if (!bcnWaterData || !originInitialized) return;

  const lines = Array.isArray(bcnWaterData) ? bcnWaterData : (bcnWaterData.rivers || []);
  const processed = [];
  const mPerDegLat = METERS_PER_DEG_LAT;
  const mPerDegLon = METERS_PER_DEG_LON;

  for (let i = 0; i < lines.length; i++) {
    const poly = lines[i];
    if (!poly || poly.length < 2) continue;

    const count = poly.length;
    const pts = new Int32Array(count * 2);
    let minX = 999999, maxX = -999999, minY = 999999, maxY = -999999;

    for (let j = 0; j < count; j++) {
      const pt = poly[j];
      const x = Math.round((pt[1] - MAP_ORIGIN_LON) * mPerDegLon);
      const y = Math.round((pt[0] - MAP_ORIGIN_LAT) * mPerDegLat);
      pts[j * 2] = x;
      pts[j * 2 + 1] = y;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    processed.push({
      pts,
      count,
      minX, maxX, minY, maxY,
      id: i
    });
  }

  activeWaterLines = processed;
}

// 4. CORTE ESPACIAL VECTORIAL: CALLES
function sliceLocalSegmentsFromMaster(lat, lon) {
  if (!bcnMasterData || !bcnMasterData.segs) return false;
  if (!originInitialized) {
    MAP_ORIGIN_LAT = lat;
    MAP_ORIGIN_LON = lon;
    METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos(MAP_ORIGIN_LAT * Math.PI / 180);
    originInitialized = true;
  }

  const names = bcnMasterData.names;
  const segs = bcnMasterData.segs;
  const localSegs = [];

  // Radio amplio de corte para cubrir toda Barcelona en zoom lejano
  const maxDistM = 16000;
  const maxDistSq = maxDistM * maxDistM;
  const mPerDegLat = METERS_PER_DEG_LAT;
  const mPerDegLon = METERS_PER_DEG_LON;

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const midLat = (s[0] + s[2]) * 0.5;
    const midLon = (s[1] + s[3]) * 0.5;
    const dy = (midLat - lat) * mPerDegLat;
    const dx = (midLon - lon) * mPerDegLon;
    const rawName = names[s[4]] || "";
    const name = formatStreetName(rawName);
    const isArterial = (s[5] === 4) || isMajorArterialName(name);

    if (Math.abs(dy) > maxDistM || Math.abs(dx) > maxDistM) continue;

    if (dx * dx + dy * dy <= maxDistSq) {
      const p1 = latLonToMeters(s[0], s[1]);
      const p2 = latLonToMeters(s[2], s[3]);
      const distKey = getBarcelonaDistrictKey(midLat, midLon);

      localSegs.push({
        x1: Math.round(p1.x),
        y1: Math.round(p1.y),
        x2: Math.round(p2.x),
        y2: Math.round(p2.y),
        name: name,
        isMajor: isArterial,
        districtKey: distKey,
        opacity: 1.0
      });
    }
  }

  if (localSegs.length > 10) {
    mapSegments = localSegs;
    lastSlicedLat = lat;
    lastSlicedLon = lon;
    if (bcnTopographyData) {
      sliceTopographyFromMaster(lat, lon);
    }
    if (bcnWaterData) {
      sliceWaterFromMaster(lat, lon);
    }
    const vMapStatus = document.getElementById('vMapStatus');
    if (vMapStatus) vMapStatus.textContent = `${mapSegments.length} calles (Barcelona Vectorial)`;
    return true;
  }
  return false;
}

// 5. CARGA DE BASES DE DATOS DE BARCELONA
async function loadBarcelonaMasterIfAvailable(lat, lon) {
  if (!isInsideBarcelonaArea(lat, lon)) return false;
  try {
    const vMapStatus = document.getElementById('vMapStatus');
    if (!bcnMasterData) {
      if (vMapStatus) vMapStatus.textContent = "cargando vector barcelona...";
      const resp = await fetch(`barcelona_complete.json?v=${Date.now()}`);
      if (resp.ok) {
        bcnMasterData = await resp.json();
      }
    }
    if (!bcnTopographyData) {
      fetch(`barcelona_topography.json?v=${Date.now()}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            bcnTopographyData = data;
            if (window.compasState.userLat !== null) {
              sliceTopographyFromMaster(window.compasState.userLat, window.compasState.userLon);
            }
          }
        })
        .catch(e => console.warn("Topografía no disponible:", e));
    }
    if (!bcnWaterData) {
      fetch(`barcelona_water.json?v=${Date.now()}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            bcnWaterData = data;
            if (window.compasState.userLat !== null) {
              sliceWaterFromMaster(window.compasState.userLat, window.compasState.userLon);
            }
          }
        })
        .catch(e => console.warn("Líneas de agua no disponibles:", e));
    }
    if (bcnMasterData) {
      return sliceLocalSegmentsFromMaster(lat, lon);
    }
  } catch(e) {
    console.warn("Error cargando base completa de Barcelona:", e);
  }
  return false;
}

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

// 6. DESCARGA OVERPASS API (FALLBACK FUERA DE BARCELONA)
async function fetchRealStreetsForLocation(lat, lon) {
  if (isFetchingStreets) return;
  isFetchingStreets = true;
  const vMapStatus = document.getElementById('vMapStatus');

  const cached = loadMapCache(lat, lon);
  if (cached && cached.length > 5) {
    mapSegments = cached;
    if (vMapStatus) vMapStatus.textContent = `${mapSegments.length} calles (caché)`;
    isFetchingStreets = false;
    return;
  }

  if (vMapStatus) vMapStatus.textContent = "descargando calles reales...";

  const dLat = 0.0076;
  const dLon = 0.0076 / Math.cos(lat * Math.PI / 180);
  const s = (lat - dLat).toFixed(5);
  const w = (lon - dLon).toFixed(5);
  const n = (lat + dLat).toFixed(5);
  const e = (lon + dLon).toFixed(5);

  const query = `[out:json][timeout:8];(way(${s},${w},${n},${e})["highway"~"^(primary|secondary|tertiary|residential|trunk)$"];);out geom;`;
  let success = false;

  for (let idx = 0; idx < OVERPASS_MIRRORS.length; idx++) {
    const mirror = OVERPASS_MIRRORS[idx];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      let resp = null;
      try {
        resp = await fetch(`${mirror}?data=${encodeURIComponent(query)}`, {
          method: 'GET',
          signal: controller.signal
        });
      } catch(e) {
        resp = await fetch(mirror, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });
      }
      clearTimeout(timeoutId);

      if (!resp || !resp.ok) continue;
      const data = await resp.json();
      if (!data || !data.elements || data.elements.length === 0) continue;

      const newSegs = [];
      for (let k = 0; k < data.elements.length; k++) {
        const elem = data.elements[k];
        if (elem.type === 'way' && elem.geometry && elem.geometry.length >= 2) {
          const highwayType = elem.tags ? elem.tags.highway : "";
          const rawName = elem.tags && elem.tags.name ? elem.tags.name : "";
          const name = formatStreetName(rawName);
          const isArterial = (highwayType === "primary" || highwayType === "trunk" || highwayType === "motorway") || isMajorArterialName(name);

          const pts = elem.geometry.map(p => latLonToMeters(p.lat, p.lon));
          for (let i = 0; i < pts.length - 1; i++) {
            const x1 = Math.round(pts[i].x);
            const y1 = Math.round(pts[i].y);
            const x2 = Math.round(pts[i + 1].x);
            const y2 = Math.round(pts[i + 1].y);
            const midLat = (elem.geometry[i].lat + elem.geometry[i + 1].lat) * 0.5;
            const midLon = (elem.geometry[i].lon + elem.geometry[i + 1].lon) * 0.5;
            const distKey = getBarcelonaDistrictKey(midLat, midLon);

            newSegs.push({
              x1, y1, x2, y2,
              name,
              isMajor: isArterial,
              districtKey: distKey,
              opacity: 1.0
            });
          }
        }
        if (newSegs.length >= 1100) break;
      }

      if (newSegs.length > 5) {
        mapSegments = newSegs;
        saveMapCache(lat, lon, newSegs);
        if (vMapStatus) vMapStatus.textContent = `${mapSegments.length} calles reales`;
        success = true;
        break;
      }
    } catch (err) {
      console.warn("Mirror falló:", mirror);
    }
  }

  if (!success && mapSegments.length === 0) {
    const loadedMaster = await loadBarcelonaMasterIfAvailable(lat, lon);
    if (!loadedMaster) {
      if (vMapStatus) vMapStatus.textContent = "reintentando mapa...";
      setTimeout(() => { isFetchingStreets = false; fetchRealStreetsForLocation(lat, lon); }, 5000);
    } else {
      isFetchingStreets = false;
    }
  } else {
    isFetchingStreets = false;
  }
}

// 7. RECARGA FORZADA DE MAPA
async function forceRefreshMap() {
  const vMapStatus = document.getElementById('vMapStatus');
  try {
    localStorage.removeItem('compas_map_v6_districts');
  } catch(e) {}
  if (window.compasState.userLat !== null) {
    const lat = window.compasState.userLat;
    const lon = window.compasState.userLon;
    if (isInsideBarcelonaArea(lat, lon)) {
      if (vMapStatus) vMapStatus.textContent = "recargando barcelona...";
      bcnMasterData = null;
      bcnTopographyData = null;
      bcnWaterData = null;
      activeWaterLines = [];
      activeTopographyLines = [];
      await loadBarcelonaMasterIfAvailable(lat, lon);
    } else {
      if (vMapStatus) vMapStatus.textContent = "recargando mapa amplio...";
      fetchRealStreetsForLocation(lat, lon);
    }
  }
}

// 8. GEOCODIFICACIÓN INVERSA NOMINATIM
async function reverseGeocodeRealLocation(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'es,ca' } });
    if (!resp.ok) return;
    const data = await resp.json();
    
    if (data && data.address) {
      const addr = data.address;
      const road = addr.road || addr.pedestrian || addr.footway || addr.path || "TU UBICACIÓN";
      
      window.compasState.currentStreet = road.toLowerCase();
      const vCurrentStreet = document.getElementById('vCurrentStreet');
      if (vCurrentStreet) vCurrentStreet.textContent = road.toLowerCase();

      const bcn = getBarcelonaDistrictAndBarri(lat, lon);
      const vZone = document.getElementById('vZone');
      if (bcn) {
        const zoneText = `${bcn.dist.toUpperCase()} | ${formatBarriName(bcn.barri)}`;
        window.compasState.districtNeighborhood = zoneText;
        window.compasState.currentDistrict = bcn.dist.toUpperCase();
        window.compasState.currentDistrictKey = normalizeDistrictName(bcn.dist);
        if (vZone) vZone.textContent = zoneText;
      } else {
        let district = addr.city_district || addr.suburb || addr.borough || addr.county || addr.city || "UBICACIÓN REAL";
        let neighborhood = addr.neighbourhood || addr.quarter || addr.residential || "";
        if (!neighborhood && addr.suburb && addr.suburb !== district) {
          neighborhood = addr.suburb;
        }

        let zoneText = (neighborhood && neighborhood !== district) ? `${district} | ${neighborhood}` : `${district}`;
        zoneText = zoneText.toUpperCase();
        if (zoneText.length > 34) zoneText = zoneText.substring(0, 34);

        window.compasState.districtNeighborhood = zoneText;
        window.compasState.currentDistrict = district;
        window.compasState.currentDistrictKey = normalizeDistrictName(district);
        if (vZone) vZone.textContent = zoneText;
      }
    }
  } catch (err) {
    console.warn("Geocodificación inversa no disponible:", err);
  }
}

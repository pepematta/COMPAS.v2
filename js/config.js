// =============================================================================
// COMPAS - CONFIGURACIÓN Y CONSTANTES DEL SISTEMA
// =============================================================================

// 1. SISTEMA DE TEMAS: "SILENCIO CARTOGRÁFICO"
// Modo Claro (Papel cartográfico) y Modo Oscuro (Verde bosque nocturno)
const THEMES = {
  light: {
    key: 'light',
    mapBg: '#F4EFE6',
    headerBg: '#EAE3D5',
    headerBorder: '#CFC6B4',
    uiText: '#2B2A27',
    topoLine: '#D5CDBE',
    labelBg: '#F4EFE6',
    labelText: '#2B2A27',
    userMarker: '#D1493B',
    waterRiver: '#0284C7',
    waterCoast: '#D5CDBE', // Mismo color que las curvas de nivel
    streetNeutral: '#C5BDB0'
  },
  dark: {
    key: 'dark',
    mapBg: '#13221C',
    headerBg: '#0E1A15',
    headerBorder: '#273E34',
    uiText: '#E8E2D5',
    topoLine: '#253F35',
    labelBg: '#13221C',
    labelText: '#E8E2D5',
    userMarker: '#E85D4A',
    waterRiver: '#38BDF8',
    waterCoast: '#253F35', // Mismo color que las curvas de nivel
    streetNeutral: '#3A5247'
  }
};

// 2. PALETA CROMÁTICA POR DISTRITO (10 DISTRITOS DE BARCELONA)
const DISTRICT_COLORS = {
  ciutatvella:        { light: '#8F4A6A', dark: '#CC7DA1' },
  eixample:           { light: '#9E7322', dark: '#D4AA57' },
  santsmontjuic:      { light: '#3A658A', dark: '#73A6CF' },
  lescorts:           { light: '#77538A', dark: '#B48EC9' },
  sarriasantgervasi:  { light: '#3B7556', dark: '#6EC094' },
  gracia:             { light: '#A35564', dark: '#DE8C9B' },
  hortaguinardo:      { light: '#535C99', dark: '#8891CF' },
  noubarris:          { light: '#677830', dark: '#A5B863' },
  santandreu:         { light: '#945334', dark: '#D18760' },
  santmarti:          { light: '#2A7275', dark: '#5EB9BD' }
};

const DISTRICT_FALLBACK_COLOR = {
  light: '#6E685F',
  dark: '#7E9187'
};

function normalizeDistrictName(name) {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bst\b/g, "sant")
    .replace(/[^a-z0-9]/g, "");
}

function getDistrictColor(districtKeyOrName, themeKey) {
  const norm = normalizeDistrictName(districtKeyOrName);
  const entry = DISTRICT_COLORS[norm];
  if (entry) {
    return themeKey === 'dark' ? entry.dark : entry.light;
  }
  return themeKey === 'dark' ? DISTRICT_FALLBACK_COLOR.dark : DISTRICT_FALLBACK_COLOR.light;
}

let currentThemeKey = 'light';
try {
  const savedTheme = localStorage.getItem('compas_theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    currentThemeKey = savedTheme;
  }
} catch(e) {}

function applyTheme(themeKey) {
  currentThemeKey = themeKey;
  try {
    localStorage.setItem('compas_theme', themeKey);
  } catch(e) {}
  if (themeKey === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function toggleTheme() {
  const nextTheme = currentThemeKey === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
}

// 3. CONSTANTES DE PANTALLA Y ZOOM
const SCREEN_W = 256;
const SCREEN_H = 256;
const CENTER_X = 128;
const CENTER_Y = 128;

const VIEW_METERS_NORMAL = 240.0;
const VIEW_METERS_PEEK   = 360.0;
const VIEW_METERS_MAX    = 15000.0;

let isPressing = false;
let touchStartY = 0;
let currentDragY = 0;
let smoothViewMeters = VIEW_METERS_NORMAL;
let smoothDragRatio = 0.0;

// 4. ORIGEN Y PROYECCIÓN CARTOGRÁFICA LOCAL (Equirrectangular)
let MAP_ORIGIN_LAT = null;
let MAP_ORIGIN_LON = null;
let originInitialized = false;

const METERS_PER_DEG_LAT = 111132.954;
let METERS_PER_DEG_LON = 83362.0;

function latLonToMeters(lat, lon) {
  if (MAP_ORIGIN_LAT === null) return { x: 0, y: 0 };
  return {
    x: (lon - MAP_ORIGIN_LON) * METERS_PER_DEG_LON,
    y: (lat - MAP_ORIGIN_LAT) * METERS_PER_DEG_LAT
  };
}

function isInsideBarcelonaArea(lat, lon) {
  return (lat >= 41.30 && lat <= 41.48 && lon >= 2.05 && lon <= 2.25);
}

// 5. ESTADO GLOBAL DE COMPAS
window.compasState = {
  userLat: null,
  userLon: null,
  userX: 0.0,
  userY: 0.0,
  heading: 0.0,
  tiltBeta: 0.0,
  tiltGamma: 0.0,
  accuracy: null,
  currentStreet: "--",
  districtNeighborhood: "UBICACIÓN REAL",
  currentDistrict: null,
  currentDistrictKey: null,
  gyroActive: false,
  gpsActive: false
};

// 6. CATÁLOGO DE BARRIOS (73 BARRIS DE BARCELONA)
const BARCELONA_BARRIS = [
  { barri: 'EL RAVAL', dist: 'CIUTAT VELLA', lat: 41.3795, lon: 2.1685 },
  { barri: 'EL BARRI GÒTIC', dist: 'CIUTAT VELLA', lat: 41.3828, lon: 2.1769 },
  { barri: 'LA BARCELONETA', dist: 'CIUTAT VELLA', lat: 41.3789, lon: 2.1895 },
  { barri: 'SANT PERE, STA CATERINA I RIBERA', dist: 'CIUTAT VELLA', lat: 41.3865, lon: 2.1818 },
  { barri: 'EL FORT PIENC', dist: 'EIXAMPLE', lat: 41.3970, lon: 2.1825 },
  { barri: 'SAGRADA FAMÍLIA', dist: 'EIXAMPLE', lat: 41.4035, lon: 2.1744 },
  { barri: "DRETA DE L'EIXAMPLE", dist: 'EIXAMPLE', lat: 41.3935, lon: 2.1645 },
  { barri: 'ANTIGA ESQUERRA EIXAMPLE', dist: 'EIXAMPLE', lat: 41.3885, lon: 2.1550 },
  { barri: 'NOVA ESQUERRA EIXAMPLE', dist: 'EIXAMPLE', lat: 41.3825, lon: 2.1475 },
  { barri: 'SANT ANTONI', dist: 'EIXAMPLE', lat: 41.3785, lon: 2.1595 },
  { barri: 'EL POBLE-SEC', dist: 'SANTS-MONTJUÏC', lat: 41.3725, lon: 2.1620 },
  { barri: 'MARINA PRAT VERMELL', dist: 'SANTS-MONTJUÏC', lat: 41.3530, lon: 2.1400 },
  { barri: 'LA MARINA DE PORT', dist: 'SANTS-MONTJUÏC', lat: 41.3615, lon: 2.1380 },
  { barri: 'FONT DE LA GUATLLA', dist: 'SANTS-MONTJUÏC', lat: 41.3705, lon: 2.1460 },
  { barri: 'HOSTAFRANCS', dist: 'SANTS-MONTJUÏC', lat: 41.3750, lon: 2.1420 },
  { barri: 'LA BORDETA', dist: 'SANTS-MONTJUÏC', lat: 41.3695, lon: 2.1340 },
  { barri: 'SANTS - BADAL', dist: 'SANTS-MONTJUÏC', lat: 41.3745, lon: 2.1280 },
  { barri: 'SANTS', dist: 'SANTS-MONTJUÏC', lat: 41.3785, lon: 2.1360 },
  { barri: 'PARC DE MONTJUÏC', dist: 'SANTS-MONTJUÏC', lat: 41.3650, lon: 2.1550 },
  { barri: 'LES CORTS', dist: 'LES CORTS', lat: 41.3855, lon: 2.1270 },
  { barri: 'LA MATERNITAT I ST RAMON', dist: 'LES CORTS', lat: 41.3810, lon: 2.1150 },
  { barri: 'PEDRALBES', dist: 'LES CORTS', lat: 41.3930, lon: 2.1120 },
  { barri: 'VALLVIDRERA, TIBIDABO I PLANES', dist: 'SARRIÀ-ST GERVASI', lat: 41.4170, lon: 2.1050 },
  { barri: 'SARRIÀ', dist: 'SARRIÀ-ST GERVASI', lat: 41.3995, lon: 2.1220 },
  { barri: 'LES TRES TORRES', dist: 'SARRIÀ-ST GERVASI', lat: 41.3980, lon: 2.1315 },
  { barri: 'ST GERVASI - LA BONANOVA', dist: 'SARRIÀ-ST GERVASI', lat: 41.4065, lon: 2.1320 },
  { barri: 'ST GERVASI - GALVANY', dist: 'SARRIÀ-ST GERVASI', lat: 41.3960, lon: 2.1440 },
  { barri: 'EL PUTXET I EL FARRÓ', dist: 'SARRIÀ-ST GERVASI', lat: 41.4060, lon: 2.1460 },
  { barri: 'VALLCARCA I PENITENTS', dist: 'GRÀCIA', lat: 41.4140, lon: 2.1430 },
  { barri: 'EL COLL', dist: 'GRÀCIA', lat: 41.4195, lon: 2.1500 },
  { barri: 'LA SALUT', dist: 'GRÀCIA', lat: 41.4130, lon: 2.1560 },
  { barri: 'LA VILA DE GRÀCIA', dist: 'GRÀCIA', lat: 41.4030, lon: 2.1570 },
  { barri: "CAMP D'EN GRASSOT", dist: 'GRÀCIA', lat: 41.4045, lon: 2.1660 },
  { barri: 'EL BAIX GUINARDÓ', dist: 'HORTA-GUINARDÓ', lat: 41.4110, lon: 2.1690 },
  { barri: 'CAN BARÓ', dist: 'HORTA-GUINARDÓ', lat: 41.4160, lon: 2.1630 },
  { barri: 'EL GUINARDÓ', dist: 'HORTA-GUINARDÓ', lat: 41.4185, lon: 2.1740 },
  { barri: "LA FONT D'EN FARGUES", dist: 'HORTA-GUINARDÓ', lat: 41.4245, lon: 2.1670 },
  { barri: 'EL CARMEL', dist: 'HORTA-GUINARDÓ', lat: 41.4225, lon: 2.1550 },
  { barri: 'LA TEIXONERA', dist: 'HORTA-GUINARDÓ', lat: 41.4240, lon: 2.1460 },
  { barri: 'ST GENÍS DELS AGUDELLS', dist: 'HORTA-GUINARDÓ', lat: 41.4270, lon: 2.1370 },
  { barri: 'MONTBAU', dist: 'HORTA-GUINARDÓ', lat: 41.4310, lon: 2.1440 },
  { barri: "LA VALL D'HEBRON", dist: 'HORTA-GUINARDÓ', lat: 41.4280, lon: 2.1490 },
  { barri: 'LA CLOTA', dist: 'HORTA-GUINARDÓ', lat: 41.4290, lon: 2.1560 },
  { barri: 'HORTA', dist: 'HORTA-GUINARDÓ', lat: 41.4320, lon: 2.1620 },
  { barri: 'VILAPICINA I TORRE LLOBETA', dist: 'NOU BARRIS', lat: 41.4270, lon: 2.1760 },
  { barri: 'PORTA', dist: 'NOU BARRIS', lat: 41.4320, lon: 2.1780 },
  { barri: 'TURÓ DE LA PEIRA', dist: 'NOU BARRIS', lat: 41.4325, lon: 2.1690 },
  { barri: 'CAN PEGUERA', dist: 'NOU BARRIS', lat: 41.4350, lon: 2.1660 },
  { barri: 'LA GUINEUETA', dist: 'NOU BARRIS', lat: 41.4385, lon: 2.1700 },
  { barri: 'CANYELLES', dist: 'NOU BARRIS', lat: 41.4420, lon: 2.1670 },
  { barri: 'LES ROQUETES', dist: 'NOU BARRIS', lat: 41.4440, lon: 2.1750 },
  { barri: 'VERDUM', dist: 'NOU BARRIS', lat: 41.4400, lon: 2.1770 },
  { barri: 'LA PROSPERITAT', dist: 'NOU BARRIS', lat: 41.4410, lon: 2.1830 },
  { barri: 'LA TRINITAT NOVA', dist: 'NOU BARRIS', lat: 41.4470, lon: 2.1840 },
  { barri: 'TORRE BARÓ', dist: 'NOU BARRIS', lat: 41.4580, lon: 2.1820 },
  { barri: 'CIUTAT MERIDIANA', dist: 'NOU BARRIS', lat: 41.4610, lon: 2.1770 },
  { barri: 'VALLBONA', dist: 'NOU BARRIS', lat: 41.4560, lon: 2.1900 },
  { barri: 'LA TRINITAT VELLA', dist: 'SANT ANDREU', lat: 41.4490, lon: 2.1920 },
  { barri: 'BARÓ DE VIVER', dist: 'SANT ANDREU', lat: 41.4470, lon: 2.2010 },
  { barri: 'EL BON PASTOR', dist: 'SANT ANDREU', lat: 41.4390, lon: 2.2070 },
  { barri: 'SANT ANDREU DE PALOMAR', dist: 'SANT ANDREU', lat: 41.4350, lon: 2.1900 },
  { barri: 'LA SAGRERA', dist: 'SANT ANDREU', lat: 41.4240, lon: 2.1880 },
  { barri: 'CONGRÉS I ELS INDIANS', dist: 'SANT ANDREU', lat: 41.4230, lon: 2.1800 },
  { barri: 'NAVAS', dist: 'SANT ANDREU', lat: 41.4170, lon: 2.1830 },
  { barri: "CAMP D'EN GRASSOT I GRÀCIA NOVA", dist: 'GRÀCIA', lat: 41.4060, lon: 2.1640 },
  { barri: "CAMP DE L'ARPA DEL CLOT", dist: 'SANT MARTÍ', lat: 41.4110, lon: 2.1810 },
  { barri: 'EL CLOT', dist: 'SANT MARTÍ', lat: 41.4080, lon: 2.1880 },
  { barri: 'PARC I LA LLACUNA', dist: 'SANT MARTÍ', lat: 41.3980, lon: 2.1900 },
  { barri: 'LA VILA OLÍMPICA', dist: 'SANT MARTÍ', lat: 41.3890, lon: 2.1950 },
  { barri: 'EL POBLENOU', dist: 'SANT MARTÍ', lat: 41.4010, lon: 2.2030 },
  { barri: 'DIAGONAL MAR', dist: 'SANT MARTÍ', lat: 41.4090, lon: 2.2130 },
  { barri: 'EL BESÒS I EL MARESME', dist: 'SANT MARTÍ', lat: 41.4180, lon: 2.2150 },
  { barri: 'PROVENÇALS DEL POBLENOU', dist: 'SANT MARTÍ', lat: 41.4110, lon: 2.2010 },
  { barri: 'ST MARTÍ DE PROVENÇALS', dist: 'SANT MARTÍ', lat: 41.4180, lon: 2.1980 },
  { barri: 'LA VERNEDA I LA PAU', dist: 'SANT MARTÍ', lat: 41.4240, lon: 2.2040 }
];

function getBarcelonaDistrictAndBarri(lat, lon) {
  if (lat < 41.30 || lat > 41.48 || lon < 2.05 || lon > 2.25) {
    return null;
  }
  let best = null;
  let minD2 = Infinity;
  const cosLat = Math.cos(lat * Math.PI / 180.0);
  for (let i = 0; i < BARCELONA_BARRIS.length; i++) {
    const b = BARCELONA_BARRIS[i];
    const dLat = b.lat - lat;
    const dLon = (b.lon - lon) * cosLat;
    const d2 = dLat * dLat + dLon * dLon;
    if (d2 < minD2) {
      minD2 = d2;
      best = b;
    }
  }
  return best;
}

function getBarcelonaDistrictKey(lat, lon) {
  if (lat < 41.30 || lat > 41.48 || lon < 2.05 || lon > 2.25) {
    return null;
  }
  const bcn = getBarcelonaDistrictAndBarri(lat, lon);
  return bcn ? normalizeDistrictName(bcn.dist) : null;
}

// 7. CENTROIDES DE DISTRITOS
const BARCELONA_DISTRICT_CENTROIDS = [
  { key: 'ciutatvella',       name: 'CIUTAT VELLA',       lat: 41.38193, lon: 2.17917 },
  { key: 'eixample',          name: 'EIXAMPLE',          lat: 41.39058, lon: 2.16390 },
  { key: 'santsmontjuic',     name: 'SANTS-MONTJUÏC',     lat: 41.36889, lon: 2.14233 },
  { key: 'lescorts',          name: 'LES CORTS',          lat: 41.38650, lon: 2.11800 },
  { key: 'sarriasantgervasi', name: 'SARRIÀ-SANT GERVASI',lat: 41.40100, lon: 2.12100 },
  { key: 'gracia',            name: 'GRÀCIA',             lat: 41.41000, lon: 2.15600 },
  { key: 'hortaguinardo',     name: 'HORTA-GUINARDÓ',     lat: 41.42395, lon: 2.15655 },
  { key: 'noubarris',         name: 'NOU BARRIS',         lat: 41.44262, lon: 2.17646 },
  { key: 'santandreu',        name: 'SANT ANDREU',        lat: 41.43343, lon: 2.19157 },
  { key: 'santmarti',         name: 'SANT MARTÍ',         lat: 41.40870, lon: 2.19880 }
];

// 8. ELEMENTOS GEOGRÁFICOS PRINCIPALES (Zona Geográfica: 12000m - 15000m)
const BARCELONA_GEOGRAPHIC_FEATURES = [
  { key: 'mar',        label: 'mar mediterrània',        lat: 41.3800, lon: 2.2280 },
  { key: 'llobregat',  label: 'riu llobregat',           lat: 41.3450, lon: 2.1150 },
  { key: 'besos',      label: 'riu besòs',               lat: 41.4220, lon: 2.2150 },
  { key: 'tibidabo',   label: 'tibidabo (512m)',         lat: 41.4219, lon: 2.1189 },
  { key: 'collserola', label: 'serra de collserola',     lat: 41.4280, lon: 2.1050 },
  { key: 'montjuic',   label: 'montjuïc (173m)',         lat: 41.3639, lon: 2.1656 },
  { key: 'rovira',     label: 'turó de la rovira',       lat: 41.4192, lon: 2.1617 },
  { key: 'santpere',   label: 'sant pere màrtir (384m)', lat: 41.3961, lon: 2.1020 }
];

// 9. RANGOS DE CURVAS MAESTRAS DE 20M EN TOPOGRAFÍA
const MAJOR_20M_RANGES = [
  128,270, 389,456, 533,566, 637,657, 722,738, 793,814, 895,914, 973,995,
  1063,1090, 1149,1164, 1210,1224, 1269,1280, 1329,1346, 1397,1407, 1444,1455,
  1476,1479, 1493,1501, 1532,1546, 1581,1591, 1622,1631, 1662,1670, 1694,1698,
  1714,1719, 1737,1741, 1752,1752, 1756,1756
];

function isMajorContourLine(idx) {
  for (let r = 0; r < MAJOR_20M_RANGES.length; r += 2) {
    if (idx >= MAJOR_20M_RANGES[r] && idx <= MAJOR_20M_RANGES[r + 1]) return true;
  }
  return false;
}

// 10. FUNCIONES DE FORMATEO Y UTILIDADES
function isMajorArterialName(name) {
  if (!name) return false;
  const n = name.toUpperCase();
  return n.includes("DIAGONAL") || n.includes("MERIDIANA") || n.includes("GRAN VIA") ||
         n.includes("ARAGÓ") || n.includes("ARAGO") || n.includes("PARAL·LEL") || n.includes("PARAL.LEL") ||
         n.includes("PASSEIG DE GRÀCIA") || n.includes("PASSEIG DE GRACIA") || n.includes("VIA LAIETANA") ||
         n.includes("BALMES") || n.includes("NUMÀNCIA") || n.includes("NUMANCIA") || n.includes("TARRAGONA") ||
         n.includes("PASSEIG DE SANT JOAN") || n.includes("MARINA") || n.includes("GUIPÚSCOA") ||
         n.includes("GUIPUSCOA") || n.includes("RAMBLA DE PRIM") || n.includes("RONDA") ||
         n.includes("VIA AUGUSTA") || n.includes("VALL D'HEBRON") || n.includes("MALLORCA") ||
         n.includes("VALÈNCIA") || n.includes("VALENCIA") || n.includes("ROMA") ||
         n.includes("JOSEP TARRADELLAS") || n.includes("CARLES III");
}

function formatStreetName(rawName) {
  if (!rawName) return "";
  let name = rawName.toUpperCase()
    .replace(/^CARRER D'|^CARRER DE L'|^CARRER DE LA |^CARRER DE LES |^CARRER DELS |^CARRER DEL |^CARRER DE |^CARRER /, "C. ")
    .replace(/^AVINGUDA DIAGONAL|^AV. DIAGONAL/, "DIAGONAL")
    .replace(/^AVINGUDA D'|^AVINGUDA DE |^AVINGUDA /, "AV. ")
    .replace(/^PASSEIG DE |^PASSEIG D'|^PASSEIG /, "PG. ")
    .replace(/^RAMBLA DEL |^RAMBLA DE |^RAMBLA /, "RBLA. ")
    .replace(/^GRAN VIA DE LES CORTS CATALANES|^GRAN VIA/, "GRAN VIA")
    .replace(/^CALLE DE LA |^CALLE DE LAS |^CALLE DE LOS |^CALLE DEL |^CALLE DE |^CALLE D'|^CALLE /, "C. ")
    .replace(/^AVENIDA DE |^AVENIDA /, "AV. ")
    .replace(/^PASEO DE |^PASEO /, "PG. ")
    .replace(/^RONDA DE |^RONDA /, "RDA. ")
    .replace(/^PLAÇA DE |^PLAÇA DEL |^PLAÇA D'|^PLAÇA |^PLAZA DE |^PLAZA /, "PL. ")
    .trim();
  if (name.length > 25) name = name.substring(0, 25);
  return name.toLowerCase();
}

function splitDistrictNameToLines(name) {
  if (!name) return [];
  if (name.length <= 15) return [name.toUpperCase()];
  if (name === "SARRIÀ-SANT GERVASI") return ["SARRIÀ-", "SANT GERVASI"];
  if (name.includes("-")) {
    const parts = name.split("-");
    if (parts.length === 2) return [parts[0].toUpperCase() + "-", parts[1].toUpperCase()];
  }
  return [name.toUpperCase()];
}

function formatBarriName(str) {
  if (!str) return "";
  const words = str.toLowerCase().split(/\s+/);
  return words.map((w, idx) => {
    if (w.includes("'")) {
      const parts = w.split("'");
      const p0 = (idx === 0 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : parts[0].toLowerCase());
      const p1 = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      return p0 + "'" + p1;
    }
    if (w.includes("-")) {
      return w.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
    }
    if (idx > 0 && (w === "de" || w === "del" || w === "dels" || w === "i" || w === "en" || w === "a")) {
      return w;
    }
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

function splitBarriNameToLines(name) {
  if (!name) return [];
  if (name.length <= 16) return [name];
  if (name.includes(",")) {
    const parts = name.split(",");
    return [parts[0].trim(), parts.slice(1).join(",").trim()];
  }
  if (name.includes(" - ")) {
    const parts = name.split(" - ");
    return [parts[0].trim(), parts[1].trim()];
  }
  const words = name.split(/\s+/);
  if (words.length <= 1) return [name];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function splitStreetNameToLines(name) {
  if (!name) return [];
  if (name.length <= 13) {
    return [name];
  }

  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= 1) {
    const mid = Math.ceil(name.length / 2);
    return [name.substring(0, mid) + '-', name.substring(mid)];
  }

  let bestSplit = [words[0], words.slice(1).join(' ')];
  let minScore = 999;

  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    const maxLen = Math.max(l1.length, l2.length);
    const diff = Math.abs(l1.length - l2.length);
    const penalty = maxLen > 13 ? (maxLen - 13) * 6 : 0;
    const score = diff + penalty;

    if (score < minScore) {
      minScore = score;
      bestSplit = [l1, l2];
    }
  }

  return bestSplit;
}

function getCardinal(deg) {
  const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return directions[Math.round(deg / 45) % 8];
}

// 11. FUNCIONES MATEMÁTICAS Y DE COLOR
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 180, g: 180, b: 180 };
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  if (isNaN(num)) return { r: 180, g: 180, b: 180 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function lerpColor(hexA, hexB, t) {
  if (t <= 0.001) return hexA;
  if (t >= 0.999) return hexB;
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

// =============================================================================
// COMPAS - PIPELINE GRÁFICO MODULAR (OLED CANVAS 256x256)
// =============================================================================

// 1. CAPA 0: LÍNEAS TOPOGRÁFICAS (Curvas de nivel en fondo)
function drawTopography(ctx, view, theme) {
  if (activeTopographyLines.length === 0) return;

  ctx.save();
  ctx.strokeStyle = theme.topoLine;
  ctx.lineWidth = (view.smoothMeters > 2500) ? 1.0 : (view.smoothMeters > 600 ? 0.85 : 0.75);
  ctx.beginPath();

  const isFarZoom = view.smoothMeters > 6000;
  const isMidZoom = view.smoothMeters > 1500;
  const isTransition = view.smoothMeters > 600;
  const pointStep = isFarZoom ? 3 : (isMidZoom ? 2 : 1);

  for (let t = 0; t < activeTopographyLines.length; t++) {
    const line = activeTopographyLines[t];

    if (isFarZoom) {
      if (!line.isMajor || line.count < 6) continue;
    } else if (isMidZoom) {
      if (!line.isMajor) continue;
    } else if (isTransition) {
      if (!line.isMajor && (line.id % 2 !== 0)) continue;
    }

    const dxMin = line.minX - view.uX;
    const dxMax = line.maxX - view.uX;
    const dyMin = line.minY - view.uY;
    const dyMax = line.maxY - view.uY;

    if (dxMax < -view.cullingRadius || dxMin > view.cullingRadius ||
        dyMax < -view.cullingRadius || dyMin > view.cullingRadius) {
      continue;
    }

    const pts = line.pts;
    const count = line.count;

    for (let p = 0; p < count; p += pointStep) {
      const mx = pts[p * 2];
      const my = pts[p * 2 + 1];
      const dx = mx - view.uX;
      const dy = my - view.uY;

      const rx = dx * view.cosH - dy * view.sinH;
      const ry = dx * view.sinH + dy * view.cosH;

      const sx = Math.round(CENTER_X + rx * view.ppm);
      const sy = Math.round(CENTER_Y - ry * view.ppm);

      if (p === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }

    if ((count - 1) % pointStep !== 0) {
      const lastIdx = (count - 1) * 2;
      const mx = pts[lastIdx];
      const my = pts[lastIdx + 1];
      const dx = mx - view.uX;
      const dy = my - view.uY;
      const rx = dx * view.cosH - dy * view.sinH;
      const ry = dx * view.sinH + dy * view.cosH;
      const sx = Math.round(CENTER_X + rx * view.ppm);
      const sy = Math.round(CENTER_Y - ry * view.ppm);
      ctx.lineTo(sx, sy);
    }
  }

  ctx.stroke();
  ctx.restore();
}

// 2. CAPA 1: AGUA (Línea de costa en color relieve + Cursos fluviales en celeste)
function drawWater(ctx, view, theme) {
  const waterAlpha = smoothstep(4000, 9500, view.smoothMeters);
  if (waterAlpha <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = waterAlpha;

  // A) Línea costera: MISMO COLOR QUE LAS CURVAS DE NIVEL
  if (activeCoastLines.length > 0) {
    ctx.strokeStyle = theme.topoLine;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    for (let w = 0; w < activeCoastLines.length; w++) {
      const line = activeCoastLines[w];
      const dxMin = line.minX - view.uX;
      const dxMax = line.maxX - view.uX;
      const dyMin = line.minY - view.uY;
      const dyMax = line.maxY - view.uY;
      if (dxMax < -view.cullingRadius || dxMin > view.cullingRadius || dyMax < -view.cullingRadius || dyMin > view.cullingRadius) continue;

      const pts = line.pts;
      const count = line.count;
      for (let p = 0; p < count; p++) {
        const mx = pts[p * 2];
        const my = pts[p * 2 + 1];
        const dx = mx - view.uX;
        const dy = my - view.uY;
        const rx = dx * view.cosH - dy * view.sinH;
        const ry = dx * view.sinH + dy * view.cosH;
        const sx = Math.round(CENTER_X + rx * view.ppm);
        const sy = Math.round(CENTER_Y - ry * view.ppm);
        if (p === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  }

  // B) Cursos fluviales: CELESTE DESTACADO (Besòs y Llobregat)
  if (activeRiverLines.length > 0) {
    const isGeoZone = view.smoothMeters >= 11800;
    const riverWidth = isGeoZone ? 2.2 : 1.7;

    ctx.strokeStyle = theme.waterRiver;
    ctx.lineWidth = riverWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let w = 0; w < activeRiverLines.length; w++) {
      const line = activeRiverLines[w];
      const dxMin = line.minX - view.uX;
      const dxMax = line.maxX - view.uX;
      const dyMin = line.minY - view.uY;
      const dyMax = line.maxY - view.uY;
      if (dxMax < -view.cullingRadius || dxMin > view.cullingRadius || dyMax < -view.cullingRadius || dyMin > view.cullingRadius) continue;

      const pts = line.pts;
      const count = line.count;
      for (let p = 0; p < count; p++) {
        const mx = pts[p * 2];
        const my = pts[p * 2 + 1];
        const dx = mx - view.uX;
        const dy = my - view.uY;
        const rx = dx * view.cosH - dy * view.sinH;
        const ry = dx * view.sinH + dy * view.cosH;
        const sx = Math.round(CENTER_X + rx * view.ppm);
        const sy = Math.round(CENTER_Y - ry * view.ppm);
        if (p === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}

// 3. CAPA 2: RED VIAL (Calles secundarias y principales)
function drawStreets(ctx, view, theme, districtBatches) {
  const colorDesat = smoothstep(9000, 11500, view.smoothMeters);
  const streetFade = 1.0 - smoothstep(9500, 12000, view.smoothMeters);

  if (streetFade <= 0.005) return;

  // A) Calles secundarias
  const secLineWidth = (view.smoothMeters <= 1500)
    ? 1.1
    : Math.max(0.65, 1.1 - ((view.smoothMeters - 1500) / 10500) * 0.45);

  ctx.lineWidth = secLineWidth;
  for (const key in districtBatches) {
    const batch = districtBatches[key];
    if (batch.sec.length === 0) continue;
    ctx.save();
    ctx.strokeStyle = (colorDesat > 0.01)
      ? lerpColor(batch.color, theme.streetNeutral, colorDesat)
      : batch.color;
    const effAlpha = ((typeof batch.opacity === 'number') ? batch.opacity : 1.0) * streetFade;
    if (effAlpha < 0.99) ctx.globalAlpha = Math.max(0.0, Math.min(1.0, effAlpha));
    ctx.beginPath();
    for (let j = 0; j < batch.sec.length; j += 4) {
      ctx.moveTo(batch.sec[j], batch.sec[j + 1]);
      ctx.lineTo(batch.sec[j + 2], batch.sec[j + 3]);
    }
    ctx.stroke();
    ctx.restore();
  }

  // B) Vías principales
  const priLineWidth = (view.smoothMeters <= 1500)
    ? 2.4
    : Math.max(1.6, 2.4 - ((view.smoothMeters - 1500) / 10500) * 0.8);

  ctx.lineWidth = priLineWidth;
  for (const key in districtBatches) {
    const batch = districtBatches[key];
    if (batch.pri.length === 0) continue;
    ctx.save();
    ctx.strokeStyle = (colorDesat > 0.01)
      ? lerpColor(batch.color, theme.streetNeutral, colorDesat)
      : batch.color;
    const effAlpha = ((typeof batch.opacity === 'number') ? batch.opacity : 1.0) * streetFade;
    if (effAlpha < 0.99) ctx.globalAlpha = Math.max(0.0, Math.min(1.0, effAlpha));
    ctx.beginPath();
    for (let j = 0; j < batch.pri.length; j += 4) {
      ctx.moveTo(batch.pri[j], batch.pri[j + 1]);
      ctx.lineTo(batch.pri[j + 2], batch.pri[j + 3]);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// 4. CAPA 3: ETIQUETAS DE CALLES ORIENTADAS AL VECTOR CON HALO
function drawStreetLabels(ctx, view, theme, candidateList) {
  const streetLabelOpacity = Math.max(0, Math.min(1.0, 1.0 - (view.smoothMeters - 1450) / 100));
  if (streetLabelOpacity <= 0.02 || candidateList.length === 0) return;

  ctx.save();
  ctx.globalAlpha = streetLabelOpacity;
  ctx.font = "600 8.5px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let k = 0; k < candidateList.length; k++) {
    const item = candidateList[k];

    ctx.save();
    ctx.translate(item.mx, item.my);
    ctx.rotate(item.angle);

    // Halo protector en color de fondo del mapa
    ctx.strokeStyle = theme.mapBg;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(item.formattedName, 0, -6.0);

    // Texto en minúsculas flotando sobre la vía
    ctx.fillStyle = theme.labelText;
    ctx.fillText(item.formattedName, 0, -6.0);

    ctx.restore();
  }

  ctx.restore();
}

// 5. CAPA 4: ETIQUETAS DE BARRIOS EN ZONA DE BARRIOS (1500m - 2500m)
function drawBarrioBadges(ctx, view, theme) {
  const barrioFadeIn = Math.min(1.0, Math.max(0, (view.smoothMeters - 1450) / 100));
  const barrioFadeOut = Math.max(0, Math.min(1.0, 1.0 - (view.smoothMeters - 2450) / 100));
  const barrioOpacity = Math.min(barrioFadeIn, barrioFadeOut);

  if (barrioOpacity <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = barrioOpacity;
  ctx.font = "500 8px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "middle";

  const sortedBarris = BARCELONA_BARRIS.map(b => {
    const m = latLonToMeters(b.lat, b.lon);
    const dx = m.x - view.uX;
    const dy = m.y - view.uY;
    return { ...b, dx, dy, d2: dx * dx + dy * dy };
  }).sort((a, b) => a.d2 - b.d2);

  const visibleBarrios = [];
  for (let d = 0; d < sortedBarris.length; d++) {
    if (visibleBarrios.length >= 8) break;
    const barriObj = sortedBarris[d];

    const rx = barriObj.dx * view.cosH - barriObj.dy * view.sinH;
    const ry = barriObj.dx * view.sinH + barriObj.dy * view.cosH;

    const sx = Math.round(CENTER_X + rx * view.ppm);
    const sy = Math.round(CENTER_Y - ry * view.ppm);

    if (sx >= 10 && sx <= SCREEN_W - 10 && sy >= 26 && sy <= SCREEN_H - 14) {
      visibleBarrios.push({ ...barriObj, sx, sy });
    }
  }

  const barrioBoxes = [];
  for (let d = 0; d < visibleBarrios.length; d++) {
    const barriObj = visibleBarrios[d];
    const formattedName = formatBarriName(barriObj.barri);
    const lines = splitBarriNameToLines(formattedName);
    const distKey = normalizeDistrictName(barriObj.dist);
    const badgeBorderColor = getDistrictColor(distKey, currentThemeKey);

    let badgeW = 0;
    let badgeH = 0;
    if (lines.length === 1) {
      const tw = ctx.measureText(lines[0]).width;
      badgeW = Math.round(tw + 8);
      badgeH = 14;
    } else {
      const tw1 = ctx.measureText(lines[0]).width;
      const tw2 = ctx.measureText(lines[1]).width;
      badgeW = Math.round(Math.max(tw1, tw2) + 8);
      badgeH = 22;
    }

    barrioBoxes.push({
      name: formattedName,
      lines,
      badgeBorderColor,
      w: badgeW,
      h: badgeH,
      origX: barriObj.sx,
      origY: barriObj.sy,
      cx: barriObj.sx,
      cy: barriObj.sy
    });
  }

  const barrioBounds = { minX: 4, maxX: SCREEN_W - 4, minY: 24, maxY: SCREEN_H - 12 };
  relaxLabelBoxes(barrioBoxes, barrioBounds, 18);

  for (let d = 0; d < barrioBoxes.length; d++) {
    const box = barrioBoxes[d];
    const targetShiftX = box.cx - box.origX;
    const targetShiftY = box.cy - box.origY;

    let shift = barrioLabelShiftMap.get(box.name);
    if (!shift) {
      shift = { dx: targetShiftX, dy: targetShiftY, lastSeen: labelAnimFrameCount };
      barrioLabelShiftMap.set(box.name, shift);
    } else {
      const easing = 0.22;
      shift.dx += (targetShiftX - shift.dx) * easing;
      shift.dy += (targetShiftY - shift.dy) * easing;
      shift.lastSeen = labelAnimFrameCount;
    }

    const renderCx = box.origX + shift.dx;
    const renderCy = box.origY + shift.dy;
    const bx = Math.round(renderCx - box.w / 2);
    const by = Math.round(renderCy - box.h / 2);

    drawBadge(ctx, bx, by, box.w, box.h, 2, theme.labelBg, box.badgeBorderColor);

    ctx.fillStyle = theme.labelText;
    ctx.textAlign = "center";
    if (box.lines.length === 1) {
      ctx.fillText(box.lines[0], renderCx, renderCy + 0.5);
    } else {
      ctx.fillText(box.lines[0], renderCx, renderCy - 4.5);
      ctx.fillText(box.lines[1], renderCx, renderCy + 4.5);
    }
  }

  ctx.restore();

  if (labelAnimFrameCount % 120 === 0) {
    for (const [key, shift] of barrioLabelShiftMap.entries()) {
      if (labelAnimFrameCount - shift.lastSeen > 90) {
        barrioLabelShiftMap.delete(key);
      }
    }
  }
}

// 6. CAPA 5: ETIQUETAS DE DISTRITOS EN ZONA DISTANTE (2500m - 12000m)
function drawDistrictBadges(ctx, view, theme) {
  const distFadeIn = Math.min(1.0, Math.max(0, (view.smoothMeters - 2450) / 100));
  const distFadeOut = 1.0 - smoothstep(9500, 11800, view.smoothMeters);
  const districtOpacity = Math.min(distFadeIn, distFadeOut);

  if (districtOpacity <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = districtOpacity;
  ctx.font = "600 8px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "middle";

  const sortedDistricts = BARCELONA_DISTRICT_CENTROIDS.map(d => {
    const m = latLonToMeters(d.lat, d.lon);
    const dx = m.x - view.uX;
    const dy = m.y - view.uY;
    return { ...d, dx, dy, d2: dx * dx + dy * dy };
  }).sort((a, b) => a.d2 - b.d2);

  const visibleDistricts = [];
  for (let d = 0; d < sortedDistricts.length; d++) {
    const distObj = sortedDistricts[d];

    const rx = distObj.dx * view.cosH - distObj.dy * view.sinH;
    const ry = distObj.dx * view.sinH + distObj.dy * view.cosH;

    const sx = Math.round(CENTER_X + rx * view.ppm);
    const sy = Math.round(CENTER_Y - ry * view.ppm);

    if (sx >= 10 && sx <= SCREEN_W - 10 && sy >= 24 && sy <= SCREEN_H - 12) {
      visibleDistricts.push({ ...distObj, sx, sy });
    }
  }

  const districtBoxes = [];
  for (let d = 0; d < visibleDistricts.length; d++) {
    const distObj = visibleDistricts[d];
    const lines = splitDistrictNameToLines(distObj.name.toUpperCase());
    const badgeBorderColor = getDistrictColor(distObj.key, currentThemeKey);

    let badgeW = 0;
    let badgeH = 0;
    if (lines.length === 1) {
      const tw = ctx.measureText(lines[0]).width;
      badgeW = Math.round(tw + 8);
      badgeH = 13;
    } else {
      const tw1 = ctx.measureText(lines[0]).width;
      const tw2 = ctx.measureText(lines[1]).width;
      badgeW = Math.round(Math.max(tw1, tw2) + 8);
      badgeH = 20;
    }

    districtBoxes.push({
      name: distObj.name.toUpperCase(),
      lines,
      badgeBorderColor,
      w: badgeW,
      h: badgeH,
      origX: distObj.sx,
      origY: distObj.sy,
      cx: distObj.sx,
      cy: distObj.sy
    });
  }

  const distBounds = { minX: 4, maxX: SCREEN_W - 4, minY: 24, maxY: SCREEN_H - 12 };
  relaxLabelBoxes(districtBoxes, distBounds, 18);

  for (let d = 0; d < districtBoxes.length; d++) {
    const box = districtBoxes[d];
    const targetShiftX = box.cx - box.origX;
    const targetShiftY = box.cy - box.origY;

    let shift = districtLabelShiftMap.get(box.name);
    if (!shift) {
      shift = { dx: targetShiftX, dy: targetShiftY, lastSeen: labelAnimFrameCount };
      districtLabelShiftMap.set(box.name, shift);
    } else {
      const easing = 0.22;
      shift.dx += (targetShiftX - shift.dx) * easing;
      shift.dy += (targetShiftY - shift.dy) * easing;
      shift.lastSeen = labelAnimFrameCount;
    }

    const renderCx = box.origX + shift.dx;
    const renderCy = box.origY + shift.dy;
    const bx = Math.round(renderCx - box.w / 2);
    const by = Math.round(renderCy - box.h / 2);

    drawBadge(ctx, bx, by, box.w, box.h, 2, theme.labelBg, box.badgeBorderColor);

    ctx.fillStyle = theme.labelText;
    ctx.textAlign = "center";
    if (box.lines.length === 1) {
      ctx.fillText(box.lines[0], renderCx, renderCy + 0.5);
    } else {
      ctx.fillText(box.lines[0], renderCx, renderCy - 4.5);
      ctx.fillText(box.lines[1], renderCx, renderCy + 4.5);
    }
  }

  ctx.restore();

  if (labelAnimFrameCount % 120 === 0) {
    for (const [key, shift] of districtLabelShiftMap.entries()) {
      if (labelAnimFrameCount - shift.lastSeen > 90) {
        districtLabelShiftMap.delete(key);
      }
    }
  }
}

// 7. CAPA 6: ETIQUETAS GEOGRÁFICAS EN ZONA GEOGRÁFICA (12000m - 15000m)
function drawGeographicLabels(ctx, view, theme) {
  const geoOpacity = smoothstep(11200, 12200, view.smoothMeters);
  if (geoOpacity <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = geoOpacity;
  ctx.font = "600 8.5px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const visibleGeos = [];
  for (let g = 0; g < BARCELONA_GEOGRAPHIC_FEATURES.length; g++) {
    const feat = BARCELONA_GEOGRAPHIC_FEATURES[g];
    const m = latLonToMeters(feat.lat, feat.lon);
    const dx = m.x - view.uX;
    const dy = m.y - view.uY;

    const rx = dx * view.cosH - dy * view.sinH;
    const ry = dx * view.sinH + dy * view.cosH;

    const sx = Math.round(CENTER_X + rx * view.ppm);
    const sy = Math.round(CENTER_Y - ry * view.ppm);

    if (sx >= 12 && sx <= SCREEN_W - 12 && sy >= 28 && sy <= SCREEN_H - 14) {
      visibleGeos.push({ ...feat, sx, sy });
    }
  }

  const geoBoxes = [];
  for (let g = 0; g < visibleGeos.length; g++) {
    const feat = visibleGeos[g];
    const tw = ctx.measureText(feat.label).width;
    geoBoxes.push({
      name: feat.key,
      label: feat.label,
      w: Math.round(tw + 8),
      h: 12,
      origX: feat.sx,
      origY: feat.sy,
      cx: feat.sx,
      cy: feat.sy
    });
  }

  const geoBounds = { minX: 10, maxX: SCREEN_W - 10, minY: 28, maxY: SCREEN_H - 12 };
  relaxLabelBoxes(geoBoxes, geoBounds, 18);

  for (let g = 0; g < geoBoxes.length; g++) {
    const box = geoBoxes[g];
    const targetShiftX = box.cx - box.origX;
    const targetShiftY = box.cy - box.origY;

    let shift = geoLabelShiftMap.get(box.name);
    if (!shift) {
      shift = { dx: targetShiftX, dy: targetShiftY, lastSeen: labelAnimFrameCount };
      geoLabelShiftMap.set(box.name, shift);
    } else {
      const easing = 0.22;
      shift.dx += (targetShiftX - shift.dx) * easing;
      shift.dy += (targetShiftY - shift.dy) * easing;
      shift.lastSeen = labelAnimFrameCount;
    }

    const renderCx = box.origX + shift.dx;
    const renderCy = box.origY + shift.dy;

    // Halo protector en color de fondo del mapa (knockout halo sin caja)
    ctx.strokeStyle = theme.mapBg;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(box.label, renderCx, renderCy);

    // Texto tipográfico limpio en minúsculas
    ctx.fillStyle = theme.labelText;
    ctx.fillText(box.label, renderCx, renderCy);
  }

  ctx.restore();

  if (labelAnimFrameCount % 120 === 0) {
    for (const [key, shift] of geoLabelShiftMap.entries()) {
      if (labelAnimFrameCount - shift.lastSeen > 90) {
        geoLabelShiftMap.delete(key);
      }
    }
  }
}

// 8. HUD SUPERIOR: ENCABEZADO "DISTRITO | BARRIO" + PUNTO 7PX DEL DISTRITO + BOTÓN SOL/LUNA
function drawHeaderHUD(ctx, theme) {
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, SCREEN_W, 22);
  ctx.strokeStyle = theme.headerBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 22.5);
  ctx.lineTo(SCREEN_W, 22.5);
  ctx.stroke();

  // Botón minimalista de alternancia de modo con ícono de sol / luna
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.uiText;
  if (currentThemeKey === "light") {
    ctx.beginPath();
    ctx.arc(12, 11, 4.2, -0.6 * Math.PI, 0.8 * Math.PI, false);
    ctx.quadraticCurveTo(11.2, 11, 12 + 4.2 * Math.cos(-0.6 * Math.PI), 11 + 4.2 * Math.sin(-0.6 * Math.PI));
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(12, 11, 2.5, 0, Math.PI * 2);
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      ctx.moveTo(12 + ca * 4.2, 11 + sa * 4.2);
      ctx.lineTo(12 + ca * 5.8, 11 + sa * 5.8);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Encabezado con punto de 7px del color del distrito + texto en mayúsculas
  ctx.save();
  const zoneStr = (window.compasState.districtNeighborhood || "UBICACIÓN REAL").toUpperCase();
  const currentDistKey = window.compasState.currentDistrictKey || null;
  const currentDistColor = getDistrictColor(currentDistKey, currentThemeKey);

  if ("letterSpacing" in ctx) ctx.letterSpacing = "0.08em";
  if (zoneStr.length > 25) {
    ctx.font = "600 8.5px 'IBM Plex Mono', monospace";
  } else {
    ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
  }

  const tw = ctx.measureText(zoneStr).width;
  const dotDiameter = 7;
  const dotRadius = 3.5;
  const gap = 6;
  const totalHeaderWidth = dotDiameter + gap + tw;

  let headerStartX = Math.round(CENTER_X - totalHeaderWidth / 2);
  if (headerStartX < 28) headerStartX = 28;

  const dotCenterX = headerStartX + dotRadius;
  const textStartX = headerStartX + dotDiameter + gap;

  // Punto circular de 7px con el color del distrito actual
  ctx.fillStyle = currentDistColor;
  ctx.beginPath();
  ctx.arc(dotCenterX, 11.5, dotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Nombre del distrito / barrio
  ctx.fillStyle = theme.uiText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(zoneStr, textStartX, 11.5);
  ctx.restore();
}

// 9. MARCADOR DE POSICIÓN DEL USUARIO (Centro 128, 128)
function drawUserMarker(ctx, theme) {
  ctx.save();
  ctx.fillStyle = theme.mapBg;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 7.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = theme.userMarker;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = theme.userMarker;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 10. INDICADOR DEL NORTE EN EL PERÍMETRO
function drawCompass(ctx, view, theme) {
  const northAngle = -view.radHeading - Math.PI / 2;
  const northRadius = 100;
  const nx = CENTER_X + Math.cos(northAngle) * northRadius;
  const ny = CENTER_Y + Math.sin(northAngle) * northRadius;

  ctx.save();
  ctx.translate(nx, ny);
  ctx.rotate(northAngle + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fillStyle = theme.uiText;
  ctx.fill();

  ctx.font = "600 8.5px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, 15);
  ctx.restore();
}

// 11. BARRA DE ESCALA GRÁFICA DINÁMICA
function drawScaleBar(ctx, view, theme) {
  let scaleMeters = 50.0;
  if (view.currentMeters > 13000) {
    scaleMeters = 4000.0;
  } else if (view.currentMeters > 9000) {
    scaleMeters = 3000.0;
  } else if (view.currentMeters > 7000) {
    scaleMeters = 2000.0;
  } else if (view.currentMeters > 3200) {
    scaleMeters = 1000.0;
  } else if (view.currentMeters > 1500) {
    scaleMeters = 500.0;
  } else if (view.currentMeters > 600) {
    scaleMeters = 200.0;
  } else if (view.currentMeters > 380) {
    scaleMeters = 100.0;
  }

  const scaleBarPx = Math.round(scaleMeters * view.ppm);
  const scaleY = SCREEN_H - 10;
  ctx.strokeStyle = theme.uiText;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(12, scaleY);
  ctx.lineTo(12 + scaleBarPx, scaleY);
  ctx.moveTo(12, scaleY - 3);
  ctx.lineTo(12, scaleY + 3);
  ctx.moveTo(12 + scaleBarPx, scaleY - 3);
  ctx.lineTo(12 + scaleBarPx, scaleY + 3);
  ctx.stroke();

  ctx.fillStyle = theme.uiText;
  ctx.font = "500 8px 'IBM Plex Mono', monospace";
  ctx.textAlign = "left";
  const scaleLabel = scaleMeters >= 1000 ? `${Math.round(scaleMeters / 1000)}km` : `${Math.round(scaleMeters)}m`;
  ctx.fillText(scaleLabel, 12 + scaleBarPx + 5, scaleY + 3);
}

// 12. INDICADOR VISUAL DEL SLIDER (Control vertical de zoom)
function drawSlider(ctx, view, theme) {
  const sliderOpacity = Math.min(1.0, Math.max(0, (view.smoothMeters - VIEW_METERS_NORMAL) / 80.0));
  if (sliderOpacity <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = sliderOpacity;
  const trackX = SCREEN_W - 8;
  const trackTop = 40;
  const trackH = 80;
  const trackBottom = trackTop + trackH;

  ctx.strokeStyle = theme.headerBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(trackX, trackTop);
  ctx.lineTo(trackX, trackBottom);
  ctx.moveTo(trackX - 3, trackTop);
  ctx.lineTo(trackX + 3, trackTop);
  ctx.moveTo(trackX - 3, trackBottom);
  ctx.lineTo(trackX + 3, trackBottom);
  ctx.stroke();

  const thumbY = trackTop + smoothDragRatio * trackH;
  ctx.fillStyle = theme.uiText;
  ctx.fillRect(trackX - 3, Math.round(thumbY - 3), 7, 7);

  ctx.font = "500 7.5px 'IBM Plex Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(view.smoothMeters)}m`, trackX - 6, Math.round(thumbY + 2.5));

  ctx.restore();
}

// 13. BUCLE PRINCIPAL DE RENDERIZADO (60 FPS)
function renderOLED() {
  labelAnimFrameCount++;
  const theme = THEMES[currentThemeKey] || THEMES.light;
  const canvas = document.getElementById('oledCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Limpiar fondo de pantalla
  ctx.fillStyle = theme.mapBg;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Parámetros de orientación Heading-Up
  const radHeading = (window.compasState.heading * Math.PI) / 180.0;
  const cosH = Math.cos(radHeading);
  const sinH = Math.sin(radHeading);

  const uX = window.compasState.userX;
  const uY = window.compasState.userY;

  // Interpolación suave del Zoom Out con Slider Vertical continuo
  let targetMeters = VIEW_METERS_NORMAL;
  let targetDragRatio = 0.0;

  if (isPressing) {
    targetDragRatio = Math.min(1.0, currentDragY / 160.0);
    // Mapeo progresivo calibrado para recorrer cómodamente las 5 zonas de zoom:
    // - Zona Cercana (240m - 600m) en el primer 25% del recorrido (0 a 0.25)
    // - Zona Media (600m - 1500m) entre el 25% y 50% del recorrido (0.25 a 0.50)
    // - Zona de Barrios (1500m - 2500m) entre el 50% y 72% del recorrido (0.50 a 0.72)
    // - Zona Distante (2500m - 12000m) entre el 72% y 88% del recorrido (0.72 a 0.88)
    // - Zona Geográfica (12000m - 15000m) en el tramo final (0.88 a 1.0)
    if (targetDragRatio <= 0.25) {
      targetMeters = VIEW_METERS_PEEK + (targetDragRatio / 0.25) * (600.0 - VIEW_METERS_PEEK);
    } else if (targetDragRatio <= 0.50) {
      targetMeters = 600.0 + ((targetDragRatio - 0.25) / 0.25) * (1500.0 - 600.0);
    } else if (targetDragRatio <= 0.72) {
      targetMeters = 1500.0 + ((targetDragRatio - 0.50) / 0.22) * (2500.0 - 1500.0);
    } else if (targetDragRatio <= 0.88) {
      targetMeters = 2500.0 + ((targetDragRatio - 0.72) / 0.16) * (12000.0 - 2500.0);
    } else {
      targetMeters = 12000.0 + ((targetDragRatio - 0.88) / 0.12) * (VIEW_METERS_MAX - 12000.0);
    }
  }

  smoothViewMeters += (targetMeters - smoothViewMeters) * 0.16;
  smoothDragRatio += (targetDragRatio - smoothDragRatio) * 0.16;
  if (Math.abs(targetMeters - smoothViewMeters) < 0.2) smoothViewMeters = targetMeters;

  const currentViewMeters = smoothViewMeters;
  const currentPixelsPerMeter = SCREEN_W / currentViewMeters;
  const cullingRadius = (currentViewMeters / 2.0) * 1.45;

  const view = {
    smoothMeters: smoothViewMeters,
    currentMeters: currentViewMeters,
    ppm: currentPixelsPerMeter,
    cullingRadius,
    radHeading,
    cosH,
    sinH,
    uX,
    uY
  };

  // 1. DIBUJAR CAPA TOPOGRÁFICA
  drawTopography(ctx, view, theme);

  // 2. DIBUJAR CAPA DE AGUA Y RÍOS EN CELESTE
  drawWater(ctx, view, theme);

  // 3. PROCESAR Y AGRUPAR SEGMENTOS VIALES
  const districtBatches = {};
  const majorCandidatesMap = new Map();
  const minorCandidatesMap = new Map();

  for (let i = 0; i < mapSegments.length; i++) {
    const seg = mapSegments[i];

    const dx1 = seg.x1 - uX;
    const dy1 = seg.y1 - uY;
    const dx2 = seg.x2 - uX;
    const dy2 = seg.y2 - uY;

    if ((dx1 < -cullingRadius && dx2 < -cullingRadius) ||
        (dx1 >  cullingRadius && dx2 >  cullingRadius) ||
        (dy1 < -cullingRadius && dy2 < -cullingRadius) ||
        (dy1 >  cullingRadius && dy2 >  cullingRadius)) {
      continue;
    }

    const rx1 = dx1 * cosH - dy1 * sinH;
    const ry1 = dx1 * sinH + dy1 * cosH;
    const rx2 = dx2 * cosH - dy2 * sinH;
    const ry2 = dx2 * sinH + dy2 * cosH;

    const sx1 = Math.round(CENTER_X + rx1 * currentPixelsPerMeter);
    const sy1 = Math.round(CENTER_Y - ry1 * currentPixelsPerMeter);
    const sx2 = Math.round(CENTER_X + rx2 * currentPixelsPerMeter);
    const sy2 = Math.round(CENTER_Y - ry2 * currentPixelsPerMeter);

    if (sx1 === sx2 && sy1 === sy2) continue;

    const isMajor = !!seg.isMajor;
    const distKey = seg.districtKey || 'fallback';
    const op = (typeof seg.opacity === 'number') ? seg.opacity : 1.0;

    if (!districtBatches[distKey]) {
      districtBatches[distKey] = {
        sec: [],
        pri: [],
        color: getDistrictColor(distKey, currentThemeKey),
        opacity: op
      };
    }

    const batch = districtBatches[distKey];
    if (isMajor) {
      batch.pri.push(sx1, sy1, sx2, sy2);
    } else {
      batch.sec.push(sx1, sy1, sx2, sy2);
    }

    // Recolectar candidatos para etiquetas de calles (solo en zona cercana y media <= 1500m)
    if (smoothViewMeters <= 1500 && seg.name && seg.name.length > 2) {
      const segDx = sx2 - sx1;
      const segDy = sy2 - sy1;
      const segLen = Math.hypot(segDx, segDy);

      if (segLen >= 26) {
        const mx = (sx1 + sx2) / 2;
        const my = (sy1 + sy2) / 2;

        if (mx >= 16 && mx <= SCREEN_W - 16 && my >= 30 && my <= SCREEN_H - 18) {
          const distCenter = Math.hypot(mx - CENTER_X, my - CENTER_Y);
          let angle = Math.atan2(segDy, segDx);
          if (angle > Math.PI / 2) angle -= Math.PI;
          else if (angle < -Math.PI / 2) angle += Math.PI;

          const score = (1.0 / (distCenter + 35.0)) * 1400.0 + Math.min(segLen, 120.0);
          const key = seg.name.toUpperCase();
          const candidate = {
            name: seg.name,
            formattedName: formatStreetName(seg.name).toLowerCase(),
            mx, my,
            angle,
            segLen,
            isMajor,
            districtKey: distKey,
            distCenter,
            score
          };

          if (isMajor) {
            const existing = majorCandidatesMap.get(key);
            if (!existing || candidate.score > existing.score) {
              majorCandidatesMap.set(key, candidate);
            }
          } else {
            const existing = minorCandidatesMap.get(key);
            if (!existing || candidate.score > existing.score) {
              minorCandidatesMap.set(key, candidate);
            }
          }
        }
      }
    }
  }

  // 4. DIBUJAR RED VIAL
  drawStreets(ctx, view, theme, districtBatches);

  // 5. SELECCIONAR Y DIBUJAR ETIQUETAS DE CALLES
  if (smoothViewMeters <= 1500) {
    const isNearZone = smoothViewMeters <= 600;
    let candidateList = [];

    if (isNearZone) {
      const allList = Array.from(majorCandidatesMap.values()).concat(Array.from(minorCandidatesMap.values()));
      allList.sort((a, b) => b.score - a.score);
      candidateList = allList.slice(0, 6);
    } else {
      const majors = Array.from(majorCandidatesMap.values()).sort((a, b) => b.score - a.score);
      const minors = Array.from(minorCandidatesMap.values()).sort((a, b) => b.score - a.score);
      candidateList = majors.slice(0, 6);
      if (candidateList.length < 6) {
        const remaining = 6 - candidateList.length;
        candidateList = candidateList.concat(minors.slice(0, remaining));
      }
    }

    drawStreetLabels(ctx, view, theme, candidateList);
  }

  // 6. DIBUJAR ETIQUETAS DE BARRIOS (1500m - 2500m)
  drawBarrioBadges(ctx, view, theme);

  // 7. DIBUJAR ETIQUETAS DE DISTRITOS (2500m - 12000m)
  drawDistrictBadges(ctx, view, theme);

  // 8. DIBUJAR ETIQUETAS GEOGRÁFICAS (12000m - 15000m)
  drawGeographicLabels(ctx, view, theme);

  // 9. DIBUJAR HUD SUPERIOR
  drawHeaderHUD(ctx, theme);

  // 10. MARCADOR DEL USUARIO
  drawUserMarker(ctx, theme);

  // 11. INDICADOR DEL NORTE
  drawCompass(ctx, view, theme);

  // 12. BARRA DE ESCALA GRÁFICA
  drawScaleBar(ctx, view, theme);

  // 13. INDICADOR DEL SLIDER VERTICAL
  drawSlider(ctx, view, theme);

  requestAnimationFrame(renderOLED);
}

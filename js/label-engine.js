// =============================================================================
// COMPAS - MOTOR DE ETIQUETAS Y FÍSICA ANTI-COLISIÓN
// =============================================================================

function drawBadge(ctx, x, y, w, h, r, bgColor, borderColor) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Mapas de desplazamiento temporal suave para cada capa de etiquetas
const streetLabelShiftMap = new Map();
const barrioLabelShiftMap = new Map();
const districtLabelShiftMap = new Map();
const geoLabelShiftMap = new Map();
let labelAnimFrameCount = 0;

/**
 * Reconciliación espacial de etiquetas (Anti-colisión por relajación física de fuerzas).
 * En lugar de descartar etiquetas, las separa armónicamente a lo largo del eje
 * de mínima penetración (con preferencia vertical para etiquetas rectangulares) y
 * las restringe estrictamente dentro de los límites visibles del viewport.
 */
function relaxLabelBoxes(boxes, bounds, iterations = 20) {
  if (!boxes || boxes.length <= 1) return;
  const pad = 3;

  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const reqX = (a.w + b.w) / 2 + pad;
        const reqY = (a.h + b.h) / 2 + pad;

        let dx = a.cx - b.cx;
        let dy = a.cy - b.cy;

        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
          dx = (i - j) * 0.1;
          dy = (i % 2 === 0 ? 1 : -1) * 0.1;
        }

        const overlapX = reqX - Math.abs(dx);
        const overlapY = reqY - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          const penX = overlapX / reqX;
          // Las etiquetas son bandas horizontales alargadas; la separación vertical
          // es más sutil y mantiene la etiqueta más cerca de su coordenada real.
          const penY = (overlapY / reqY) * 0.65;

          if (penY <= penX) {
            const signY = dy >= 0 ? 1 : -1;
            const shiftY = overlapY * 0.55;
            a.cy += signY * shiftY;
            b.cy -= signY * shiftY;
          } else {
            const signX = dx >= 0 ? 1 : -1;
            const shiftX = overlapX * 0.55;
            a.cx += signX * shiftX;
            b.cx -= signX * shiftX;
          }
        }
      }
    }

    // Restringir cajas dentro de los márgenes visibles del viewport
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const halfW = b.w / 2;
      const halfH = b.h / 2;
      b.cx = Math.max(bounds.minX + halfW, Math.min(bounds.maxX - halfW, b.cx));
      b.cy = Math.max(bounds.minY + halfH, Math.min(bounds.maxY - halfH, b.cy));
    }

    if (!moved) break;
  }
}

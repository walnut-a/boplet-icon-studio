// Derive guides from the rendered brand path, in the same SVG coordinate system.
export function addMarkConstruction(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  const group = name => {
    const node = document.createElementNS(ns, 'g');
    node.setAttribute('class', name);
    node.setAttribute('aria-hidden', 'true');
    return node;
  };
  const handles = group('geometry-handles'), anchors = group('geometry-anchors');
  const dot = (x, y) => {
    const node = document.createElementNS(ns, 'circle');
    Object.entries({ cx: x, cy: y, r: .22 }).forEach(([key, value]) => node.setAttribute(key, value));
    anchors.append(node);
  };
  const line = (x1, y1, x2, y2) => {
    const node = document.createElementNS(ns, 'line');
    Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) => node.setAttribute(key, value));
    handles.append(node);
  };
  for (const path of svg.querySelectorAll('path')) {
    let x = 0, y = 0, startX = 0, startY = 0;
    for (const [, command, raw] of path.getAttribute('d').matchAll(/([a-z])([^a-z]*)/gi)) {
      const values = raw.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
      const relative = command === command.toLowerCase();
      const kind = command.toUpperCase();
      const stride = { M: 2, L: 2, H: 1, V: 1, C: 6, Z: 0 }[kind];
      if (stride === undefined) throw new Error(`Unsupported brand path command: ${command}`);
      if (kind === 'Z') { x = startX; y = startY; continue; }
      for (let i = 0; i < values.length; i += stride) {
        const ox = relative ? x : 0, oy = relative ? y : 0;
        if (kind === 'C') {
          const nx = ox + values[i + 4], ny = oy + values[i + 5];
          line(x, y, ox + values[i], oy + values[i + 1]);
          line(nx, ny, ox + values[i + 2], oy + values[i + 3]);
          x = nx; y = ny;
        } else if (kind === 'H') x = ox + values[i];
        else if (kind === 'V') y = oy + values[i];
        else { x = ox + values[i]; y = oy + values[i + 1]; }
        if (kind === 'M' && i === 0) { startX = x; startY = y; }
        dot(x, y);
      }
    }
  }
  svg.append(handles, anchors);
}

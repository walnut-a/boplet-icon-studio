import paper from 'paper/dist/paper-core.js';
import { StudioError } from '../contracts/errors.js';

const invalid = message => { throw new StudioError('VALIDATION_FAILED', message); };
const escaped = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** Inspect a source operand independently of its parent's boolean result. */
export function previewLayer(variant, layerId, options = {}) {
  const isolate = layers => {
    for (const layer of layers) {
      if (layer.layerId === layerId) return layer;
      const child = layer.children && isolate(layer.children);
      if (child) return { layerId: layer.layerId, type: 'group', visible: layer.visible, transform: layer.transform, children: [child] };
    }
  };
  const selected = isolate(variant.layers);
  if (!selected) invalid('图层不存在。');
  const { svg, bounds } = renderGeometry({ ...variant, layers: [selected] }, options);
  return { svg, bounds };
}

/** Deterministic synchronous geometry; no DOM, filesystem, raw SVG input or raster. */
export function renderGeometry(variant, { primitives = {}, lineCap = 'round', lineJoin = 'round' } = {}) {
  const scope = new paper.PaperScope();
  new scope.Project();
  const { Path, Point, Rectangle, Size, Segment, Group, Matrix } = scope;
  const construct = (layer, ancestors = []) => {
    if (!layer.visible) return null;
    let item;
    if (layer.type === 'rect') {
      item = new Path.Rectangle(new Rectangle(layer.x, layer.y, layer.width, layer.height), new Size(Math.min(layer.radius, layer.width / 2, layer.height / 2)));
    } else if (layer.type === 'ellipse') {
      item = new Path.Ellipse({ center: layer.center, radius: [layer.radiusX, layer.radiusY] });
    } else if (layer.type === 'line') {
      item = new Path.Line(layer.start, layer.end);
    } else if (layer.type === 'path') {
      item = new Path({ segments: layer.nodes.map(n => new Segment(new Point(n.point), n.in ? new Point(n.in).subtract(n.point) : null, n.out ? new Point(n.out).subtract(n.point) : null)), closed: layer.closed });
    } else if (layer.type === 'group') {
      item = new Group(layer.children.map(l => construct(l, ancestors)).filter(Boolean));
      if (layer.transform) item.transform(new Matrix(...layer.transform));
      return item;
    } else if (layer.type === 'instance') {
      if (ancestors.includes(layer.primitiveId) || ancestors.length >= 32) invalid('组件引用循环或嵌套过深。');
      if (!primitives[layer.primitiveId]) invalid('组件不存在。');
      item = new Group(primitives[layer.primitiveId].map(l => construct(l, [...ancestors, layer.primitiveId])).filter(Boolean));
      item.transform(new Matrix(...layer.transform));
      return item;
    } else if (layer.type === 'boolean') {
      const paths = layer.children.map(l => construct(l, ancestors)).filter(Boolean);
      if (paths.length < 2 || paths.some(p => !p.fillColor || typeof p.unite !== 'function' || (p instanceof Path && !p.closed))) invalid('布尔运算需要至少两个闭合填充路径。');
      const method = { union: 'unite', subtract: 'subtract', intersect: 'intersect', exclude: 'exclude' }[layer.operation];
      if (!method) invalid('未知布尔操作。');
      item = paths[0];
      for (const path of paths.slice(1)) { const next = item[method](path, { insert: false }); item.remove(); path.remove(); item = next; }
      item.reorient(true, true);
    } else invalid('未知几何类型；不接受原始路径字符串。');
    const stroke = layer.type === 'line' || layer.drawing === 'stroke';
    item.fillColor = stroke ? null : 'black';
    item.strokeColor = stroke ? 'black' : null;
    item.strokeWidth = stroke ? layer.strokeWidth : 0;
    item.strokeCap = lineCap;
    item.strokeJoin = lineJoin;
    if (layer.transform) item.transform(new Matrix(...layer.transform));
    return item;
  };
  try {
    const entries = variant.layers.map(layer => ({ layer, item: construct(layer) })).filter(e => e.item);
    let bounds = null;
    let area = 0;
    const serialize = item => {
      if (item instanceof Group) return item.children.map(serialize).join('');
      const stroke = Boolean(item.strokeColor);
      area += stroke ? 0 : Math.abs(item.area);
      return `<path d="${escaped(item.pathData)}" fill="${stroke ? 'none' : 'currentColor'}"${stroke ? ` stroke="currentColor" stroke-width="${item.strokeWidth}" stroke-linecap="${lineCap}" stroke-linejoin="${lineJoin}"` : ' fill-rule="nonzero"'}/>`;
    };
    const layers = entries.map(({ layer, item }) => {
      bounds = bounds ? bounds.unite(item.strokeBounds) : item.strokeBounds.clone();
      return { layerId: layer.layerId, bounds: box(item.strokeBounds), svg: `<g data-layer="${escaped(layer.layerId)}">${serialize(item)}</g>` };
    });
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${variant.size}" height="${variant.size}" viewBox="0 0 ${variant.size} ${variant.size}">${layers.map(l => l.svg).join('')}</svg>`,
      bounds: bounds ? box(bounds) : null, area, layers };
  } finally { scope.project.remove(); scope.remove(); }
}

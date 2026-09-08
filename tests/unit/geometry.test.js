import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGeometry } from '../../src/core/geometry.js';
const rect = (layerId, x, y, width, height) => ({ layerId, name: '形状', type: 'rect', visible: true, drawing: 'fill', strokeWidth: 0, radius: 0, x, y, width, height });
const variant = layers => ({ size: 24, layers });
test('曲线边界计算实际极值，不使用控制柄包围盒', () => {
  const result = renderGeometry(variant([{ layerId: 'l-path', name: '曲线', visible: true, type: 'path', drawing: 'stroke', strokeWidth: 2, closed: false,
    nodes: [{ nodeId: 'n-a', point: [2, 2], in: null, out: [2, 14] }, { nodeId: 'n-b', point: [14, 2], in: [14, 14], out: null }] }]));
  assert.ok(Math.abs(result.bounds.bottom - 12) < 1e-6);
  assert.ok(result.svg.includes('C'));
});
test('布尔实算差集、交集和并集面积与边界', () => {
  const area = { subtract: 48, intersect: 16, union: 112, exclude: 96 };
  for (const operation of Object.keys(area)) {
    const result = renderGeometry(variant([{ layerId: 'l-bool', name: '布尔', visible: true, type: 'boolean', operation,
      children: [rect('l-a', 2, 2, 8, 8), rect('l-b', 6, 6, 8, 8)] }]));
    assert.ok(Math.abs(result.area - area[operation]) < 1e-6);
    assert.equal(result.svg.includes('<mask'), false);
  }
});
test('圆角、描边、组件循环与不透明输入边界', () => {
  const r = rect('l-r', 2, 2, 12, 12); r.radius = 2;
  assert.ok(renderGeometry(variant([r])).area < 144);
  const line = { layerId: 'l-line', name: '线', visible: true, type: 'line', start: [2, 4], end: [12, 4], strokeWidth: 2 };
  assert.equal(renderGeometry(variant([line])).bounds.left, 1);
  assert.throws(() => renderGeometry(variant([{ ...r, type: 'raw', d: 'M0 0' }])));
  const instance = { layerId: 'l-inst', name: '实例', visible: true, type: 'instance', primitiveId: 'prim-a', transform: [1, 0, 0, 1, 0, 0] };
  assert.throws(() => renderGeometry(variant([instance]), { primitives: { 'prim-a': [instance] } }), /循环/);
});

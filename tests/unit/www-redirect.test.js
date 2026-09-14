import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/edge/www-redirect.js';

test('www 永久跳转至 HTTPS 主域名，并保留路径和查询参数', async () => {
  for (const url of ['http://www.boplet.app/', 'https://www.boplet.app/studio/?view=icons&name=%E4%B8%AD%E6%96%87']) {
    const response = await worker.fetch(new Request(url));
    assert.equal(response.status, 308);
    const target = new URL(url);
    target.protocol = 'https:';
    target.hostname = 'boplet.app';
    assert.equal(response.headers.get('location'), target.href);
  }
});

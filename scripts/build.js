import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ajv } from '../src/contracts/schema.js';
import { CONTRACT_VERSION, FORMAT_VERSION, documentSchemas } from '../src/contracts/models.js';
import { describeOperations, operationCatalog } from '../src/contracts/operations.js';

export async function buildContracts(outputDirectory) {
  // Compile every defined schema before writing any build output.
  for (const schema of Object.values(documentSchemas)) ajv.getSchema(schema.$id);
  for (const operation of Object.values(operationCatalog).filter(item => item.handler)) {
    for (const schema of [operation.inputSchema, operation.dataSchema, operation.outputSchema]) {
      if (schema.$id) ajv.getSchema(schema.$id) ?? ajv.compile(schema);
      else ajv.compile(schema);
    }
  }
  const bundle = { contractVersion: CONTRACT_VERSION, formatVersion: FORMAT_VERSION, stage: 'skill_candidate', productionReady: false,
    documents: documentSchemas, operations: describeOperations() };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'contracts.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bundle = await buildContracts(fileURLToPath(new URL('../dist/', import.meta.url)));
  await buildApplication(resolve('dist'));
  console.log(`本地容器构建完成：${bundle.operations.filter(x => x.available).length} 个操作；未安装或部署。`);
}

export async function buildApplication(directory) {
  const app = join(directory, 'app'); await mkdir(app, { recursive: true });
  await copyFile('src/app/index.html', join(app, 'index.html')); await copyFile('src/app/style.css', join(app, 'style.css'));
  await build({ entryPoints: ['src/app/app.js'], outfile: join(app, 'app.js'), bundle: true, format: 'esm', platform: 'browser', minify: true });
}

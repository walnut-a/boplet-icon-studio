import { mkdir, writeFile } from 'node:fs/promises';
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
  const bundle = { contractVersion: CONTRACT_VERSION, formatVersion: FORMAT_VERSION, stage: 'foundation', productionReady: false,
    documents: documentSchemas, operations: describeOperations() };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'contracts.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bundle = await buildContracts(fileURLToPath(new URL('../dist/', import.meta.url)));
  console.log(`合同构建完成：${Object.keys(bundle.documents).length} 类文档，${bundle.operations.filter(x => x.available).length} 个已实现操作。不是 Skill 或网站发行包。`);
}

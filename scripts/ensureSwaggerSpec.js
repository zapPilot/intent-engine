const fs = require('fs');
const path = require('path');
const { swaggerOptions } = require('../src/config/swaggerConfig');

const outputPath = path.resolve(__dirname, '..', 'docs', 'swagger.json');

if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const baseSpec = {
    ...swaggerOptions.definition,
    paths: {},
  };
  fs.writeFileSync(outputPath, JSON.stringify(baseSpec, null, 2));
  console.log('✅ Initialized docs/swagger.json with base Swagger definition.');
} else {
  console.log(
    'ℹ️  docs/swagger.json already exists. Update manually as needed.'
  );
}

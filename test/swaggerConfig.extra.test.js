const { swaggerOptions, swaggerSpec } = require('../src/config/swaggerConfig');

describe('Swagger config - extra coverage', () => {
  it('exposes expected swagger options basics', () => {
    expect(swaggerOptions.definition.openapi).toBe('3.0.0');
    expect(swaggerOptions.definition.info.title).toBe('Intent Engine API');
    expect(Array.isArray(swaggerOptions.definition.servers)).toBe(true);
    expect(swaggerOptions.apis).toEqual(['./src/routes/*.js', './src/app.js']);
  });

  it('generates a swagger spec with info and tags', () => {
    expect(swaggerSpec.openapi).toBe('3.0.0');
    expect(swaggerSpec.info).toBeDefined();
    expect(swaggerSpec.info.title).toBe('Intent Engine API');
    expect(Array.isArray(swaggerSpec.tags)).toBe(true);
    const tagNames = (swaggerSpec.tags || []).map(t => t.name);
    expect(tagNames).toEqual(
      expect.arrayContaining(['Intents', 'Swaps', 'Prices', 'Health'])
    );
  });
});

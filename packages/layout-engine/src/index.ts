export * from './patterns';
export * from './content';
export * from './density';
export * from './overflow';
export * from './layout';

// Re-export the shared rich-text measurement / compression helpers so downstream
// packages (e.g. @jkinco/qa-engine) can rely on the same measurement logic
// without declaring @jkinco/rich-text as a direct dependency.
export { checkAutofit, compressText, maxFontSizeThatFits, measureText, truncateToBudget } from '@jkinco/rich-text';

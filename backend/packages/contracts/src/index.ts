// Shared schemas and types: the contract between Track A (game & content) and
// Track B (platform & data). Changes follow the contract-change protocol in
// docs/Paisa Path — Backend Design & Parallel Plan.md and are logged in CHANGELOG.md.

export const CONTRACTS_VERSION = '0.1.0';

export * from './content';
export * from './events';

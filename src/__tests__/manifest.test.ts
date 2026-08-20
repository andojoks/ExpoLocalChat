import { describe, expect, it, jest } from '@jest/globals';

jest.mock('react-native-zip-archive', () => ({
  unzip: jest.fn(),
  subscribe: jest.fn(() => ({ remove: jest.fn() })),
}));

import { validateManifest } from '../ai/embeddings/model-manager';
describe('compressed model manifest', () => {
  it('accepts a safe ZIP bundle', () =>
    expect(
      validateManifest({
        id: 'embeddinggemma',
        version: '1',
        archive: 'model.zip',
        archiveBytes: 100,
        entryPoint: 'onnx/model.onnx',
      }),
    ).toBe(true));
  it('accepts a LiteRT zip with task entry', () =>
    expect(
      validateManifest({
        id: 'embeddinggemma',
        version: '1',
        archive: 'embeddinggemma-300m-q4.zip',
        archiveBytes: 100,
        entryPoint: 'embedding_gemma.task',
      }),
    ).toBe(true));
  it('accepts a raw LiteRT .task archive', () =>
    expect(
      validateManifest({
        id: 'embeddinggemma',
        version: 'int4int8-2',
        archive: 'embedding_gemma.task',
        archiveBytes: 183816181,
        entryPoint: 'embedding_gemma.task',
      }),
    ).toBe(true));
  it('rejects traversal and raw delivery', () => {
    expect(
      validateManifest({
        id: 'x',
        version: '1',
        archive: 'model.zip',
        archiveBytes: 100,
        entryPoint: '../model.onnx',
      }),
    ).toBe(false);
    expect(
      validateManifest({
        id: 'x',
        version: '1',
        archive: 'model.onnx',
        archiveBytes: 100,
        entryPoint: 'model.onnx',
      }),
    ).toBe(false);
  });
});

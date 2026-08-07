import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Metro asset copy of assets/mathjax/chtml.min.css.
 * `.txt` keeps the file out of NativeWind/Tailwind CSS interop.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CHTML_CSS_MODULE = require('@/assets/mathjax/chtml.min.txt');

let _cssCache: string | null = null;

async function readAssetUri(uri: string): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to fetch stylesheet asset (${res.status})`);
    return res.text();
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function loadChtmlCss(): Promise<string> {
  if (_cssCache !== null) return _cssCache;

  const asset = Asset.fromModule(CHTML_CSS_MODULE);

  if (asset.localUri) {
    _cssCache = await readAssetUri(asset.localUri);
    return _cssCache;
  }

  // Dev: Metro serves the bundle over HTTP — fetch avoids native downloadAsync.
  if (asset.uri?.startsWith('http')) {
    _cssCache = await readAssetUri(asset.uri);
    return _cssCache;
  }

  if (!asset.downloaded) {
    try {
      await asset.downloadAsync();
    } catch {
      if (asset.uri) {
        _cssCache = await readAssetUri(asset.uri);
        return _cssCache;
      }
      throw new Error('Failed to load MathJax stylesheet asset.');
    }
  }

  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('Failed to resolve bundled stylesheet asset.');
  _cssCache = await readAssetUri(uri);
  return _cssCache;
}

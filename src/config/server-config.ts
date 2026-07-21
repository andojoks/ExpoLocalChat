import Storage from 'expo-sqlite/kv-store';
const KEY='questionbankchat:model-server-url';
export const DEFAULT_MODEL_SERVER_URL=process.env.EXPO_PUBLIC_MODEL_SERVER_URL||'http://127.0.0.1:8787';
let current=DEFAULT_MODEL_SERVER_URL;
export function normalizeServerUrl(value:string){const normalized=value.trim().replace(/\/+$/,'');const parsed=new URL(normalized);if(!['http:','https:'].includes(parsed.protocol))throw Error('Server URL must start with http:// or https://');return normalized}
export async function loadServerUrl(){const saved=await Storage.getItem(KEY);if(saved){try{current=normalizeServerUrl(saved)}catch{current=DEFAULT_MODEL_SERVER_URL}}return current}
export async function saveServerUrl(value:string){current=normalizeServerUrl(value);await Storage.setItem(KEY,current);return current}
export function getServerUrl(){return current}

import { NativeModules } from 'react-native';
import { DOCUMENT_PREFIX, EMBEDDING_DIMENSIONS, QUERY_PREFIX, type EmbeddingProvider, HashEmbeddingProvider } from './embedding';
const NativeEmbeddingGemma=NativeModules.EmbeddingGemma;
export function createPlatformProvider():EmbeddingProvider{
 if(!NativeEmbeddingGemma)return new HashEmbeddingProvider();
 return{ name:'EmbeddingGemma · LiteRT', async initialize(path?:string){if(!path)throw new Error('Model path required');await NativeEmbeddingGemma.load(path,EMBEDDING_DIMENSIONS)}, async embedQuery(text){return NativeEmbeddingGemma.embed(QUERY_PREFIX+text)}, async embedDocuments(texts,titles=[]){return Promise.all(texts.map((t,i)=>NativeEmbeddingGemma.embed(DOCUMENT_PREFIX(titles[i]||'none')+t)))} };
}

export const EMBEDDING_DIMENSIONS=128;
export const QUERY_PREFIX='task: question answering | query: ';
export const DOCUMENT_PREFIX=(title:string)=>`title: ${title||'none'} | text: `;
export type EmbeddingStatus={kind:'missing'|'downloading'|'ready'|'fallback';progress:number;label:string};
export interface EmbeddingProvider{readonly name:string;initialize(modelPath?:string):Promise<void>;embedQuery(text:string):Promise<number[]>;embedDocuments(texts:string[],titles?:string[]):Promise<number[][]>}
export function cosine(a:number[],b:number[]){let dot=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return dot/(Math.sqrt(aa)*Math.sqrt(bb)||1)}
export class HashEmbeddingProvider implements EmbeddingProvider{readonly name='Development fallback';async initialize(){}async embedQuery(text:string){return hash(QUERY_PREFIX+text)}async embedDocuments(texts:string[],titles:string[]=[]){return texts.map((t,i)=>hash(DOCUMENT_PREFIX(titles[i]||'none')+t))}}
function hash(text:string){const v=new Array(EMBEDDING_DIMENSIONS).fill(0);for(const token of text.toLowerCase().split(/\W+/).filter(Boolean)){let h=2166136261;for(let i=0;i<token.length;i++)h=Math.imul(h^token.charCodeAt(i),16777619);v[Math.abs(h)%v.length]+=h%2?1:-1}const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1;return v.map(x=>x/n)}

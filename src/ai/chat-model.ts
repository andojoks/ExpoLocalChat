export type TutorTurn={role:'system'|'user'|'assistant';content:string};
export type GenerationOptions={jsonSchema?:object;maxTokens?:number;temperature?:number};
export interface ChatModel{readonly name:string;initialize():Promise<void>;generate(turns:TutorTurn[],onToken?:(token:string)=>void,options?:GenerationOptions):Promise<string>}

import type {ChatModel,TutorTurn} from './chat-model';
export function createChatModel():ChatModel{return{name:'Authored tutor fallback',async initialize(){},async generate(turns:TutorTurn[]){return turns.at(-1)?.content||'I need more information to help with that.'}}}

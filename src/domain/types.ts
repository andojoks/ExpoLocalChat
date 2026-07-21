export type ExamQuestion={id:string;category:'OL'|'AL';subject:string;year:number;paper:1|2|3;number:number;topic:string;marks:number;markdown:string;answerMarkdown:string;explanationMarkdown:string;hints:string[];tags:string[]};
export type ChatMessage={id:string;role:'user'|'assistant';content:string;toolCalls?:ToolTrace[];createdAt:number};
export type ToolTrace={name:string;input:Record<string,unknown>;resultCount?:number};
export type AgentContext={activeQuestionId?:string;category?:'OL'|'AL';subject?:string;topic?:string;year?:number;hintIndex?:number;page?:number;pageSize?:number;lastTool?:string;lastArguments?:Record<string,unknown>};
export type AgentReply={content:string;context:AgentContext;toolCalls:ToolTrace[];suggestions:string[]};

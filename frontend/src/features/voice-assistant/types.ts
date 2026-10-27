export type AssistantState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type CommandIntentType =
  | 'ROUTE_FASTEST'
  | 'ROUTE_SHADIEST'
  | 'ROUTE_BALANCED'
  | 'COMPARE_ROUTES'
  | 'EXPLAIN_HEAT'
  | 'CHECK_WEATHER'
  | 'FIND_PARKING'
  | 'SET_DESTINATION'
  | 'SET_ORIGIN'
  | 'STOP_SPEAKING'
  | 'CLARIFY'
  | 'UNKNOWN';

export interface CommandIntent {
  type: CommandIntentType;
  rawText: string;
  targetLocation?: {
    name: string;
    lat: number;
    lon: number;
  };
  clarificationMessage?: string;
}

export interface AssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  intentType?: CommandIntentType;
  actionSummary?: string;
}


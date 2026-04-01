export interface ScriptLine {
  character: string;
  text: string;
  isStageDirection: boolean;
}

export type AppState = 'upload' | 'setup' | 'rehearsal';

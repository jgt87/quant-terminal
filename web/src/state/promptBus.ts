// Asks the user for a short text from anywhere (template names, group names) through the app's
// own text dialog; PromptHost (mounted once in App) renders the requests.

export interface PromptRequest {
  title: string;
  label?: string;
  initial?: string;
  onSubmit(text: string): void;
}

let listener: ((r: PromptRequest) => void) | null = null;

export function requestPrompt(r: PromptRequest): void {
  listener?.(r);
}

export function onPromptRequest(fn: (r: PromptRequest) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

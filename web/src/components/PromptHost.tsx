// Renders text prompts requested through state/promptBus (one at a time).

import { useEffect, useState } from "react";
import { onPromptRequest, type PromptRequest } from "../state/promptBus";
import { TextPrompt } from "./TextPrompt";

export function PromptHost() {
  const [req, setReq] = useState<PromptRequest | null>(null);
  useEffect(() => onPromptRequest(setReq), []);
  if (!req) return null;
  return (
    <TextPrompt
      title={req.title}
      label={req.label}
      initial={req.initial ?? ""}
      required
      maxLength={80}
      onSubmit={(t) => req.onSubmit(t)}
      onClose={() => setReq(null)}
    />
  );
}

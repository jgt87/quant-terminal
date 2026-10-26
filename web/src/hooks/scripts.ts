// User scripts: saved list plus load / save / delete.

import { useCallback, useEffect, useState } from "react";
import type { UserScript } from "@qt/core";
import { errorText } from "../api/http";
import { createScript, deleteScript, getScript, listScripts, saveScript, type ScriptBody, type ScriptListItem } from "../api/scripts";

export function useScripts() {
  const [list, setList] = useState<ScriptListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setList(await listScripts());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const act = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      const r = await fn();
      setError(null);
      return r;
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  };

  return {
    list,
    error,
    load: (id: string) => act(() => getScript(id)),
    save: (body: ScriptBody, id?: string) =>
      act(async (): Promise<UserScript> => {
        const s = id ? await saveScript(id, body) : await createScript(body);
        await reload();
        return s;
      }),
    remove: (id: string) =>
      act(async () => {
        await deleteScript(id);
        await reload();
      }),
  };
}

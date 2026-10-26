// Save text as a download, and read a user-picked text file.

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a file picker and resolve with the chosen file's text (null when cancelled). */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** File-name friendly stamp, e.g. 2026-10-13. */
export const dateStamp = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

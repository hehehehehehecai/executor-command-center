import { act, render as renderReact, type RenderOptions } from "@testing-library/react";

// Flush actual asynchronous session verification rather than replacing its UI.
export async function render(element: React.ReactNode, options?: RenderOptions) {
  let rendered: ReturnType<typeof renderReact> | undefined;
  await act(async () => { rendered = renderReact(element, options); });
  if (!rendered) throw new Error("workspace_render_failed");
  const result = rendered;
  return { ...result, rerender: async (next: React.ReactNode) => {
    await act(async () => result.rerender(next));
  } };
}

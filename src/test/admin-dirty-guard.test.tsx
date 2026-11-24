import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DirtyProvider, useDraft, useLeaveGuard } from "@/components/admin/ui";

function Editor() {
  const form = useDraft("saved");
  const guard = useLeaveGuard();
  return (
    <>
      <input
        aria-label="Draft"
        value={form.value ?? ""}
        onChange={(e) => form.setValue(e.target.value)}
      />
      <button onClick={() => void guard.confirmLeave()}>
        Attempt navigation
      </button>
      <button onClick={form.discard}>Discard draft</button>
    </>
  );
}

afterEach(cleanup);

describe("Dirty registration survives interrupted navigation", () => {
  it("keeps protecting edits after a confirmed leave until the editor unmounts", async () => {
    render(
      <DirtyProvider>
        <Editor />
      </DirtyProvider>,
    );
    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "edited" },
    });
    fireEvent.click(screen.getByText("Attempt navigation"));
    fireEvent.click(await screen.findByRole("button", { name: /^Leave$/ }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    // Simulate a navigation that failed: the editor remains mounted and dirty.
    fireEvent.click(screen.getByText("Attempt navigation"));
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByLabelText("Draft")).toHaveValue("edited");
    fireEvent.click(screen.getByText("Discard draft"));
    expect(screen.getByLabelText("Draft")).toHaveValue("saved");
  });
});

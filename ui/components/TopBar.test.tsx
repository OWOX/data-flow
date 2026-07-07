import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "./TopBar";

const storages = [{ id: "s1", title: "BigQuery", type: "BIGQUERY" }];

describe("TopBar", () => {
  it("always shows the storage picker", () => {
    render(<TopBar storages={storages} storageId="s1" />);
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("reveals 'Import from OWOX project' in the Push caret menu", () => {
    render(<TopBar onImportFromOwox={() => {}} />);
    // hidden until the caret menu is opened
    expect(screen.queryByText(/Import from OWOX project/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/More OWOX actions/i));
    expect(screen.getByText(/Import from OWOX project/i)).toBeTruthy();
  });

  it("invokes onImportFromOwox from the caret menu", () => {
    const fn = vi.fn();
    render(<TopBar onImportFromOwox={fn} />);
    fireEvent.click(screen.getByLabelText(/More OWOX actions/i));
    fireEvent.click(screen.getByText(/Import from OWOX project/i));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("renders a Business Goal button and fires onOpenGoal", () => {
    const onOpenGoal = vi.fn();
    render(<TopBar onOpenGoal={onOpenGoal} questionsEnabled />);
    fireEvent.click(screen.getByRole("button", { name: /business goal/i }));
    expect(onOpenGoal).toHaveBeenCalled();
  });

  it("hides the Business Goal button when the AI key is not configured", () => {
    render(<TopBar onOpenGoal={() => {}} questionsEnabled={false} />);
    expect(screen.queryByRole("button", { name: /business goal/i })).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SharePanel } from "./SharePanel";

describe("SharePanel", () => {
  const defaultProps = {
    shareUrl: "https://model.owox.com/#m=abc123",
    onCopy: vi.fn(),
    onExportImage: vi.fn(),
  };

  it("renders the perk description header with Share2 icon label, title and description", () => {
    render(<SharePanel {...defaultProps} />);
    expect(screen.getByText("Named sharing")).toBeTruthy();
    expect(screen.getByText("Share a model by name with a link")).toBeTruthy();
  });

  it("shows the shareUrl in a read-only input", () => {
    render(<SharePanel {...defaultProps} />);
    const input = screen.getByDisplayValue("https://model.owox.com/#m=abc123");
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).readOnly).toBe(true);
  });

  it("calls onCopy when Copy button is clicked", () => {
    const onCopy = vi.fn();
    render(<SharePanel {...defaultProps} onCopy={onCopy} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("calls onExportImage when Export as image button is clicked", () => {
    const onExportImage = vi.fn();
    render(<SharePanel {...defaultProps} onExportImage={onExportImage} />);
    fireEvent.click(screen.getByRole("button", { name: /export as image/i }));
    expect(onExportImage).toHaveBeenCalledTimes(1);
  });

  it("renders without gating — no sign-in prompt visible", () => {
    render(<SharePanel {...defaultProps} />);
    expect(screen.queryByText(/sign in/i)).toBeNull();
    expect(screen.queryByText(/create.*account/i)).toBeNull();
  });
});

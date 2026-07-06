import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RightRail } from "./RightRail";

describe("RightRail", () => {
  it("renders all four entries and is visible regardless of sign-in", () => {
    render(<RightRail active={null} onOpen={() => {}} signedIn={false} />);
    ["Inspect", "My Models", "History", "Share"].forEach(l =>
      expect(screen.getByRole("button", { name: l })).toBeTruthy());
  });

  it("calls onOpen with the clicked panel id", () => {
    const onOpen = vi.fn();
    render(<RightRail active={null} onOpen={onOpen} signedIn={true} />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(onOpen).toHaveBeenCalledWith("history");
  });

  it("marks the active entry with aria-current", () => {
    render(<RightRail active="models" onOpen={() => {}} signedIn={true} />);
    expect(screen.getByRole("button", { name: "My Models" }).getAttribute("aria-current")).toBe("true");
  });

  it("highlights the icon from highlightId even when active is a different panel (gated redirect case)", () => {
    // Simulates: signed-out user clicks "My Models" → panel routes to "enable",
    // but highlightId="models" keeps the My Models icon highlighted.
    render(<RightRail active="enable" onOpen={() => {}} signedIn={false} highlightId="models" />);
    expect(screen.getByRole("button", { name: "My Models" }).getAttribute("aria-current")).toBe("true");
    // No other rail icon should be highlighted
    ["Inspect", "History", "Share"].forEach(l =>
      expect(screen.getByRole("button", { name: l }).getAttribute("aria-current")).toBeNull());
  });

  it("highlights the icon from highlightId even when active is a different panel (gated redirect case, history)", () => {
    render(<RightRail active="enable" onOpen={() => {}} signedIn={false} highlightId="history" />);
    expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-current")).toBe("true");
    ["Inspect", "My Models", "Share"].forEach(l =>
      expect(screen.getByRole("button", { name: l }).getAttribute("aria-current")).toBeNull());
  });

  it("highlights the active rail panel even when a stale highlightId points elsewhere", () => {
    // Opening My Models from the Account panel sets active="models" while a prior
    // rail click may have left highlightId="inspect" — active must win.
    render(<RightRail active="models" onOpen={() => {}} signedIn highlightId="inspect" />);
    expect(screen.getByRole("button", { name: "My Models" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Inspect" }).getAttribute("aria-current")).toBeNull();
  });

  it("fires onSave only when there are unsaved changes (amber)", () => {
    const onSave = vi.fn();
    render(<RightRail active={null} onOpen={() => {}} signedIn onSave={onSave} saveState="unsaved" />);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toMatch(/text-amber-600/);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables Save with an explanatory tooltip when there's nothing to save", () => {
    const onSave = vi.fn();
    render(<RightRail active={null} onOpen={() => {}} signedIn onSave={onSave} saveState="saved" />);
    const btn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/nothing to save/i);
    fireEvent.click(btn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables Save while a save is in flight", () => {
    render(<RightRail active={null} onOpen={() => {}} signedIn onSave={() => {}} saving saveState="unsaved" />);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders an accessible progressbar clamped to 0-100", () => {
    render(<ProgressBar value={42} label="Transfer progress" />);
    const bar = screen.getByRole("progressbar", { name: "Transfer progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });

  it("clamps values above the max", () => {
    render(<ProgressBar value={150} max={100} label="over" />);
    expect(screen.getByRole("progressbar", { name: "over" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps negative values to 0", () => {
    render(<ProgressBar value={-10} label="under" />);
    expect(screen.getByRole("progressbar", { name: "under" })).toHaveAttribute("aria-valuenow", "0");
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resolveScopes } from "@/lib/ai-analysis/RewriteTypes";
import { ResumeRewrite } from "@/components/admin/resume-ai/ResumeRewrite";

describe("resolveScopes", () => {
  it("keeps several sections, in resume order, without duplicates", () => {
    expect(resolveScopes(["skills", "summary", "skills"])).toEqual(["summary", "skills"]);
  });

  it("expands full to all four sections", () => {
    expect(resolveScopes(["full"])).toEqual(["summary", "experience", "skills", "projects"]);
    expect(resolveScopes(["skills", "full"])).toEqual(["summary", "experience", "skills", "projects"]);
  });

  it("refuses empty, unknown or non-array input", () => {
    expect(resolveScopes([])).toBeNull();
    expect(resolveScopes(["summary", "education"])).toBeNull();
    expect(resolveScopes("summary")).toBeNull();
    expect(resolveScopes(undefined)).toBeNull();
  });
});

describe("ResumeRewrite section picker", () => {
  function setup() {
    const onGenerate = vi.fn();
    render(<ResumeRewrite enabled pending={false} error={null} result={null} onGenerate={onGenerate} />);
    const box = (name: string) => screen.getByRole("checkbox", { name });
    const generate = () => userEvent.click(screen.getByRole("button", { name: /generate rewrite/i }));
    return { onGenerate, box, generate };
  }

  it("sends every section that is checked", async () => {
    const { onGenerate, box, generate } = setup();
    await userEvent.click(box("Experience"));
    await userEvent.click(box("Skills"));
    await generate();
    expect(onGenerate).toHaveBeenLastCalledWith(
      expect.objectContaining({ scopes: ["summary", "experience", "skills"] }),
    );
  });

  it("full resume selects all four, and toggling it back returns to the summary", async () => {
    const { onGenerate, box, generate } = setup();
    await userEvent.click(box("Full resume"));
    for (const name of ["Professional summary", "Experience", "Skills", "Projects", "Full resume"]) {
      expect(box(name)).toBeChecked();
    }
    await generate();
    expect(onGenerate).toHaveBeenLastCalledWith(
      expect.objectContaining({ scopes: ["summary", "experience", "skills", "projects"] }),
    );

    await userEvent.click(box("Full resume"));
    expect(box("Professional summary")).toBeChecked();
    expect(box("Experience")).not.toBeChecked();
  });

  it("will not uncheck the last selected section", async () => {
    const { box } = setup();
    await userEvent.click(box("Professional summary"));
    expect(box("Professional summary")).toBeChecked();
  });
});

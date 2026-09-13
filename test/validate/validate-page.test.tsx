import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ValidatePage from "@/app/(marketing)/validate-before-you-build/page";
import { VALIDATE_PRODUCT } from "@/constants";

/**
 * The page is static copy; what can silently break is where its money links go.
 */
describe("/validate-before-you-build CTAs", () => {
  it("points every $39 CTA at Gumroad, or at the on-page offer until a URL is set", () => {
    render(<ValidatePage />);
    const expected = VALIDATE_PRODUCT.gumroadUrl || "#founding-version";
    const buy = screen.getAllByRole("link", { name: /\$39/ });

    expect(buy).toHaveLength(4);
    buy.forEach((link) => expect(link).toHaveAttribute("href", expected));
    expect(document.getElementById("founding-version")).not.toBeNull();
  });

  it("sends Submit Your Idea to the Tally form and See How It Works to the method", () => {
    render(<ValidatePage />);

    const tally = screen.getAllByRole("link", { name: /submit your idea/i });
    expect(tally).toHaveLength(2);
    tally.forEach((link) => expect(link).toHaveAttribute("href", "https://tally.so/r/lbxOAv"));

    expect(screen.getByRole("link", { name: /see how it works/i })).toHaveAttribute("href", "#method");
    expect(document.getElementById("method")).not.toBeNull();
  });
});

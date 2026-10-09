import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ValidatePage from "@/app/(marketing)/validate-before-you-build/page";
import { VALIDATE_PRODUCT } from "@/constants";

/**
 * The page is static copy; what can silently break is where its money links go.
 */
describe("/validate-before-you-build CTAs", () => {
  it("points every $39 CTA at the live Gumroad product", () => {
    render(<ValidatePage />);
    const buy = screen.getAllByRole("link", { name: /\$39/ });

    expect(buy).toHaveLength(4);
    buy.forEach((link) => expect(link).toHaveAttribute("href", VALIDATE_PRODUCT.gumroadUrl));
    // Fails closed if the URL is ever blanked: the CTAs would silently fall back
    // to the on-page section, which looks fine and sells nothing.
    expect(VALIDATE_PRODUCT.gumroadUrl).toMatch(/^https:\/\/[a-z0-9-]+\.gumroad\.com\/l\/[a-z0-9-]+$/i);
    expect(document.getElementById("founding-version")).not.toBeNull();
  });

  it("sends Submit Your Idea to the Tally form and See How It Works to the method", () => {
    render(<ValidatePage />);

    const tally = screen.getAllByRole("link", { name: /submit your idea/i });
    expect(tally).toHaveLength(2);
    // Asserted against the configured URL rather than a copy of it: the literal
    // that used to be here kept passing while the live links pointed at a form
    // id that 404s.
    tally.forEach((link) => expect(link).toHaveAttribute("href", VALIDATE_PRODUCT.tallyUrl));

    expect(screen.getByRole("link", { name: /see how it works/i })).toHaveAttribute("href", "#method");
    expect(document.getElementById("method")).not.toBeNull();
  });
});

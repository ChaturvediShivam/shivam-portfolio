/**
 * Shared setup for component suites.
 *
 * Runs for every test file, including the Node ones, so it must do nothing that
 * assumes a DOM. The jest-dom matchers are imported unconditionally because
 * importing them is inert without a document; `cleanup` is only wired up when
 * one exists.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  // Without this, a component left mounted by one test is still in the document
  // for the next, and a getByRole that should find one element finds two.
  afterEach(cleanup);
}

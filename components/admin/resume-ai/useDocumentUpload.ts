"use client";

import * as React from "react";
import { validateSelection, toUploadedDocument } from "@/lib/resume/validation";
import type { UploadState, UploadedDocument } from "@/types/upload";

/**
 * Upload state machine (Resume AI · Step 1).
 *
 * Shared by both uploaders so the resume and the job description cannot drift
 * into behaving differently — the same validation, the same transitions, the
 * same reset semantics.
 *
 * Step 1 goes `empty → validating → ready`. The `transferring` and `processing`
 * states exist in the union and are rendered, but nothing drives them yet
 * because no bytes leave the browser. That is the seam: the step which adds a
 * real transfer replaces the body of `accept` and changes nothing else — not
 * the components, not the props, not the parent.
 */

export interface DocumentUpload {
  state: UploadState;
  document: UploadedDocument | null;
  /** Validate and hold a selection. */
  accept: (files: FileList | File[]) => void;
  /** Back to empty. */
  clear: () => void;
}

export function useDocumentUpload(
  onChange?: (document: UploadedDocument | null) => void,
): DocumentUpload {
  const [state, setState] = React.useState<UploadState>({ status: "empty" });

  // Held in a ref so `accept` keeps a stable identity: it is passed to a
  // memo-friendly child, and a new function every render would defeat that.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const accept = React.useCallback((files: FileList | File[]) => {
    setState({ status: "validating" });

    const outcome = validateSelection(files);

    if (outcome.ok === false) {
      setState({ status: "rejected", rejection: outcome.rejection });
      onChangeRef.current?.(null);
      return;
    }

    const document = toUploadedDocument(outcome.file, outcome.type);
    setState({ status: "ready", document });
    onChangeRef.current?.(document);
  }, []);

  const clear = React.useCallback(() => {
    setState({ status: "empty" });
    onChangeRef.current?.(null);
  }, []);

  const document =
    state.status === "ready" || state.status === "transferring" || state.status === "processing"
      ? state.document
      : null;

  return { state, document, accept, clear };
}

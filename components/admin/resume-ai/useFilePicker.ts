"use client";

import * as React from "react";
import { FILE_INPUT_ACCEPT } from "@/types/upload";

/**
 * Hidden file input, opened imperatively (Resume AI · Step 1).
 *
 * A file dialog can only be opened by clicking a real `<input type="file">`, so
 * anything offering "browse" needs one in the DOM. Two places do — the dropzone
 * and the Replace action on a held file — and sharing this hook is what stops
 * the second one being a hidden input wired to a ref that points at nothing.
 *
 * The input is rendered by the caller (`<input {...inputProps} />`) rather than
 * by the hook, so it lands in the right place in the tree and inherits the
 * caller's disabled state.
 */

export interface FilePicker {
  /** Opens the OS file dialog. */
  open: () => void;
  inputProps: React.InputHTMLAttributes<HTMLInputElement> & {
    ref: React.RefObject<HTMLInputElement>;
  };
}

export function useFilePicker(
  onFiles: (files: FileList | File[]) => void,
  disabled = false,
): FilePicker {
  const ref = React.useRef<HTMLInputElement>(null);

  const open = React.useCallback(() => {
    ref.current?.click();
  }, []);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files?.length) onFiles(event.target.files);
      // Cleared so re-selecting the same file still fires `change` — otherwise
      // "remove, then add the same file back" silently does nothing.
      event.target.value = "";
    },
    [onFiles],
  );

  return {
    open,
    inputProps: {
      ref,
      type: "file",
      accept: FILE_INPUT_ACCEPT,
      onChange: handleChange,
      disabled,
      className: "sr-only",
      tabIndex: -1,
      "aria-hidden": true,
    },
  };
}

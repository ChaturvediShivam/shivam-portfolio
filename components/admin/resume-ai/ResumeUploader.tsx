"use client";

import * as React from "react";
import { Dropzone } from "./Dropzone";
import { UploadCard } from "./UploadCard";
import { UploadStatus } from "./UploadStatus";
import { useDocumentUpload } from "./useDocumentUpload";
import { useFilePicker } from "./useFilePicker";
import { isUploadBusy } from "@/types/upload";
import type { UploadedDocument } from "@/types/upload";

/**
 * Resume upload (Resume AI · Step 1).
 *
 * Owns nothing but composition: the state machine is `useDocumentUpload`, the
 * target is `Dropzone`, the held-file view is `UploadCard`. Splitting it this
 * way is what lets the job-description uploader reuse all three without a
 * single conditional about which document it is handling.
 *
 * Replace opens the picker directly rather than clearing first, so cancelling
 * the dialog leaves the existing file in place instead of emptying the card.
 */

export interface ResumeUploaderProps {
  disabled?: boolean;
  onChange?: (document: UploadedDocument | null) => void;
}

export function ResumeUploader({ disabled = false, onChange }: ResumeUploaderProps) {
  const upload = useDocumentUpload(onChange);
  const statusId = React.useId();

  const busy = isUploadBusy(upload.state);
  const inert = disabled || busy;
  const replacePicker = useFilePicker(upload.accept, inert);

  return (
    <div className="space-y-3">
      {upload.document ? (
        <>
          <UploadCard
            document={upload.document}
            busy={busy}
            disabled={disabled}
            progress={upload.state.status === "transferring" ? upload.state.progress : null}
            onRemove={upload.clear}
            onReplace={replacePicker.open}
          />
          <input {...replacePicker.inputProps} />
        </>
      ) : (
        <Dropzone
          label="Upload your resume"
          hint="Drag and drop, or click to browse"
          disabled={disabled}
          busy={busy}
          invalid={upload.state.status === "rejected"}
          describedBy={statusId}
          onFiles={upload.accept}
        />
      )}

      <UploadStatus id={statusId} state={upload.state} successLabel="Resume ready." />
    </div>
  );
}

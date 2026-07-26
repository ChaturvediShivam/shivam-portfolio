import * as React from "react";
import { fieldClasses } from "./TextInput";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={fieldClasses(invalid, className)} {...props} />;
});

import { type FormHTMLAttributes, type HTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";
import { Label, type LabelProps } from "./label";

/**
 * Form primitives, deliberately without react-hook-form. Dashboard forms
 * submit through Server Actions and validate with @plinth/schema (Zod); field
 * errors arrive as the api envelope's `fieldErrors` (string[] per dotted path),
 * not from a client form library. These are layout + error-display shells that
 * compose with native <form> and those server-returned messages (ADR-0007:
 * only the form surfaces errors).
 */
export const Form = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => (
    <form ref={ref} className={cn("grid gap-4", className)} {...props} />
  ),
);
Form.displayName = "Form";

export const FormField = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("grid gap-2", className)} {...props} />
  ),
);
FormField.displayName = "FormField";

export const FormLabel = forwardRef<HTMLLabelElement, LabelProps>((props, ref) => (
  <Label ref={ref} {...props} />
));
FormLabel.displayName = "FormLabel";

export const FormDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
FormDescription.displayName = "FormDescription";

export interface FormMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Server-returned messages for this field (envelope `fieldErrors[path]`).
   * Renders nothing when empty, so it's safe to mount unconditionally. */
  errors?: string[];
}

export const FormMessage = forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, errors, children, ...props }, ref) => {
    const content = errors?.length ? errors.join(" ") : children;
    if (!content) return null;
    return (
      <p ref={ref} className={cn("text-sm font-medium text-destructive", className)} {...props}>
        {content}
      </p>
    );
  },
);
FormMessage.displayName = "FormMessage";

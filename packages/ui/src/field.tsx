import { Field as BaseField } from "@base-ui/react/field";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import { Form as BaseForm } from "@base-ui/react/form";
import { Input as BaseInput } from "@base-ui/react/input";
import type { ReactNode } from "react";
import { SearchIcon } from "./icons";
import { cn, mergeClassName, styled } from "./lib/cn";

/* Every text entry is the same recessed box (.ps-field), with its label
   above it. Focus draws a pink ring around the box; an invalid field turns
   the ring red. */
const control =
  "ps-field w-full min-w-0 px-3 placeholder:text-ink-3 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";

export const Field = {
  Root: styled(BaseField.Root, "flex min-w-0 flex-col gap-1.5", "Field.Root"),
  Label: styled(BaseField.Label, "cursor-default select-none text-ui font-medium text-ink", "Field.Label"),
  Control: styled(BaseField.Control, `${control} min-h-control text-ui`, "Field.Control"),
  Description: styled(BaseField.Description, "text-meta text-ink-3", "Field.Description"),
  Error: styled(BaseField.Error, "motion-fade text-meta text-bad", "Field.Error"),
  Item: styled(BaseField.Item, "flex items-start gap-3", "Field.Item"),
  Validity: BaseField.Validity,
};

interface TextFieldProps extends Omit<BaseField.Root.Props, "children"> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  control?: BaseField.Control.Props;
  multiline?: boolean;
}

/** The common case in one component: label, control, help and error text.
 * An `error` passed in (from the server, say) marks the field invalid and is
 * shown as is; without one, the browser's own validation messages show. */
export function TextField({ label, description, error, control, multiline, invalid, ...root }: TextFieldProps) {
  return (
    <Field.Root {...root} invalid={invalid ?? (error ? true : undefined)}>
      <Field.Label>{label}</Field.Label>
      <Field.Control
        {...control}
        render={multiline ? <textarea rows={4} className="resize-none py-2" /> : undefined}
      />
      {description ? <Field.Description>{description}</Field.Description> : null}
      {error ? <Field.Error match>{error}</Field.Error> : <Field.Error />}
    </Field.Root>
  );
}

export type InputSize = "md" | "lg";

/* Medium sits among other medium controls; large is the main field on a
   screen (the Jobs search) and anything typed into on a phone. Type size
   follows height, as with every control. */
const inputSizes: Record<InputSize, string> = {
  md: "h-control text-ui",
  lg: "h-control-lg text-body",
};

type InputProps = Omit<BaseInput.Props, "size"> & { size?: InputSize };

/** A bare input, for entry that has no label of its own (search, filters). */
export function Input({ size = "md", className, ...props }: InputProps) {
  return <BaseInput {...props} className={mergeClassName(cn(control, inputSizes[size]), className)} />;
}

export function SearchInput({ size = "md", className, ...props }: InputProps) {
  return (
    <div className={cn("relative flex items-center", typeof className === "string" ? className : undefined)}>
      <SearchIcon
        size={size === "lg" ? 18 : 16}
        className={cn("pointer-events-none absolute z-10 text-ink-3", size === "lg" ? "left-3.5" : "left-3")}
      />
      <Input type="search" size={size} {...props} className={size === "lg" ? "pl-10.5" : "pl-9"} />
    </div>
  );
}

export const Fieldset = {
  Root: styled(BaseFieldset.Root, "m-0 flex min-w-0 flex-col gap-4 border-0 p-0", "Fieldset.Root"),
  Legend: styled(BaseFieldset.Legend, "mb-1 p-0 text-ui font-medium text-ink", "Fieldset.Legend"),
};

export const Form = styled(BaseForm, "flex flex-col gap-5", "Form");

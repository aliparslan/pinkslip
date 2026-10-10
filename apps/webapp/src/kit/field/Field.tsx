import { Field as BaseField } from "@base-ui/react/field";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import { Form as BaseForm } from "@base-ui/react/form";
import { Input as BaseInput } from "@base-ui/react/input";
import type {
  FormEventHandler, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes,
} from "react";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { cx } from "../cx";
import styles from "./Field.module.css";

export interface FieldProps {
  label: ReactNode;
  /** Marks the field "optional"; required fields stay unmarked. */
  optional?: boolean;
  /** Shown under the control and linked to it with aria-describedby. */
  error?: string | null;
  disabled?: boolean;
  name?: string;
  children: ReactNode;
}

/** A label above one control, with an optional error below. There is no
 * description slot: if a control needs explaining, the label should change. */
export function Field({ label, optional, error, disabled, name, children }: FieldProps) {
  return <BaseField.Root className={styles.root} invalid={Boolean(error)} disabled={disabled} name={name}>
    <BaseField.Label className={styles.label}>
      {label}
      {optional && <span className={styles.optional}> optional</span>}
    </BaseField.Label>
    {children}
    {error && <BaseField.Error match className={styles.error} role="alert">
      {error}
    </BaseField.Error>}
  </BaseField.Root>;
}

type NativeProps<Attributes> = Omit<Attributes, "className" | "style" | "children">;

export type InputProps = NativeProps<InputHTMLAttributes<HTMLInputElement>> & { ref?: Ref<HTMLInputElement> };

/** `.input-field`. Inside a `Field` it picks up the label and error wiring. */
export function Input(props: InputProps) {
  return <BaseInput {...props} className={styles.control} />;
}

export type SearchInputProps = Omit<InputProps, "type"> & { "aria-label": string };

/** A search box: the input with a leading magnifying glass. Labelled by its
 * `aria-label`, since search boxes rarely have a visible label. */
export function SearchInput(props: SearchInputProps) {
  return <div className={styles.searchWrap}>
    <span className={styles.searchIcon} aria-hidden><MagnifyingGlass size={17} weight="bold" /></span>
    <BaseInput {...props} type="search" enterKeyHint="search" className={cx(styles.control, styles.search)} />
  </div>;
}

export type TextareaProps = NativeProps<TextareaHTMLAttributes<HTMLTextAreaElement>> & { ref?: Ref<HTMLTextAreaElement> };

export function Textarea(props: TextareaProps) {
  return <BaseField.Control render={<textarea {...props} />} className={cx(styles.control, styles.textarea)} />;
}

export type SelectProps = NativeProps<SelectHTMLAttributes<HTMLSelectElement>> & {
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
};

/** The native select with the app's chevron. Native keeps the platform
 * picker on phones, which is what the current app uses. */
export function Select({ children, ...props }: SelectProps) {
  return <div className={styles.selectWrap}>
    <BaseField.Control render={<select {...props}>{children}</select>} className={cx(styles.control, styles.select)} />
    <span className={styles.chevron} aria-hidden><CaretDown size={15} weight="bold" /></span>
  </div>;
}

export interface FieldsetProps {
  legend: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

/** Groups related fields under a section-label legend. */
export function Fieldset({ legend, disabled, children }: FieldsetProps) {
  return <BaseFieldset.Root className={styles.fieldset} disabled={disabled}>
    <BaseFieldset.Legend className={styles.legend}>{legend}</BaseFieldset.Legend>
    {children}
  </BaseFieldset.Root>;
}

export interface FormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Server errors keyed by field `name`; Base UI shows them on the matching Field. */
  errors?: Record<string, string | string[]>;
  "aria-label"?: string;
  children: ReactNode;
}

/** Stacks fields with the form gap and prevents the native submit. */
export function Form({ onSubmit, errors, children, ...rest }: FormProps) {
  return <BaseForm
    {...rest}
    className={styles.form}
    errors={errors}
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit(event);
    }}
  >{children}</BaseForm>;
}

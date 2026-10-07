import { OTPField as BaseOTPField } from "@base-ui/react/otp-field";
import { styled } from "./lib/cn";

/** One-time code entry. Each digit is its own small slip box. */
export const OTPField = {
  Root: styled(BaseOTPField.Root, "flex gap-2", "OTPField.Root"),
  Input: styled(
    BaseOTPField.Input,
    "ps-field size-12 text-center font-heading text-title tabular-nums text-ink caret-accent outline-none",
    "OTPField.Input",
  ),
};

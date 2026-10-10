import { createLink } from "@tanstack/react-router";
import { ButtonAnchor } from "../../kit";

/** Web routing adapter; the kit's styled anchor remains router-independent. */
export const LinkButton = createLink(ButtonAnchor);

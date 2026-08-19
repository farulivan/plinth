import { Footer } from "./Footer";
import { Nav } from "./Nav";

/**
 * The template's site chrome, paired so a surface takes both or neither
 * (ADR-0015). The published build and the dashboard preview render the same
 * pair — chrome that only appeared in one would make the preview a different
 * page from the one it claims to show (ADR-0007).
 */
export const norvenChrome = { Nav, Footer };
export type NorvenChrome = typeof norvenChrome;

export { Nav, Footer };
export { ScrollHud } from "./ScrollHud";

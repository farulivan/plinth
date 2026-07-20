import { Fragment } from "react";

/** Render "\n" breaks in an editable heading as <br/> — the CMS analogue of
 * the original site's inline <br> markup. */
export function lines(text: string) {
  return text.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

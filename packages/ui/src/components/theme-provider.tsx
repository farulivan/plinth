"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

/**
 * Class-strategy theming (the .dark custom variant) with the system theme as
 * the default. Lives in the shared package because next-themes is a @plinth/ui
 * dependency — apps shouldn't need to declare it just to wrap their root.
 */
function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };

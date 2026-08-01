"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginRequest, loginRequest } from "@plinth/schema/auth";
import { Button } from "@plinth/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plinth/ui/components/form";
import { Input } from "@plinth/ui/components/input";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth-client";

/**
 * The magic-link request form. Split out of the route so `page.tsx` can stay a
 * Server Component and opt the route into dynamic rendering — a statically
 * prerendered page is built once, long before a request exists, so it cannot
 * carry the per-request CSP nonce its own scripts need (ADR-0011).
 *
 * `callbackURL` is where Better Auth sends the browser once the emailed link is
 * consumed, so it has to be baked into the link at request time. The route
 * resolves it from the gate's `?next=` through `safeReturnPath`; this component
 * never reads the query string itself, which keeps the one place that decides
 * where a signed-in user lands on the server side.
 */
export function LoginForm({ callbackURL }: { callbackURL: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequest),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: LoginRequest) {
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL,
      errorCallbackURL: "/callback",
    });
    if (error) {
      form.setError("email", { message: error.message ?? "Could not send the link." });
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-2">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-muted-foreground text-sm">A sign-in link is on its way to {sentTo}.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold">Sign in to Plinth</h1>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending…" : "Send magic link"}
          </Button>
        </form>
      </Form>
    </main>
  );
}

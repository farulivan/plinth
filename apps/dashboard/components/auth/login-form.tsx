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
import { ArrowLeft, MailOpen } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthShell } from "@/components/auth/auth-shell";
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
      <AuthShell>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
            <MailOpen className="size-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-muted-foreground text-sm">
            A sign-in link is on its way to <span className="text-foreground">{sentTo}</span>. It
            expires shortly and works once.
          </p>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" />
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to Plinth</h1>
            <p className="text-muted-foreground text-sm">
              Enter your email and we will send you a sign-in link.
            </p>
          </div>
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
          <p className="text-muted-foreground text-xs">
            No password — the emailed link is the whole credential.
          </p>
        </form>
      </Form>
    </AuthShell>
  );
}

import { Button } from "@plinth/ui/components/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Plinth</h1>
      <Button>Get started</Button>
    </main>
  );
}

// Minimal ambient types for the Deno runtime used by the Edge Functions entrypoints.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}

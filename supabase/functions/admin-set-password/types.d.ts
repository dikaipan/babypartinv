declare module 'npm:@supabase/supabase-js@2' {
    export * from '@supabase/supabase-js';
}

interface DenoEnv {
    get(key: string): string | undefined;
}

interface DenoRuntime {
    env: DenoEnv;
    serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare const Deno: DenoRuntime;


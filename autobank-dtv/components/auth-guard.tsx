"use client";

import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    // Permitimos que vayan a la página de login sin chequear nada
    if (pathname?.startsWith("/login")) {
      setChecking(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        const qs =
          pathname && pathname !== "/"
            ? `?redirect=${encodeURIComponent(pathname)}`
            : "";
        router.replace(`/login${qs}`);
      }

      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>
}

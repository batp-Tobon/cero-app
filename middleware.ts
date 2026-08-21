import type { NextRequest } from "next/server";
import { updateSession } from "@/infrastructure/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo salvo estaticos, imagenes y artefactos de la PWA.
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-|icons/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

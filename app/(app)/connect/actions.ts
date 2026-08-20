"use server";

import { createClient } from "@/lib/supabase/server";

export type PairingState = {
  code?: string;
  expiresInMinutes?: number;
  error?: string;
} | null;

/**
 * Produces the one-time code the student types into the extension.
 *
 * Generating a new code invalidates any previous one, so a code left on
 * screen in a lab can't be reused later.
 */
export async function generatePairingCode(): Promise<PairingState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Please sign in again." };

  const { data, error } = await supabase.rpc("create_pairing_code");

  if (error || !data) {
    return { error: "Could not create a code. Please try again." };
  }

  return { code: data as string, expiresInMinutes: 15 };
}

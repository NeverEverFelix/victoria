import { PlaidConnectionExperience } from "./plaid-connection-experience";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <PlaidConnectionExperience
    supabaseUrl={process.env.SUPABASE_URL ?? ""}
    supabasePublishableKey={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
  />;
}

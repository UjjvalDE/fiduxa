import { redirect } from 'next/navigation';

// Alias: server/.env currently sets WORKER_INVITATION_URL to /worker/accept-invitation,
// while .env.example (and this app) use /worker/einladung. Forward the token so both work.
export default function AcceptInvitationAlias({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  redirect(token ? `/worker/einladung?token=${encodeURIComponent(token)}` : '/worker/einladung');
}

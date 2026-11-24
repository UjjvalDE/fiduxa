import { redirect } from 'next/navigation';

// The public cleaner list was removed from the customer website: customers see
// their own cleaner's profile (/reinigungskraefte/[id]) from the booking
// details. Old links and bookmarks land on the homepage (temporary 307, so the
// list can come back later without stale browser caches).
export default function CleanersPage() {
  redirect('/');
}

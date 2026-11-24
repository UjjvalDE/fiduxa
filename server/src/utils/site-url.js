// Public website origin for links in emails and payment redirects.
// PUBLIC_SITE_URL wins; otherwise the first CLIENT_URL entry.
export const getSiteUrl = () =>
  (process.env.PUBLIC_SITE_URL || (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0])
    .trim()
    .replace(/\/$/, "");

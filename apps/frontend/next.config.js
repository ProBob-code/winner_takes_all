/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Stamped into the page so a screenshot says which build it came from.
    // Three rounds of "the mobile fix isn't live" were a tab showing a render
    // from days earlier; with this, that is visible at a glance instead of
    // being inferred from the layout.
    NEXT_PUBLIC_BUILD_SHA: (process.env.CF_PAGES_COMMIT_SHA || "dev").slice(0, 7),
  },
  async headers() {
    return [
      {
        // Next serves prerendered documents with s-maxage=31536000. Assets are
        // content-hashed, so a document cached for a year keeps asking for the
        // CSS and JS filenames that were current when it was cached -- and a
        // deploy that replaces them changes nothing on that device. That is how
        // a fixed mobile layout and a configured payment gateway both kept
        // rendering as broken for anyone who had visited before.
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        // The hashed assets themselves are safe to keep forever: a new build
        // gives them new names rather than new contents.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

module.exports = nextConfig;

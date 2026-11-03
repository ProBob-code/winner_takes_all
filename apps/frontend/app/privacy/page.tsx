import Link from "next/link";
import { LegalPage, SUPPORT_EMAIL, type LegalSection } from "@/components/legal-page";

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        Winner Takes All (&quot;W.T.A&quot;, &quot;we&quot;) runs winnertakesall.live, software for hosting and playing
        game nights. This policy explains what we collect when you use it, why, who else sees it, and what you can do
        about it.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p><strong>Your account.</strong> Your name, email address and a password, which we store only as a one-way hash we can&apos;t read back. If you sign in with Google, we receive your name, email address and Google account ID from Google, and no password.</p>
        <p><strong>Your profile.</strong> Your avatar, which you build from parts (we never ask for or store a photo of you), the items you own and wear, your WTA Coins, trophies, level and game record.</p>
        <p><strong>Your games.</strong> The nights you host or join, scores, results, and Proof of Play check-ins (which game, and when).</p>
        <p><strong>Walk-ins.</strong> If you join a night by code without an account, we store only the name you type, on that night.</p>
        <p><strong>Venues.</strong> A venue&apos;s name and details, the email addresses of the staff and managers its owner adds, and the note of which group chat results go to. We don&apos;t collect phone numbers.</p>
        <p><strong>Technical data.</strong> Your IP address, used briefly to limit abuse such as repeated sign-in attempts, and a session cookie that keeps you signed in. Your device keeps a few things locally: your light or dark setting, and scores entered while offline until they are sent.</p>
        <p>We don&apos;t use advertising trackers or sell analytics about you.</p>
      </>
    ),
  },
  {
    id: "location",
    title: "Location at check-in",
    body: (
      <p>
        When you check in to a game with Proof of Play, you can choose to share your location. It is only compared with
        the other player&apos;s and the scorer&apos;s location to confirm you were at the same table, and it is deleted when
        that game&apos;s result locks. Saying no is fine: you can still check in.
      </p>
    ),
  },
  {
    id: "voice",
    title: "Voice scoring",
    body: (
      <p>
        If you score a game by voice, the words are turned into text either by your browser&apos;s own speech service
        (which may send the audio to your browser&apos;s maker, for example Google for Chrome, under their privacy policy) or
        by a model that runs entirely on your device. We never receive, record or store the audio, only the score it
        produces.
      </p>
    ),
  },
  {
    id: "streams",
    title: "Live streams",
    body: (
      <p>
        If you stream a game from your camera, the video passes through Cloudflare&apos;s real-time service to the people
        watching. We don&apos;t record it, and it stops existing when the stream ends.
      </p>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>to run your account and sign you in;</li>
        <li>to run nights: draws, scoring, tables, the big screen and the join code;</li>
        <li>to verify results, award coins and trophies, and keep rankings fair;</li>
        <li>to stop cheating, abuse and attacks on the service;</li>
        <li>to answer you when you contact us, and to fix what breaks.</li>
      </ul>
    ),
  },
  {
    id: "public",
    title: "What others can see",
    body: (
      <>
        <p>W.T.A is about playing in front of people, so some things are public by design:</p>
        <ul>
          <li>your name, avatar, level, trophies and record on your player profile and the rankings;</li>
          <li>names, scores and the table for any night you play in, including on the venue&apos;s big screen;</li>
          <li>the emotes you send during a night.</li>
        </ul>
        <p>Your email address is never shown to other players. A venue&apos;s owner can see the emails of the staff they added.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We don&apos;t sell your personal information. We share it only with:</p>
        <ul>
          <li><strong>Cloudflare</strong>, which hosts W.T.A, its database and live streams;</li>
          <li><strong>Google</strong>, if you choose to sign in with Google;</li>
          <li><strong>Razorpay</strong>, only to return balances left in the old wallet;</li>
          <li><strong>hosts and venues</strong>, who see the names and results of the nights they run;</li>
          <li><strong>the authorities</strong>, when the law requires it.</li>
        </ul>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: (
      <p>
        We keep your account and game history while your account is open, so your record and rankings stay intact.
        Check-in locations are deleted when a result locks, and streams are never stored. When you ask us to delete your
        account, we remove your personal details. Results of nights other people played in may remain, without your name
        attached.
      </p>
    ),
  },
  {
    id: "choices",
    title: "Your choices and rights",
    body: (
      <ul>
        <li>Change your avatar and what you wear on your <Link href="/profile">profile</Link> at any time.</li>
        <li>Say no to location at check-in, or turn it off for next time.</li>
        <li>Ask us for a copy of your data, or to correct or delete it, by writing to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Keeping it safe",
    body: (
      <p>
        Everything travels over HTTPS, passwords are stored only as hashes, and sign-in is rate limited. No service is
        perfectly secure, so use a password you don&apos;t use anywhere else, and tell us straight away if you think your
        account has been used by someone else.
      </p>
    ),
  },
  {
    id: "age",
    title: "Age",
    body: (
      <p>
        Accounts are for people 18 and over. If you think someone younger has made one, write to us and we will remove it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When this policy changes, the date at the top changes. If we start collecting something new or using it in a new
        way, we will say so on the site first.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      accent="Policy."
      effective="3 November 2026"
      summary={
        <ul>
          <li>We collect what it takes to run your account and your games: your name, email, profile and results.</li>
          <li>Location at check-in is optional, and deleted when the game&apos;s result locks.</li>
          <li>We never store voice recordings or streams, and never ask for a photo of you.</li>
          <li>No advertising trackers. We don&apos;t sell your data.</li>
          <li>Write to {SUPPORT_EMAIL} to get a copy of your data or have it deleted.</li>
        </ul>
      }
      sections={sections}
    />
  );
}

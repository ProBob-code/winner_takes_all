import Link from "next/link";
import { LegalPage, SUPPORT_EMAIL, type LegalSection } from "@/components/legal-page";

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreeing to these terms",
    body: (
      <p>
        These terms cover your use of Winner Takes All (&quot;W.T.A&quot;, &quot;we&quot;, &quot;us&quot;), the website at
        winnertakesall.live and everything on it. By making an account, hosting a fight or joining one, you agree to them.
        If you don&apos;t agree, please don&apos;t use W.T.A.
      </p>
    ),
  },
  {
    id: "what-it-is",
    title: "What W.T.A is",
    body: (
      <>
        <p>
          W.T.A is software for running game fights at pool rooms, clubs, bars, gaming cafés and anywhere else people play.
          It covers pool, football, tennis, badminton, pickleball and table tennis: brackets and groups, scoring on a phone,
          a live table for a spare screen, a join code for walk-ins, series that carry from week to week, trophy ladders and
          player profiles.
        </p>
        <p>
          We provide the tools. Each fight is run by its host, usually at a venue, and the host and venue decide how it is
          played, who can take part and whether there is any prize.
        </p>
      </>
    ),
  },
  {
    id: "no-stakes",
    title: "Free to play, no stakes",
    body: (
      <>
        <p>W.T.A is not a betting or gambling service. In particular:</p>
        <ul>
          <li>We charge no entry fee to play, and take no part of any prize.</li>
          <li>We do not hold player money or pool prize money.</li>
          <li>
            Any prize at a fight is provided and handed out by the host or venue, not by us, and is their responsibility.
          </li>
          <li>
            You must not use W.T.A to arrange bets, stakes or wagers on any game, whether in money, coins or anything else.
          </li>
        </ul>
        <p>
          See our <Link href="/skill-based-policy">No-Stakes Policy</Link> for more.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <>
        <ul>
          <li>You must be at least 18 to make an account.</li>
          <li>Use your real name or a name people at the table will know you by, and an email address you can reach.</li>
          <li>One account per person. Don&apos;t share it, and keep your password to yourself.</li>
          <li>
            If you sign in with Google, Google confirms who you are; your use of Google is covered by Google&apos;s own terms.
          </li>
          <li>You are responsible for what happens under your account. Tell us straight away if you think someone else is using it.</li>
        </ul>
        <p>
          You can join a fight as a walk-in without an account, by scanning its code and typing a name. A walk-in&apos;s results
          appear on that fight&apos;s board but earn no coins or trophies.
        </p>
      </>
    ),
  },
  {
    id: "hosts",
    title: "Hosts, venues and staff",
    body: (
      <>
        <p>If you host a fight or run a venue on W.T.A, you are responsible for:</p>
        <ul>
          <li>running it fairly, and for any prize you offer and its delivery;</li>
          <li>the names you type in for other people, and only adding people who are happy to appear on the board;</li>
          <li>your venue&apos;s own rules and licences, including anything about age, alcohol or opening hours;</li>
          <li>the people you add as staff or managers, and what they do with that access.</li>
        </ul>
        <p>
          A big-screen display shows names, scores and the table to everyone in the room. Make sure players know that before
          you put it up.
        </p>
      </>
    ),
  },
  {
    id: "fair-play",
    title: "Fair play and Proof of Play",
    body: (
      <>
        <p>
          Results should be what actually happened at the table. Proof of Play lets both players check in to a game with the
          code on the scorer&apos;s screen; a game both players check in to counts as verified, and pays full trophies and coins.
          Sharing your location at check-in is optional.
        </p>
        <p>
          Don&apos;t enter false scores, check in to games you didn&apos;t play, use more than one account, or play on someone
          else&apos;s seat. If we find results that look fake, we may void them, remove the trophies and coins they earned, and
          suspend the accounts involved.
        </p>
      </>
    ),
  },
  {
    id: "coins",
    title: "WTA Coins, trophies and the shop",
    body: (
      <>
        <p>
          WTA Coins are a record of play. You earn them by playing and winning, and you can spend them in the shop on
          cosmetic items such as frames, emotes and artifacts.
        </p>
        <ul>
          <li>Coins have no cash value. They cannot be bought with money, withdrawn, exchanged, transferred or wagered.</li>
          <li>Shop items are cosmetic. They give no advantage in any game.</li>
          <li>
            Coins, trophies, levels and items are a licence to use them on W.T.A, not property. We may rebalance, rename or
            retire them, and we may reset them where they were earned unfairly or by mistake.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "conduct",
    title: "How to behave",
    body: (
      <>
        <p>
          Team names, player names, emotes and anything else you put on W.T.A must not be abusive, hateful, sexual, or
          impersonate anyone. Don&apos;t harass other players, and don&apos;t try to break, overload or get around the service&apos;s
          limits or security.
        </p>
        <p>
          Our <Link href="/community-guidelines">Community Guidelines</Link> say more. We may remove content and suspend
          accounts that break them.
        </p>
      </>
    ),
  },
  {
    id: "streams",
    title: "Live streams and screens",
    body: (
      <p>
        If you stream a game from your phone&apos;s camera, you must have the agreement of the people in shot and the
        venue. Streams are shown live and are not recorded by us. Don&apos;t stream anything you wouldn&apos;t show the whole
        room.
      </p>
    ),
  },
  {
    id: "old-wallet",
    title: "Old wallet balances",
    body: (
      <p>
        An earlier version of W.T.A had a wallet with real-money entry fees. That has been switched off. Any balance left
        from it is being returned, as set out in our <Link href="/refund">Refund &amp; Cancellation</Link> policy. No new
        money can be added.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Our content",
    body: (
      <p>
        The W.T.A name, logo, software, designs and text belong to us or the people who licensed them to us. You may use
        the service as intended, and share links, screenshots and results, but not copy, resell or rebuild it. What you put in
        (your names, team names, scores) stays yours; you let us show it on W.T.A so the service works.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility to you",
    body: (
      <>
        <p>
          We work to keep W.T.A running and accurate, including when a venue&apos;s wifi drops, but we provide it &quot;as
          is&quot;. We can&apos;t promise it will always be available or free of errors.
        </p>
        <p>
          As far as the law allows, we are not responsible for what happens at a venue or a fight, for prizes offered by hosts
          or venues, for disputes between players, or for loss caused by outages or by other people&apos;s content. Nothing
          here limits any right you have that the law says cannot be limited.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Closing an account",
    body: (
      <p>
        You can stop using W.T.A at any time, and ask us to delete your account by writing to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We may suspend or close an account that breaks these terms,
        and will tell you why unless the law or safety stops us.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        W.T.A is changing quickly, and these terms will change with it. When they change, the date at the top changes.
        If a change matters to how you use W.T.A, we will say so on the site before it takes effect. Using W.T.A after that
        means you accept the new terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms &"
      accent="Conditions."
      effective="3 November 2026"
      summary={
        <ul>
          <li>W.T.A is free software for running game fights. We take no entry fees, hold no money and pool no prizes.</li>
          <li>Any prize at a fight comes from its host or venue, not from us.</li>
          <li>WTA Coins have no cash value and can&apos;t be bought, withdrawn, transferred or bet.</li>
          <li>Play fair: fake results lose their trophies and coins, and can lose you your account.</li>
          <li>You must be 18 or over to make an account.</li>
        </ul>
      }
      sections={sections}
    />
  );
}

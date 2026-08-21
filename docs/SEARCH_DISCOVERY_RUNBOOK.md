# Homesrolo search and answer-engine release runbook

This runbook covers the public static site only. It does not expose or index a
private homeowner record. Search submission is a release step, not a substitute
for useful pages, accurate claims, or independent proof.

## What the search systems actually reward

- Google does not ban content because software helped draft it. It evaluates
  whether a page is accurate, useful, original, and made for people. Do not ship
  thin city swaps, fake experience, invented reviewers, or large batches of
  query-variation pages.
- Bing and Microsoft Copilot use Bing's crawl and ranking foundation. Clear
  answers, original evidence, consistent entity names, crawlable HTML, internal
  links, and trustworthy sources matter more than repeating keywords.
- ChatGPT Search is not a mirror of Bing rankings. OpenAI may use third-party
  search providers, including Bing, and also crawls with `OAI-SearchBot`.
  Homesrolo must be discoverable to both systems.
- `llms.txt` is a concise directory for tools that choose to read it. Google
  says no special AI file or schema is required, and the file is not treated as
  a ranking guarantee.

Official references:

- Google on generative AI content: <https://developers.google.com/search/docs/fundamentals/using-gen-ai-content>
- Google people-first guidance: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>
- Google AI-search guidance: <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- Bing Webmaster Guidelines: <https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a>
- OpenAI crawler controls: <https://developers.openai.com/api/docs/bots>
- ChatGPT Search: <https://help.openai.com/en/articles/9237897-chatgpt-search>

## One-time account setup

### Google Search Console

1. Verify the `homesrolo.com` domain property.
2. Submit `https://homesrolo.com/sitemap.xml`.
3. Inspect the Roof Watch hub, guide index, three guides, and six live city
   pages. Request indexing only after the deployed HTML, canonical, photo, and
   safety copy have been checked.
4. Review Page indexing, Manual actions, Core Web Vitals, and Search results.
   Do not treat a `site:` query as a complete index report.

### Bing Webmaster Tools

1. Import the verified Google Search Console property or verify the domain
   directly.
2. Submit the same sitemap.
3. Use URL Inspection and Live URL for the Roof Watch hub and newly changed
   pages. Use Site Explorer to verify the crawled URL tree.
4. Review Search Performance, Site Scan, Recommendations, Backlinks, and the AI
   Performance report. AI Performance reports Microsoft citations and grounding
   queries; it is not a universal ChatGPT rank report.

Official references:

- Bing site verification: <https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b>
- Bing URL Inspection: <https://www.bing.com/webmasters/help/URL-Inspection-55a30305>
- Bing Site Explorer: <https://www.bing.com/webmasters/help/site-explorer-c680da37>
- Bing AI Performance: <https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c>

## Every public-content release

1. Run the full verification suite and inspect the exported page bodies, not
   only their HTTP status. A prior Next.js async-parameter bug produced a 200
   response containing a not-found page.
2. Deploy the exact reviewed commit. Confirm which branch the public Render
   service tracks before merging or promoting a branch.
3. Check the deployed sitemap, robots file, canonical tags, image URLs, and one
   city-page body.
4. Confirm `https://homesrolo.com/ae05831592254a7653354c33657a5584.txt`
   returns only the matching IndexNow key.
5. For the first activation, run `npm run indexnow:dry-run -- --all`, then
   `npm run indexnow:submit -- --all`. For later releases, pass only materially changed
   canonical pages, for example `npm run indexnow:submit -- --url
   https://homesrolo.com/roof-watch/`. The submit command refuses to post if the
   deployed key file does not match.
   It also refuses URLs absent from the current sitemap; deleted-URL notices need
   a separate reviewed workflow rather than an arbitrary command-line URL.
6. Inspect priority URLs in both webmaster tools. IndexNow acceptance means the
   change was received; it does not guarantee indexing, ranking, or citation.

IndexNow documentation: <https://www.indexnow.org/documentation>

## OpenAI and answer-engine discovery

- Allow `OAI-SearchBot` for ChatGPT Search visibility.
- Treat `GPTBot` separately: it controls potential model-training crawl, not
  ChatGPT Search inclusion.
- `ChatGPT-User` is a user-triggered fetch agent and may not behave like an
  automatic search crawler.
- If Cloudflare bot protection blocks a verified crawler, validate requests
  against OpenAI's current published IP ranges before creating a narrow WAF
  exception: <https://openai.com/searchbot.json>.
- Track referrals containing `utm_source=chatgpt.com`, but do not assume every
  citation produces a visit.

## Content and photo gate

Before adding a guide or city page, verify all of the following:

- The page answers a distinct homeowner need and contains local or field detail
  that would still be useful with the city name removed.
- Safety, insurance, legal, and technical claims are qualified and link to the
  current primary source.
- The visible publisher, dates, schema, and page copy agree. Never invent a
  person, credential, review, service address, or modification date.
- Field photos are owned or licensed, stripped of GPS/EXIF location data, and
  checked for faces, addresses, plates, paperwork, and security details.
- Alt text describes what is visible. Captions explain why the image matters
  and whether it is archival or from the specific program visit.
- Do not place hashtags or keyword strings in alt text, captions, filenames, or
  hidden metadata. Descriptive words and useful context are enough.
- Do not present stock, generated, or archival imagery as proof of a Roof Watch
  visit. Publication derivatives may resize and re-encode a reviewed image, but
  they must preserve its composition and factual content without generative or
  semantic edits.

## Measurement cadence

Weekly during launch, then monthly:

- Google: indexed Roof Watch URLs, impressions, queries, clicks, average
  position, rich-result errors, and manual actions.
- Bing: indexed URLs, crawl errors, impressions, clicks, Site Scan changes,
  backlinks, AI citations, cited pages, and grounding-query themes.
- Once a reviewed, privacy-safe analytics path exists: organic landings by
  guide/city, SMS CTA clicks, private-project handoffs, and
  `utm_source=chatgpt.com` referrals. Until then, use Search Console, Bing
  Webmaster Tools, and aggregate hosting logs only for the data they actually
  expose; the current static site does not collect CTA events.
- Editorial: pages with stale dates or sources, unsupported absolutes, duplicate
  intent, and photos that no longer match the caption.

Do not manufacture freshness or citations. Update `lastmod` and article dates
only when the main content was reviewed or materially changed.

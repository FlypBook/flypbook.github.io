# What makes a Reddit-style story keep people reading (research notes, 2026-10-28)

These notes are why the writer (`generate_story.py`, `reddit_voice.md`, `story_seeds.py`) works the way it does.

## Our own readers
- As of 2026-10-28 the app had 1 reader account and 26 reading events: **25 skips, 1 finish**.
- The average skip happened **1-10% into a story**, i.e. in the first sentence or two.
- Takeaway: the opening is the whole game. The title is now read aloud first (like story videos), and the
  first sentence of the body must already contain the conflict. Backstory comes after, briefly.

## Published research
- **Believability drives immersion.** "Narrative transportation" studies (Green & Brock 2000; Green 2004;
  van Laer et al. 2014 meta-analysis) link being absorbed in a story to an imaginable plot, identifiable
  characters, and verisimilitude (life-likeness). Readers with relevant experience are transported more.
  -> Everyday situations teens have lived (siblings, parents, friends, school, first jobs, money), boring-real
  details, and no sitcom logic.
- **Narrator-in-the-right posts are the most popular.** On r/AmItheAsshole, posts judged positively ("not the
  asshole") score higher (Botzer, Gu & Weninger 2021, arXiv 2101.07664). In 100,000 AITA threads, 55-65% were
  judged NTA, while YTA posts drew more comments (mean 107.6 vs 79.4) (Nguyen et al., ICWSM 2022).
  -> Mostly sympathetic narrator with one honest doubt; controversy is spice, not the default.
- **Length.** Mean AITA post length: NTA 401 words, YTA 371, ESH 433 (Nguyen et al. 2022).
  -> Target 330-480 words (about 2.5-3 minutes narrated).
- **Real dilemmas mix two topics** (family + money, friends + celebrations, communication + mental health),
  and moral dilemmas often grow out of "nominally neutral" everyday topics (the workplace fridge, in-laws at a
  wedding) (Nguyen et al. 2022). -> Every story gets a "second layer" (`SECOND_LAYERS`).
- **Curiosity is an information gap** that must feel specific and closeable, and it grows as the answer nears
  (Loewenstein 1994). -> The title opens one concrete question; the key fact lands near the end.
- **How readers spot fakes:** characters engineered for maximum outrage, premises that devolve into pure
  rage-bait (essay by a self-described AITA fake-poster, alexanderturok.substack.com).
  -> The "villain" must have their own reasons.

## What we changed because of this
1. A new voice guide (`reddit_voice.md`) with two original example posts, and a list of AI tells to avoid.
2. Believable premises, narrators by age/gender/life stage only, post-type title and ending rules (`story_seeds.py`).
3. A realism ("authenticity") score in the review; stories need 8/10 to publish.
4. A free local filter for AI-sounding phrases and dashes, before spending tokens on a review.
5. Near-miss drafts are revised with the reviewer's notes instead of thrown away.
6. Only gpt-oss-120b writes (gpt-oss-20b failed the bar every time with this writer).

## Sources
- Botzer, Gu & Weninger (2021). Analysis of Moral Judgement on Reddit. https://arxiv.org/pdf/2101.07664
- Nguyen et al. (2022). Mapping Topics in 100,000 Real-Life Moral Dilemmas. ICWSM. https://ojs.aaai.org/index.php/ICWSM/article/view/19327
- Green & Brock (2000); Green (2004), Transportation Into Narrative Worlds: The Role of Prior Knowledge and Perceived Realism. https://narrativestudies.lib.unb.ca/bibcite/reference/17215
- Loewenstein (1994). The Psychology of Curiosity (summary): https://concepts.dsebastien.net/concept/information-gap-theory/
- Turok, My Collection of AITA Troll Posts. https://alexanderturok.substack.com/p/my-collection-of-aita-troll-posts

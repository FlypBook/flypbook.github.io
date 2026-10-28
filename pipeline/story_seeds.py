"""Story seeds for FlypBook's writer: who is posting, what kind of post it is, and a believable
situation to build it on. Every seed is an original, ordinary situation (the kind that really happens
at school, at home, or at a first job), so the stories feel real instead of like sitcom plots.
The writer is told to change the details, so the same seed never comes out the same way twice."""

# Post types: how the title is written and how the post ends. The genre matches GENRES in generate_story.py.
POST_TYPES = {
    "aita": {
        "title": 'starts with "AITA for" and names the exact thing the narrator did, plus the provocation. Example shape: '
                 '"AITA for refusing to drive my sister to school after she posted my private texts?"',
        "ending": "End by asking readers to judge, in plain words (\"Am I the jerk here?\" or \"So, was I wrong?\"). "
                  "The narrator should be mostly in the right (those posts are the most popular), but give them one honest "
                  "thing they did or said that makes them unsure, so readers want to weigh in. Often add one short "
                  "\"EDIT:\" line answering the obvious question a commenter would ask.",
    },
    "tifu": {
        "title": 'starts with "TIFU by" and names the mistake. Example shape: "TIFU by sending my whole class the voice memo meant for my best friend"',
        "ending": "End on the most embarrassing consequence and one honest line about where things stand now. It should be funny, not tragic.",
    },
    "petty revenge": {
        "title": 'says what the other person did and what the narrator did back. Example shape: '
                 '"My coworker kept eating my lunch, so I started bringing food only I would ever eat"',
        "ending": "The revenge is clever, harmless, and completely legal, and the other person brought it on themselves. "
                  "End right after the payoff with one short satisfied line.",
    },
    "malicious compliance": {
        "title": 'quotes the bad instruction and ends with "So I did." Example shape: '
                 '"My teacher said late work would get a zero \"no matter what.\" So I did the math."',
        "ending": "The narrator follows the instruction exactly, the consequence lands on the person who gave it, and the rule "
                  "gets changed or the person has to admit it. End with that result, short.",
    },
    "entitled people": {
        "title": 'says what the entitled person demanded and why it was ridiculous. Example shape: '
                 '"A parent at my brother\'s game demanded I give up my seat because her son \"needed to see his fans\""',
        "ending": "The entitlement escalates believably, then backfires on them in a satisfying but realistic way. End on that moment.",
    },
    "family drama": {
        "title": 'is a "My [family member] did X" or "WIBTA if" line. Example shape: '
                 '"My parents gave my brother my college fund for his \"business\" and now I\'m the bad guy for being upset"',
        "ending": "End with where things stand now and what the narrator is going to do, or ask readers what they would do. "
                  "Often an \"UPDATE:\" paragraph a few days later with one new development.",
    },
    "friendship drama": {
        "title": 'is a "My best friend did X" line. Example shape: '
                 '"My best friend asked me to keep a secret, then told everyone I was the one who spread it"',
        "ending": "End with the decision the narrator made about the friendship, or an \"UPDATE:\" with how it played out.",
    },
    "school drama": {
        "title": 'is about something at school. Example shape: '
                 '"A girl in my group project turned in our slides under only her name, so I brought receipts"',
        "ending": "End with the result (grade, teacher's decision, what happened in class) in a short paragraph.",
    },
    "workplace drama": {
        "title": 'is about a first job. Example shape: "My manager scheduled me during my graduation and said I should have asked sooner"',
        "ending": "End with the consequence at work and where the narrator stands now.",
    },
    "roommate drama": {
        "title": 'is about roommates or a shared room. Example shape: '
                 '"My roommate\'s boyfriend basically lives with us now and she says I\'m being dramatic about splitting bills"',
        "ending": "End with the conversation or decision that changed things, or ask what readers would do.",
    },
    "wholesome twist": {
        "title": 'sounds like drama at first. Example shape: '
                 '"My grumpy neighbor yelled at me for mowing his lawn, and then I found out why"',
        "ending": "The reveal is kind and makes sense of everything earlier. End warmly but briefly, no lesson.",
    },
    "mystery": {
        "title": 'asks readers for help explaining something. Example shape: '
                 '"Someone has been leaving a different library book on my porch every Sunday and I finally found out who"',
        "ending": "The answer is surprising but completely logical once explained, set up by details earlier in the post.",
    },
    "unexplained / eerie": {
        "title": 'is a calm, unsettling question to readers. Example shape: '
                 '"My grandma\'s house has a phone line that still rings every night at 9:14 and nobody can tell me why"',
        "ending": "End on the unsettling fact that still has no explanation, or a quiet, plausible explanation that is somehow creepier. "
                  "Never gory, never violent, nobody gets hurt.",
    },
}

# Who is posting: just age, gender, and stage of life. The writer invents the rest so it fits the situation
# (detailed personas fought with the situations and caused contradictions).
PERSONAS = [
    "15F, high school freshman", "16F, high school sophomore", "17F, high school junior", "18F, high school senior",
    "15M, high school freshman", "16M, high school sophomore", "17M, high school junior", "18M, high school senior",
    "19F, first year of college, lives at home", "19M, first year of college, lives at home",
    "20F, college student with a part-time job", "20M, works full time, lives with roommates",
    "21F, college junior", "22M, first full-time job", "23F, first apartment",
]

# Believable situations. (genre, situation)
# Each one has the three things that kept real posts from being boring in our tests: a hook (one
# specific, slightly outrageous fact), the other side's honest reason, and a late turn (a fact that comes
# out near the end and changes how everything reads). The writer changes the specifics every time.
PREMISES = [
    # AITA: narrator mostly right, with one thing to argue about.
    ("aita", "Hook: the narrator made their brother (20) pay $70 for the controller he broke throwing it during a game; it was the first thing the narrator bought with their own paycheck. Their side: mom says it's 'just a controller' and brothers share. Turn: the brother got $100 for his birthday the week before and spent it all on in-game stuff."),
    ("aita", "Hook: the narrator won't switch the date of their graduation party, which they booked and paid a $60 deposit for four months ago, even though an aunt scheduled a baby shower the same afternoon. Their side: the aunt says a baby is bigger news and relatives can't do both. Turn: a cousin lets slip that the aunt picked the date AFTER the narrator's invitations went out, because relatives would already be in town."),
    ("aita", "Hook: the narrator's sister 'lent' them her old car when she left for college, the narrator has paid the $96 a month insurance since, and now she's home for summer and takes the car every day. The narrator started charging her gas money. Their side: it's legally still her car. Turn: she's been telling their parents the narrator 'never pays for anything.'"),
    ("aita", "Hook: grandma gives the narrator and their twin $100 each every birthday; the narrator saves it, the twin spends it, and now the parents want the narrator to split their savings so the twins can go on a trip together. Their side: it's 'unfair' for one twin to stay home. Turn: the twin had already promised the narrator's money to friends for concert tickets."),
    ("aita", "Hook: the narrator sold the box of trading cards their brother gave them when he was 12; now he's 20, says it was a loan, and wants the $640. Their side: he says he only gave them to keep them safe from mom. Turn: the brother tried to sell the cards himself last year, couldn't find the box, and never mentioned it."),
    ("aita", "Hook: the narrator's stepmom wants to put the narrator's late mom's lemon cake on the menu of her new baking business as 'our family recipe.' The narrator said only if it's named after their mom. Their side: the stepmom says she's family now too and the name 'is just marketing.' Turn: the narrator finds out their dad gave her the original handwritten recipe card."),
    ("aita", "Hook: the narrator's friend has been telling her parents she sleeps over at the narrator's house, and when the friend's mom called and asked the narrator directly, they told the truth. Their side: the friend says the narrator 'ruined her life' over one night. Turn: the friend had actually been riding two hours away with people she met online, and the narrator only found that out from her mom."),
    ("aita", "Hook: the narrator refused to let their dad's girlfriend turn the narrator's bedroom into her home office while the narrator is away at college for the semester. Their side: it's empty most of the year and she works from home. Turn: the narrator's stuff was already boxed up in the garage before anyone asked them."),
    ("aita", "Hook: the narrator told their coworker the real reason nobody wants to close with her: she leaves 40 minutes early and clocks out at the normal time from her phone. Their side: the coworker says she does 'the important stuff' first and nobody's ever complained to her face. Turn: the manager already knew and had been waiting for someone to say it in writing."),
    ("aita", "Hook: the narrator refused to give up their concert ticket to their older sister after the sister's friend bailed. Their side: the sister bought the tickets, so she says she gets to choose who goes. Turn: the narrator paid her back for their ticket in cash months ago, and the sister 'forgot' because the narrator never asked for a receipt."),
    ("aita", "Hook: the narrator stopped babysitting their aunt's two kids every Saturday 'for an hour' that always turns into six, unpaid. Their side: family helps family, and the aunt is a single parent. Turn: the narrator finds out the aunt has been paying a neighbor's kid $15 an hour for the exact same thing on weekdays."),
    ("aita", "Hook: at a family dinner the narrator corrected their uncle's story about 'paying for' the narrator's braces, in front of everyone. Their side: the uncle did help a little and it was a 'joke.' Turn: the narrator has the receipt; the uncle paid one $40 copay, two years ago."),
    # TIFU: funny, embarrassing, nobody gets hurt.
    ("tifu", "The narrator told everyone on a bus they were fluent in their grandma's language to impress someone, and a minute later a lost tourist asked them to translate directions. The person they were trying to impress is still on the bus."),
    ("tifu", "The narrator accidentally joined their mom's video work meeting from the family tablet while singing in the kitchen, and nobody told them for four minutes."),
    ("tifu", "At a dog park, the narrator walked three blocks home with someone else's identical dog, and only noticed at the front door when the dog didn't know where the water bowl was. Their actual dog was still at the park, very calm."),
    ("tifu", "The narrator asked the 'new kid' where he transferred from. He's been in three of their classes since freshman year and sat behind them in one."),
    ("tifu", "The narrator was in charge of ordering rice for the club fundraiser dinner and ordered 40 pounds instead of 4. It all arrived at their house."),
    ("tifu", "The narrator gave an 'anonymous' secret gift at school but left the store receipt in the bag, with their rewards name printed on it."),
    ("tifu", "The narrator corrected a 'substitute' in front of the class about how to pronounce a word, and she turned out to be the new principal who grew up speaking that language."),
    # Petty revenge: clever, legal, harmless, deserved.
    ("petty revenge", "The narrator's sister kept using their expensive shampoo and refilling it with water. The narrator swapped in the cheapest shampoo from the dollar store and kept the real one in their gym bag. The sister has been telling everyone her hair has never looked better."),
    ("petty revenge", "The narrator's brother claims the front seat by yelling 'shotgun' the second he wakes up. The narrator found the old 'official shotgun rules' their dad wrote on a notebook page when they were kids, which say you have to be able to see the car."),
    ("petty revenge", "A coworker always takes the last of the good snacks in the break room and leaves the empty box. The narrator started keeping the snacks in the old empty boxes and leaving the new boxes empty."),
    ("petty revenge", "A friend always 'forgets' their wallet when it's their turn to pay for food. The narrator started picking places that only take cash, and has the exact amount for themselves ready every time."),
    ("petty revenge", "The narrator's cousin spoils every show on purpose. The narrator noticed the cousin is three episodes behind on the one show he actually cares about, and his whole friend group watches it together on Sundays."),
    ("petty revenge", "A classmate kept repeating the narrator's ideas louder in class discussions. The narrator started 'thinking out loud' with deliberately wrong ideas before class, then saying the right one after the classmate went first."),
    # Malicious compliance: an exact instruction, followed exactly.
    ("malicious compliance", "A drive-thru manager says every customer gets the full greeting script, no exceptions, even when the line is long. The regional manager visits during the Friday rush."),
    ("malicious compliance", "A coach says 'keep running until I blow the whistle,' then walks off to take a phone call. The team keeps running for 40 minutes, and parents start showing up for pickup."),
    ("malicious compliance", "The narrator's older brother says 'don't talk to me at school, ever.' Then he locks his keys in his car with the engine running, and the narrator has the spare."),
    ("malicious compliance", "The narrator's dad says 'from now on, ask me before you spend a single cent on the family card.' The narrator does the weekly grocery run at 7 AM while he's in meetings, and texts him for every item."),
    ("malicious compliance", "A group project leader says 'just do your slide and don't touch anyone else's.' Nobody was assigned the conclusion slide, and the narrator noticed a week early."),
    ("malicious compliance", "The narrator's manager at a frozen yogurt shop says 'don't call me on my day off, figure it out yourself.' Then the walk-in freezer starts beeping."),
    ("malicious compliance", "A teacher says to use ONLY the class textbook as a source. The textbook's chapter has a wrong date that the teacher's own answer key disagrees with."),
    # Entitled people: escalates, then backfires realistically.
    ("entitled people", "A parent at the library demands the narrator leave the study room they reserved two weeks ago, because her son 'has a real tutor coming.' The narrator has the printed reservation."),
    ("entitled people", "A customer at the narrator's ice cream job demands the employee discount because her cousin 'used to work here.' Her cousin turns out to be the narrator's manager, who is in the back."),
    ("entitled people", "A neighbor says the narrator should shovel her driveway for free because 'young people should help.' The narrator offered for $15, she refused, then complained to the narrator's mom. The narrator's mom knows something about that neighbor's snowblower."),
    ("entitled people", "A family friend expects the narrator, who won the science fair, to do his kid's science project 'since you already know how.' The project is due in four days and the kid hasn't picked a topic."),
    ("entitled people", "A woman at a kid's birthday party the narrator is working at insists her kid gets to open all the presents 'because he gets upset.' The birthday girl's mom is the narrator's boss."),
    # Family drama: where things stand, and what next.
    ("family drama", "The narrator's dad sold their late grandpa's old truck, which grandpa told everyone was going to the narrator, to pay for a family trip. Turn: the narrator has a voicemail from grandpa saying it."),
    ("family drama", "The narrator's older sister announced her wedding date at Thanksgiving: the same day as the narrator's graduation. She says graduations happen every year. Turn: the venue had offered her two dates."),
    ("family drama", "The narrator found out their parents used the money relatives gave the narrator for graduation to fix their brother's car. Their side: they 'were going to pay it back.' Turn: the brother has been telling people the narrator 'owes' him rides now."),
    ("family drama", "The narrator's parents have been reading the narrator's texts on the family tablet and bringing them up at dinner as 'jokes.' The narrator finally logged out, and now the parents say they must be hiding something."),
    ("family drama", "The narrator's birthday is three days after their little sister's, and every year since they were small the parents throw one shared party. This year the narrator planned their own and paid for it, and the parents say the sister is invited 'or else.'"),
    # Friendship drama.
    ("friendship drama", "The narrator's friend borrowed $200 for a 'family emergency' and then posted photos from a concert two hours away the same weekend. Their side: the tickets were a gift. Turn: the narrator's ex was in the photos."),
    ("friendship drama", "The narrator found a shared note on a friend's phone where the friend group 'ranks' each other every month. The narrator is ranked last, with reasons."),
    ("friendship drama", "The narrator told their best friend about a job opening at their work, the friend got it, and now the friend keeps getting the narrator's preferred shifts because she 'asked first.'"),
    ("friendship drama", "The narrator's best friend started dating the narrator's ex two weeks after the breakup and wants everything to be 'normal' at the narrator's birthday."),
    ("friendship drama", "A friend borrowed the narrator's camera for a trip, returned it with a cracked screen, and says it was 'already like that.' The narrator's photos from the day before the trip are still on the memory card."),
    # School drama.
    ("school drama", "The narrator's group partner entered the narrator's essay into a scholarship contest under his own name, and the narrator found out from the school newsletter announcing him as a finalist."),
    ("school drama", "A teacher accused the narrator of using AI because their essay was 'too good.' The narrator has the whole edit history, and the teacher still wants them to rewrite it in class."),
    ("school drama", "The narrator's lab partner skipped every work session of a three-week project and then showed up on presentation day with a printed script of the narrator's part."),
    ("school drama", "Someone keeps moving the narrator's ongoing project in the art room, and the teacher won't believe them, until the narrator notices which days it happens."),
    # Workplace drama.
    ("workplace drama", "The narrator trained a new hire, who turned out to be the manager's nephew, and a month later he became the narrator's shift lead. Then he asks the narrator how to do the closing count."),
    ("workplace drama", "The narrator found out the new hire they trained makes $1.50 more per hour. Their side: the manager says the new hire 'negotiated.' Turn: the narrator had asked for a raise twice and was told raises were frozen."),
    ("workplace drama", "The narrator's manager posts next week's schedule as a photo in the group chat at 11 PM on Sunday, and keeps putting the narrator on nights they marked unavailable for their younger brother's games."),
    ("workplace drama", "A coworker tells customers the narrator is 'new' whenever something goes wrong. The narrator has worked there eight months longer than her."),
    # Roommate drama.
    ("roommate drama", "The narrator's roommate has been 'renting' their couch to a friend for $10 a night without telling the narrator. The narrator found out when the friend asked where the extra towels are."),
    ("roommate drama", "The narrator's roommate keeps eating the narrator's meal prep and 'paying them back' in instant noodles."),
    ("roommate drama", "The narrator's roommate started a candle business in their apartment and the living room smells like eleven scents at once. The roommate says they're 'basically business partners' because the narrator helped fold boxes once."),
    ("roommate drama", "The narrator's roommate keeps 'forgetting' her half of the internet bill but streams all day. She says she'll pay 'when her refund comes in.' It's been since March."),
    # Wholesome twist: sounds bad, turns out kind.
    ("wholesome twist", "A regular at the narrator's coffee job orders his coffee at an exact temperature and gets annoyed when it's wrong. The narrator finally finds out why from the car parked outside."),
    ("wholesome twist", "The narrator's dad has been leaving the house every Thursday night and lying about where he goes. The narrator follows him once."),
    ("wholesome twist", "The grumpy old neighbor keeps complaining about the narrator's drum practice. Then the notes change from 'too loud' to 'you're rushing the chorus.'"),
    ("wholesome twist", "A kid comes into the narrator's job every day with a handful of coins to buy one cheap thing, and won't say why."),
    # Mystery: surprising, but logical, set up earlier.
    ("mystery", "Every Friday the narrator's pizza job gets the same order: one plain slice, cut into eight pieces, delivered to a park bench. Nobody is ever there, but the money is always under the box next time."),
    ("mystery", "Someone keeps returning the narrator's lost things to their locker, sometimes before the narrator even noticed they were missing."),
    ("mystery", "A package keeps arriving at the narrator's house for someone who hasn't lived there in 20 years, and one day it's addressed to the narrator too."),
    ("mystery", "The neighbor's porch light blinks in the same pattern every night at 10:00, and the narrator's grandpa says it means something."),
    # Unexplained / eerie: calm, unsettling, never gory.
    ("unexplained / eerie", "The family bought a used car, and every radio preset is tuned to the same station, which plays quiet static and, once a night, a man reading a list of street names in the narrator's town."),
    ("unexplained / eerie", "The narrator's old voicemail box keeps getting messages from their own phone number: just ten seconds of the narrator's kitchen, with someone humming."),
    ("unexplained / eerie", "The narrator's grandparents' old house has a closet that is always colder than the rest of the house, even in summer, and grandma won't let anyone keep coats in it."),
    ("unexplained / eerie", "A neighbor keeps waving at the narrator from an upstairs window, but the family who lives there says nobody uses that room."),
]

# Tones that fit each genre (the writer gets one, so the feed isn't all the same mood).
GENRE_TONES = {
    "aita": ["dramatic", "funny", "satisfying"], "tifu": ["funny"], "petty revenge": ["satisfying", "funny"],
    "malicious compliance": ["satisfying", "funny"], "entitled people": ["satisfying", "dramatic"],
    "family drama": ["dramatic", "heartwarming"], "friendship drama": ["dramatic"], "school drama": ["dramatic", "satisfying"],
    "workplace drama": ["satisfying", "dramatic"], "roommate drama": ["funny", "dramatic"],
    "wholesome twist": ["heartwarming"], "mystery": ["suspenseful"], "unexplained / eerie": ["eerie"],
}

# A second everyday area to mix into the situation. In a study of 100,000 real dilemma posts, most combined
# two topics (like family + money), and that mix is what makes a situation feel lived-in and arguable.
SECOND_LAYERS = [
    "money: a specific amount that matters to someone this age",
    "a sentimental object (something from a grandparent, a first paycheck purchase, a handmade gift)",
    "a big upcoming event (a birthday, a game, a formal, a graduation, a holiday dinner)",
    "a group chat where everyone can see what happened",
    "a younger sibling or cousin caught in the middle",
    "a job or shift schedule",
    "a pet",
    "food (a recipe, leftovers, a restaurant bill, a bake sale)",
    "a car, a ride, or who drives whom",
    "a shared account or password",
    "a promise someone made weeks ago",
    "a grade, a deadline, or a teacher's rule",
]

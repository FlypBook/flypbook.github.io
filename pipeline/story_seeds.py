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
PREMISES = [
    ("aita", "The narrator's aunt asks them to babysit her kids 'for an hour' every week and it is never an hour, and she never pays. This week the narrator said no and the whole family is upset."),
    ("aita", "The narrator saved for months for concert tickets. Their sibling was supposed to come, bailed last minute, and now wants their half of the money back even though the tickets can't be refunded."),
    ("aita", "The narrator's friend group always splits the bill evenly, but one friend always orders the most. Tonight the narrator only had water and asked to just pay for that."),
    ("aita", "The narrator's mom gave their old room to a cousin while they were away at a summer job, including their stuff in boxes. The narrator wants the room back."),
    ("aita", "The narrator found out their best friend has been copying their homework and turning it in early so it looks like the narrator copied. They told the teacher."),
    ("aita", "The narrator's stepdad wants them to call him 'Dad' at his work party. The narrator said no in front of his coworker."),
    ("aita", "The narrator's sister wants to borrow the dress the narrator bought for their own formal, for a wedding the day before. The narrator said no because the sister ruined the last thing she borrowed."),
    ("aita", "The narrator refused to give up their window seat on a long family road trip to a younger cousin who always gets their way."),
    ("aita", "The narrator's group of friends planned a surprise party for someone and the narrator told that person, because they know that person hates surprises."),
    ("aita", "The narrator kept the money they found in a jacket they bought at a thrift store, and their friend says they should have returned it."),
    ("aita", "The narrator's parents want them to give their savings to cover their sibling's speeding ticket so the sibling doesn't lose their license."),
    ("aita", "The narrator told a coworker the truth about why everyone avoids working shifts with them."),
    ("tifu", "The narrator accidentally replied-all to a class group chat with a message meant for one friend."),
    ("tifu", "The narrator confidently corrected a 'substitute teacher' who turned out to be the new principal."),
    ("tifu", "The narrator brought the wrong container of food to a potluck and served everyone their dog's homemade treats."),
    ("tifu", "The narrator practiced their presentation out loud on the bus, not knowing their mic was connected to their speaker the whole time."),
    ("tifu", "The narrator waved back at someone at the mall for a long time before realizing they were waving at the person behind them, who turned out to be their crush's mom."),
    ("tifu", "The narrator set a 'reminder' alarm during a test that went off with the most embarrassing ringtone possible."),
    ("petty revenge", "A coworker keeps 'borrowing' the narrator's phone charger from the break room and never returns it."),
    ("petty revenge", "The narrator's neighbor keeps parking in front of their family's driveway because 'it's a public street.'"),
    ("petty revenge", "A classmate kept taking credit for the narrator's ideas in class discussions."),
    ("petty revenge", "The narrator's sibling always 'tastes' their food without asking, especially fries."),
    ("petty revenge", "A friend keeps 'forgetting' their wallet whenever it's their turn to pay."),
    ("petty revenge", "The narrator's cousin keeps spoiling every show and movie on purpose."),
    ("malicious compliance", "A teacher says 'answer exactly what the question asks, nothing more.'"),
    ("malicious compliance", "The narrator's parent says 'if you're going to be on your phone, you can do the grocery shopping list on it.'"),
    ("malicious compliance", "A manager says 'don't call me on my day off, figure it out yourself.'"),
    ("malicious compliance", "A coach says 'nobody leaves until the field is perfect.'"),
    ("malicious compliance", "An older sibling says 'if you touch my stuff again, I want everything back exactly how it was.'"),
    ("malicious compliance", "A group project leader says 'just do your part and don't touch anyone else's.'"),
    ("entitled people", "A customer at the narrator's job demands a free meal because the line was 'too long.'"),
    ("entitled people", "A parent at a kids' birthday party the narrator is helping at demands their child gets to open all the presents."),
    ("entitled people", "A woman at the community pool insists the narrator give up their lounge chair because she 'always sits there.'"),
    ("entitled people", "A family friend expects the narrator to tutor their kid for free every week because 'you're good at school anyway.'"),
    ("entitled people", "A neighbor demands the narrator's family stop their kids from playing outside before 10 AM on Saturdays."),
    ("family drama", "The narrator found out their parents used the money relatives gave them for graduation to pay for their sibling's car repair."),
    ("family drama", "The narrator's grandma secretly gave them her old jewelry box and now an aunt says the narrator stole it."),
    ("family drama", "The narrator's dad started inviting his new girlfriend's kids to family traditions without asking anyone."),
    ("family drama", "The narrator's older sibling moved back home and took over the house rules, including the narrator's curfew."),
    ("family drama", "The narrator discovered their parents have been reading their texts and announcing things from them at dinner."),
    ("friendship drama", "The narrator's best friend started dating the narrator's ex two weeks after the breakup and expects nothing to change."),
    ("friendship drama", "The narrator's friend group made a second group chat without them, and they found out from a screenshot."),
    ("friendship drama", "A friend borrowed the narrator's camera for a trip and returned it broken, saying it was 'already like that.'"),
    ("friendship drama", "The narrator's friend keeps 'joking' about the narrator's job in front of other people."),
    ("school drama", "A teacher accused the narrator of using someone else's work because their essay was 'too good.'"),
    ("school drama", "The narrator's lab partner disappears for the whole project and then shows up to present."),
    ("school drama", "A student council candidate promised something the school can't do, and the narrator is the one who has to explain it."),
    ("school drama", "Someone keeps taking the narrator's assigned spot in the art room and messing up their ongoing project."),
    ("workplace drama", "The narrator's manager keeps scheduling them on nights they marked unavailable, then acts surprised."),
    ("workplace drama", "A coworker tells customers the narrator is 'new' whenever something goes wrong, even though they've worked there longer."),
    ("workplace drama", "The narrator found out the new hire, who they trained, makes more per hour than they do."),
    ("workplace drama", "The narrator's boss keeps asking them to 'just stay ten more minutes' every shift, unpaid."),
    ("roommate drama", "The narrator's roommate keeps using their things and replacing them with cheaper versions."),
    ("roommate drama", "The narrator's roommate started a small business in their shared apartment and the living room is now full of inventory."),
    ("roommate drama", "The narrator's roommate keeps 'forgetting' their share of the internet bill but streams all day."),
    ("roommate drama", "The narrator shares a room with a sibling who sets five alarms and snoozes all of them."),
    ("wholesome twist", "An older neighbor keeps leaving notes complaining about the narrator's music, and the narrator finally knocks on his door."),
    ("wholesome twist", "The narrator's strict boss keeps scheduling them on the same shifts as one quiet coworker, and the narrator finds out why."),
    ("wholesome twist", "A kid at the narrator's job keeps buying one small thing every day with coins, and it turns out to be part of a plan."),
    ("wholesome twist", "The narrator's stepdad kept 'borrowing' their old school notebooks, and the narrator finds out what he was doing with them."),
    ("mystery", "Someone has been paying for the narrator's coffee order every Monday, and the barista won't say who."),
    ("mystery", "The narrator keeps finding their bike locked with a second lock that isn't theirs, then unlocked the next morning."),
    ("mystery", "A package keeps getting delivered to the narrator's house addressed to someone who hasn't lived there in 20 years."),
    ("mystery", "The narrator's dog brings home the same kind of toy every few days, still with the tag on."),
    ("unexplained / eerie", "Every night, the narrator's baby monitor app picks up a second voice humming a song nobody in the house knows."),
    ("unexplained / eerie", "The narrator's grandparents' old house has a closet that is always colder than the rest of the house, even in summer."),
    ("unexplained / eerie", "The narrator found a photo of their family's house from decades ago, and someone is standing in the window who looks exactly like them."),
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

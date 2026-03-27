# AI Spaces Use Cases

**Real-world applications of shared agent spaces.**

---

## Use Case: Family Vacation Planning

**Scenario:** You're planning a Maine vacation with your spouse. Your agent has researched options, but your spouse needs to see them and add her preferences.

### The Setup

```yaml
# .space/config.yaml
name: Family Vacations
path: Vacations/

collaborators:
  - email: leah@example.com
    role: editor

agent:
  capabilities: [read, write, web_search]
```

### The Flow

1. **Agent researches:** "Find vacation options for Maine in June"
2. **Agent creates:** `Vacations/Maine.md` with options, prices, links
3. **You share:** `https://spaces.yourdomain.com/vacations` with Leah
4. **Leah opens:** Sees document tree, reads Maine options
5. **Leah chats:** "I prefer coast over mountains"
6. **Scoped agent:** Updates Maine.md with preference noted
7. **You return:** Agent says "Leah prefers coast. Adjusted recommendations."

### What Leah Can Do

- Browse all vacation documents
- Edit Maine.md directly (add notes, check checkboxes)
- Ask the scoped agent questions
- See comparison views the agent generates

### What Leah Cannot Do

- See other spaces (like your Private/ folder)
- Ask about non-vacation topics
- Access your full agent's memory

---

## Use Case: Teen Car Research

**Scenario:** Your teenager needs a car. You've done research with your agent, but want them to be involved in the decision.

### The Setup

```yaml
name: Teen Car Search
path: Research/TeenCar/

collaborators:
  - email: allie@example.com
    role: viewer      # can see and chat, not edit
  - email: leah@example.com
    role: editor      # can review and edit
```

### The Flow

1. **Agent researched:** RAV4, CX-5, CR-V with prices, mileage, pros/cons
2. **You share:** Link with Allie
3. **Allie browses:** Sees comparison table
4. **Allie chats:** "Which one has the best safety rating?"
5. **Scoped agent:** Pulls safety data, generates comparison view
6. **Allie reacts:** "I like the CX-5"
7. **Agent notes:** Preference logged in space memory

### Permission Levels

| Role | View | Edit | Chat | Invite |
|------|------|------|------|--------|
| Viewer | ✅ | ❌ | ✅ | ❌ |
| Editor | ✅ | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ |

---

## Use Case: Home Improvement Tracking

**Scenario:** Major renovation project. Multiple contractors, budget tracking, decision log.

### The Setup

```
Research/HomeReno/
├── .space/
│   └── config.yaml
├── Budget.md
├── Contractors.md
├── Timeline.md
├── Decisions.md
└── tables.db              # NocoDB for expenses
```

### Collaborators

- Spouse (editor) — sees everything, can edit
- Contractor A (viewer) — sees only their section
- Contractor B (viewer) — sees only their section

### The Flow

1. **You create:** Contractor profiles, timeline, budget
2. **Agent tracks:** Expenses via NocoDB table
3. **Contractors view:** Their section of the project
4. **Agent generates:** "Expenses this week" summary
5. **Spouse chats:** "How are we doing against budget?"
6. **Scoped agent:** Queries table, generates chart view

### Space-Scoped Memory

The scoped agent maintains `Decisions.md`:
- "2026-03-15: Decided on granite countertops"
- "2026-03-18: Contractor A chosen for plumbing"
- "2026-03-22: Budget revised to $45k"

Anyone in the space can ask about past decisions.

---

## Use Case: Shared Recipe Collection

**Scenario:** Family recipe collection that grows over time, with notes from each cook.

### The Setup

```
Family/Recipes/
├── .space/
│   └── config.yaml
├── Desserts/
│   ├── ChocolateCake.md
│   └── ApplePie.md
├── Mains/
│   ├── Lasagna.md
│   └── Tacos.md
└── .space-memory.md      # "Favorites: Leah likes the tacos best"
```

### The Flow

1. **Agent helps:** "Convert grandma's recipe to metric"
2. **Spouse adds:** Notes about ingredient substitutions
3. **Teen asks:** "What should I make for dinner?"
4. **Scoped agent:** Suggests based on ingredients + family preferences
5. **Everyone edits:** Adds notes after cooking

### Long-Term Value

- Family preferences recorded in space memory
- Generation of new recipes based on favorites
- "What did we make for Dad's birthday last year?" — answerable

---

## Use Case: Book Club Notes

**Scenario:** Running a book club with shared notes and discussion.

### The Setup

```
BookClub/
├── .space/
│   └── config.yaml
├── Books/
│   ├── ProjectHailMary.md
│   ├── TomorrowTomorrow.md
│   └── DemonCopperhead.md
├── DiscussionQuestions/
│   └── ProjectHailMary_questions.md
└── tables.db              # Reading progress, votes
```

### Collaborators

- All book club members (viewers)
- Discussion leader (editor)

### The Flow

1. **Leader creates:** Book summary, discussion questions
2. **Agent generates:** Character maps from the book notes
3. **Members view:** Progress tracker (who's read how far)
4. **Members chat:** "What were Rocky's motivations?"
5. **Scoped agent:** Answers from book content + discussion notes

---

## Use Case: Job Search Tracking

**Scenario:** Managing job applications with a spouse who helps review.

### The Setup

```
JobSearch/
├── .space/
│   └── config.yaml
├── Applications/
│   ├── Acme.md
│   ├── TechCorp.md
│   └── StartupX.md
├── InterviewPrep/
│   └── behavioral_questions.md
└── tables.db              # Application status, dates
```

### The Flow

1. **Agent researches:** Company info for each application
2. **You update:** Status changes in real-time
3. **Spouse reviews:** Can see all applications, add notes
4. **Spouse chats:** "How did the Acme interview go?"
5. **Scoped agent:** Pulls from notes, provides summary
6. **Agent preps:** Generates interview questions for upcoming

---

## Use Case: Fantasy Football League

**Scenario:** Shared league management with real-time updates.

### The Setup

`````yaml
FantasyFootball/
├── .space/
│   └── config.yaml
├── League/
│   ├── Roster.md
│   ├── Waivers.md
│   └── Trades.md
├── Analysis/
│   ├── StartSit.md
│   └── MatchupPreviews.md
└── tables.db
```

### Collaborators

- League members (viewers) — see their matchups, waivers
- Commissioner (editor) — manages roster, approves trades

### The Flow

1. **Agent analyzes:** Matchup previews, start/sit recommendations
2. **Members view:** Weekly picks
3. **Members chat:** "Who should I start at flex?"
4. **Scoped agent:** Answers from analysis files
5. **Commissioner updates:** Trade approvals, waiver claims

---

## Permission Matrix

| Use Case | Typical Role Setup |
|----------|-------------------|
| Family Vacations | Spouse = editor, family = viewer |
| Teen Car Search | Teen = viewer (input only), spouse = editor |
| Home Improvement | Spouse = editor, contractors = scoped viewer |
| Recipe Collection | Family = editor (everyone can add/modify) |
| Book Club | Members = viewer, leader = editor |
| Job Search | Spouse = editor (help with prep) |
| Fantasy Football | Members = viewer, commissioner = editor |

---

## Anti-Patterns (What NOT to Use AI Spaces For)

| ❌ Don't Use For | Why | What Instead |
|------------------|-----|---------------|
| Private journals | Collaborators could see | Keep in Private/ folder |
| Passwords/credentials | Security risk | Use credential manager |
| Work secrets | May leak to collaborators | Separate space with limited access |
| Temporary notes | Creates clutter | Use ephemeral chat or scratchpad |

---

*Use cases from ideation session on 2026-03-22*